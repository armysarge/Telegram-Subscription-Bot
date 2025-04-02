const { Telegraf, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const express = require('express');
const bodyParser = require('body-parser');

// Import payment system
const { PaymentManager, PayFastProvider } = require('./src/payment-providers');

// Load environment variables
dotenv.config();

// Set strictQuery option to suppress deprecation warning
mongoose.set('strictQuery', false);

// Initialize bot with your token (to be set in .env file)
const bot = new Telegraf(process.env.BOT_TOKEN);

// Initialize Express app for payment webhooks
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Initialize payment manager and register providers
const paymentManager = new PaymentManager();

// Configure PayFast payment provider
const payfastConfig = {
    merchantId: process.env.PAYFAST_MERCHANT_ID,
    merchantKey: process.env.PAYFAST_MERCHANT_KEY,
    passphrase: process.env.PAYFAST_PASSPHRASE,
    returnUrl: process.env.PAYFAST_RETURN_URL || 'https://t.me/your_bot_username',
    cancelUrl: process.env.PAYFAST_CANCEL_URL || 'https://t.me/your_bot_username',
    notifyUrl: process.env.PAYFAST_NOTIFY_URL || 'https://your-server.com/payfast-itn',
    sandbox: process.env.PAYFAST_SANDBOX === 'true',
    apiKey: process.env.PAYFAST_API_KEY // Add this for subscription API calls
};

// Register PayFast as the default payment provider
paymentManager.registerProvider('payfast', new PayFastProvider(payfastConfig), true);

// Configure MongoDB connection and launch bot only after successful connection
console.log('Connecting to MongoDB...');
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('Connected to MongoDB');
    console.log('Setting up schemas and models...');
    // Start the bot only after MongoDB connection is established
    startBot();
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit if MongoDB connection fails
});

// Payment success callback function
async function handlePaymentSuccess(paymentData) {
    try {
        const { userId, amount, currency, paymentId, status, isSubscription, subscriptionId, token } = paymentData;

        // Save payment record
        await new Payment({
            userId,
            amount,
            currency,
            paymentId,
            status
        }).save();

        // Calculate expiry date (either for one-time or recurring)
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month subscription

        // Prepare update data
        const updateData = {
            isSubscribed: true,
            subscriptionExpiresAt: expiryDate
        };

        // Add subscription data if this is a recurring subscription
        if (isSubscription && subscriptionId && token) {
            updateData.subscription = {
                id: subscriptionId,
                token: token,
                isRecurring: true,
                status: 'active'
            };

            // For recurring subscriptions, the date will be managed by webhook updates
            console.log(`Setting up recurring subscription ${subscriptionId} for user ${userId}`);
        }

        // Update user subscription status
        await User.findOneAndUpdate(
            { userId },
            updateData
        );

        // Notify user about successful subscription
        let message = `Your subscription has been activated and is valid until ${expiryDate.toLocaleDateString()}.`;

        if (isSubscription) {
            message = `Your recurring subscription has been activated. You will be billed automatically each month unless you cancel.`;
        }

        bot.telegram.sendMessage(
            userId,
            message
        ).catch(err => console.error('Error sending subscription confirmation:', err));

        console.log(`Successfully processed payment for user ${userId}`);
    } catch (error) {
        console.error('Error handling payment success:', error);
    }
}

// Setup payment provider webhooks
paymentManager.setupWebhooks(app, handlePaymentSuccess);

// Start the Express server for payment webhooks
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Payment webhook server running on port ${PORT}`);
});

// Move bot startup into a separate function
function startBot() {
    console.log('Attempting to launch bot...');

    // Add timeout safety net
    const launchTimeout = setTimeout(() => {
        console.error('Bot launch timeout after 10 seconds. There might be an issue with the Telegram API connection.');
        console.log('Continuing anyway...');
        // Force success even if we didn't get confirmation from Telegram
        console.log('Bot should be running now (forced continuation)');
        console.log('Running initial subscription check...');
        checkExpiredSubscriptions(); // Run once at startup
        console.log('Bot is now fully operational');
    }, 10000);

    bot.launch()
        .then(() => {
            clearTimeout(launchTimeout); // Clear the timeout if launch succeeds
            console.log('Bot started successfully');
            console.log('Running initial subscription check...');
            checkExpiredSubscriptions(); // Run once at startup
            console.log('Bot is now fully operational');
        })
        .catch(err => {
            clearTimeout(launchTimeout); // Clear the timeout if launch fails
            console.error('Failed to start bot:', err);
            process.exit(1); // Exit with error if bot fails to start
        });
}

// Create user schema for subscription tracking
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: String,
    isSubscribed: { type: Boolean, default: false },
    subscriptionExpiresAt: Date,
    joinedGroups: [{ groupId: Number, groupTitle: String }],
    joinedChannels: [{ channelId: Number, channelTitle: String }], // Added for channel tracking
    // Added subscription tracking fields
    subscription: {
        id: String,         // PayFast subscription ID
        token: String,      // PayFast token for API operations
        isRecurring: { type: Boolean, default: false },
        frequency: Number,  // Billing frequency code
        status: String      // active, cancelled, etc.
    }
});

const User = mongoose.model('User', userSchema);

// Create payment schema
const paymentSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    paymentId: { type: String, required: true, unique: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const Payment = mongoose.model('Payment', paymentSchema);

// Create channel schema to track channel-specific settings
const channelSchema = new mongoose.Schema({
    channelId: { type: Number, required: true, unique: true },
    channelTitle: String,
    adminUsers: [{ type: Number }], // User IDs who are admins for the channel
    subscriptionRequired: { type: Boolean, default: true },
    welcomeMessage: String,
    createdAt: { type: Date, default: Date.now },
    // Add subscription settings
    subscriptionSettings: {
        oneTimePayment: {
            enabled: { type: Boolean, default: true },
            amount: { type: Number, default: 99.99 },
            durationDays: { type: Number, default: 30 } // Duration in days
        },
        recurringPayment: {
            enabled: { type: Boolean, default: true },
            amount: { type: Number, default: 99.99 },
            frequency: { type: Number, default: 3 } // 3 = Monthly in PayFast
        },
        customItemName: { type: String, default: 'Channel Subscription' },
        customItemDescription: { type: String, default: 'Access to premium content' }
    }
});

const Channel = mongoose.model('Channel', channelSchema);

// Create group schema for group-specific settings
const groupSchema = new mongoose.Schema({
    groupId: { type: Number, required: true, unique: true },
    groupTitle: String,
    adminUsers: [{ type: Number }], // User IDs who are admins for the group
    subscriptionRequired: { type: Boolean, default: true },
    welcomeMessage: String,
    createdAt: { type: Date, default: Date.now },
    // Add subscription settings
    subscriptionSettings: {
        oneTimePayment: {
            enabled: { type: Boolean, default: true },
            amount: { type: Number, default: 99.99 },
            durationDays: { type: Number, default: 30 } // Duration in days
        },
        recurringPayment: {
            enabled: { type: Boolean, default: true },
            amount: { type: Number, default: 99.99 },
            frequency: { type: Number, default: 3 } // 3 = Monthly in PayFast
        },
        customItemName: { type: String, default: 'Group Subscription' },
        customItemDescription: { type: String, default: 'Access to premium content' }
    }
});

const Group = mongoose.model('Group', groupSchema);

// Middleware to track users
bot.use(async (ctx, next) => {
    if (ctx.from) {
        try {
            await User.findOneAndUpdate(
                { userId: ctx.from.id },
                {
                    userId: ctx.from.id,
                    username: ctx.from.username
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error('Error updating user:', err);
        }
    }
    return next();
});

// Add session middleware
bot.use(session());

// Fix for the middleware chain
bot.use(async (ctx, next) => {
    if (ctx.message && ctx.message.text && ctx.session && ctx.session.awaitingInput) {
        // Don't call next() as the text handler will process this
    } else {
        // Call next() to allow other handlers to run
        return next();
    }
});

// Command handlers
bot.start(async (ctx) => {
    await ctx.reply(
        'Welcome to the Subscription Bot! 👋\n\n' +
        'This bot manages access to premium content in groups and channels.\n\n' +
        'Commands:\n' +
        '/subscribe - Purchase a subscription\n' +
        '/status - Check your subscription status\n' +
        '/help - Show help information\n' +
        '/admin - Admin commands (for group/channel admins only)'
    );
});

bot.help((ctx) => {
    return ctx.reply(
        'Subscription Bot Help:\n\n' +
        '/subscribe - Purchase a subscription\n' +
        '/status - Check your subscription status\n' +
        '/help - Show this help information\n' +
        '/admin - Admin commands (for group/channel admins only)'
    );
});

// Handle subscription command - Updated to use source-specific settings
bot.command('subscribe', async (ctx) => {
    try {
        // First send a message to indicate processing is starting
        await ctx.reply('Preparing your subscription options...');

        // Find user
        const user = await User.findOne({ userId: ctx.from.id });

        if (user && user.isSubscribed) {
            const expiryDate = new Date(user.subscriptionExpiresAt).toLocaleDateString();
            return ctx.reply(`You already have an active subscription until ${expiryDate}.`);
        }

        // Get subscription source (which channel/group the user is subscribing to)
        const source = await getSubscriptionSource(ctx.from.id);

        // Get subscription settings based on source or use defaults
        let settings = {
            oneTimePayment: {
                enabled: true,
                amount: 99.99,
                durationDays: 30
            },
            recurringPayment: {
                enabled: true,
                amount: 99.99,
                frequency: 3
            },
            customItemName: 'Subscription',
            customItemDescription: 'Access to premium content'
        };

        let sourceTitle = 'Premium Content';

        if (source && source.sourceSettings) {
            settings = source.sourceSettings;
            sourceTitle = source.title;
        }

        // Prepare options based on what's enabled
        const options = [];

        // Add one-time payment option if enabled
        if (settings.oneTimePayment && settings.oneTimePayment.enabled) {
            const amount = settings.oneTimePayment.amount || 99.99;
            const duration = settings.oneTimePayment.durationDays || 30;

            options.push([{
                text: `One-time payment (R${amount.toFixed(2)} for ${duration} days)`,
                callback_data: `sub_onetime_${source?.sourceType || ''}_${source?.sourceChatId || 0}`
            }]);
        }

        // Add recurring payment option if enabled
        if (settings.recurringPayment && settings.recurringPayment.enabled) {
            const amount = settings.recurringPayment.amount || 99.99;
            const frequency = settings.recurringPayment.frequency || 3;

            // Get frequency text
            const frequencyText =
                frequency === 2 ? 'Weekly' :
                frequency === 3 ? 'Monthly' :
                frequency === 4 ? 'Quarterly' :
                frequency === 5 ? 'Biannually' :
                frequency === 6 ? 'Annually' : 'Regular';

            options.push([{
                text: `${frequencyText} recurring subscription (R${amount.toFixed(2)}/${frequencyText.toLowerCase()})`,
                callback_data: `sub_recurring_${source?.sourceType || ''}_${source?.sourceChatId || 0}`
            }]);
        }

        // If no options are enabled, show a default message
        if (options.length === 0) {
            return ctx.reply(
                'Sorry, subscription payments are not currently enabled for this content. ' +
                'Please contact the administrator for more information.'
            );
        }

        // Construct source-specific message
        let sourceMessage = '';
        if (source && source.sourceChatId) {
            sourceMessage = `\nYou're subscribing to: ${sourceTitle}`;
        }

        // Ask user to choose subscription type
        await ctx.reply(
            `Please choose a subscription option:${sourceMessage}`,
            {
                reply_markup: {
                    inline_keyboard: options
                }
            }
        );

        console.log(`Subscription options presented to user ${ctx.from.id}`);
    } catch (error) {
        console.error('Error creating subscription options:', error);
        await ctx.reply('Sorry, there was an error preparing your subscription options. Please try again later.');
    }
});

