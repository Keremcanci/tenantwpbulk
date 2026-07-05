require('dotenv').config();
const Redis = require('ioredis');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { encrypt, decrypt } = require('../config/encryption');

const prisma = new PrismaClient();
const subscriber = new Redis(process.env.REDIS_URL);
const publisher = new Redis(process.env.REDIS_URL);

// accountId → { socket, retryCount, retryTimer }
const instances = new Map();

// 5SIM provisioning ile başlatılan hesaplar (pairing code istenmez)
const provisioningAccounts = new Set();

const RETRY_DELAYS = [5000, 15000, 45000, 120000, 300000, 900000];

let makeWASocket, makeRegistrationSocket, DisconnectReason, fetchLatestBaileysVersion;

async function loadBaileys() {
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.default;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;

  // makeRegistrationSocket ana export'ta yok, direkt modülden al
  const registration = await import('@whiskeysockets/baileys/lib/Socket/registration.js');
  makeRegistrationSocket = registration.makeRegistrationSocket;
}

// --- PostgreSQL Auth State ---
async function usePostgresAuthState(accountId) {
  const { initAuthCreds, proto } = await import('@whiskeysockets/baileys');

  const account = await prisma.whatsappAccount.findUnique({ where: { id: accountId } });

  let creds = initAuthCreds();
  let keysData = {};

  if (account?.sessionData) {
    try {
      const json = JSON.parse(decrypt(account.sessionData));
      creds = json.creds || creds;
      keysData = json.keys || {};
    } catch {
      console.warn(`[Worker] ${accountId}: session_data decrypt edilemedi, sıfırdan başlanıyor`);
    }
  }

  async function saveToDb() {
    const encrypted = encrypt(JSON.stringify({ creds, keys: keysData }));
    await prisma.whatsappAccount.update({
      where: { id: accountId },
      data: { sessionData: encrypted },
    });
  }

  const keys = {
    async get(type, ids) {
      const result = {};
      for (const id of ids) {
        const val = keysData[type]?.[id];
        if (val != null) result[id] = val;
      }
      return result;
    },
    async set(data) {
      for (const [type, values] of Object.entries(data)) {
        keysData[type] = keysData[type] || {};
        for (const [id, value] of Object.entries(values)) {
          if (value != null) keysData[type][id] = value;
          else delete keysData[type][id];
        }
      }
      await saveToDb();
    },
  };

  return {
    state: { creds, keys },
    saveCreds: async () => { await saveToDb(); },
  };
}

// --- Publish helpers ---
function emit(event) {
  publisher.publish('wa:events', JSON.stringify(event));
}

async function updateStatus(accountId, status) {
  await prisma.whatsappAccount.update({ where: { id: accountId }, data: { status } });
  emit({ event: 'statusChange', accountId, status });
}

// --- Reconnect ---
function scheduleReconnect(accountId) {
  const instance = instances.get(accountId);
  if (!instance) return;

  const delay = RETRY_DELAYS[Math.min(instance.retryCount, RETRY_DELAYS.length - 1)];
  instance.retryCount++;

  console.log(`[Worker] ${accountId}: ${delay / 1000}s sonra yeniden bağlanılacak (deneme ${instance.retryCount})`);

  instance.retryTimer = setTimeout(() => {
    if (instances.has(accountId)) {
      startConnection(accountId).catch(console.error);
    }
  }, delay);
}

