require('dotenv').config();
const Redis = require('ioredis');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const evo = require('../config/evolution');

// WhatsApp iOS 26.25.77 token — packageMD5 = md5("26.25.77")
const CURRENT_MOBILE_TOKEN = '0a1mLfGUIBVrMKF1RdvLI5lkRBvof6vn0fD2QRSMa5bfb80a128f2d06fc1bef08bd8c0ed3';
const CURRENT_MOBILE_USERAGENT = 'WhatsApp/26.25.77 iOS/17.5.1 Device/Apple-iPhone_15_Pro';

const prisma = new PrismaClient();
const subscriber = new Redis(process.env.REDIS_URL);
const publisher = new Redis(process.env.REDIS_URL);

const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
const WEBHOOK_BASE = `${BACKEND_URL}/webhook/evolution`;

// accountId → { socket } (provision sırasında)
const provisioningSockets = new Map();

let makeRegistrationSocket, DEFAULT_CONNECTION_CONFIG, initAuthCreds;

async function loadBaileys() {
  const baileys = await import('@whiskeysockets/baileys');
  initAuthCreds = baileys.initAuthCreds;

  const reg = await import('@whiskeysockets/baileys/lib/Socket/registration.js');
  makeRegistrationSocket = reg.makeRegistrationSocket;

  const defs = await import('@whiskeysockets/baileys/lib/Defaults/index.js');
  DEFAULT_CONNECTION_CONFIG = defs.DEFAULT_CONNECTION_CONFIG;

  // Token ve UA'yı 26.25.77 ile patch'le
  const baileysDefaults = require('@whiskeysockets/baileys/lib/Defaults');
  baileysDefaults.MOBILE_TOKEN = Buffer.from(CURRENT_MOBILE_TOKEN);
  baileysDefaults.MOBILE_USERAGENT = CURRENT_MOBILE_USERAGENT;
}

function emit(event) {
  publisher.publish('wa:events', JSON.stringify(event));
}

async function updateStatus(accountId, status) {
  await prisma.whatsappAccount.update({ where: { id: accountId }, data: { status } });
  emit({ event: 'statusChange', accountId, status });
}

// --- Evolution API üzerinden bağlantı (pairing code) ---
async function connectAccount(accountId) {
  const account = await prisma.whatsappAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  await updateStatus(accountId, 'connecting');

  try {
    await evo.createInstance(accountId).catch(() => {});
    await evo.setWebhook(accountId, `${WEBHOOK_BASE}/${accountId}`);
    const result = await evo.connectInstance(accountId, account.phoneNumber);

    if (result?.pairingCode) {
      emit({ event: 'pairingCode', accountId, code: result.pairingCode });
      console.log(`[Worker] ${accountId}: Pairing code → ${result.pairingCode}`);
    } else if (result?.base64) {
      emit({ event: 'qrCode', accountId, qr: result.base64 });
      console.log(`[Worker] ${accountId}: QR code üretildi`);
    } else {
      console.log(`[Worker] ${accountId}: Bağlantı isteği gönderildi`);
    }
  } catch (err) {
    console.error(`[Worker] ${accountId}: Bağlantı hatası:`, err.message, err.data || '');
    emit({ event: 'connectError', accountId, message: err.message });
    await updateStatus(accountId, 'disconnected');
  }
}

// --- 5SIM SMS kaydı (Baileys ile) ---
async function provisionAccount(accountId) {
  try {
    await updateStatus(accountId, 'connecting');

    const account = await prisma.whatsappAccount.findUnique({ where: { id: accountId } });
    if (!account) return;

    const phoneRaw = account.phoneNumber.replace(/\D/g, '');
    const countryCode = process.env.FIVESIM_COUNTRY_CODE || '54';
    const nationalNumber = phoneRaw.startsWith(countryCode)
      ? phoneRaw.slice(countryCode.length)
      : phoneRaw;
    const mcc = parseInt(process.env.FIVESIM_MCC || '722');

    const creds = initAuthCreds();
    const state = {
      creds,
      keys: { get: async () => ({}), set: async () => {} },
    };

    const sock = makeRegistrationSocket({
      ...DEFAULT_CONNECTION_CONFIG,
      auth: state,
      printQRInTerminal: false,
      logger: require('pino')({ level: 'silent' }),
      mobile: true,
    });

    provisioningSockets.set(accountId, { socket: sock, creds });

    await sock.requestRegistrationCode({
      phoneNumberCountryCode: countryCode,
      phoneNumberNationalNumber: nationalNumber,
      phoneNumberMobileCountryCode: mcc,
      method: 'sms',
    });

    emit({ event: 'smsCodeRequested', accountId });
    console.log(`[Worker] ${accountId}: SMS kodu istendi (+${countryCode} ${nationalNumber})`);
  } catch (err) {
    provisioningSockets.delete(accountId);
    const msg = err?.message || JSON.stringify(err);
    emit({ event: 'registerError', accountId, message: msg });
    await updateStatus(accountId, 'disconnected').catch(() => {});
    console.error(`[Worker] ${accountId}: Provision hatası:`, err);
  }
}