// Handle source-specific subscription callback queries
bot.action(/sub_onetime_(.*)_(.*)/, async (ctx) => {
    try {
        await ctx.answerCbQuery('Preparing one-time subscription...');

        // Extract source information from callback data
        const sourceType = ctx.match[1]; // 'group' or 'channel'
        const sourceChatId = parseInt(ctx.match[2]);

        // Default values
        let amount = 99.99;
        let itemName = 'Premium Content Subscription';
        let itemDescription = 'Access to premium content for one month';
        let duration = 30; // Default duration in days

        // Get source-specific settings if they exist
        if (sourceType && sourceChatId) {
            let entity;
            if (sourceType === 'channel') {
                entity = await Channel.findOne({ channelId: sourceChatId });
            } else if (sourceType === 'group') {
                entity = await Group.findOne({ groupId: sourceChatId });
            }

            if (entity && entity.subscriptionSettings) {
                const settings = entity.subscriptionSettings;

                // Get custom one-time payment settings
                if (settings.oneTimePayment && settings.oneTimePayment.enabled) {
                    amount = settings.oneTimePayment.amount || amount;
                    duration = settings.oneTimePayment.durationDays || duration;
                }

                // Get custom product info
                itemName = settings.customItemName || itemName;
                itemDescription = settings.customItemDescription || itemDescription;

                // Add source info to product name if not already included
                if (!itemName.includes(entity.channelTitle || entity.groupTitle)) {
                    const sourceName = entity.channelTitle || entity.groupTitle;
                    itemName = `${itemName} - ${sourceName}`;
                }
            }
        }

        // Generate one-time payment URL
        const paymentUrl = paymentManager.generatePaymentUrl(
            null, // Use default provider
            ctx.from.id,
            amount,
            itemName,
            itemDescription
        );

        // Send payment URL
        await ctx.reply(
            `Click the link below to complete your one-time subscription payment for ${duration} days:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `Pay R${amount.toFixed(2)} via PayFast`, url: paymentUrl }]
                    ]
                }
            }
        );

        console.log(`One-time subscription payment link sent to user ${ctx.from.id} for ${sourceType} ${sourceChatId}`);
    } catch (error) {
        console.error('Error creating one-time payment link:', error);
        await ctx.reply('Sorry, there was an error creating your subscription link. Please try again later.');
    }
});

bot.action(/sub_recurring_(.*)_(.*)/, async (ctx) => {
    try {
        await ctx.answerCbQuery('Preparing recurring subscription...');

        // Extract source information from callback data
        const sourceType = ctx.match[1]; // 'group' or 'channel'
        const sourceChatId = parseInt(ctx.match[2]);

        // Default values
        let amount = 99.99;
        let itemName = 'Premium Content Subscription';
        let itemDescription = 'Recurring access to premium content';
        let frequency = 3; // Default monthly (3)

        // Get source-specific settings if they exist
        if (sourceType && sourceChatId) {
            let entity;
            if (sourceType === 'channel') {
                entity = await Channel.findOne({ channelId: sourceChatId });
            } else if (sourceType === 'group') {
                entity = await Group.findOne({ groupId: sourceChatId });
            }

            if (entity && entity.subscriptionSettings) {
                const settings = entity.subscriptionSettings;

                // Get custom recurring payment settings
                if (settings.recurringPayment && settings.recurringPayment.enabled) {
                    amount = settings.recurringPayment.amount || amount;
                    frequency = settings.recurringPayment.frequency || frequency;
                }

                // Get custom product info
                itemName = settings.customItemName || itemName;
                itemDescription = settings.customItemDescription || itemDescription;

                // Add source info to product name if not already included
                if (!itemName.includes(entity.channelTitle || entity.groupTitle)) {
                    const sourceName = entity.channelTitle || entity.groupTitle;
                    itemName = `${itemName} - ${sourceName}`;
                }
            }
        }

        // Get frequency text for display
        const frequencyText =
            frequency === 2 ? 'weekly' :
            frequency === 3 ? 'monthly' :
            frequency === 4 ? 'quarterly' :
            frequency === 5 ? 'biannually' :
            frequency === 6 ? 'annually' : 'recurring';

        // Generate subscription URL with appropriate recurring billing settings
        const subscriptionOptions = {
            billingDate: new Date(), // Using current date
            frequency: frequency,
            cycles: 0 // 0 = Until cancelled
        };

        const paymentUrl = paymentManager.generateSubscriptionUrl(
            null, // Use default provider
            ctx.from.id,
            amount,
            itemName,
            itemDescription,
            subscriptionOptions
        );

        // Send payment URL
        await ctx.reply(
            `Click the link below to set up your ${frequencyText} recurring subscription:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `Subscribe for R${amount.toFixed(2)}/${frequencyText} via PayFast`, url: paymentUrl }]
                    ]
                }
            }
        );

        console.log(`Recurring subscription payment link sent to user ${ctx.from.id} for ${sourceType} ${sourceChatId}`);
    } catch (error) {
        console.error('Error creating recurring payment link:', error);
        await ctx.reply('Sorry, there was an error creating your subscription link. Please try again later.');
    }
});

// Enhanced status command to show subscription details
bot.command('status', async (ctx) => {
    const user = await User.findOne({ userId: ctx.from.id });

    if (!user) {
        return ctx.reply('You do not have an active subscription. Use /subscribe to purchase one.');
    }

    if (user.isSubscribed) {
        const expiryDate = new Date(user.subscriptionExpiresAt).toLocaleDateString();

        // Basic status message
        let message = `You have an active subscription until ${expiryDate}.\n\n`;

        // Check if this is a recurring subscription
        if (user.subscription && user.subscription.isRecurring) {
            message += `Type: Recurring Monthly Subscription\n`;
            message += `Status: ${user.subscription.status || 'Active'}\n`;
            message += `Subscription ID: ${user.subscription.id}\n\n`;
            message += `Your subscription will automatically renew each month until canceled.`;

            // Add cancel button
            await ctx.reply(message, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Cancel Subscription", callback_data: "cancel_subscription" }]
                    ]
                }
            });
        } else {
            message += `Type: One-time Payment\n`;
            message += `When your subscription expires, you can use /subscribe to renew.`;

            await ctx.reply(message);
        }
    } else {
        return ctx.reply('You do not have an active subscription. Use /subscribe to purchase one.');
    }
});

