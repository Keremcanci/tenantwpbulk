const { validationResult } = require('express-validator');
const service = require('./whatsapp.service');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

async function addAccount(req, res, next) {
  if (handleValidation(req, res)) return;
  try {
    const result = await service.addAccount(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function listAccounts(req, res, next) {
  try {
    res.json(await service.listAccounts());
  } catch (err) { next(err); }
}

async function connectAccount(req, res, next) {
  try {
    const code = await service.connectAccount(req.params.id);
    res.json({ pairingCode: code, message: 'Bu kodu WhatsApp uygulamanıza girin' });
  } catch (err) { next(err); }
}

async function verifyAccount(req, res, next) {
  try {
    res.json(await service.verifyAccount(req.params.id));
  } catch (err) { next(err); }
}

async function disconnectAccount(req, res, next) {
  try {
    await service.disconnectAccount(req.params.id);
    res.json({ message: 'Bağlantı kesildi' });
  } catch (err) { next(err); }
}

async function updateType(req, res, next) {
  if (handleValidation(req, res)) return;
  try {
    res.json(await service.updateType(req.params.id, req.body.type));
  } catch (err) { next(err); }
}

async function getHealth(req, res, next) {
  try {
    res.json(await service.getHealth(req.params.id));
  } catch (err) { next(err); }
}

module.exports = {
  addAccount, listAccounts,
  connectAccount, verifyAccount, disconnectAccount,
  updateType, getHealth,
};