async function handleCommand(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  const { command, accountId } = data;
  console.log(`[Worker] Komut: ${command} → ${accountId}`);

  switch (command) {
    case 'connect':
      await connectAccount(accountId).catch(console.error);
      break;

    case 'provision':
      await provisionAccount(accountId).catch(console.error);
      break;

    // 5SIM'den gelen SMS kodu gönder
    case 'registerSms': {
      const entry = provisioningSockets.get(accountId);
      if (!entry?.socket) {
        emit({ event: 'registerError', accountId, message: 'Socket bulunamadı' });
        break;
      }
      try {
        await entry.socket.register(data.code.replace(/\D/g, ''));
        console.log(`[Worker] ${accountId}: SMS kodu girildi: ${data.code}`);

        // Kayıt başarılı — Evolution API'ye aktar
        await evo.createInstance(accountId).catch(() => {});
        await evo.setWebhook(accountId, `${WEBHOOK_BASE}/${accountId}`);
        await evo.connectInstance(accountId);

        provisioningSockets.delete(accountId);
        await updateStatus(accountId, 'connected');
        emit({ event: 'registered', accountId });
        console.log(`[Worker] ${accountId}: Kayıt tamamlandı`);
      } catch (err) {
        emit({ event: 'registerError', accountId, message: err.message });
        console.error(`[Worker] ${accountId}: registerSms hatası:`, err.message);
      }
      break;
    }

    case 'disconnect':
      try { await evo.logoutInstance(accountId); } catch {}
      await updateStatus(accountId, 'disconnected');
      break;

    case 'send': {
      try {
        if (data.imageData) {
          await evo.sendMedia(accountId, data.recipient, data.imageData, data.message);
        } else {
          await evo.sendText(accountId, data.recipient, data.message);
        }
        emit({
          event: 'sent',
          accountId,
          recipient: data.recipient,
          messageId: Date.now().toString(),
          jobId: data.jobId,
        });
        await prisma.whatsappAccount.update({
          where: { id: accountId },
          data: { lastMessageSentAt: new Date(), dailyMessageCount: { increment: 1 } },
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
      emit({ event: 'health', accountId, connected: true, pid: process.pid });
      break;
  }
}

cron.schedule('0 0 * * *', async () => {
  try {
    const result = await prisma.whatsappAccount.updateMany({ data: { dailyMessageCount: 0 } });
    console.log(`[Worker] Günlük sayaçlar sıfırlandı: ${result.count} hesap`);
  } catch (err) {
    console.error('[Worker] Cron hatası:', err.message);
  }
}, { timezone: 'Europe/Istanbul' });

async function main() {
  console.log('[Worker] Başlatılıyor...');
  await loadBaileys();

  subscriber.subscribe('wa:commands');
  subscriber.on('message', (channel, message) => {
    if (channel === 'wa:commands') handleCommand(message);
  });

  const accounts = await prisma.whatsappAccount.findMany({
    where: { status: { in: ['connected', 'connecting'] } },
    select: { id: true },
  });

  for (const acc of accounts) {
    evo.setWebhook(acc.id, `${WEBHOOK_BASE}/${acc.id}`).catch(() => {});
  }

  console.log(`[Worker] Hazır. PID: ${process.pid}`);
}

main().catch((err) => {
  console.error('[Worker] Başlatma hatası:', err);
  process.exit(1);
});
