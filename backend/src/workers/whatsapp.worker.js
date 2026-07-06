require('dotenv').config();
const Redis = require('ioredis');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const evo = require('../config/evolution');

const prisma = new PrismaClient();
const subscriber = new Redis(process.env.REDIS_URL);
const publisher = new Redis(process.env.REDIS_URL);

const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
const WEBHOOK_BASE = `${BACKEND_URL}/webhook/evolution`;

function emit(event) {
  publisher.publish('wa:events', JSON.stringify(event));
}

async function updateStatus(accountId, status) {
  await prisma.whatsappAccount.update({ where: { id: accountId }, data: { status } });
  emit({ event: 'statusChange', accountId, status });
}

async function connectAccount(accountId) {
  const account = await prisma.whatsappAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  await updateStatus(accountId, 'connecting');

  try {
    await evo.createInstance(accountId).catch(() => {});
    await evo.setWebhook(accountId, `${WEBHOOK_BASE}/${accountId}`);
    const result = await evo.connectInstance(accountId, account.phoneNumber);

    if (result?.pairingCode) {
      emit({ event: 'pairingCode', accountId, code: result.pairingCode });
      console.log(`[Worker] ${accountId}: Pairing code → ${result.pairingCode}`);
    } else if (result?.base64) {
      emit({ event: 'qrCode', accountId, qr: result.base64 });
      console.log(`[Worker] ${accountId}: QR code üretildi`);
    } else {
      console.log(`[Worker] ${accountId}: Bağlantı isteği gönderildi`);
    }
  } catch (err) {
    console.error(`[Worker] ${accountId}: Bağlantı hatası:`, err.message, err.data || '');
    emit({ event: 'connectError', accountId, message: err.message });
    await updateStatus(accountId, 'disconnected');
  }
}

async function handleCommand(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  const { command, accountId } = data;
  console.log(`[Worker] Komut: ${command} → ${accountId}`);

  switch (command) {
    case 'connect':
      await connectAccount(accountId).catch(console.error);
      break;

    case 'disconnect':
      try { await evo.logoutInstance(accountId); } catch {}
      await updateStatus(accountId, 'disconnected');
      break;

    case 'send': {
      try {
        if (data.imageData) {
          await evo.sendMedia(accountId, data.recipient, data.imageData, data.message);
        } else {
          await evo.sendText(accountId, data.recipient, data.message);
        }
        emit({
          event: 'sent',
          accountId,
          recipient: data.recipient,
          messageId: Date.now().toString(),
          jobId: data.jobId,
        });
        await prisma.whatsappAccount.update({
          where: { id: accountId },
          data: { lastMessageSentAt: new Date(), dailyMessageCount: { increment: 1 } },
        });
      } catch (err) {
        emit({
          event: 'sendError',
          accountId,
          recipient: data.recipient,
          message: err.message,
          jobId: data.jobId,
        });
      }
      break;
    }

    case 'health':
      emit({ event: 'health', accountId, connected: true, pid: process.pid });
      break;
  }
}

cron.schedule('0 0 * * *', async () => {
  try {
    const result = await prisma.whatsappAccount.updateMany({ data: { dailyMessageCount: 0 } });
    console.log(`[Worker] Günlük sayaçlar sıfırlandı: ${result.count} hesap`);
  } catch (err) {
    console.error('[Worker] Cron hatası:', err.message);
  }
}, { timezone: 'Europe/Istanbul' });

async function main() {
  console.log('[Worker] Başlatılıyor...');

  subscriber.subscribe('wa:commands');
  subscriber.on('message', (channel, message) => {
    if (channel === 'wa:commands') handleCommand(message);
  });

  const accounts = await prisma.whatsappAccount.findMany({
    where: { status: { in: ['connected', 'connecting'] } },
    select: { id: true },
  });

  for (const acc of accounts) {
    evo.setWebhook(acc.id, `${WEBHOOK_BASE}/${acc.id}`).catch(() => {});
  }

  console.log(`[Worker] Hazır. PID: ${process.pid}`);
}

main().catch((err) => {
  console.error('[Worker] Başlatma hatası:', err);
  process.exit(1);
});
