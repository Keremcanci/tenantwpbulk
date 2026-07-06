const prisma = require('../../config/database');
const { publisher, subscriber } = require('../../config/redis');

// accountId → { resolve, reject, timer }
const pendingConnects = new Map();

let subscriberReady = false;

function ensureSubscriber() {
  if (subscriberReady) return;
  subscriberReady = true;

  subscriber.subscribe('wa:events').catch(() => {});

  subscriber.on('message', (channel, raw) => {
    if (channel !== 'wa:events') return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    const pending = pendingConnects.get(data.accountId);
    if (pending) {
      if (data.event === 'pairingCode') {
        clearTimeout(pending.timer);
        pending.resolve(data.code);
        pendingConnects.delete(data.accountId);
      } else if (data.event === 'connectError') {
        clearTimeout(pending.timer);
        pending.reject(Object.assign(new Error(data.message || 'Bağlantı hatası'), { status: 500 }));
        pendingConnects.delete(data.accountId);
      }
    }
  });
}

async function addAccount({ phoneNumber, displayName, proxyHost, proxyPort, proxyUser, proxyPass }) {
  if (phoneNumber) {
    const existing = await prisma.whatsappAccount.findUnique({ where: { phoneNumber } });
    if (existing) {
      throw Object.assign(new Error('Bu numara zaten kayıtlı'), { status: 409 });
    }
  }

  return prisma.whatsappAccount.create({
    data: { phoneNumber, displayName, proxyHost, proxyPort, proxyUser, proxyPass },
    select: {
      id: true, phoneNumber: true, displayName: true, status: true, type: true,
      proxyHost: true, proxyPort: true, createdAt: true,
    },
  });
}

async function listAccounts() {
  return prisma.whatsappAccount.findMany({
    select: {
      id: true, phoneNumber: true, displayName: true, status: true, type: true,
      dailyMessageCount: true, dailyMessageLimit: true,
      lastConnectedAt: true, lastMessageSentAt: true,
      proxyHost: true, proxyPort: true, workerId: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function getAccount(id) {
  const account = await prisma.whatsappAccount.findUnique({
    where: { id },
    select: {
      id: true, phoneNumber: true, displayName: true, status: true, type: true,
      dailyMessageCount: true, dailyMessageLimit: true,
      lastConnectedAt: true, lastMessageSentAt: true,
      proxyHost: true, proxyPort: true, workerId: true,
      createdAt: true, updatedAt: true,
    },
  });
  if (!account) throw Object.assign(new Error('Hesap bulunamadı'), { status: 404 });
  return account;
}

async function connectAccount(id) {
  const account = await prisma.whatsappAccount.findUnique({ where: { id } });
  if (!account) throw Object.assign(new Error('Hesap bulunamadı'), { status: 404 });
  if (account.status === 'connected') {
    throw Object.assign(new Error('Hesap zaten bağlı'), { status: 400 });
  }

  ensureSubscriber();

  await prisma.whatsappAccount.update({
    where: { id },
    data: { status: 'connecting' },
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingConnects.delete(id);
      reject(Object.assign(new Error('Worker yanıt vermedi (timeout 30s)'), { status: 504 }));
    }, 30000);

    pendingConnects.set(id, { resolve, reject, timer });

    publisher.publish('wa:commands', JSON.stringify({ command: 'connect', accountId: id }));
  });
}

async function verifyAccount(id) {
  const account = await prisma.whatsappAccount.findUnique({
    where: { id },
    select: { id: true, status: true, phoneNumber: true, lastConnectedAt: true },
  });
  if (!account) throw Object.assign(new Error('Hesap bulunamadı'), { status: 404 });
  return account;
}

async function disconnectAccount(id) {
  const account = await prisma.whatsappAccount.findUnique({ where: { id } });
  if (!account) throw Object.assign(new Error('Hesap bulunamadı'), { status: 404 });

  await publisher.publish('wa:commands', JSON.stringify({ command: 'disconnect', accountId: id }));

  await prisma.whatsappAccount.update({
    where: { id },
    data: { status: 'disconnected' },
  });
}

async function updateType(id, type) {
  const account = await prisma.whatsappAccount.findUnique({ where: { id } });
  if (!account) throw Object.assign(new Error('Hesap bulunamadı'), { status: 404 });

  return prisma.whatsappAccount.update({
    where: { id },
    data: { type },
    select: { id: true, phoneNumber: true, type: true, status: true },
  });
}

async function getHealth(id) {
  const account = await prisma.whatsappAccount.findUnique({
    where: { id },
    select: {
      id: true, phoneNumber: true, displayName: true, status: true, type: true,
      dailyMessageCount: true, dailyMessageLimit: true,
      lastConnectedAt: true, lastMessageSentAt: true,
      workerId: true, proxyHost: true, proxyPort: true,
    },
  });
  if (!account) throw Object.assign(new Error('Hesap bulunamadı'), { status: 404 });

  publisher.publish('wa:commands', JSON.stringify({ command: 'health', accountId: id }));

  return account;
}

module.exports = {
  addAccount, listAccounts, getAccount,
  connectAccount, verifyAccount, disconnectAccount,
  updateType, getHealth,
};
