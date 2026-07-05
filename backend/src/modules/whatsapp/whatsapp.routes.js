const { Router } = require('express');
const { body } = require('express-validator');
const { requireSuperAdmin } = require('../../middlewares/role.middleware');
const controller = require('./whatsapp.controller');

const router = Router();

router.use(requireSuperAdmin);

router.post(
  '/accounts',
  [
    body('phoneNumber').optional().matches(/^\d+$/).withMessage('Sadece rakam olmalı (ülke kodu dahil)'),
    body('displayName').optional().isString(),
    body('proxyHost').optional().isString(),
    body('proxyPort').optional().isInt({ min: 1, max: 65535 }),
    body('proxyUser').optional().isString(),
    body('proxyPass').optional().isString(),
  ],
  controller.addAccount
);

router.get('/accounts', controller.listAccounts);
router.post('/accounts/:id/connect', controller.connectAccount);
router.post('/accounts/:id/verify', controller.verifyAccount);
router.post('/accounts/:id/disconnect', controller.disconnectAccount);

router.patch(
  '/accounts/:id/type',
  [body('type').isIn(['active', 'backup']).withMessage("type 'active' veya 'backup' olmalı")],
  controller.updateType
);

router.get('/accounts/:id/health', controller.getHealth);

// 5SIM otomatik provisioning
router.post('/accounts/provision', controller.provisionAccount);

module.exports = router;
