const { validationResult } = require('express-validator');
const adminService = require('./admin.service');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

async function createCustomer(req, res, next) {
  if (handleValidation(req, res)) return;
  try {
    const result = await adminService.createCustomer(req.body.email, req.body.fullName);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function listCustomers(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await adminService.listCustomers({ page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getCustomer(req, res, next) {
  try {
    const result = await adminService.getCustomer(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function loadCredit(req, res, next) {
  if (handleValidation(req, res)) return;
  try {
    const result = await adminService.loadCredit(
      req.params.id,
      req.body.amount,
      req.body.description
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getCreditHistory(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await adminService.getCreditHistory(req.params.id, { page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { createCustomer, listCustomers, getCustomer, loadCredit, getCreditHistory };
