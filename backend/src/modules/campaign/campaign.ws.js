const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { subscriber } = require('../../config/redis');
const env = require('../../config/env');

// campaignId → Set<WebSocket>
const clients = new Map();
const subscribedChannels = new Set();

function parseUrl(url) {
  // /ws/customer/campaigns/:id/progress
  const match = (url || '').match(/\/ws\/customer\/campaigns\/([^/]+)\/progress/);
  return match ? match[1] : null;
}

function verifyToken(req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    return payload.role === 'customer' ? payload : null;
  } catch {
    return null;
  }
}

function subscribeToChannel(campaignId) {
  const channel = `campaign:progress:${campaignId}`;
  if (!subscribedChannels.has(channel)) {
    subscribedChannels.add(channel);
    subscriber.subscribe(channel).catch(() => {});
  }
}

// Tek global listener — subscriber zaten auth.ws.js veya whatsapp.ws.js'de başlatılmış olabilir
// Pattern-based yayın için ayrı bir dinleyici ekliyoruz
subscriber.on('message', (channel, raw) => {
  if (!channel.startsWith('campaign:progress:')) return;
  const campaignId = channel.replace('campaign:progress:', '');
  const sockets = clients.get(campaignId);
  if (!sockets || sockets.size === 0) return;
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send(raw);
  }
});

function setup(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url.includes('/ws/customer/campaigns/')) return;

    const user = verifyToken(req);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws._userId = user.userId;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const campaignId = parseUrl(req.url);
    if (!campaignId) { ws.close(1008, 'Geçersiz URL'); return; }

    if (!clients.has(campaignId)) clients.set(campaignId, new Set());
    clients.get(campaignId).add(ws);
    subscribeToChannel(campaignId);

    ws.send(JSON.stringify({ event: 'connected', campaignId }));

    ws.on('close', () => {
      const set = clients.get(campaignId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) clients.delete(campaignId);
      }
    });
  });
}

module.exports = { setup };
