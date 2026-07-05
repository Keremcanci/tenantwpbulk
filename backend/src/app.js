require('./config/env');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const authRoutes = require('./modules/auth/auth.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const whatsappRoutes = require('./modules/whatsapp/whatsapp.routes');
const campaignRoutes = require('./modules/campaign/campaign.routes');
const customerRoutes = require('./modules/customer/customer.routes');
const webhookRoutes = require('./modules/webhook/webhook.routes');
const { errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Evolution API webhooks — auth gerekmez
app.use('/webhook', webhookRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/whatsapp', whatsappRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/customer/campaigns', campaignRoutes);

app.use(errorHandler);

module.exports = app;
