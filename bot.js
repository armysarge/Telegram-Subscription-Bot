const { Telegraf, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize bot with your token (to be set in .env file)
const bot = new Telegraf(process.env.BOT_TOKEN);

// Configure MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Create user schema for subscription tracking
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: String,
    isSubscribed: { type: Boolean, default: false },
    subscriptionExpiresAt: Date,
    joinedGroups: [{ groupId: Number, groupTitle: String }],
    joinedChannels: [{ channelId: Number, channelTitle: String }] // Added for channel tracking
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
    createdAt: { type: Date, default: Date.now }
});

const Channel = mongoose.model('Channel', channelSchema);

// Create group schema for group-specific settings
const groupSchema = new mongoose.Schema({
    groupId: { type: Number, required: true, unique: true },
    groupTitle: String,
    adminUsers: [{ type: Number }], // User IDs who are admins for the group
    subscriptionRequired: { type: Boolean, default: true },
    welcomeMessage: String,
    createdAt: { type: Date, default: Date.now }
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

// Handle subscription command
bot.command('subscribe', async (ctx) => {
    const user = await User.findOne({ userId: ctx.from.id });

    if (user && user.isSubscribed) {
        const expiryDate = new Date(user.subscriptionExpiresAt).toLocaleDateString();
        return ctx.reply(`You already have an active subscription until ${expiryDate}.`);
    }

    // Create an invoice link
    const invoice = {
        title: 'Monthly Subscription',
        description: 'Access to premium content for one month',
        payload: `sub_${ctx.from.id}_${Date.now()}`,
        provider_token: process.env.PAYMENT_PROVIDER_TOKEN,
        currency: 'USD',
        prices: [{ label: 'Monthly Access', amount: 999 }], // $9.99
        start_parameter: 'subscription'
    };

    try {
        await ctx.replyWithInvoice(invoice);
    } catch (error) {
        console.error('Error creating invoice:', error);
        await ctx.reply('Sorry, there was an error creating your subscription. Please try again later.');
    }
});

// Handle subscription status command
bot.command('status', async (ctx) => {
    const user = await User.findOne({ userId: ctx.from.id });

    if (user && user.isSubscribed) {
        const expiryDate = new Date(user.subscriptionExpiresAt).toLocaleDateString();
        return ctx.reply(`You have an active subscription until ${expiryDate}.`);
    } else {
        return ctx.reply('You do not have an active subscription. Use /subscribe to purchase one.');
    }
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

    // Show admin options
    return ctx.reply(
        `Admin commands for this ${entityType}:\n\n` +
        `/admin_toggle - Toggle subscription requirement\n` +
        `/admin_welcome [message] - Set welcome message\n` +
        `/admin_stats - Show subscription statistics`
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

// Handle successful payments
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    const { from, successful_payment } = ctx;
    const amount = successful_payment.total_amount / 100;
    const currency = successful_payment.currency;
    const paymentId = successful_payment.telegram_payment_charge_id;

    try {
        // Save payment record
        await new Payment({
            userId: from.id,
            amount,
            currency,
            paymentId,
            status: 'completed'
        }).save();

        // Update user subscription status
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 month subscription

        await User.findOneAndUpdate(
            { userId: from.id },
            {
                isSubscribed: true,
                subscriptionExpiresAt: expiryDate
            }
        );

        await ctx.reply(`Thank you for your payment of ${amount} ${currency}! Your subscription is now active until ${expiryDate.toLocaleDateString()}.`);
    } catch (error) {
        console.error('Error processing payment:', error);
        await ctx.reply('There was an error processing your payment. Please contact support.');
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

// Start the bot
bot.launch()
    .then(() => {
        console.log('Bot started successfully');
        checkExpiredSubscriptions(); // Run once at startup
    })
    .catch(err => console.error('Failed to start bot:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));