// Handle subscription cancellation
bot.action('cancel_subscription', async (ctx) => {
    try {
        await ctx.answerCbQuery('Processing cancellation request...');

        const user = await User.findOne({ userId: ctx.from.id });

        if (!user || !user.subscription || !user.subscription.id) {
            return ctx.reply('No active subscription found to cancel.');
        }

        const subscriptionId = user.subscription.id;

        // Ask for confirmation
        await ctx.reply(
            `Are you sure you want to cancel your subscription? You will lose access to premium content when your current billing period ends.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "Yes, cancel subscription", callback_data: `confirm_cancel_${subscriptionId}` },
                            { text: "No, keep my subscription", callback_data: "keep_subscription" }
                        ]
                    ]
                }
            }
        );
    } catch (error) {
        console.error('Error processing cancellation request:', error);
        await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    }
});

// Handle final cancellation confirmation
bot.action(/confirm_cancel_(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery('Cancelling subscription...');

        const subscriptionId = ctx.match[1];

        try {
            // Cancel subscription with PayFast
            const success = await paymentManager.cancelSubscription(null, subscriptionId);

            if (success) {
                // Update user record
                await User.findOneAndUpdate(
                    { userId: ctx.from.id },
                    {
                        'subscription.status': 'cancelled'
                    }
                );

                await ctx.reply('Your subscription has been cancelled. You will continue to have access until the end of your current billing period.');
            } else {
                await ctx.reply('There was an issue cancelling your subscription. Please contact support for assistance.');
            }
        } catch (error) {
            console.error('Error cancelling subscription:', error);
            await ctx.reply('There was an error cancelling your subscription. Please try again later or contact support.');
        }
    } catch (error) {
        console.error('Error processing cancellation confirmation:', error);
        await ctx.reply('Sorry, there was an error processing your request. Please try again later.');
    }
});

// Handle keeping subscription
bot.action('keep_subscription', async (ctx) => {
    await ctx.answerCbQuery('Keeping your subscription active');
    await ctx.reply('Good choice! Your subscription will remain active.');
});

// Handle admin commands
bot.command('admin', async (ctx) => {
    const user = await User.findOne({ userId: ctx.from.id });

    // Check if we're in a group or channel and if the user is an admin
    const chatId = ctx.chat.id;
    let isAdmin = false;
    let entityType = '';

    if (ctx.chat.type === 'channel') {
        const channel = await Channel.findOne({ channelId: chatId });
        if (channel && channel.adminUsers.includes(ctx.from.id)) {
            isAdmin = true;
            entityType = 'channel';
        }
    } else if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        const group = await Group.findOne({ groupId: chatId });
        if (group && group.adminUsers.includes(ctx.from.id)) {
            isAdmin = true;
            entityType = 'group';
        } else {
            // Check Telegram admins as well
            try {
                const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
                if (chatMember.status === 'creator' || chatMember.status === 'administrator') {
                    isAdmin = true;
                    entityType = 'group';

                    // Add to our DB as an admin if not already there
                    await Group.findOneAndUpdate(
                        { groupId: chatId },
                        {
                            $addToSet: { adminUsers: ctx.from.id },
                            groupTitle: ctx.chat.title
                        },
                        { upsert: true }
                    );
                }
            } catch (err) {
                console.error('Error checking admin status:', err);
            }
        }
    }

    if (!isAdmin) {
        return ctx.reply('This command is only available to group or channel administrators.');
    }

    // Show expanded admin options with subscription settings
    return ctx.reply(
        `Admin commands for this ${entityType}:\n\n` +
        `/admin_toggle - Toggle subscription requirement\n` +
        `/admin_welcome [message] - Set welcome message\n` +
        `/admin_stats - Show subscription statistics\n` +
        `/admin_subscription - Configure subscription settings\n` +
        `/admin_payment - Configure payment options`
    );
});

// Toggle subscription requirement for a group or channel
bot.command('admin_toggle', async (ctx) => {
    const chatId = ctx.chat.id;
    let isAdmin = false;

    if (ctx.chat.type === 'channel') {
        const channel = await Channel.findOne({ channelId: chatId });
        if (channel && channel.adminUsers.includes(ctx.from.id)) {
            isAdmin = true;

            // Toggle subscription requirement
            const newSetting = !channel.subscriptionRequired;
            await Channel.findOneAndUpdate(
                { channelId: chatId },
                { subscriptionRequired: newSetting }
            );

            return ctx.reply(`Subscription requirement for this channel is now ${newSetting ? 'enabled' : 'disabled'}.`);
        }
    } else if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        // Check if user is admin
        try {
            const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
            if (chatMember.status === 'creator' || chatMember.status === 'administrator') {
                isAdmin = true;

                // Find or create group
                const group = await Group.findOne({ groupId: chatId });
                const newSetting = group ? !group.subscriptionRequired : false;

                await Group.findOneAndUpdate(
                    { groupId: chatId },
                    {
                        subscriptionRequired: newSetting,
                        groupTitle: ctx.chat.title,
                        $addToSet: { adminUsers: ctx.from.id }
                    },
                    { upsert: true }
                );

                return ctx.reply(`Subscription requirement for this group is now ${newSetting ? 'enabled' : 'disabled'}.`);
            }
        } catch (err) {
            console.error('Error checking admin status:', err);
        }
    }

    if (!isAdmin) {
        return ctx.reply('This command is only available to group or channel administrators.');
    }
});

// Set welcome message for a group or channel
bot.command('admin_welcome', async (ctx) => {
    const chatId = ctx.chat.id;
    let isAdmin = false;
    const welcomeMessage = ctx.message.text.split('/admin_welcome ')[1];

    if (!welcomeMessage) {
        return ctx.reply('Please provide a welcome message. Example: /admin_welcome Welcome to our premium content!');
    }

    if (ctx.chat.type === 'channel') {
        const channel = await Channel.findOne({ channelId: chatId });
        if (channel && channel.adminUsers.includes(ctx.from.id)) {
            isAdmin = true;

            await Channel.findOneAndUpdate(
                { channelId: chatId },
                { welcomeMessage }
            );

            return ctx.reply('Welcome message updated for this channel.');
        }
    } else if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        // Check if user is admin
        try {
            const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
            if (chatMember.status === 'creator' || chatMember.status === 'administrator') {
                isAdmin = true;

                await Group.findOneAndUpdate(
                    { groupId: chatId },
                    {
                        welcomeMessage,
                        groupTitle: ctx.chat.title,
                        $addToSet: { adminUsers: ctx.from.id }
                    },
                    { upsert: true }
                );

                return ctx.reply('Welcome message updated for this group.');
            }
        } catch (err) {
            console.error('Error checking admin status:', err);
        }
    }

    if (!isAdmin) {
        return ctx.reply('This command is only available to group or channel administrators.');
    }
});

// Show stats for a group or channel
bot.command('admin_stats', async (ctx) => {
    const chatId = ctx.chat.id;
    let isAdmin = false;

    if (ctx.chat.type === 'channel') {
        const channel = await Channel.findOne({ channelId: chatId });
        if (channel && channel.adminUsers.includes(ctx.from.id)) {
            isAdmin = true;

            // Count subscribers in this channel
            const subscribers = await User.countDocuments({
                isSubscribed: true,
                'joinedChannels.channelId': chatId
            });

            // Count total users
            const totalUsers = await User.countDocuments({
                'joinedChannels.channelId': chatId
            });

            return ctx.reply(
                `Channel Statistics:\n\n` +
                `Total Members: ${totalUsers}\n` +
                `Subscribed Members: ${subscribers}\n` +
                `Subscription Rate: ${totalUsers > 0 ? Math.round((subscribers / totalUsers) * 100) : 0}%`
            );
        }
    } else if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        // Check if user is admin
        try {
            const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
            if (chatMember.status === 'creator' || chatMember.status === 'administrator') {
                isAdmin = true;

                // Count subscribers in this group
                const subscribers = await User.countDocuments({
                    isSubscribed: true,
                    'joinedGroups.groupId': chatId
                });

                // Count total users
                const totalUsers = await User.countDocuments({
                    'joinedGroups.groupId': chatId
                });

                return ctx.reply(
                    `Group Statistics:\n\n` +
                    `Total Members: ${totalUsers}\n` +
                    `Subscribed Members: ${subscribers}\n` +
                    `Subscription Rate: ${totalUsers > 0 ? Math.round((subscribers / totalUsers) * 100) : 0}%`
                );
            }
        } catch (err) {
            console.error('Error checking admin status:', err);
        }
    }

    if (!isAdmin) {
        return ctx.reply('This command is only available to group or channel administrators.');
    }
});

// Create notification log schema to prevent spam
const notificationLogSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    groupId: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

// Handle channel posts (for channels)
bot.on('channel_post', async (ctx) => {
    // Only process if subscription is required for this channel
    const channelId = ctx.chat.id;
    const channel = await Channel.findOne({ channelId });

    // If this is a new channel, record it
    if (!channel) {
        try {
            await new Channel({
                channelId,
                channelTitle: ctx.chat.title,
                subscriptionRequired: true
            }).save();
        } catch (err) {
            console.error('Error creating channel record:', err);
        }
    }

    // Check if this is a command and process it
    if (ctx.channelPost && ctx.channelPost.text && ctx.channelPost.text.startsWith('/')) {
        const command = ctx.channelPost.text.split(' ')[0].substring(1); // Extract command name without /

        // Handle /subscribe command in channels
        if (command === 'subscribe') {
            return ctx.reply(
                'To subscribe to this channel, please send a direct message to the bot with /subscribe command.\n\n' +
                'Or click the button below:',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Subscribe to Channel", url: `https://t.me/${ctx.botInfo.username}?start=channel_${channelId}` }]
                        ]
                    }
                }
            );
        }
    }

    // If subscription is not required, allow all messages
    if (channel && !channel.subscriptionRequired) {
        return;
    }

    // Handle anonymous posts (channel itself posts)
    // Channel posts don't have ctx.from, so we can't check subscription
    // We typically don't need to filter channel admin posts
});

// Handle chat member updates - detect when users join channels
bot.on('chat_member', async (ctx) => {
    const { chat, from, new_chat_member } = ctx.update.chat_member;

    // Skip if it's not about a specific user
    if (!new_chat_member.user) return;

    const memberId = new_chat_member.user.id;
    const memberStatus = new_chat_member.status;

    // Record when a user joins a channel
    if (chat.type === 'channel' && memberStatus === 'member') {
        try {
            // Record channel in user's joined channels
            await User.findOneAndUpdate(
                { userId: memberId },
                {
                    $addToSet: {
                        joinedChannels: {
                            channelId: chat.id,
                            channelTitle: chat.title
                        }
                    }
                },
                { upsert: true }
            );

            // Check if subscription required and user is subscribed
            const channel = await Channel.findOne({ channelId: chat.id });
            if (channel && channel.subscriptionRequired) {
                const user = await User.findOne({ userId: memberId });

                // If not subscribed, send welcome message with subscription info
                if (!user || !user.isSubscribed) {
                    const welcomeMsg = channel.welcomeMessage ||
                        'Welcome! This channel requires a subscription to view content. Use /subscribe to purchase a subscription.';

                    try {
                        await bot.telegram.sendMessage(memberId, welcomeMsg);
                    } catch (err) {
                        console.error('Error sending welcome message:', err);
                    }
                }
            }
        } catch (err) {
            console.error('Error handling chat member update:', err);
        }
    }
});

