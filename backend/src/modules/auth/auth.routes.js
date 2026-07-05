const { Router } = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const controller = require('./auth.controller');
const { requireAuth } = require('../../middlewares/auth.middleware');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Çok fazla giriş denemesi. 1 dakika bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Geçerli bir e-posta girin'),
    body('password').notEmpty().withMessage('Şifre gerekli'),
  ],
  controller.login
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('refreshToken gerekli')],
  controller.refresh
);

router.post(
  '/logout',
  [body('refreshToken').notEmpty().withMessage('refreshToken gerekli')],
  controller.logout
);

router.post(
  '/change-password',
  requireAuth,
  [
    body('oldPassword').notEmpty().withMessage('Mevcut şifre gerekli'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Yeni şifre en az 8 karakter olmalı'),
  ],
  controller.changePassword
);

module.exports = router;