// --- Main connection logic ---
async function startConnection(accountId) {
  const account = await prisma.whatsappAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  // Mevcut instance'ı temizle
  const existing = instances.get(accountId);
  if (existing?.socket) {
    try { existing.socket.end(); } catch {}
  }

  const { state, saveCreds } = await usePostgresAuthState(accountId);

  // Proxy agent (9proxy HTTP sticky session)
  let agent;
  if (account.proxyHost && account.proxyPort) {
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    const ssid = accountId.replace(/-/g, '').slice(0, 12);
    const user = account.proxyUser
      ? `${account.proxyUser}-ssid-${ssid}:${account.proxyPass}@`
      : '';
    agent = new HttpsProxyAgent(`http://${user}${account.proxyHost}:${account.proxyPort}`);
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' }),
    agent,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  const retryCount = instances.get(accountId)?.retryCount || 0;
  instances.set(accountId, { socket: sock, retryCount, retryTimer: null });

  sock.ev.on('creds.update', saveCreds);

  // Bağlantı kurulmamışsa pairing code iste (manuel bağlantı için)
  if (!state.creds.registered && !provisioningAccounts.has(accountId)) {
    try {
      await updateStatus(accountId, 'connecting');
      const code = await sock.requestPairingCode(account.phoneNumber.replace(/\D/g, ''));
      emit({ event: 'pairingCode', accountId, code });
      console.log(`[Worker] ${accountId}: Pairing code → ${code}`);
    } catch (err) {
      emit({ event: 'connectError', accountId, message: err.message });
      console.error(`[Worker] ${accountId}: Pairing code hatası:`, err.message);
    }
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      const instance = instances.get(accountId);
      if (instance) instance.retryCount = 0;

      await prisma.whatsappAccount.update({
        where: { id: accountId },
        data: {
          status: 'connected',
          lastConnectedAt: new Date(),
          workerId: `worker-${process.pid}`,
        },
      });
      emit({ event: 'statusChange', accountId, status: 'connected' });
      console.log(`[Worker] ${accountId}: Bağlandı`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      const isBanned =
        statusCode === DisconnectReason.loggedOut ||
        statusCode === DisconnectReason.multideviceMismatch;

      if (isBanned) {
        await prisma.whatsappAccount.update({
          where: { id: accountId },
          data: { status: 'banned', sessionData: null },
        });
        emit({ event: 'statusChange', accountId, status: 'banned' });
        instances.delete(accountId);
        console.log(`[Worker] ${accountId}: BAN tespit edildi`);
      } else {
        await updateStatus(accountId, 'disconnected');
        scheduleReconnect(accountId);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    // Gönderim onayları için kullanılacak (Modül 5)
    for (const msg of messages) {
      if (msg.key.fromMe) {
        publisher.publish('wa:message-acks', JSON.stringify({
          accountId,
          messageId: msg.key.id,
          status: 'sent',
        }));
      }
    }
  });
}

// --- Command handler ---
async function handleCommand(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  const { command, accountId } = data;
  console.log(`[Worker] Komut alındı: ${command} → ${accountId}`);

  switch (command) {
    case 'connect':
      await startConnection(accountId).catch((err) => {
        emit({ event: 'connectError', accountId, message: err.message });
      });
      break;

    case 'disconnect': {
      const instance = instances.get(accountId);
      if (instance) {
        clearTimeout(instance.retryTimer);
        try { instance.socket?.end(); } catch {}
        instances.delete(accountId);
      }
      await updateStatus(accountId, 'disconnected');
      break;
    }

    case 'send': {
      const instance = instances.get(accountId);
      if (!instance?.socket) {
        emit({ event: 'sendError', accountId, recipient: data.recipient, message: 'Hesap bağlı değil' });
        return;
      }
      try {
        const jid = `${data.recipient}@s.whatsapp.net`;
        const content = data.imageData
          ? { image: Buffer.from(data.imageData, 'base64'), caption: data.message || undefined }
          : { text: data.message };
        const result = await instance.socket.sendMessage(jid, content);
        emit({
          event: 'sent',
          accountId,
          recipient: data.recipient,
          messageId: result.key.id,
          jobId: data.jobId,
        });
        await prisma.whatsappAccount.update({
          where: { id: accountId },
          data: {
            lastMessageSentAt: new Date(),
            dailyMessageCount: { increment: 1 },
          },
        });
      } catch (err) {
        emit({
          event: 'sendError',
          accountId,
          recipient: data.recipient,
          message: err.message,
          jobId: data.jobId,
        });
      }
      break;
    }

    case 'health':
      emit({
        event: 'health',
        accountId,
        connected: instances.has(accountId),
        pid: process.pid,
      });
      break;

    // 5SIM otomatik provisioning: SMS ile kayıt
    case 'provision': {
      try {
        provisioningAccounts.add(accountId);
        await prisma.whatsappAccount.update({
          where: { id: accountId },
          data: { status: 'connecting' },
        });

        const { state, saveCreds } = await usePostgresAuthState(accountId);
        const account = await prisma.whatsappAccount.findUnique({ where: { id: accountId } });

        let agent;
        if (account.proxyHost && account.proxyPort) {
          const { HttpsProxyAgent } = await import('https-proxy-agent');
          const ssid = accountId.replace(/-/g, '').slice(0, 12);
          const user = account.proxyUser ? `${account.proxyUser}-ssid-${ssid}:${account.proxyPass}@` : '';
          agent = new HttpsProxyAgent(`http://${user}${account.proxyHost}:${account.proxyPort}`);
        }

        const { version } = await fetchLatestBaileysVersion();
        const sock = makeRegistrationSocket({
          version,
          auth: state,
          printQRInTerminal: false,
          logger: require('pino')({ level: 'silent' }),
          agent,
          generateHighQualityLinkPreview: false,
          syncFullHistory: false,
          // makeRegistrationSocket config merge etmiyor, manuel gerekli:
          waWebSocketUrl: 'wss://web.whatsapp.com/ws/chat',
          mobile: true,
        });

        const retryCount = instances.get(accountId)?.retryCount || 0;
        instances.set(accountId, { socket: sock, retryCount, retryTimer: null });
        sock.ev.on('creds.update', saveCreds);

        // Telefon numarasını ülke kodu ve ulusal numara olarak ayır
        const phoneRaw = account.phoneNumber.replace(/\D/g, '');
        const countryCode = process.env.FIVESIM_COUNTRY_CODE || '54';
        const nationalNumber = phoneRaw.startsWith(countryCode)
          ? phoneRaw.slice(countryCode.length)
          : phoneRaw;
        const mcc = parseInt(process.env.FIVESIM_MCC || '722');

        // SMS kayıt kodu iste (makeRegistrationSocket API)
        await sock.requestRegistrationCode({
          phoneNumberCountryCode: countryCode,
          phoneNumberNationalNumber: nationalNumber,
          phoneNumberMobileCountryCode: mcc,
          method: 'sms',
        });
        emit({ event: 'smsCodeRequested', accountId });
        console.log(`[Worker] ${accountId}: SMS kayıt kodu istendi (+${countryCode} ${nationalNumber})`);

        sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect } = update;
          if (connection === 'open') {
            const instance = instances.get(accountId);
            if (instance) instance.retryCount = 0;
            provisioningAccounts.delete(accountId);
            await prisma.whatsappAccount.update({
              where: { id: accountId },
              data: { status: 'connected', lastConnectedAt: new Date(), workerId: `worker-${process.pid}` },
            });
            emit({ event: 'statusChange', accountId, status: 'connected' });
            emit({ event: 'registered', accountId });
            console.log(`[Worker] ${accountId}: 5SIM provisioning tamamlandı`);
          }
          if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isBanned = statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.multideviceMismatch;
            if (isBanned) {
              provisioningAccounts.delete(accountId);
              await prisma.whatsappAccount.update({ where: { id: accountId }, data: { status: 'banned', sessionData: null } });
              emit({ event: 'statusChange', accountId, status: 'banned' });
              instances.delete(accountId);
            } else {
              await updateStatus(accountId, 'disconnected');
              scheduleReconnect(accountId);
            }
          }
        });
      } catch (err) {
        provisioningAccounts.delete(accountId);
        emit({ event: 'registerError', accountId, message: err.message });
        await prisma.whatsappAccount.update({ where: { id: accountId }, data: { status: 'disconnected' } }).catch(() => {});
        console.error(`[Worker] ${accountId}: Provision hatası:`, err.message);
      }
      break;
    }

    // SMS kodu geldi, kayıt tamamla
    case 'registerSms': {
      const instance = instances.get(accountId);
      if (!instance?.socket) {
        emit({ event: 'registerError', accountId, message: 'Socket bulunamadı' });
        break;
      }
      try {
        await instance.socket.register(data.code.replace(/\D/g, ''));
        console.log(`[Worker] ${accountId}: SMS kayıt kodu girildi: ${data.code}`);
      } catch (err) {
        emit({ event: 'registerError', accountId, message: err.message });
        console.error(`[Worker] ${accountId}: registerSms hatası:`, err.message);
      }
      break;
    }
  }
}