// Handle group chat messages - this is where we filter non-subscribers
bot.on('message', async (ctx) => {
    // Skip if it's a channel post (handled separately)
    if (ctx.chat.type === 'channel') return;

    // Process group and supergroup messages
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        // Skip processing for bot commands and service messages
        if (ctx.message.text && ctx.message.text.startsWith('/')) return;

        // Add group to user's joined groups if needed
        if (ctx.from) {
            try {
                await User.findOneAndUpdate(
                    { userId: ctx.from.id },
                    {
                        $addToSet: {
                            joinedGroups: {
                                groupId: ctx.chat.id,
                                groupTitle: ctx.chat.title
                            }
                        }
                    }
                );
            } catch (err) {
                console.error('Error updating user groups:', err);
            }
        }

        // Check if subscription is required for this group
        const group = await Group.findOne({ groupId: ctx.chat.id });

        // If this is a new group or subscription is disabled, allow all messages
        if (!group || !group.subscriptionRequired) {
            if (!group) {
                try {
                    // Record new group
                    await new Group({
                        groupId: ctx.chat.id,
                        groupTitle: ctx.chat.title,
                        subscriptionRequired: true
                    }).save();
                } catch (err) {
                    console.error('Error creating group record:', err);
                }
            }
            return;
        }

        // Check if user is an admin (admins don't need to subscribe)
        try {
            const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
            if (chatMember.status === 'creator' || chatMember.status === 'administrator') {
                return; // Allow admin messages
            }
        } catch (err) {
            console.error('Error checking admin status:', err);
        }

        // If the user isn't subscribed, delete their message
        const user = await User.findOne({ userId: ctx.from.id });

        if (!user || !user.isSubscribed) {
            try {
                // Delete the message if user is not subscribed
                await ctx.deleteMessage();

                // Send a private message to the user (only once per hour per group to avoid spam)
                const oneHourAgo = new Date();
                oneHourAgo.setHours(oneHourAgo.getHours() - 1);

                const recentNotification = await NotificationLog.findOne({
                    userId: ctx.from.id,
                    groupId: ctx.chat.id,
                    createdAt: { $gte: oneHourAgo }
                });

                if (!recentNotification) {
                    const welcomeMsg = group.welcomeMessage ||
                        `Your message in "${ctx.chat.title}" was hidden because you don't have an active subscription. Use /subscribe to purchase a subscription and unlock all content.`;

                    await bot.telegram.sendMessage(
                        ctx.from.id,
                        welcomeMsg
                    );

                    await new NotificationLog({
                        userId: ctx.from.id,
                        groupId: ctx.chat.id
                    }).save();
                }
            } catch (error) {
                console.error('Error handling non-subscriber message:', error);
            }
        }
    }
});

// Run daily to check expired subscriptions
async function checkExpiredSubscriptions() {
    const now = new Date();

    try {
        // Find users with expired subscriptions
        const expiredUsers = await User.find({
            isSubscribed: true,
            subscriptionExpiresAt: { $lt: now }
        });

        console.log(`Found ${expiredUsers.length} expired subscriptions`);

        // Update subscription status for each expired user
        for (const user of expiredUsers) {
            await User.findOneAndUpdate(
                { userId: user.userId },
                { isSubscribed: false }
            );

            // Notify user about expired subscription
            try {
                await bot.telegram.sendMessage(
                    user.userId,
                    'Your subscription has expired. Use /subscribe to renew your subscription and continue accessing premium content.'
                );
            } catch (err) {
                console.error(`Error notifying user ${user.userId} about expired subscription:`, err);
            }
        }
    } catch (err) {
        console.error('Error checking expired subscriptions:', err);
    }
}

// Run the check every 24 hours
setInterval(checkExpiredSubscriptions, 24 * 60 * 60 * 1000);

// Enable graceful stop
process.once('SIGINT', () => {
    console.log('Received SIGINT signal, shutting down bot...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('Received SIGTERM signal, shutting down bot...');
    bot.stop('SIGTERM');
});

// Configure subscription settings for a group or channel
bot.command('admin_subscription', async (ctx) => {
    const chatId = ctx.chat.id;
    let isAdmin = false;
    let entity = null;
    let entityType = '';

    // Check if user is an admin
    if (ctx.chat.type === 'channel') {
        const channel = await Channel.findOne({ channelId: chatId });
        if (channel && channel.adminUsers.includes(ctx.from.id)) {
            isAdmin = true;
            entity = channel;
            entityType = 'channel';
        }
    } else if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        // Check if user is admin in our database
        const group = await Group.findOne({ groupId: chatId });
        if (group && group.adminUsers.includes(ctx.from.id)) {
            isAdmin = true;
            entity = group;
            entityType = 'group';
        } else {
            // Check Telegram admins as well
            try {
                const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
                if (chatMember.status === 'creator' || chatMember.status === 'administrator') {
                    isAdmin = true;
                    // Create or update group
                    entity = await Group.findOneAndUpdate(
                        { groupId: chatId },
                        {
                            groupTitle: ctx.chat.title,
                            $addToSet: { adminUsers: ctx.from.id }
                        },
                        { upsert: true, new: true }
                    );
                    entityType = 'group';
                }
            } catch (err) {
                console.error('Error checking admin status:', err);
            }
        }
    }

    if (!isAdmin) {
        return ctx.reply('This command is only available to group or channel administrators.');
    }

    // Format subscription settings for display
    const settings = entity.subscriptionSettings || {};
    const oneTime = settings.oneTimePayment || { enabled: true, amount: 99.99, durationDays: 30 };
    const recurring = settings.recurringPayment || { enabled: true, amount: 99.99, frequency: 3 };

    // Create buttons for different subscription settings
    await ctx.reply(
        `📝 Subscription Settings for this ${entityType}:\n\n` +
        `🔶 One-Time Payment:\n` +
        `   - Enabled: ${oneTime.enabled ? 'Yes ✅' : 'No ❌'}\n` +
        `   - Amount: R${oneTime.amount.toFixed(2)}\n` +
        `   - Duration: ${oneTime.durationDays} days\n\n` +
        `🔄 Recurring Payment:\n` +
        `   - Enabled: ${recurring.enabled ? 'Yes ✅' : 'No ❌'}\n` +
        `   - Amount: R${recurring.amount.toFixed(2)}\n` +
        `   - Frequency: ${recurring.frequency === 3 ? 'Monthly' :
                           recurring.frequency === 2 ? 'Weekly' :
                           recurring.frequency === 4 ? 'Quarterly' :
                           recurring.frequency === 5 ? 'Biannually' :
                           recurring.frequency === 6 ? 'Annually' : 'Custom'}\n\n` +
        `📋 Product Info:\n` +
        `   - Name: ${settings.customItemName || (entityType === 'channel' ? 'Channel Subscription' : 'Group Subscription')}\n` +
        `   - Description: ${settings.customItemDescription || 'Access to premium content'}`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Configure One-Time Payment", callback_data: `cfg_onetime_${entityType}` }],
                    [{ text: "Configure Recurring Payment", callback_data: `cfg_recurring_${entityType}` }],
                    [{ text: "Configure Product Info", callback_data: `cfg_product_${entityType}` }]
                ]
            }
        }
    );
});

// Configure payment options menu
bot.command('admin_payment', async (ctx) => {
    const chatId = ctx.chat.id;
    let isAdmin = false;
    let entityType = '';

    // Check if user is an admin (reusing admin verification logic)
    if (ctx.chat.type === 'channel') {
        const channel = await Channel.findOne({ channelId: chatId });
        if (channel && channel.adminUsers.includes(ctx.from.id)) {
            isAdmin = true;
            entityType = 'channel';
        }
    } else if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        const group = await Group.findOne({ groupId: chatId });
        if (group && group.adminUsers.includes(ctx.from.id)) {
            isAdmin = true;
            entityType = 'group';
        } else {
            try {
                const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
                if (chatMember.status === 'creator' || chatMember.status === 'administrator') {
                    isAdmin = true;
                    entityType = 'group';

                    // Add to our DB as an admin if not already there
                    await Group.findOneAndUpdate(
                        { groupId: chatId },
                        {
                            $addToSet: { adminUsers: ctx.from.id },
                            groupTitle: ctx.chat.title
                        },
                        { upsert: true }
                    );
                }
            } catch (err) {
                console.error('Error checking admin status:', err);
            }
        }
    }

    if (!isAdmin) {
               return ctx.reply('This command is only available to group or channel administrators.');
    }

    // Show payment configuration options
    await ctx.reply(
        `💳 Payment Configuration\n\n` +
        `Choose which payment options you want to enable for this ${entityType}:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Toggle One-Time Payments", callback_data: `toggle_onetime_${entityType}` }],
                    [{ text: "Toggle Recurring Payments", callback_data: `toggle_recurring_${entityType}` }],
                    [{ text: "Back to Admin Menu", callback_data: `admin_menu` }]
                ]
            }
        }
    );
});

// Handle subscription configuration callbacks
bot.action(/cfg_onetime_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    await ctx.answerCbQuery();

    // Start conversation for configuring one-time payment
    await ctx.reply(
        `⚙️ Configure One-Time Payment\n\n` +
        `Please select the parameter you want to change:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Change Price", callback_data: `edit_onetime_price_${entityType}` }],
                    [{ text: "Change Duration", callback_data: `edit_onetime_duration_${entityType}` }],
                    [{ text: "Toggle Enabled/Disabled", callback_data: `toggle_onetime_${entityType}` }],
                    [{ text: "Back", callback_data: `admin_subscription` }]
                ]
            }
        }
    );
});

