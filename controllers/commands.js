const User = require('../models/user');
const Group = require('../models/group');

// Command handlers
const register = (bot, paymentManager) => {
    // Start command
    bot.command('start', async (ctx) => {
        // Check if there's a deep link parameter (e.g., subscribe_group_123456)
        const startParam = ctx.startPayload;

        if (startParam && startParam.startsWith('subscribe_group_')) {
            // Extract group ID from the parameter
            const groupId = parseInt(startParam.replace('subscribe_group_', ''));
            if (groupId) {
                // Redirect to group-specific subscription flow
                return handleGroupSubscription(ctx, groupId);
            }
        }

        const message = 'Welcome to the Subscription Bot!\n\n'
            + 'This bot helps manage subscriptions for groups.\n\n'
            + 'Available commands:\n'
            + '/subscribe - Start subscription process\n'
            + '/status - Check your subscription status\n'
            + '/help - Show this help message';
        await ctx.reply(message);
    });

    // Helper function to handle group subscription
    async function handleGroupSubscription(ctx, groupId) {
        try {
            // Get group details
            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.reply('Group not found or subscription is not required for this group.');
            }

            // Make sure the group is registered and has subscription enabled
            if (!group.isRegistered || !group.subscriptionRequired) {
                return ctx.reply('This group does not require subscription or has not been registered yet.');
            }

            // Check if user is already subscribed to this group
            const user = await User.findOne({
                userId: ctx.from.id,
                'groupSubscriptions.groupId': groupId,
                'groupSubscriptions.isSubscribed': true,
                'groupSubscriptions.subscriptionExpiresAt': { $gt: new Date() }
            });

            if (user) {
                // Find the specific group subscription
                const groupSub = user.groupSubscriptions.find(sub =>
                    sub.groupId === groupId && sub.isSubscribed);

                return ctx.reply(
                    `You are already subscribed to ${group.groupTitle}.\n` +
                    `Your subscription is active until: ${groupSub.subscriptionExpiresAt.toLocaleDateString()}`
                );
            }

            // Create subscription options based on group settings
            const keyboard = {
                inline_keyboard: [
                    [{
                        text: `Subscribe to ${group.groupTitle} (${group.subscriptionPrice} ${group.subscriptionCurrency})`,
                        callback_data: `subscribe_to_group:${groupId}`
                    }],
                    [{ text: 'Cancel', callback_data: 'subscribe_cancel' }]
                ]
            };

            await ctx.reply(
                `Subscribe to ${group.groupTitle}\n\n` +
                `Monthly subscription fee: ${group.subscriptionPrice} ${group.subscriptionCurrency}\n\n` +
                `Click below to continue:`,
                { reply_markup: keyboard }
            );
        } catch (err) {
            console.error('Error in handleGroupSubscription:', err);
            await ctx.reply('An error occurred while processing your subscription. Please try again later.');
        }
    }

    // Help command
    bot.command('help', async (ctx) => {
        const message = 'Available commands:\n\n'
            + 'User Commands:\n'
            + '/subscribe - Start subscription process\n'
            + '/status - Check subscription status\n'
            + '/my_groups - Manage your groups\n\n'
            + 'Admin Commands:\n'
            + '/admin - Access admin dashboard\n'
            + '/admin_toggle - Toggle subscription requirement\n'
            + '/admin_welcome - Set welcome message\n'
            + '/admin_stats - View subscription statistics\n'
            + '/admin_subscription - Configure subscription settings\n'
            + '/admin_payment - Configure payment options';
        await ctx.reply(message);
    });

    // My Groups command - allows admins to manage their groups from private chat
    bot.command('my_groups', async (ctx) => {
        // Only works in private chat
        if (ctx.chat.type !== 'private') {
            return ctx.reply('Please use this command in a private chat with me to manage your groups.');
        }

        const userId = ctx.from.id;

        try {
            // Find all groups where the user is an admin
            const adminGroups = await Group.find({ adminUsers: userId });

            if (!adminGroups || adminGroups.length === 0) {
                return ctx.reply('You don\'t have admin rights for any groups in my database. Add me to a group as an admin to get started.');
            }

            // Create keyboard with admin groups
            const keyboard = {
                inline_keyboard: adminGroups.map(group => ([{
                    text: `${group.groupTitle} ${group.isRegistered ? '✅' : '❌'}`,
                    callback_data: `manage_group:${group.groupId}`
                }]))
            };

            await ctx.reply(
                '*Your Groups*\n\n' +
                'Select a group to manage:\n' +
                '(✅ = registered, ❌ = not registered)',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (err) {
            console.error('Error getting admin groups:', err);
            await ctx.reply('An error occurred while fetching your groups. Please try again later.');
        }
    });

    // Admin command
    bot.command('admin', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.reply('Sorry, this command is only available to administrators.');
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: 'Toggle Subscription', callback_data: 'admin_toggle' }],
                [{ text: 'Set Welcome Message', callback_data: 'admin_welcome' }],
                [{ text: 'View Stats', callback_data: 'admin_stats' }],
                [{ text: 'Configure Subscription', callback_data: 'admin_subscription' }],
                [{ text: 'Configure Payment', callback_data: 'admin_payment' }]
            ]
        };

        await ctx.reply('Admin Dashboard:', { reply_markup: keyboard });
    });

    // Subscribe command
    bot.command('subscribe', async (ctx) => {
        const User = require('../models/user');
        const Group = require('../models/group');
        const chat = await ctx.getChat();

        if (chat.type === 'private') {
            // Check if the user has joined any groups that require subscription
            const user = await User.findOne({ userId: ctx.from.id });
            const joinedGroups = user?.joinedGroups || [];

            // Get all groups the user has joined that require subscription
            const availableGroups = await Group.find({
                groupId: { $in: joinedGroups.map(g => g.groupId) },
                isRegistered: true,
                subscriptionRequired: true
            });

            if (availableGroups.length === 0) {
                return ctx.reply('You haven\'t joined any groups that require subscription yet.');
            }

            // Create buttons for each group
            const keyboard = {
                inline_keyboard: availableGroups.map(group => ([{
                    text: `${group.groupTitle} (${group.subscriptionPrice} ${group.subscriptionCurrency})`,
                    callback_data: `subscribe_to_group:${group.groupId}`
                }]))
            };

            return ctx.reply(
                'Select a group to subscribe to:',
                { reply_markup: keyboard }
            );
        }

        // In groups, check if subscription is required
        const group = await Group.findOne({ groupId: chat.id });
        if (!group?.subscriptionRequired) {
            return ctx.reply('Subscriptions are not required in this group.');
        }

        if (!group.isRegistered) {
            return ctx.reply('This group has not been registered for subscription services yet.');
        }

        // Check if user is already subscribed to this group
        const user = await User.findOne({
            userId: ctx.from.id,
            'groupSubscriptions.groupId': chat.id,
            'groupSubscriptions.isSubscribed': true,
            'groupSubscriptions.subscriptionExpiresAt': { $gt: new Date() }
        });

        if (user) {
            // Find the specific group subscription
            const groupSub = user.groupSubscriptions.find(sub =>
                sub.groupId === chat.id && sub.isSubscribed);

            return ctx.reply(
                `You are already subscribed to this group.\n` +
                `Your subscription is active until: ${groupSub.subscriptionExpiresAt.toLocaleDateString()}`
            );
        }

        // Direct them to private chat with deep link
        const keyboard = {
            inline_keyboard: [[{
                text: 'Subscribe in Private Chat',
                url: `https://t.me/${ctx.me.username}?start=subscribe_group_${chat.id}`
            }]]
        };
        await ctx.reply('Please click below to subscribe in a private chat:', { reply_markup: keyboard });
    });

    // Status command
    bot.command('status', async (ctx) => {
        const User = require('../models/user');
        const user = await User.findOne({ userId: ctx.from.id });

        if (!user) {
            return ctx.reply('You have no subscription history.');
        }

        const chat = await ctx.getChat();

        // If in a group, show status for that specific group
        if (chat.type === 'group' || chat.type === 'supergroup') {
            const groupSub = user.groupSubscriptions?.find(sub => sub.groupId === chat.id);

            if (!groupSub || !groupSub.isSubscribed) {
                return ctx.reply('You are not currently subscribed to this group.');
            }

            return ctx.reply(
                `Your subscription to this group is active until: ${groupSub.subscriptionExpiresAt.toLocaleDateString()}`
            );
        }

        // If in private chat, show all group subscriptions
        if (!user.groupSubscriptions || user.groupSubscriptions.length === 0) {
            return ctx.reply('You are not currently subscribed to any groups.');
        }

        const activeSubscriptions = user.groupSubscriptions.filter(
            sub => sub.isSubscribed && sub.subscriptionExpiresAt > new Date()
        );

        if (activeSubscriptions.length === 0) {
            return ctx.reply('You have no active group subscriptions.');
        }

        let message = 'Your active subscriptions:\n\n';
        activeSubscriptions.forEach(sub => {
            message += `• ${sub.groupTitle}\n`;
            message += `  Expires: ${sub.subscriptionExpiresAt.toLocaleDateString()}\n`;
            message += `  Amount: ${sub.paymentAmount} ${sub.paymentCurrency}\n\n`;
        });

        await ctx.reply(message);
    });

    // Admin toggle command
    bot.command('admin_toggle', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.reply('Sorry, this command is only available to administrators.');
        }

        const Group = require('../models/group');
        const chat = await ctx.getChat();

        if (chat.type === 'private') {
            return ctx.reply('This command can only be used in groups.');
        }

        let group = await Group.findOne({ groupId: chat.id });
        if (!group) {
            group = new Group({ groupId: chat.id });
        }

        // Check if the group is registered
        if (!group.isRegistered && !group.subscriptionRequired) {
            return ctx.reply('This group is not registered. Please register the group before enabling subscriptions.');
        }

        group.subscriptionRequired = !group.subscriptionRequired;
        await group.save();

        await ctx.reply(`Subscription requirement has been ${group.subscriptionRequired ? 'enabled' : 'disabled'} for this group.`);
    });

    // Admin welcome command
    bot.command('admin_welcome', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.reply('Sorry, this command is only available to administrators.');
        }

        const message = ctx.message.text.split('/admin_welcome ')[1];
        if (!message) {
            return ctx.reply('Please provide a welcome message. Example:\n/admin_welcome Welcome to our group!');
        }

        const Group = require('../models/group');
        const chat = await ctx.getChat();

        if (chat.type === 'private') {
            return ctx.reply('This command can only be used in groups.');
        }

        let group = await Group.findOne({ groupId: chat.id });
        if (!group) {
            group = new Group({ groupId: chat.id });
        }

        group.welcomeMessage = message;
        await group.save();

        await ctx.reply('Welcome message has been updated.');
    });
};

module.exports = { register };
