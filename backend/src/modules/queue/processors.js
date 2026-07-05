const { Worker } = require('bullmq');
const Redis = require('ioredis');
const prisma = require('../../config/database');
const { publisher } = require('../../config/redis');
const { campaignFinalizeQueue, messageSendQueue } = require('./queue');

const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

// jobId → { resolve, reject, timer }
const pendingSends = new Map();

// wa:events'i dinle, send ack'lerini karşılık gelen Promise'e ilet
const eventSub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
eventSub.subscribe('wa:events').catch(console.error);
eventSub.on('message', (channel, raw) => {
  if (channel !== 'wa:events') return;
  let data;
  try { data = JSON.parse(raw); } catch { return; }
  if (data.event !== 'sent' && data.event !== 'sendError') return;

  const pending = pendingSends.get(data.jobId);
  if (!pending) return;
  clearTimeout(pending.timer);
  if (data.event === 'sent') pending.resolve(data);
  else pending.reject(new Error(data.message || 'Gönderim başarısız'));
  pendingSends.delete(data.jobId);
});

function publishProgress(campaignId, data) {
  publisher.publish(`campaign:progress:${campaignId}`, JSON.stringify({ campaignId, ...data }));
}

// --- campaign-dispatch: alıcıları tüm hesaplara dağıt ---
async function processCampaignDispatch(job) {
  const { campaignId } = job.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true, userId: true, status: true, messageTemplate: true,
      imageData: true, totalCount: true,
    },
  });
  if (!campaign) throw new Error(`Kampanya bulunamadı: ${campaignId}`);

  // Kapasitesi olan tüm bağlı hesapları getir (en az mesaj gönderenden başla)
  const accounts = await prisma.whatsappAccount.findMany({
    where: { status: 'connected' },
    orderBy: { dailyMessageCount: 'asc' },
  });
  const available = accounts.filter((a) => a.dailyMessageCount < a.dailyMessageLimit);

  if (available.length === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'failed' } });
    publishProgress(campaignId, { status: 'failed', reason: 'Bağlı WhatsApp hesabı yok' });
    return;
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'running', startedAt: new Date() },
  });

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: 'pending' },
    select: { id: true, phoneNumber: true, name: true },
  });

  const MESSAGE_DELAY_MS = 72000;
  const jobs = [];
  const overCapacityIds = [];
  let cursor = 0;

  // Her hesaba kapasitesi kadar alıcı dağıt, bağımsız gecikme sırası oluştur
  for (const account of available) {
    if (cursor >= recipients.length) break;
    const capacity = account.dailyMessageLimit - account.dailyMessageCount;
    const batch = recipients.slice(cursor, cursor + capacity);
    cursor += batch.length;

    batch.forEach((r, idx) => {
      jobs.push({
        name: 'send',
        data: {
          campaignId,
          recipientId: r.id,
          phoneNumber: r.phoneNumber,
          name: r.name,
          messageTemplate: campaign.messageTemplate,
          imageData: campaign.imageData || null,
          accountId: account.id,
        },
        opts: { delay: idx * MESSAGE_DELAY_MS, attempts: 2, backoff: { type: 'fixed', delay: 10000 } },
      });
    });
  }

  // Toplam kapasite yetersizse fazla alıcıları hemen failed yap
  if (cursor < recipients.length) {
    overCapacityIds.push(...recipients.slice(cursor).map((r) => r.id));
  }

  if (overCapacityIds.length > 0) {
    await prisma.$transaction([
      prisma.campaignRecipient.updateMany({
        where: { id: { in: overCapacityIds } },
        data: { status: 'failed', errorMessage: 'Günlük hesap kapasitesi yetersiz' },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { failedCount: { increment: overCapacityIds.length } },
      }),
    ]);
    console.warn(`[Dispatch] ${campaignId}: ${overCapacityIds.length} alıcı kapasitesizlik nedeniyle atlandı`);
  }

  await messageSendQueue.addBulk(jobs);

  publishProgress(campaignId, {
    status: 'running',
    totalCount: campaign.totalCount,
    successCount: 0,
    failedCount: overCapacityIds.length,
  });
}

// --- message-send: tek mesaj gönder ---
async function processMessageSend(job) {
  const { campaignId, recipientId, phoneNumber, name, messageTemplate, imageData, accountId } = job.data;
  const jobId = job.id;

  const message = messageTemplate.replace(/\{\{visitorname\}\}/gi, name || '');

  let success = false;
  let waMessageId = null;
  let errorMessage = null;

  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingSends.delete(jobId);
        reject(new Error('Mesaj gönderim timeout (60s)'));
      }, 60000);

      pendingSends.set(jobId, { resolve, reject, timer });

      publisher.publish('wa:commands', JSON.stringify({
        command: 'send',
        accountId,
        recipient: phoneNumber,
        message,
        imageData: imageData || null,
        jobId,
      }));
    });

    waMessageId = result.messageId;
    success = true;
  } catch (err) {
    errorMessage = err.message;
  }

  // Alıcı durumunu güncelle
  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: {
      status: success ? 'sent' : 'failed',
      waMessageId: waMessageId || null,
      errorMessage: errorMessage || null,
      sentAt: success ? new Date() : null,
    },
  });

  // Kampanya sayaçlarını güncelle ve progress yayınla
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: success
      ? { successCount: { increment: 1 } }
      : { failedCount: { increment: 1 } },
  });

  publishProgress(campaignId, {
    status: updated.status,
    totalCount: updated.totalCount,
    successCount: updated.successCount,
    failedCount: updated.failedCount,
  });

  // Tüm alıcılar işlendiyse finalize tetikle
  if (updated.successCount + updated.failedCount >= updated.totalCount) {
    await campaignFinalizeQueue.add('finalize', { campaignId }, { attempts: 3 });
  }
}

// --- campaign-finalize: kampanyayı kapat ---
async function processCampaignFinalize(job) {
  const { campaignId } = job.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status === 'completed' || campaign.status === 'failed') return;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'completed', completedAt: new Date() },
  });

  publishProgress(campaignId, {
    status: 'completed',
    totalCount: campaign.totalCount,
    successCount: campaign.successCount,
    failedCount: campaign.failedCount,
  });
}

// --- Worker'ları başlat ---
function startWorkers() {
  const dispatchWorker = new Worker(
    'campaign-dispatch',
    processCampaignDispatch,
    { connection, concurrency: 5 }
  );

  const sendWorker = new Worker(
    'message-send',
    processMessageSend,
    { connection, concurrency: 10 }
  );

  const finalizeWorker = new Worker(
    'campaign-finalize',
    processCampaignFinalize,
    { connection, concurrency: 5 }
  );

  for (const w of [dispatchWorker, sendWorker, finalizeWorker]) {
    w.on('failed', (job, err) => {
      console.error(`[Queue] ${w.name} job failed (${job?.id}):`, err.message);
    });
  }

  console.log('[Queue] Workers başlatıldı: campaign-dispatch, message-send, campaign-finalize');
  return { dispatchWorker, sendWorker, finalizeWorker };
}

module.exports = { startWorkers };