bot.action(/cfg_recurring_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    await ctx.answerCbQuery();

    // Start conversation for configuring recurring payment
    await ctx.reply(
        `⚙️ Configure Recurring Payment\n\n` +
        `Please select the parameter you want to change:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Change Price", callback_data: `edit_recurring_price_${entityType}` }],
                    [{ text: "Change Frequency", callback_data: `edit_recurring_frequency_${entityType}` }],
                    [{ text: "Toggle Enabled/Disabled", callback_data: `toggle_recurring_${entityType}` }],
                    [{ text: "Back", callback_data: `admin_subscription` }]
                ]
            }
        }
    );
});

bot.action(/cfg_product_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    await ctx.answerCbQuery();

    // Start conversation for configuring product info
    await ctx.reply(
        `⚙️ Configure Product Information\n\n` +
        `Please select the parameter you want to change:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Change Product Name", callback_data: `edit_product_name_${entityType}` }],
                    [{ text: "Change Product Description", callback_data: `edit_product_desc_${entityType}` }],
                    [{ text: "Back", callback_data: `admin_subscription` }]
                ]
            }
        }
    );
});

// Handle toggle actions
bot.action(/toggle_onetime_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery();

    try {
        let entity;
        if (entityType === 'channel') {
            entity = await Channel.findOne({ channelId: chatId });
            if (!entity) return ctx.reply('Channel settings not found.');

            // Toggle one-time payments
            const currentValue = entity.subscriptionSettings?.oneTimePayment?.enabled !== false;
            await Channel.findOneAndUpdate(
                { channelId: chatId },
                {
                    'subscriptionSettings.oneTimePayment.enabled': !currentValue
                },
                { upsert: true }
            );

            await ctx.reply(`One-time payments are now ${!currentValue ? 'enabled' : 'disabled'} for this channel.`);
        } else {
            entity = await Group.findOne({ groupId: chatId });
            if (!entity) return ctx.reply('Group settings not found.');

            // Toggle one-time payments
            const currentValue = entity.subscriptionSettings?.oneTimePayment?.enabled !== false;
            await Group.findOneAndUpdate(
                { groupId: chatId },
                {
                    'subscriptionSettings.oneTimePayment.enabled': !currentValue
                },
                { upsert: true }
            );

            await ctx.reply(`One-time payments are now ${!currentValue ? 'enabled' : 'disabled'} for this group.`);
        }

        // Show updated admin subscription menu
        return await ctx.telegram.sendMessage(
            chatId,
            'Settings updated. Use /admin_subscription to see the current configuration.'
        );
    } catch (error) {
        console.error('Error toggling one-time payments:', error);
        return ctx.reply('An error occurred while updating settings. Please try again.');
    }
});

bot.action(/toggle_recurring_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery();

    try {
        let entity;
        if (entityType === 'channel') {
            entity = await Channel.findOne({ channelId: chatId });
            if (!entity) return ctx.reply('Channel settings not found.');

            // Toggle recurring payments
            const currentValue = entity.subscriptionSettings?.recurringPayment?.enabled !== false;
            await Channel.findOneAndUpdate(
                { channelId: chatId },
                {
                    'subscriptionSettings.recurringPayment.enabled': !currentValue
                },
                { upsert: true }
            );

            await ctx.reply(`Recurring payments are now ${!currentValue ? 'enabled' : 'disabled'} for this channel.`);
        } else {
            entity = await Group.findOne({ groupId: chatId });
            if (!entity) return ctx.reply('Group settings not found.');

            // Toggle recurring payments
            const currentValue = entity.subscriptionSettings?.recurringPayment?.enabled !== false;
            await Group.findOneAndUpdate(
                { groupId: chatId },
                {
                    'subscriptionSettings.recurringPayment.enabled': !currentValue
                },
                { upsert: true }
            );

            await ctx.reply(`Recurring payments are now ${!currentValue ? 'enabled' : 'disabled'} for this group.`);
        }

        // Show updated admin subscription menu
        return await ctx.telegram.sendMessage(
            chatId,
            'Settings updated. Use /admin_subscription to see the current configuration.'
        );
    } catch (error) {
        console.error('Error toggling recurring payments:', error);
        return ctx.reply('An error occurred while updating settings. Please try again.');
    }
});

// Handle property edit actions - Prices
bot.action(/edit_onetime_price_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    await ctx.answerCbQuery();

    // Store in session that we're waiting for price input
    ctx.session = {
        awaitingInput: 'onetime_price',
        entityType: entityType
    };

    await ctx.reply(
        '💰 Enter the new price for one-time payment (in Rand):\n' +
        'Example: 99.99'
    );
});

bot.action(/edit_recurring_price_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    await ctx.answerCbQuery();

    // Store in session that we're waiting for price input
    ctx.session = {
        awaitingInput: 'recurring_price',
        entityType: entityType
    };

    await ctx.reply(
        '💰 Enter the new price for recurring payment (in Rand):\n' +
        'Example: 99.99'
    );
});

// Handle property edit actions - Duration
bot.action(/edit_onetime_duration_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    await ctx.answerCbQuery();

    // Store in session that we're waiting for duration input
    ctx.session = {
        awaitingInput: 'onetime_duration',
        entityType: entityType
    };

    await ctx.reply(
        '⏱️ Enter the duration for one-time payment (in days):\n' +
        'Example: 30 for one month'
    );
});

// Handle property edit actions - Frequency
bot.action(/edit_recurring_frequency_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    await ctx.answerCbQuery();

    await ctx.reply(
        '🔄 Select the frequency for recurring payments:',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Weekly", callback_data: `set_frequency_2_${entityType}` }],
                    [{ text: "Monthly", callback_data: `set_frequency_3_${entityType}` }],
                    [{ text: "Quarterly", callback_data: `set_frequency_4_${entityType}` }],
                    [{ text: "Biannually", callback_data: `set_frequency_5_${entityType}` }],
                    [{ text: "Annually", callback_data: `set_frequency_6_${entityType}` }],
                    [{ text: "Back", callback_data: `cfg_recurring_${entityType}` }]
                ]
            }
        }
    );
});

// Handle frequency selection
bot.action(/set_frequency_(\d+)_(.+)/, async (ctx) => {
    const frequency = parseInt(ctx.match[1]);
    const entityType = ctx.match[2];
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery();

    try {
        if (entityType === 'channel') {
            await Channel.findOneAndUpdate(
                { channelId: chatId },
                { 'subscriptionSettings.recurringPayment.frequency': frequency },
                { upsert: true }
            );
        } else {
            await Group.findOneAndUpdate(
                { groupId: chatId },
                { 'subscriptionSettings.recurringPayment.frequency': frequency },
                { upsert: true }
            );
        }

        const frequencyText =
            frequency === 2 ? 'Weekly' :
            frequency === 3 ? 'Monthly' :
            frequency === 4 ? 'Quarterly' :
            frequency === 5 ? 'Biannually' :
            frequency === 6 ? 'Annually' : 'Custom';

        await ctx.reply(`Recurring payment frequency has been set to ${frequencyText}.`);

        // Show updated admin subscription menu
        return await ctx.telegram.sendMessage(
            chatId,
            'Settings updated. Use /admin_subscription to see the current configuration.'
        );
    } catch (error) {
        console.error('Error setting payment frequency:', error);
        return ctx.reply('An error occurred while updating settings. Please try again.');
    }
});

// Handle property edit actions - Product Info
bot.action(/edit_product_name_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    await ctx.answerCbQuery();

    // Store in session that we're waiting for product name input
    ctx.session = {
        awaitingInput: 'product_name',
        entityType: entityType
    };

    await ctx.reply(
        '📝 Enter the new product name for subscriptions:\n' +
        'Example: "Premium Membership"'
    );
});

bot.action(/edit_product_desc_(.+)/, async (ctx) => {
    const entityType = ctx.match[1];
    await ctx.answerCbQuery();

    // Store in session that we're waiting for product description input
    ctx.session = {
        awaitingInput: 'product_desc',
        entityType: entityType
    };

    await ctx.reply(
        '📝 Enter the new product description for subscriptions:\n' +
        'Example: "Access to exclusive premium content"'
    );
});

// Back to admin menu
bot.action('admin_menu', async (ctx) => {
    await ctx.answerCbQuery();

    // Clear any session state
    ctx.session = {};

    // Re-display the admin menu
    const chatType = ctx.chat.type;
    const entityType = chatType === 'channel' ? 'channel' : 'group';

    return ctx.reply(
        `Admin commands for this ${entityType}:\n\n` +
        `/admin_toggle - Toggle subscription requirement\n` +
        `/admin_welcome [message] - Set welcome message\n` +
        `/admin_stats - Show subscription statistics\n` +
        `/admin_subscription - Configure subscription settings\n` +
        `/admin_payment - Configure payment options`
    );
});

// Handle admin_subscription callback
bot.action('admin_subscription', async (ctx) => {
    await ctx.answerCbQuery();

    // Execute the /admin_subscription command to show subscription settings
    return ctx.telegram.sendMessage(
        ctx.chat.id,
        '/admin_subscription',
        { entities: [{ type: 'bot_command', offset: 0, length: 19 }] }
    );
});

