require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Redis = require('ioredis');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { HttpsProxyAgent } = require('https-proxy-agent');
const pino = require('pino');

const prisma = new PrismaClient();
const subscriber = new Redis(process.env.REDIS_URL);
const publisher = new Redis(process.env.REDIS_URL);

const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, '../../../sessions');

// accountId → WASocket
const sockets = new Map();

const silentLogger = pino({ level: 'silent' });

function emit(event) {
  publisher.publish('wa:events', JSON.stringify(event));
}

async function updateStatus(accountId, status) {
  await prisma.whatsappAccount.update({ where: { id: accountId }, data: { status } });
  emit({ event: 'statusChange', accountId, status });
}

function sessionDir(accountId) {
  return path.join(SESSIONS_DIR, accountId);
}

async function connectAccount(accountId) {
  const account = await prisma.whatsappAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  if (sockets.has(accountId)) {
    try { sockets.get(accountId).end(undefined); } catch {}
    sockets.delete(accountId);
  }

  await updateStatus(accountId, 'connecting');

  const sessDir = sessionDir(accountId);
  fs.mkdirSync(sessDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessDir);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = [2, 3000, 1015901307];
  }

  const socketOptions = {
    version,
    auth: state,
    printQRInTerminal: false,
    logger: silentLogger,
    browser: ['WpBulk', 'Chrome', '10.0'],
    connectTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
  };

  if (account.proxyHost && account.proxyPort) {
    const proxyUrl = account.proxyUser
      ? `http://${account.proxyUser}:${account.proxyPass}@${account.proxyHost}:${account.proxyPort}`
      : `http://${account.proxyHost}:${account.proxyPort}`;
    socketOptions.agent = new HttpsProxyAgent(proxyUrl);
  }

  const sock = makeWASocket(socketOptions);
  sockets.set(accountId, sock);

  sock.ev.on('creds.update', saveCreds);

  // Yeni kayıt — pairing code iste
  if (!state.creds.registered && account.phoneNumber) {
    // Baileys'in bağlantı kurmasını bekle, sonra pairing code iste
    setTimeout(async () => {
      try {
        const phone = account.phoneNumber.replace(/\D/g, '');
        const code = await sock.requestPairingCode(phone);
        emit({ event: 'pairingCode', accountId, code });
        console.log(`[Worker] ${accountId}: Pairing code → ${code}`);
      } catch (err) {
        console.error(`[Worker] ${accountId}: Pairing code hatası:`, err.message);
        emit({ event: 'connectError', accountId, message: err.message });
        await updateStatus(accountId, 'disconnected').catch(() => {});
      }
    }, 3000);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      await updateStatus(accountId, 'connected');
      await prisma.whatsappAccount.update({
        where: { id: accountId },
        data: { lastConnectedAt: new Date() },
      }).catch(() => {});
      console.log(`[Worker] ${accountId}: Bağlandı`);

    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      console.log(`[Worker] ${accountId}: Bağlantı kesildi (kod: ${statusCode})`);
      sockets.delete(accountId);

      if (loggedOut) {
        fs.rmSync(sessDir, { recursive: true, force: true });
        await updateStatus(accountId, 'disconnected').catch(() => {});
        console.log(`[Worker] ${accountId}: Oturum sonlandırıldı, session silindi`);
      } else {
        // Beklenmedik kopuş — yeniden bağlan
        await updateStatus(accountId, 'connecting').catch(() => {});
        setTimeout(() => connectAccount(accountId).catch(console.error), 5000);
      }
    }
  });
}

async function disconnectAccount(accountId) {
  const sock = sockets.get(accountId);
  if (sock) {
    try { await sock.logout(); } catch {}
    sockets.delete(accountId);
  }
  await updateStatus(accountId, 'disconnected');
}

async function sendMessage(accountId, recipient, message, imageData, jobId) {
  const sock = sockets.get(accountId);
  if (!sock) {
    emit({ event: 'sendError', accountId, recipient, message: 'Hesap bağlı değil', jobId });
    return;
  }

  const jid = `${recipient.replace(/\D/g, '')}@s.whatsapp.net`;

  try {
    let result;
    if (imageData) {
      const buffer = Buffer.from(imageData, 'base64');
      result = await sock.sendMessage(jid, { image: buffer, caption: message });
    } else {
      result = await sock.sendMessage(jid, { text: message });
    }

    emit({ event: 'sent', accountId, recipient, messageId: result.key.id, jobId });

    await prisma.whatsappAccount.update({
      where: { id: accountId },
      data: { lastMessageSentAt: new Date(), dailyMessageCount: { increment: 1 } },
    }).catch(() => {});

  } catch (err) {
    emit({ event: 'sendError', accountId, recipient, message: err.message, jobId });
    console.error(`[Worker] ${accountId}: Gönderim hatası (${recipient}):`, err.message);
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

    case 'disconnect':
      await disconnectAccount(accountId).catch(console.error);
      break;

    case 'send':
      await sendMessage(accountId, data.recipient, data.message, data.imageData, data.jobId);
      break;

    case 'health':
      emit({ event: 'health', accountId, connected: sockets.has(accountId), pid: process.pid });
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
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });

  subscriber.subscribe('wa:commands');
  subscriber.on('message', (channel, message) => {
    if (channel === 'wa:commands') handleCommand(message);
  });

  const accounts = await prisma.whatsappAccount.findMany({
    where: { status: { in: ['connected', 'connecting'] } },
    select: { id: true },
  });

  for (const acc of accounts) {
    connectAccount(acc.id).catch(console.error);
  }

  console.log(`[Worker] Hazır. PID: ${process.pid} | ${accounts.length} hesap yeniden bağlanıyor`);
}

main().catch((err) => {
  console.error('[Worker] Başlatma hatası:', err);
  process.exit(1);
});
