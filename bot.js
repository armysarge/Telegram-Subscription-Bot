const { Telegraf, session } = require('telegraf');
const { message } = require('telegraf/filters');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const express = require('express');
const bodyParser = require('body-parser');

// Import modules
const userMiddleware = require('./middleware/userMiddleware');
const subscriptionPermissionMiddleware = require('./middleware/subscriptionPermissionMiddleware');
const commandHandlers = require('./controllers/commands');
const groupHandlers = require('./controllers/groups');
const messageHandlers = require('./controllers/messages');
const callbackHandlers = require('./controllers/callbacks');
const subscriptionUtils = require('./utils/subscriptionUtils');

// Import payment provider system and gateway configuration
const { PaymentManager, PayFastProvider } = require('./payment-providers');
const paymentGatewaysConfig = require('./config/paymentGateways');

// Load environment variables
dotenv.config();

// Set strictQuery option to suppress deprecation warning
mongoose.set('strictQuery', false);

// Initialize bot with your token
const bot = new Telegraf(process.env.BOT_TOKEN);

// Create Express app for payment webhooks
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Initialize payment providers
const paymentManager = new PaymentManager();

// Configure PayFast provider with environment variables
const payfastConfig = {
    merchantId: process.env.PAYFAST_MERCHANT_ID,
    merchantKey: process.env.PAYFAST_MERCHANT_KEY,
    passPhrase: process.env.PAYFAST_PASSPHRASE,
    testMode: process.env.NODE_ENV !== 'production'
};

// Add payment providers from configuration
const enabledGateways = paymentGatewaysConfig.availableGateways.filter(gateway => gateway.enabled);
console.log(`Loading ${enabledGateways.length} enabled payment gateways from config`);

// Currently register PayFast manually but in the future can be expanded to load dynamically
paymentManager.registerProvider('payfast', new PayFastProvider(payfastConfig), true);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');

    // Add step-by-step debugging logs
    console.log('Initializing session middleware...');

    try {
        // Add session middleware with proper error handling
        bot.use(session({
            // Customize session to make it more robust
            getSessionKey: (ctx) => {
                // Use a combination of chat ID and user ID to create a unique key
                const chatId = ctx.chat?.id.toString();
                const userId = ctx.from?.id.toString();

                if (chatId && userId) {
                    return `${chatId}:${userId}`;
                } else if (userId) {
                    return userId;
                }

                return null; // No session
            }
        })); // Ensure session middleware is added here

        // Debugging to confirm session middleware is working
        bot.use((ctx, next) => {
            console.log('Session middleware triggered');
            console.log('Session state before handler:', JSON.stringify(ctx.session || {}));

            // Also log chat and user info for debugging purposes
            if (ctx.chat) {
                const chatInfo = {
                    id: ctx.chat.id,
                    type: ctx.chat.type,
                    title: ctx.chat.title
                };
                console.log('Chat info:', chatInfo);

                // Store chat type in context for easier access in command handlers
                ctx.chatType = ctx.chat.type;
            }

            if (ctx.from) {
                console.log('From user:', {
                    id: ctx.from.id,
                    username: ctx.from.username,
                    first_name: ctx.from.first_name
                });
            }

            return next();
        });

        console.log('Session middleware initialized');

        console.log('Initializing user tracking middleware...');
        bot.use(userMiddleware);
        console.log('User tracking middleware initialized');

        console.log('Initializing subscription permission middleware...');
        bot.use(subscriptionPermissionMiddleware);
        console.log('Subscription permission middleware initialized');

        // Register handlers with proper error handling
        console.log('Registering command handlers...');
        commandHandlers.register(bot, paymentManager);
        console.log('Command handlers registered');

        console.log('Registering group handlers...');
        groupHandlers.register(bot);
        console.log('Group handlers registered');

        console.log('Registering message handlers...');
        messageHandlers.register(bot);
        console.log('Message handlers registered');

        console.log('Registering callback handlers...');
        callbackHandlers.register(bot);
        console.log('Callback handlers registered');

        // Set up payment provider webhooks
        console.log('Setting up payment webhooks...');
        paymentManager.setupWebhooks(app, async (paymentData) => {
            console.log('Processing successful payment:', paymentData);

            const User = require('./models/user');
            const Payment = require('./models/payment');

            try {
                // Save payment record
                await new Payment({
                    userId: paymentData.userId,
                    amount: paymentData.amount,
                    currency: paymentData.currency,
                    paymentId: paymentData.paymentId,
                    status: paymentData.status,
                    providerName: paymentData.providerName,
                    isSubscription: paymentData.isSubscription || false
                }).save();

                // Update user subscription status
                const subscriptionDuration = process.env.SUBSCRIPTION_DURATION_DAYS || 30;
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + subscriptionDuration);

                await User.findOneAndUpdate(
                    { userId: paymentData.userId },
                    {
                        isSubscribed: true,
                        subscriptionExpiresAt: expiryDate
                    }
                );

                console.log(`Updated subscription for user ${paymentData.userId}`);
            } catch (err) {
                console.error('Error processing payment:', err);
            }
        });
        console.log('Payment webhooks configured');

        // Start the Express server for webhooks
        const PORT = process.env.PORT || 3000;
        console.log('Starting Express server on port', PORT);
        app.listen(PORT, () => {
            console.log(`Express server is running on port ${PORT}`);

            // Start the bot after everything else is ready
            console.log('Launching bot...');

            bot.launch();
        });

    } catch (error) {
        console.error('Error during bot initialization:', error);
        process.exit(1);
    }

}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit if MongoDB connection fails
});

// Add graceful shutdown
process.once('SIGINT', () => {
    console.log('SIGINT received, shutting down bot...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('SIGTERM received, shutting down bot...');
    bot.stop('SIGTERM');
});