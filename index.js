const { Telegraf } = require('telegraf');
const { checkExpiredSubscriptions } = require('./utils/subscriptionUtils');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Check for expired subscriptions on startup
(async () => {
  console.log('Checking for expired subscriptions at startup...');
  await checkExpiredSubscriptions(bot);
})();

// Set up recurring check for expired subscriptions (every 24 hours)
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
setInterval(async () => {
  console.log('Running scheduled check for expired subscriptions...');
  await checkExpiredSubscriptions(bot);
}, CHECK_INTERVAL);

// ...rest of your bot code...