const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { subscriber } = require('../../config/redis');
const env = require('../../config/env');

// accountId → Set<WebSocket>
const clients = new Map();

let redisListening = false;

function startRedisRelay() {
  if (redisListening) return;
  redisListening = true;

  subscriber.subscribe('wa:events').catch(() => {});

  subscriber.on('message', (channel, raw) => {
    if (channel !== 'wa:events') return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    const sockets = clients.get(data.accountId);
    if (!sockets || sockets.size === 0) return;

    const msg = JSON.stringify(data);
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  });
}

function parseAccountId(url) {
  // /ws/admin/whatsapp/:id/status
  const match = (url || '').match(/\/ws\/admin\/whatsapp\/([^/]+)\/status/);
  return match ? match[1] : null;
}

function verifyToken(req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    return payload.role === 'superadmin' ? payload : null;
  } catch {
    return null;
  }
}

function setup(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url.includes('/ws/admin/whatsapp/')) return;

    const user = verifyToken(req);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const accountId = parseAccountId(req.url);
    if (!accountId) {
      ws.close(1008, 'Geçersiz URL');
      return;
    }

    if (!clients.has(accountId)) clients.set(accountId, new Set());
    clients.get(accountId).add(ws);

    ws.send(JSON.stringify({ event: 'connected', accountId }));

    ws.on('close', () => {
      const set = clients.get(accountId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) clients.delete(accountId);
      }
    });
  });

  startRedisRelay();
}

module.exports = { setup };