// --- Gece 00:00 cron: günlük sayaçları sıfırla ---
cron.schedule('0 0 * * *', async () => {
  try {
    const result = await prisma.whatsappAccount.updateMany({
      data: { dailyMessageCount: 0 },
    });
    console.log(`[Worker] Günlük sayaçlar sıfırlandı: ${result.count} hesap`);
  } catch (err) {
    console.error('[Worker] Cron hatası:', err.message);
  }
}, { timezone: 'Europe/Istanbul' });

// --- Startup ---
async function main() {
  console.log('[Worker] Başlatılıyor...');
  await loadBaileys();

  subscriber.subscribe('wa:commands');
  subscriber.on('message', (channel, message) => {
    if (channel === 'wa:commands') handleCommand(message);
  });

  // Daha önce 'connected' olan hesapları otomatik yeniden bağla
  const accounts = await prisma.whatsappAccount.findMany({
    where: { status: { in: ['connected', 'connecting'] } },
    select: { id: true },
  });

  for (const acc of accounts) {
    console.log(`[Worker] Otomatik yeniden bağlanma: ${acc.id}`);
    startConnection(acc.id).catch(console.error);
  }

  console.log(`[Worker] Hazır. PID: ${process.pid}`);
}

main().catch((err) => {
  console.error('[Worker] Başlatma hatası:', err);
  process.exit(1);
});