// Handle text inputs for configuration
bot.on('text', async (ctx) => {
    // Only process if we're waiting for input from this user
    if (!ctx.session || !ctx.session.awaitingInput) {
        return next();
    }

    const input = ctx.message.text;
    const inputType = ctx.session.awaitingInput;
    const entityType = ctx.session.entityType;
    const chatId = ctx.chat.id;

    try {
        // Handle different types of input
        if (inputType === 'onetime_price') {
            // Parse and validate price
            const price = parseFloat(input);
            if (isNaN(price) || price <= 0) {
                return ctx.reply('Please enter a valid price (greater than 0).');
            }

            // Update the price
            if (entityType === 'channel') {
                await Channel.findOneAndUpdate(
                    { channelId: chatId },
                    { 'subscriptionSettings.oneTimePayment.amount': price },
                    { upsert: true }
                );
            } else {
                await Group.findOneAndUpdate(
                    { groupId: chatId },
                    { 'subscriptionSettings.oneTimePayment.amount': price },
                    { upsert: true }
                );
            }

            await ctx.reply(`One-time payment price has been set to R${price.toFixed(2)}.`);
        }
        else if (inputType === 'recurring_price') {
            // Parse and validate price
            const price = parseFloat(input);
            if (isNaN(price) || price <= 0) {
                return ctx.reply('Please enter a valid price (greater than 0).');
            }

            // Update the price
            if (entityType === 'channel') {
                await Channel.findOneAndUpdate(
                    { channelId: chatId },
                    { 'subscriptionSettings.recurringPayment.amount': price },
                    { upsert: true }
                );
            } else {
                await Group.findOneAndUpdate(
                    { groupId: chatId },
                    { 'subscriptionSettings.recurringPayment.amount': price },
                    { upsert: true }
                );
            }

            await ctx.reply(`Recurring payment price has been set to R${price.toFixed(2)}.`);
        }
        else if (inputType === 'onetime_duration') {
            // Parse and validate duration
            const duration = parseInt(input);
            if (isNaN(duration) || duration <= 0) {
                return ctx.reply('Please enter a valid duration in days (greater than 0).');
            }

            // Update the duration
            if (entityType === 'channel') {
                await Channel.findOneAndUpdate(
                    { channelId: chatId },
                    { 'subscriptionSettings.oneTimePayment.durationDays': duration },
                    { upsert: true }
                );
            } else {
                await Group.findOneAndUpdate(
                    { groupId: chatId },
                    { 'subscriptionSettings.oneTimePayment.durationDays': duration },
                    { upsert: true }
                );
            }

            await ctx.reply(`One-time payment duration has been set to ${duration} days.`);
        }
        else if (inputType === 'product_name') {
            // Validate product name
            if (!input || input.length < 3 || input.length > 50) {
                return ctx.reply('Please enter a valid product name (3-50 characters).');
            }

            // Update the product name
            if (entityType === 'channel') {
                await Channel.findOneAndUpdate(
                    { channelId: chatId },
                    { 'subscriptionSettings.customItemName': input },
                    { upsert: true }
                );
            } else {
                await Group.findOneAndUpdate(
                    { groupId: chatId },
                    { 'subscriptionSettings.customItemName': input },
                    { upsert: true }
                );
            }

            await ctx.reply(`Product name has been set to "${input}".`);
        }
        else if (inputType === 'product_desc') {
            // Validate product description
            if (!input || input.length < 3 || input.length > 255) {
                return ctx.reply('Please enter a valid product description (3-255 characters).');
            }

            // Update the product description
            if (entityType === 'channel') {
                await Channel.findOneAndUpdate(
                    { channelId: chatId },
                    { 'subscriptionSettings.customItemDescription': input },
                    { upsert: true }
                );
            } else {
                await Group.findOneAndUpdate(
                    { groupId: chatId },
                    { 'subscriptionSettings.customItemDescription': input },
                    { upsert: true }
                );
            }

            await ctx.reply(`Product description has been set to "${input}".`);
        }

        // Clear the session after processing
        ctx.session = {};

        // Show updated admin subscription menu
        await ctx.telegram.sendMessage(
            chatId,
            'Settings updated. Use /admin_subscription to see the current configuration.'
        );
    } catch (error) {
        console.error('Error processing input:', error);
        ctx.reply('An error occurred while updating settings. Please try again.');
        ctx.session = {};
    }

    // Prevent other handlers from running
    return;
});

// Helper function to get the current source chat for subscriptions
async function getSubscriptionSource(userId) {
    // Look up the user to find where they came from
    const user = await User.findOne({ userId });
    if (!user) return null;

    // Check user's recent activity
    let sourceEntity = null;
    let sourceType = null;
    let sourceChatId = null;
    let sourceSettings = null;

    // If user has joined groups, check the most recent one first
    if (user.joinedGroups && user.joinedGroups.length > 0) {
        const groupId = user.joinedGroups[user.joinedGroups.length - 1].groupId;
        const group = await Group.findOne({ groupId });

        if (group && group.subscriptionRequired) {
            sourceEntity = group;
            sourceType = 'group';
            sourceChatId = groupId;
            sourceSettings = group.subscriptionSettings;
        }
    }

    // If no group or not requiring subscription, check channels
    if (!sourceEntity && user.joinedChannels && user.joinedChannels.length > 0) {
        const channelId = user.joinedChannels[user.joinedChannels.length - 1].channelId;
        const channel = await Channel.findOne({ channelId });

        if (channel && channel.subscriptionRequired) {
            sourceEntity = channel;
            sourceType = 'channel';
            sourceChatId = channelId;
            sourceSettings = channel.subscriptionSettings;
        }
    }

    return {
        sourceChatId,
        sourceType,
        sourceSettings,
        sourceEntity,
        title: sourceEntity?.channelTitle || sourceEntity?.groupTitle || 'Content'
    };
}

// Add a session-based command to manage channels from private chat
bot.command('manage_channel', async (ctx) => {
    // This can only be used in private chat with the bot
    if (ctx.chat.type !== 'private') {
        return ctx.reply('This command can only be used in private chat with the bot.');
    }

    // Find all channels where user is admin
    const userId = ctx.from.id;
    const adminChannels = await Channel.find({
        adminUsers: userId
    });

    if (!adminChannels || adminChannels.length === 0) {
        return ctx.reply(
            'You are not registered as an admin of any channels.\n\n' +
            'To register as an admin:\n' +
            '1. Add this bot to your channel\n' +
            '2. Send /register_admin in the channel\n' +
            '3. Forward that message to this private chat'
        );
    }

    // Create keyboard with channel options
    const keyboard = adminChannels.map(channel => {
        return [{
            text: channel.channelTitle || `Channel ${channel.channelId}`,
            callback_data: `manage_channel_${channel.channelId}`
        }];
    });

    await ctx.reply(
        'Select a channel to manage:',
        {
            reply_markup: {
                inline_keyboard: keyboard
            }
        }
    );
});

// Command to register admin in channel
bot.command('register_admin', async (ctx) => {
    // This should be used in a channel
    if (ctx.chat.type !== 'channel') {
        return ctx.reply('This command should be used in a channel. Forward that message to the bot afterwards.');
    }

    const channelId = ctx.chat.id;
    const channelTitle = ctx.chat.title;

    // Generate a unique registration code
    const registrationCode = `reg_channel_${channelId}_${Date.now()}`;

    // Store in the database with TTL of 1 hour
    await new AdminRegistration({
        code: registrationCode,
        channelId: channelId,
        channelTitle: channelTitle,
        expires: new Date(Date.now() + 3600000) // 1 hour from now
    }).save();

    await ctx.reply(
        `To register as an admin of this channel:\n\n` +
        `1. Forward this message to the bot in private chat\n` +
        `2. Or use this code: ${registrationCode}\n\n` +
        `This registration code will expire in 1 hour.`
    );
});

// Add a registration schema for temporary admin registration codes
const adminRegistrationSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    channelId: { type: Number, required: true },
    channelTitle: String,
    expires: { type: Date, required: true }
});

// Add TTL index to automatically delete expired registrations
adminRegistrationSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

const AdminRegistration = mongoose.model('AdminRegistration', adminRegistrationSchema);

// Handle forwarded messages to register as admin
bot.on('message', async (ctx, next) => {
    // Check if we're in private chat and this is a forwarded message
    if (ctx.chat.type === 'private' && ctx.message.forward_from_chat) {
        // Check if forwarded from a channel
        if (ctx.message.forward_from_chat.type === 'channel') {
            const channelId = ctx.message.forward_from_chat.id;
            const channelTitle = ctx.message.forward_from_chat.title;
            const userId = ctx.from.id;

            // Check if the forwarded message contains the registration code
            if (ctx.message.text && ctx.message.text.includes('/register_admin')) {
                // Register user as admin for this channel
                const channel = await Channel.findOneAndUpdate(
                    { channelId },
                    {
                        channelId,
                        channelTitle,
                        $addToSet: { adminUsers: userId }
                    },
                    { upsert: true, new: true }
                );

                return ctx.reply(
                    `You have been registered as an admin for channel "${channelTitle}"\n\n` +
                    `Use /manage_channel to configure this channel.`
                );
            }
        }
    }

    // Check if this is a registration code
    if (ctx.chat.type === 'private' && ctx.message.text && ctx.message.text.startsWith('reg_channel_')) {
        const code = ctx.message.text.trim();
        const registration = await AdminRegistration.findOne({ code });

        if (registration) {
            // Register user as admin for this channel
            const channel = await Channel.findOneAndUpdate(
                { channelId: registration.channelId },
                {
                    channelId: registration.channelId,
                    channelTitle: registration.channelTitle,
                    $addToSet: { adminUsers: ctx.from.id }
                },
                { upsert: true, new: true }
            );

            // Delete the registration code
            await AdminRegistration.deleteOne({ code });

            return ctx.reply(
                `You have been registered as an admin for channel "${registration.channelTitle}"\n\n` +
                `Use /manage_channel to configure this channel.`
            );
        }
    }

    return next();
});

// Handle channel management callbacks
bot.action(/manage_channel_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const userId = ctx.from.id;

    // Verify user is an admin of this channel
    const channel = await Channel.findOne({
        channelId: channelId,
        adminUsers: userId
    });

    if (!channel) {
        return ctx.answerCbQuery('You are not an admin of this channel.');
    }

    // Store the current channel in session
    ctx.session = ctx.session || {};
    ctx.session.currentChannel = channelId;
    ctx.session.currentChannelTitle = channel.channelTitle;

    // Show admin options
    const keyboard = [
        [{ text: '➕ Add Subscription Plan', callback_data: 'channel_add_plan' }],
        [{ text: '📋 List Subscription Plans', callback_data: 'channel_list_plans' }],
        [{ text: '📊 View Subscribers', callback_data: 'channel_view_subscribers' }],
        [{ text: '⚙️ Channel Settings', callback_data: 'channel_settings' }],
        [{ text: '« Back', callback_data: 'back_to_main' }]
    ];

    await ctx.editMessageText(
        `Managing channel: ${channel.channelTitle}\n\n` +
        `Select an action:`,
        {
            reply_markup: {
                inline_keyboard: keyboard
            }
        }
    );
});

