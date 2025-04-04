const { Telegraf } = require('telegraf');
const AutoKickService = require('./services/autoKickService');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Initialize auto-kick service
const autoKickService = new AutoKickService(bot);
autoKickService.initialize();

// ...existing code...