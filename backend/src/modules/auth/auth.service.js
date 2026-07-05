const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/database');
const env = require('../../config/env');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
  );
}

async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    throw Object.assign(new Error('Geçersiz e-posta veya şifre'), { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Geçersiz e-posta veya şifre'), { status: 401 });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      credit: user.credit,
    },
  };
}

async function refresh(rawToken) {
  let payload;
  try {
    payload = jwt.verify(rawToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw Object.assign(new Error('Geçersiz veya süresi dolmuş token'), { status: 401 });
  }

  const tokenHash = hashToken(rawToken);
  const stored = await prisma.refreshToken.findFirst({
    where: { tokenHash, userId: payload.userId },
  });

  if (!stored || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Token bulunamadı veya süresi dolmuş'), { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.isActive) {
    throw Object.assign(new Error('Kullanıcı bulunamadı'), { status: 401 });
  }

  const accessToken = generateAccessToken(user);
  return { accessToken };
}

async function logout(rawToken) {
  let payload;
  try {
    payload = jwt.verify(rawToken, env.JWT_REFRESH_SECRET);
  } catch {
    // Token geçersiz olsa bile logout başarılı sayılır
    return;
  }

  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.deleteMany({
    where: { tokenHash, userId: payload.userId },
  });
}

async function changePassword(userId, oldPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error('Kullanıcı bulunamadı'), { status: 404 });
  }

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Mevcut şifre yanlış'), { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    }),
    // Tüm refresh token'ları iptal et — şifre değişince yeniden login zorunlu
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);
}

module.exports = { login, refresh, logout, changePassword };
