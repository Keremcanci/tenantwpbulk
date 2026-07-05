const service = require('./dashboard.service');

async function getDashboard(req, res, next) {
  try {
    res.json(await service.getDashboard());
  } catch (err) { next(err); }
}

async function getActiveCampaigns(req, res, next) {
  try {
    res.json(await service.getActiveCampaigns());
  } catch (err) { next(err); }
}

async function stopCampaign(req, res, next) {
  try {
    res.json(await service.stopCampaign(req.params.id));
  } catch (err) { next(err); }
}

async function getQueueStats(req, res, next) {
  try {
    res.json(await service.getQueueStatsService());
  } catch (err) { next(err); }
}

async function clearQueues(req, res, next) {
  try {
    res.json(await service.clearQueues());
  } catch (err) { next(err); }
}

module.exports = { getDashboard, getActiveCampaigns, stopCampaign, getQueueStats, clearQueues };
