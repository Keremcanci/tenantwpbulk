const { validationResult } = require('express-validator');
const authService = require('./auth.service');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

async function login(req, res, next) {
  if (handleValidation(req, res)) return;
  try {
    const result = await authService.login(req.body.email, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  if (handleValidation(req, res)) return;
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  if (handleValidation(req, res)) return;
  try {
    await authService.logout(req.body.refreshToken);
    res.json({ message: 'Çıkış yapıldı' });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  if (handleValidation(req, res)) return;
  try {
    await authService.changePassword(
      req.user.userId,
      req.body.oldPassword,
      req.body.newPassword
    );
    res.json({ message: 'Şifre güncellendi' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, refresh, logout, changePassword };
