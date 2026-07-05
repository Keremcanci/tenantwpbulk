const BASE_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || '';

async function req(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    const err = new Error(data?.message || `Evolution API ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// accountId (UUID) → evolution instance adı (max 36 char)
function instName(accountId) {
  return `acc${accountId.replace(/-/g, '')}`;
}

module.exports = {
  instName,

  createInstance: (accountId) =>
    req('POST', '/instance/create', {
      instanceName: instName(accountId),
      qrcode: false,
      integration: 'WHATSAPP-BAILEYS',
    }),

  connectInstance: (accountId, phoneNumber) =>
    req('GET', `/instance/connect/${instName(accountId)}${phoneNumber ? `?number=${phoneNumber.replace(/\D/g, '')}` : ''}`),

  logoutInstance: (accountId) =>
    req('DELETE', `/instance/logout/${instName(accountId)}`).catch(() => {}),

  deleteInstance: (accountId) =>
    req('DELETE', `/instance/delete/${instName(accountId)}`).catch(() => {}),

  setWebhook: (accountId, webhookUrl) =>
    req('POST', `/webhook/set/${instName(accountId)}`, {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: [
        'QRCODE_UPDATED',
        'CONNECTION_UPDATE',
        'MESSAGES_UPSERT',
        'SEND_MESSAGE',
      ],
    }),

  sendText: (accountId, number, text) =>
    req('POST', `/message/sendText/${instName(accountId)}`, {
      number: number.replace(/\D/g, ''),
      text,
    }),

  sendMedia: (accountId, number, mediaBase64, caption) =>
    req('POST', `/message/sendMedia/${instName(accountId)}`, {
      number: number.replace(/\D/g, ''),
      mediatype: 'image',
      caption: caption || '',
      media: mediaBase64,
    }),

  fetchInstance: (accountId) =>
    req('GET', `/instance/fetchInstances?instanceName=${instName(accountId)}`),
};
