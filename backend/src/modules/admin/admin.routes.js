const { Router } = require('express');
const { body } = require('express-validator');
const { requireSuperAdmin } = require('../../middlewares/role.middleware');
const controller = require('./admin.controller');
const dashController = require('./dashboard.controller');

const router = Router();

router.use(requireSuperAdmin);

// Dashboard
router.get('/dashboard', dashController.getDashboard);

// Kampanya operasyonları
router.get('/campaigns', dashController.getActiveCampaigns);
router.post('/campaigns/:id/stop', dashController.stopCampaign);

// Kuyruk
router.get('/queue/stats', dashController.getQueueStats);
router.post('/queue/clear', dashController.clearQueues);

router.post(
  '/customers',
  [
    body('email').isEmail().withMessage('Geçerli bir e-posta girin'),
    body('fullName').trim().notEmpty().withMessage('Ad soyad gerekli'),
  ],
  controller.createCustomer
);

router.get('/customers', controller.listCustomers);

router.get('/customers/:id', controller.getCustomer);

router.post(
  '/customers/:id/credit',
  [
    body('amount').isInt({ min: 1 }).withMessage('Miktar en az 1 olmalı'),
    body('description').optional().isString(),
  ],
  controller.loadCredit
);

router.get('/customers/:id/credit-history', controller.getCreditHistory);

module.exports = router;
