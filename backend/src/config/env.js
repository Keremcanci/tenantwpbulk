require('dotenv').config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3001,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '30d',

  SESSION_ENCRYPTION_KEY: process.env.SESSION_ENCRYPTION_KEY,

  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,

  FIVESIM_API_KEY: process.env.FIVESIM_API_KEY,
  FIVESIM_COUNTRY: process.env.FIVESIM_COUNTRY || 'any',
  FIVESIM_OPERATOR: process.env.FIVESIM_OPERATOR || 'any',
};
