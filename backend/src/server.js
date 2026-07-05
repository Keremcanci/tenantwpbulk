const http = require('http');
const app = require('./app');
const env = require('./config/env');
const whatsappWs = require('./modules/whatsapp/whatsapp.ws');
const campaignWs = require('./modules/campaign/campaign.ws');
const { startWorkers } = require('./modules/queue/processors');

const server = http.createServer(app);

whatsappWs.setup(server);
campaignWs.setup(server);
startWorkers();

server.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
});
