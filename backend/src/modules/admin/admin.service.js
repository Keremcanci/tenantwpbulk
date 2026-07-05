const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../../config/database');

function generatePassword(length = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join('');
}

async function createCustomer(email, fullName) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw Object.assign(new Error('Bu e-posta adresi zaten kullanımda'), { status: 409 });
  }

  const plainPassword = generatePassword();
  const passwordHash = await bcrypt.hash(plainPassword, 12);

  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, role: 'customer' },
    select: { id: true, email: true, fullName: true, role: true, credit: true, isActive: true, createdAt: true },
  });

  return { ...user, password: plainPassword };
}

async function listCustomers({ page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const [customers, total] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'customer' },
      select: { id: true, email: true, fullName: true, credit: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where: { role: 'customer' } }),
  ]);

  return { customers, total, page, limit, pages: Math.ceil(total / limit) };
}

async function getCustomer(id) {
  const user = await prisma.user.findFirst({
    where: { id, role: 'customer' },
    select: {
      id: true, email: true, fullName: true, credit: true,
      isActive: true, createdAt: true, updatedAt: true,
      _count: { select: { campaigns: true } },
    },
  });

  if (!user) {
    throw Object.assign(new Error('Müşteri bulunamadı'), { status: 404 });
  }

  return user;
}

async function loadCredit(customerId, amount, description) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw Object.assign(new Error('Geçersiz kredi miktarı'), { status: 400 });
  }

  const user = await prisma.user.findFirst({ where: { id: customerId, role: 'customer' } });
  if (!user) {
    throw Object.assign(new Error('Müşteri bulunamadı'), { status: 404 });
  }

  const [updatedUser, transaction] = await prisma.$transaction([
    prisma.user.update({
      where: { id: customerId },
      data: { credit: { increment: amount } },
      select: { id: true, email: true, fullName: true, credit: true },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: customerId,
        type: 'load',
        amount,
        description: description || `${amount} kredi yüklendi`,
      },
      select: { id: true, type: true, amount: true, description: true, createdAt: true },
    }),
  ]);

  return { user: updatedUser, transaction };
}

async function getCreditHistory(customerId, { page = 1, limit = 20 } = {}) {
  const user = await prisma.user.findFirst({ where: { id: customerId, role: 'customer' } });
  if (!user) {
    throw Object.assign(new Error('Müşteri bulunamadı'), { status: 404 });
  }

  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId: customerId },
      select: {
        id: true, type: true, amount: true, description: true, createdAt: true,
        campaign: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.creditTransaction.count({ where: { userId: customerId } }),
  ]);

  return { transactions, total, page, limit, pages: Math.ceil(total / limit) };
}

module.exports = { createCustomer, listCustomers, getCustomer, loadCredit, getCreditHistory };
