const Redis = require('ioredis');
const env = require('./env');

const publisher = new Redis(env.REDIS_URL, { lazyConnect: true });
const subscriber = new Redis(env.REDIS_URL, { lazyConnect: true });

publisher.on('error', (err) => console.error('[Redis Publisher]', err.message));
subscriber.on('error', (err) => console.error('[Redis Subscriber]', err.message));

async function connectRedis() {
  await publisher.connect();
  await subscriber.connect();
}

module.exports = { publisher, subscriber, connectRedis };