// Add channel subscription plan
bot.action('channel_add_plan', async (ctx) => {
    if (!ctx.session || !ctx.session.currentChannel) {
        return ctx.answerCbQuery('Session expired. Please start again with /manage_channel');
    }

    // Start conversation to collect plan details
    await ctx.answerCbQuery();
    ctx.session.addingPlan = true;

    await ctx.editMessageText(
        `Adding a subscription plan for "${ctx.session.currentChannelTitle}"\n\n` +
        `Send me the name of the subscription plan:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '« Cancel', callback_data: 'cancel_add_plan' }]
                ]
            }
        }
    );
});

// List subscription plans for a channel
bot.action('channel_list_plans', async (ctx) => {
    if (!ctx.session || !ctx.session.currentChannel) {
        return ctx.answerCbQuery('Session expired. Please start again with /manage_channel');
    }

    const channelId = ctx.session.currentChannel;

    // Get all subscription plans for this channel
    const plans = await SubscriptionPlan.find({ channelId });

    if (!plans || plans.length === 0) {
        await ctx.editMessageText(
            `No subscription plans found for "${ctx.session.currentChannelTitle}"\n\n` +
            `Use "Add Subscription Plan" to create one.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ Add Plan', callback_data: 'channel_add_plan' }],
                        [{ text: '« Back', callback_data: `manage_channel_${channelId}` }]
                    ]
                }
            }
        );
        return;
    }

    // Create keyboard with plan options
    const keyboard = plans.map(plan => {
        return [{
            text: `${plan.name} - ${plan.price} ${plan.currency}`,
            callback_data: `edit_plan_${plan._id}`
        }];
    });

    // Add back button
    keyboard.push([{ text: '« Back', callback_data: `manage_channel_${channelId}` }]);

    await ctx.editMessageText(
        `Subscription plans for "${ctx.session.currentChannelTitle}":\n\n` +
        `Select a plan to edit:`,
        {
            reply_markup: {
                inline_keyboard: keyboard
            }
        }
    );
});

// Update subscription plan schema to support channel subscriptions
const subscriptionPlanSchema = mongoose.Schema({
    // ...existing schema fields...
    channelId: Number,
    isChannelPlan: { type: Boolean, default: false },
    // ...existing schema fields...
});

// Enhance message handler to detect channel management codes
bot.on('message', async (ctx, next) => {
    // Handle forwarded messages and management codes for channels
    if (ctx.chat.type === 'private') {
        // Check for direct management codes
        if (ctx.message.text && ctx.message.text.startsWith('manage_direct_')) {
            const code = ctx.message.text.trim();
            const registration = await AdminRegistration.findOne({ code });

            if (registration) {
                const channelId = registration.channelId;
                const userId = ctx.from.id;

                // Register user as admin for this channel
                await Channel.findOneAndUpdate(
                    { channelId },
                    {
                        channelId,
                        channelTitle: registration.channelTitle,
                        $addToSet: { adminUsers: userId }
                    },
                    { upsert: true }
                );

                // Delete the registration code
                await AdminRegistration.deleteOne({ code });

                // Set the current channel in session for management
                ctx.session = ctx.session || {};
                ctx.session.currentChannel = channelId;
                ctx.session.currentChannelTitle = registration.channelTitle;

                // Show admin options for this channel
                const keyboard = [
                    [{ text: '➕ Add Subscription Plan', callback_data: 'channel_add_plan' }],
                    [{ text: '📋 List Subscription Plans', callback_data: 'channel_list_plans' }],
                    [{ text: '📊 View Subscribers', callback_data: 'channel_view_subscribers' }],
                    [{ text: '⚙️ Channel Settings', callback_data: 'channel_settings' }]
                ];

                return ctx.reply(
                    `✅ You are now managing channel: ${registration.channelTitle}\n\n` +
                    `Select an action:`,
                    {
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    }
                );
            }
        }

        // Check for forwarded management messages from channels
        if (ctx.message.forward_from_chat &&
            ctx.message.forward_from_chat.type === 'channel' &&
            ctx.message.text &&
            ctx.message.text.includes('manage_direct_')) {

            // Extract the code from the message
            const textParts = ctx.message.text.split('use code: ');
            if (textParts.length > 1) {
                const codePart = textParts[1].split('\n')[0];
                const registration = await AdminRegistration.findOne({ code: codePart });

                if (registration) {
                    const channelId = registration.channelId;
                    const userId = ctx.from.id;

                    // Register user as admin for this channel if not already
                    await Channel.findOneAndUpdate(
                        { channelId },
                        {
                            channelId,
                            channelTitle: registration.channelTitle,
                            $addToSet: { adminUsers: userId }
                        },
                        { upsert: true }
                    );

                    // Delete the registration code
                    await AdminRegistration.deleteOne({ code: codePart });

                    // Set the current channel in session for immediate management
                    ctx.session = ctx.session || {};
                    ctx.session.currentChannel = channelId;
                    ctx.session.currentChannelTitle = registration.channelTitle;

                    // Show admin options for this channel
                    const keyboard = [
                        [{ text: '➕ Add Subscription Plan', callback_data: 'channel_add_plan' }],
                        [{ text: '📋 List Subscription Plans', callback_data: 'channel_list_plans' }],
                        [{ text: '📊 View Subscribers', callback_data: 'channel_view_subscribers' }],
                        [{ text: '⚙️ Channel Settings', callback_data: 'channel_settings' }]
                    ];

                    return ctx.reply(
                        `✅ You are now managing channel: ${registration.channelTitle}\n\n` +
                        `Select an action:`,
                        {
                            reply_markup: {
                                inline_keyboard: keyboard
                            }
                        }
                    );
                }
            }
        }
    }

    return next();
});

// Handle channel settings action
bot.action('channel_settings', async (ctx) => {
    if (!ctx.session || !ctx.session.currentChannel) {
        return ctx.answerCbQuery('Session expired. Please start again with /manage_channel');
    }

    await ctx.answerCbQuery();

    const channelId = ctx.session.currentChannel;
    const channel = await Channel.findOne({ channelId });

    if (!channel) {
        return ctx.editMessageText('Channel settings not found. Please try again.');
    }

    // Format subscription settings for display
    const settings = channel.subscriptionSettings || {};
    const oneTime = settings.oneTimePayment || { enabled: true, amount: 99.99, durationDays: 30 };
    const recurring = settings.recurringPayment || { enabled: true, amount: 99.99, frequency: 3 };

    await ctx.editMessageText(
        `📝 Settings for channel "${channel.channelTitle}":\n\n` +
        `🔑 Subscription Required: ${channel.subscriptionRequired ? 'Yes ✅' : 'No ❌'}\n\n` +
        `🔶 One-Time Payment:\n` +
        `   - Enabled: ${oneTime.enabled ? 'Yes ✅' : 'No ❌'}\n` +
        `   - Amount: R${oneTime.amount.toFixed(2)}\n` +
        `   - Duration: ${oneTime.durationDays} days\n\n` +
        `🔄 Recurring Payment:\n` +
        `   - Enabled: ${recurring.enabled ? 'Yes ✅' : 'No ❌'}\n` +
        `   - Amount: R${recurring.amount.toFixed(2)}\n` +
        `   - Frequency: ${recurring.frequency === 3 ? 'Monthly' :
                          recurring.frequency === 2 ? 'Weekly' :
                          recurring.frequency === 4 ? 'Quarterly' :
                          recurring.frequency === 5 ? 'Biannually' :
                          recurring.frequency === 6 ? 'Annually' : 'Custom'}\n\n` +
        `📋 Product Info:\n` +
        `   - Name: ${settings.customItemName || 'Channel Subscription'}\n` +
        `   - Description: ${settings.customItemDescription || 'Access to premium content'}`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: oneTime.enabled ? "Disable One-Time" : "Enable One-Time", callback_data: `toggle_channel_onetime` }],
                    [{ text: recurring.enabled ? "Disable Recurring" : "Enable Recurring", callback_data: `toggle_channel_recurring` }],
                    [{ text: channel.subscriptionRequired ? "Make Public" : "Make Subscription-Only", callback_data: `toggle_channel_required` }],
                    [{ text: "Edit One-Time Price", callback_data: `edit_channel_onetime_price` }],
                    [{ text: "Edit Recurring Price", callback_data: `edit_channel_recurring_price` }],
                    [{ text: "Back to Channel Menu", callback_data: `manage_channel_${channelId}` }]
                ]
            }
        }
    );
});

// Toggle subscription requirement for channel
bot.action('toggle_channel_required', async (ctx) => {
    if (!ctx.session || !ctx.session.currentChannel) {
        return ctx.answerCbQuery('Session expired. Please start again.');
    }

    await ctx.answerCbQuery();

    const channelId = ctx.session.currentChannel;
    const channel = await Channel.findOne({ channelId });

    if (!channel) {
        return ctx.editMessageText('Channel not found. Please try again.');
    }

    // Toggle subscription requirement
    const newValue = !channel.subscriptionRequired;
    await Channel.updateOne(
        { channelId },
        { subscriptionRequired: newValue }
    );

    // Refresh settings display
    ctx.answerCbQuery(`Channel is now ${newValue ? 'subscription-only' : 'public'}`);
    return ctx.telegram.callbackQuery(ctx.callbackQuery.id, {
        callback_data: 'channel_settings'
    });
});

