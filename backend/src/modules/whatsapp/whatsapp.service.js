const prisma = require('../../config/database');
const { publisher, subscriber } = require('../../config/redis');
const fivesim = require('../../config/fivesim');
const env = require('../../config/env');

// accountId → orderId (5SIM siparişleri)
const pendingOrders = new Map();

// accountId → { resolve, reject, timer }
const pendingConnects = new Map();

// API tarafı event dinleyicisi (tek seferlik başlatılır)
let subscriberReady = false;

function ensureSubscriber() {
  if (subscriberReady) return;
  subscriberReady = true;

  subscriber.subscribe('wa:events').catch(() => {});

  subscriber.on('message', (channel, raw) => {
    if (channel !== 'wa:events') return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // Manuel bağlantı için pairing code beklentisi
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

    // 5SIM provisioning olayları
    const prov = pendingProvisions.get(data.accountId);
    if (prov) {
      if (data.event === 'smsCodeRequested') {
        prov.onSmsRequested();
      } else if (data.event === 'registerError') {
        prov.onError(data.message || 'Kayıt hatası');
      }
    }
  });
}

// Provisioning beklentileri: accountId → { onSmsRequested, onError }
const pendingProvisions = new Map();

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

  // Worker'dan anlık durum iste (fire-and-forget, cevap WS üzerinden gelir)
  publisher.publish('wa:commands', JSON.stringify({ command: 'health', accountId: id }));

  return account;
}

// --- 5SIM Otomatik Provisioning ---
async function provisionAccount({ displayName, proxyHost, proxyPort, proxyUser, proxyPass } = {}) {
  if (!env.FIVESIM_API_KEY) {
    throw Object.assign(new Error('FIVESIM_API_KEY .env dosyasında tanımlı değil'), { status: 500 });
  }

  ensureSubscriber();

  // 1. 5SIM'den numara al
  const { orderId, phone } = await fivesim.buyNumber(
    env.FIVESIM_API_KEY,
    env.FIVESIM_COUNTRY,
    env.FIVESIM_OPERATOR,
    'whatsapp'
  );

  const phoneNumber = phone.replace(/\D/g, '');

  // 2. DB'ye kaydet
  const account = await prisma.whatsappAccount.create({
    data: { phoneNumber, displayName: displayName || `5SIM-${phoneNumber}`, status: 'connecting', proxyHost, proxyPort, proxyUser, proxyPass },
    select: { id: true, phoneNumber: true, displayName: true, status: true, type: true, createdAt: true },
  });

  pendingOrders.set(account.id, orderId);

  // 3. Arka planda provision işlemini başlat (HTTP hemen döner)
  runProvision(account.id, orderId).catch((err) => {
    console.error(`[Service] Provision hatası ${account.id}:`, err.message);
    prisma.whatsappAccount.update({
      where: { id: account.id },
      data: { status: 'disconnected' },
    }).catch(() => {});
    fivesim.cancelOrder(env.FIVESIM_API_KEY, orderId).catch(() => {});
    pendingOrders.delete(account.id);
  });

  return account;
}

async function runProvision(accountId, orderId) {
  // Worker'a provision komutu gönder
  await publisher.publish('wa:commands', JSON.stringify({ command: 'provision', accountId }));

  // Worker'dan SMS kodu bekleniyor sinyalini bekle (45s)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingProvisions.delete(accountId);
      reject(new Error('Worker provision başlatma timeout (45s)'));
    }, 45000);

    pendingProvisions.set(accountId, {
      onSmsRequested: () => { clearTimeout(timer); pendingProvisions.delete(accountId); resolve(); },
      onError: (msg) => { clearTimeout(timer); pendingProvisions.delete(accountId); reject(new Error(msg)); },
    });
  });

  // 5SIM'den SMS kodunu bekle (5 dakika)
  const code = await fivesim.waitForSms(env.FIVESIM_API_KEY, orderId);
  console.log(`[Service] 5SIM SMS kodu alındı: ${code} (hesap: ${accountId})`);

  // Worker'a kodu gönder
  await publisher.publish('wa:commands', JSON.stringify({ command: 'registerSms', accountId, code }));

  // 5SIM siparişini tamamla
  await fivesim.finishOrder(env.FIVESIM_API_KEY, orderId).catch(() => {});
  pendingOrders.delete(accountId);
}

// --- Toplu 5SIM Provisioning ---
async function bulkProvisionAccounts({ count, proxyHost, proxyPort, proxyUser, proxyPass }) {
  if (!count || count < 1 || count > 100) {
    throw Object.assign(new Error('Hesap sayısı 1-100 arasında olmalı'), { status: 400 });
  }

  // Arka planda çalıştır, hemen dön
  runBulkProvision({ count, proxyHost, proxyPort, proxyUser, proxyPass }).catch((err) => {
    console.error('[BulkProvision] Hata:', err.message);
  });

  return { started: true, count };
}

async function runBulkProvision({ count, proxyHost, proxyPort, proxyUser, proxyPass }) {
  const DELAY_MS = 30000; // Her hesap arasında 30 saniye bekle

  for (let i = 0; i < count; i++) {
    try {
      console.log(`[BulkProvision] ${i + 1}/${count} başlatılıyor...`);
      await provisionAccount({
        proxyHost: proxyHost || undefined,
        proxyPort: proxyPort ? parseInt(proxyPort) : undefined,
        proxyUser: proxyUser || undefined,
        proxyPass: proxyPass || undefined,
      });
      console.log(`[BulkProvision] ${i + 1}/${count} başlatıldı`);
    } catch (err) {
      console.error(`[BulkProvision] ${i + 1}/${count} hata:`, err.message);
    }

    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log('[BulkProvision] Tamamlandı');
}

module.exports = {
  addAccount, listAccounts, getAccount,
  connectAccount, verifyAccount, disconnectAccount,
  updateType, getHealth,
  provisionAccount, bulkProvisionAccounts,
};
