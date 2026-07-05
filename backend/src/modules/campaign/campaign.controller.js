const { validationResult } = require('express-validator');
const service = require('./campaign.service');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

async function createCampaign(req, res, next) {
  if (handleValidation(req, res)) return;
  try {
    const result = await service.createCampaign(
      req.user.userId,
      req.body,
      req.files?.file?.[0] || null,
      req.files?.image?.[0] || null
    );
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function getActiveCampaign(req, res, next) {
  try {
    const campaign = await service.getActiveCampaign(req.user.userId);
    res.json(campaign || null);
  } catch (err) { next(err); }
}

async function getCampaignProgress(req, res, next) {
  try {
    res.json(await service.getCampaignProgress(req.params.id, req.user.userId));
  } catch (err) { next(err); }
}

async function listCampaigns(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    res.json(await service.listCampaigns(req.user.userId, { page, limit }));
  } catch (err) { next(err); }
}

async function getCampaign(req, res, next) {
  try {
    res.json(await service.getCampaign(req.params.id, req.user.userId));
  } catch (err) { next(err); }
}

module.exports = {
  createCampaign, getActiveCampaign,
  getCampaignProgress, listCampaigns, getCampaign,
};
