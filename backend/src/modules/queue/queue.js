const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

const campaignDispatchQueue = new Queue('campaign-dispatch', { connection });
const messageSendQueue = new Queue('message-send', { connection });
const campaignFinalizeQueue = new Queue('campaign-finalize', { connection });

async function getQueueStats() {
  const [dispatch, send, finalize] = await Promise.all([
    campaignDispatchQueue.getJobCounts(),
    messageSendQueue.getJobCounts(),
    campaignFinalizeQueue.getJobCounts(),
  ]);
  return { dispatch, send, finalize };
}

async function clearAllQueues() {
  await Promise.all([
    campaignDispatchQueue.obliterate({ force: true }),
    messageSendQueue.obliterate({ force: true }),
    campaignFinalizeQueue.obliterate({ force: true }),
  ]);
}

module.exports = {
  campaignDispatchQueue,
  messageSendQueue,
  campaignFinalizeQueue,
  getQueueStats,
  clearAllQueues,
};
