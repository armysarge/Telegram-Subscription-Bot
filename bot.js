const { Telegraf, session } = require('telegraf');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const express = require('express');
const bodyParser = require('body-parser');

// Import modules
const userMiddleware = require('./middleware/userMiddleware');
const commandHandlers = require('./controllers/commands');
const groupHandlers = require('./controllers/groups');
const messageHandlers = require('./controllers/messages');
const callbackHandlers = require('./controllers/callbacks');
const subscriptionUtils = require('./utils/subscriptionUtils');

// Import payment provider system
const { PaymentManager, PayFastProvider } = require('./payment-providers');

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

// Add PayFast payment provider
paymentManager.registerProvider('payfast', new PayFastProvider(payfastConfig), true);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit if MongoDB connection fails
});

// Add session middleware
bot.use(session());

// Add user tracking middleware
bot.use(userMiddleware);

// Register command handlers
commandHandlers.register(bot, paymentManager);

// Register group handlers
groupHandlers.register(bot);

// Register message handlers
messageHandlers.register(bot);

// Register callback query handlers
callbackHandlers.register(bot);

// Set up payment provider webhooks
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

// Start the Express server for webhooks
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Express server is running on port ${PORT}`);
});

// Start the bot
bot.launch().then(() => {
    console.log('Bot is running');
}).catch(err => {
    console.error('Error starting bot:', err);
});