// Toggle one-time payments for channel
bot.action('toggle_channel_onetime', async (ctx) => {
    if (!ctx.session || !ctx.session.currentChannel) {
        return ctx.answerCbQuery('Session expired. Please start again.');
    }

    await ctx.answerCbQuery();

    const channelId = ctx.session.currentChannel;
    const channel = await Channel.findOne({ channelId });

    if (!channel) {
        return ctx.editMessageText('Channel not found. Please try again.');
    }

    // Get current value and toggle it
    const currentValue = channel.subscriptionSettings?.oneTimePayment?.enabled !== false;
    await Channel.updateOne(
        { channelId },
        { 'subscriptionSettings.oneTimePayment.enabled': !currentValue }
    );

    // Refresh settings display
    ctx.answerCbQuery(`One-time payments are now ${!currentValue ? 'enabled' : 'disabled'}`);
    return ctx.telegram.callbackQuery(ctx.callbackQuery.id, {
        callback_data: 'channel_settings'
    });
});

// Toggle recurring payments for channel
bot.action('toggle_channel_recurring', async (ctx) => {
    if (!ctx.session || !ctx.session.currentChannel) {
        return ctx.answerCbQuery('Session expired. Please start again.');
    }

    await ctx.answerCbQuery();

    const channelId = ctx.session.currentChannel;
    const channel = await Channel.findOne({ channelId });

    if (!channel) {
        return ctx.editMessageText('Channel not found. Please try again.');
    }

    // Get current value and toggle it
    const currentValue = channel.subscriptionSettings?.recurringPayment?.enabled !== false;
    await Channel.updateOne(
        { channelId },
        { 'subscriptionSettings.recurringPayment.enabled': !currentValue }
    );

    // Refresh settings display
    ctx.answerCbQuery(`Recurring payments are now ${!currentValue ? 'enabled' : 'disabled'}`);
    return ctx.telegram.callbackQuery(ctx.callbackQuery.id, {
        callback_data: 'channel_settings'
    });
});

// Edit one-time payment price for channel
bot.action('edit_channel_onetime_price', async (ctx) => {
    if (!ctx.session || !ctx.session.currentChannel) {
        return ctx.answerCbQuery('Session expired. Please start again.');
    }

    await ctx.answerCbQuery();

    // Store in session that we're waiting for channel price input
    ctx.session.awaitingInput = 'channel_onetime_price';

    await ctx.editMessageText(
        `💰 Enter the new price for one-time channel subscription (in Rand):\n` +
        `Example: 99.99\n\n` +
        `Type your reply below:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '« Cancel', callback_data: 'channel_settings' }]
                ]
            }
        }
    );
});

// Edit recurring payment price for channel
bot.action('edit_channel_recurring_price', async (ctx) => {
    if (!ctx.session || !ctx.session.currentChannel) {
        return ctx.answerCbQuery('Session expired. Please start again.');
    }

    await ctx.answerCbQuery();

    // Store in session that we're waiting for channel price input
    ctx.session.awaitingInput = 'channel_recurring_price';

    await ctx.editMessageText(
        `💰 Enter the new price for recurring channel subscription (in Rand):\n` +
        `Example: 99.99\n\n` +
        `Type your reply below:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '« Cancel', callback_data: 'channel_settings' }]
                ]
            }
        }
    );
});

// Enhance the text handler to handle channel settings
bot.on('text', async (ctx, next) => {
    // Only process if we're waiting for input from this user
    if (!ctx.session || !ctx.session.awaitingInput) {
        return next();
    }

    const input = ctx.message.text;
    const inputType = ctx.session.awaitingInput;

    // Handle channel-specific inputs
    if (inputType === 'channel_onetime_price') {
        const channelId = ctx.session.currentChannel;
        if (!channelId) {
            ctx.session.awaitingInput = null;
            return ctx.reply('Session expired. Please start again with /manage_channel');
        }

        // Parse and validate price
        const price = parseFloat(input);
        if (isNaN(price) || price <= 0) {
            return ctx.reply('Please enter a valid price (greater than 0).');
        }

        // Update the price
        await Channel.updateOne(
            { channelId },
            { 'subscriptionSettings.oneTimePayment.amount': price }
        );

        ctx.session.awaitingInput = null;
        await ctx.reply(`One-time payment price has been set to R${price.toFixed(2)}.`);

        // Show the updated settings
        return ctx.reply(
            'Settings updated. Click below to view current settings:',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'View Channel Settings', callback_data: 'channel_settings' }]
                    ]
                }
            }
        );
    }
    else if (inputType === 'channel_recurring_price') {
        const channelId = ctx.session.currentChannel;
        if (!channelId) {
            ctx.session.awaitingInput = null;
            return ctx.reply('Session expired. Please start again with /manage_channel');
        }

        // Parse and validate price
        const price = parseFloat(input);
        if (isNaN(price) || price <= 0) {
            return ctx.reply('Please enter a valid price (greater than 0).');
        }

        // Update the price
        await Channel.updateOne(
            { channelId },
            { 'subscriptionSettings.recurringPayment.amount': price }
        );

        ctx.session.awaitingInput = null;
        await ctx.reply(`Recurring payment price has been set to R${price.toFixed(2)}.`);

        // Show the updated settings
        return ctx.reply(
            'Settings updated. Click below to view current settings:',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'View Channel Settings', callback_data: 'channel_settings' }]
                    ]
                }
            }
        );
    }

    return next();
});


// Add a direct command for managing the current channel
bot.command('manage_this_channel', async (ctx) => {
    // This command can be used in channels
    if (ctx.chat.type !== 'channel') {
        return ctx.reply('This command can only be used in channels.');
    }

    const channelId = ctx.chat.id;
    const channelTitle = ctx.chat.title;

    try {
        // Generate a unique code for this management session
        const managementCode = `manage_direct_${channelId}_${Date.now()}`;

        // Store in database with TTL of 10 minutes
        await new AdminRegistration({
            code: managementCode,
            channelId: channelId,
            channelTitle: channelTitle,
            expires: new Date(Date.now() + 600000) // 10 minutes from now
        }).save();

        await ctx.reply(
            `To manage this channel's subscription settings:\n\n` +
            `1. Start a private chat with the bot: @${ctx.botInfo.username}\n` +
            `2. Forward this message to the bot or use code: ${managementCode}\n\n` +
            `This management code will expire in 10 minutes.`
        );
    } catch (error) {
        console.error('Error creating channel management session:', error);
        await ctx.reply('An error occurred. Please try again later.');
    }
});

// Enhance message handler to detect channel management codes
bot.on('message', async (ctx, next) => {
    // Handle forwarded messages and management codes for channels
    if (ctx.chat.type === 'private') {
        // Check for direct management codes
        if (ctx.message.text && ctx.message.text.startsWith('manage_direct_')) {
            const code = ctx.message.text.trim();
            const registration = await AdminRegistration.findOne({ code });

            if (registration) {
                const channelId = registration.channelId;
                const userId = ctx.from.id;

                // Register user as admin for this channel
                await Channel.findOneAndUpdate(
                    { channelId },
                    {
                        channelId,
                        channelTitle: registration.channelTitle,
                        $addToSet: { adminUsers: userId }
                    },
                    { upsert: true }
                );

                // Delete the registration code
                await AdminRegistration.deleteOne({ code });

                // Set the current channel in session for management
                ctx.session = ctx.session || {};
                ctx.session.currentChannel = channelId;
                ctx.session.currentChannelTitle = registration.channelTitle;

                // Show admin options for this channel
                const keyboard = [
                    [{ text: '➕ Add Subscription Plan', callback_data: 'channel_add_plan' }],
                    [{ text: '📋 List Subscription Plans', callback_data: 'channel_list_plans' }],
                    [{ text: '📊 View Subscribers', callback_data: 'channel_view_subscribers' }],
                    [{ text: '⚙️ Channel Settings', callback_data: 'channel_settings' }]
                ];

                return ctx.reply(
                    `✅ You are now managing channel: ${registration.channelTitle}\n\n` +
                    `Select an action:`,
                    {
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    }
                );
            }
        }

        // Check for forwarded management messages from channels
        if (ctx.message.forward_from_chat &&
            ctx.message.forward_from_chat.type === 'channel' &&
            ctx.message.text &&
            ctx.message.text.includes('manage_direct_')) {

            // Extract the code from the message
            const textParts = ctx.message.text.split('use code: ');
            if (textParts.length > 1) {
                const codePart = textParts[1].split('\n')[0];
                const registration = await AdminRegistration.findOne({ code: codePart });

                if (registration) {
                    const channelId = registration.channelId;
                    const userId = ctx.from.id;

                    // Register user as admin for this channel if not already
                    await Channel.findOneAndUpdate(
                        { channelId },
                        {
                            channelId,
                            channelTitle: registration.channelTitle,
                            $addToSet: { adminUsers: userId }
                        },
                        { upsert: true }
                    );

                    // Delete the registration code
                    await AdminRegistration.deleteOne({ code: codePart });

                    // Set the current channel in session for immediate management
                    ctx.session = ctx.session || {};
                    ctx.session.currentChannel = channelId;
                    ctx.session.currentChannelTitle = registration.channelTitle;

                    // Show admin options for this channel
                    const keyboard = [
                        [{ text: '➕ Add Subscription Plan', callback_data: 'channel_add_plan' }],
                        [{ text: '📋 List Subscription Plans', callback_data: 'channel_list_plans' }],
                        [{ text: '📊 View Subscribers', callback_data: 'channel_view_subscribers' }],
                        [{ text: '⚙️ Channel Settings', callback_data: 'channel_settings' }]
                    ];

                    return ctx.reply(
                        `✅ You are now managing channel: ${registration.channelTitle}\n\n` +
                        `Select an action:`,
                        {
                            reply_markup: {
                                inline_keyboard: keyboard
                            }
                        }
                    );
                }
            }
        }
    }

    return next();
});

// ...existing code...