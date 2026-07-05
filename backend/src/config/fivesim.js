const https = require('https');

const BASE_URL = 'https://5sim.net';

function request(path, apiKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('5SIM API geçersiz yanıt: ' + data)); }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('5SIM API timeout'));
    });
    req.end();
  });
}

// Numara satın al
// country örn: 'russia', 'any' — operator: 'any' — product: 'whatsapp'
async function buyNumber(apiKey, country = 'any', operator = 'any', product = 'whatsapp') {
  const data = await request(`/v1/user/buy/activation/${country}/${operator}/${product}`, apiKey);
  if (data.error || !data.id) {
    throw new Error('5SIM numara alınamadı: ' + (data.error || JSON.stringify(data)));
  }
  return { orderId: data.id, phone: data.phone, status: data.status };
}

// Sipariş durumu ve SMS kontrol
async function checkOrder(apiKey, orderId) {
  const data = await request(`/v1/user/check/${orderId}`, apiKey);
  return {
    orderId: data.id,
    phone: data.phone,
    status: data.status, // PENDING | RECEIVED | CANCELED | TIMEOUT | FINISHED | BANNED
    sms: data.sms || [],
    code: data.sms?.[0]?.code || null,
  };
}

// Siparişi tamamla (başarılı)
async function finishOrder(apiKey, orderId) {
  return request(`/v1/user/finish/${orderId}`, apiKey);
}

// Siparişi iptal et (iade)
async function cancelOrder(apiKey, orderId) {
  return request(`/v1/user/cancel/${orderId}`, apiKey);
}

// SMS kodunu bekle — max 5 dakika, her 10 saniyede bir kontrol
async function waitForSms(apiKey, orderId, timeoutMs = 300000) {
  const interval = 10000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await checkOrder(apiKey, orderId);

    if (result.code) return result.code;

    if (result.status === 'CANCELED' || result.status === 'TIMEOUT' || result.status === 'BANNED') {
      throw new Error(`5SIM sipariş iptal: ${result.status}`);
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error('5SIM SMS kodu bekleme süresi doldu (5 dakika)');
}

module.exports = { buyNumber, checkOrder, finishOrder, cancelOrder, waitForSms };
