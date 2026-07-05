const os = require('os');
const prisma = require('../../config/database');
const { publisher } = require('../../config/redis');
const { getQueueStats, clearAllQueues, messageSendQueue } = require('../queue/queue');

function getCpuPercent() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  return Math.round((1 - totalIdle / totalTick) * 100);
}

async function getRedisMemoryMb() {
  try {
    const info = await publisher.info('memory');
    const match = info.match(/used_memory:(\d+)/);
    return match ? Math.round(parseInt(match[1]) / 1024 / 1024) : 0;
  } catch {
    return 0;
  }
}

async function getDashboard() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    todayMessages,
    activeCampaigns,
    queueStats,
    waAccounts,
    redisMemMb,
  ] = await Promise.all([
    prisma.campaignRecipient.count({
      where: { status: 'sent', sentAt: { gte: todayStart } },
    }),
    prisma.campaign.count({
      where: { status: { in: ['pending', 'running'] } },
    }),
    getQueueStats(),
    prisma.whatsappAccount.groupBy({
      by: ['status', 'type'],
      _count: { id: true },
    }),
    getRedisMemoryMb(),
  ]);

  const waStats = { connected: 0, backup: 0, banned: 0, disconnected: 0, suspended: 0 };
  for (const row of waAccounts) {
    if (row.type === 'backup') {
      waStats.backup += row._count.id;
    } else if (row.status === 'connected') {
      waStats.connected += row._count.id;
    } else if (row.status === 'banned') {
      waStats.banned += row._count.id;
    } else if (row.status === 'suspended') {
      waStats.suspended += row._count.id;
    } else {
      waStats.disconnected += row._count.id;
    }
  }

  const totalRamGb = os.totalmem() / 1024 / 1024 / 1024;
  const freeRamGb = os.freemem() / 1024 / 1024 / 1024;

  const queueWaiting =
    (queueStats.dispatch.waiting || 0) +
    (queueStats.send.waiting || 0) +
    (queueStats.send.delayed || 0) +
    (queueStats.finalize.waiting || 0);

  return {
    today_messages_sent: todayMessages,
    active_campaigns: activeCampaigns,
    queue_waiting: queueWaiting,
    whatsapp_accounts: waStats,
    server_health: {
      cpu_percent: getCpuPercent(),
      ram_used_gb: parseFloat((totalRamGb - freeRamGb).toFixed(2)),
      ram_total_gb: parseFloat(totalRamGb.toFixed(2)),
      redis_memory_mb: redisMemMb,
    },
  };
}

async function getActiveCampaigns() {
  return prisma.campaign.findMany({
    where: { status: { in: ['pending', 'running'] } },
    select: {
      id: true, title: true, status: true,
      totalCount: true, successCount: true, failedCount: true,
      creditUsed: true, startedAt: true, createdAt: true,
      user: { select: { id: true, email: true, fullName: true } },
      whatsappAccount: { select: { phoneNumber: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function stopCampaign(campaignId) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw Object.assign(new Error('Kampanya bulunamadı'), { status: 404 });
  if (!['pending', 'running'].includes(campaign.status)) {
    throw Object.assign(new Error('Kampanya zaten tamamlanmış veya durdurulmuş'), { status: 400 });
  }

  // BullMQ'dan bu kampanyaya ait bekleyen message-send job'larını kaldır
  try {
    const waitingJobs = await messageSendQueue.getJobs(['waiting', 'delayed', 'prioritized']);
    await Promise.all(
      waitingJobs
        .filter((j) => j.data?.campaignId === campaignId)
        .map((j) => j.remove().catch(() => {}))
    );
  } catch (err) {
    console.warn('[Dashboard] BullMQ job temizleme hatası:', err.message);
  }

  // DB'yi güncelle: kampanya failed, pending alıcılar failed
  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed', completedAt: new Date() },
    }),
    prisma.campaignRecipient.updateMany({
      where: { campaignId, status: 'pending' },
      data: { status: 'failed', errorMessage: 'Admin tarafından durduruldu' },
    }),
  ]);

  publisher.publish(`campaign:progress:${campaignId}`, JSON.stringify({
    campaignId,
    status: 'failed',
    stopped: true,
  }));

  return { stopped: true };
}

async function getQueueStatsService() {
  return getQueueStats();
}

async function clearQueues() {
  await clearAllQueues();
  return { cleared: true };
}

module.exports = {
  getDashboard,
  getActiveCampaigns,
  stopCampaign,
  getQueueStatsService,
  clearQueues,
};
