const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');

const prisma = new PrismaClient();
const publisher = new Redis(process.env.REDIS_URL);

function emit(event) {
  publisher.publish('wa:events', JSON.stringify(event));
}

// Evolution API → POST /webhook/evolution/:accountId
router.post('/evolution/:accountId', async (req, res) => {
  // Hemen 200 dön, Evolution API zaman aşımından şikayetçi olmasın
  res.sendStatus(200);

  const { accountId } = req.params;
  const body = req.body;

  // Evolution API body formatı: { event, instance, data, ... }
  const eventName = body?.event;
  const eventData = body?.data;

  if (!eventName) return;

  try {
    switch (eventName) {
      case 'CONNECTION_UPDATE': {
        const state = eventData?.state;
        if (!state) break;

        if (state === 'open') {
          await prisma.whatsappAccount.update({
            where: { id: accountId },
            data: {
              status: 'connected',
              lastConnectedAt: new Date(),
              workerId: `evolution-api`,
            },
          });
          emit({ event: 'statusChange', accountId, status: 'connected' });
          console.log(`[Webhook] ${accountId}: Bağlandı`);
        } else if (state === 'close' || state === 'connecting') {
          const statusCode = eventData?.statusCode;
          // 401/403 = ban/logout
          if (statusCode === 401 || statusCode === 403) {
            await prisma.whatsappAccount.update({
              where: { id: accountId },
              data: { status: 'banned', sessionData: null },
            });
            emit({ event: 'statusChange', accountId, status: 'banned' });
            console.log(`[Webhook] ${accountId}: BAN tespit edildi (${statusCode})`);
          } else {
            await prisma.whatsappAccount.update({
              where: { id: accountId },
              data: { status: 'disconnected' },
            });
            emit({ event: 'statusChange', accountId, status: 'disconnected' });
            console.log(`[Webhook] ${accountId}: Bağlantı kesildi`);
          }
        }
        break;
      }

      case 'QRCODE_UPDATED': {
        const qr = eventData?.qrcode?.base64 || eventData?.base64;
        if (qr) emit({ event: 'qrCode', accountId, qr });
        break;
      }

      case 'SEND_MESSAGE': {
        const msgId = eventData?.key?.id;
        if (msgId) {
          emit({ event: 'messageAck', accountId, messageId: msgId, status: 'sent' });
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[Webhook] ${accountId}: İşlem hatası (${eventName}):`, err.message);
  }
});

module.exports = router;
