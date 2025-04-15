const User = require('../models/user');
const Group = require('../models/group');
const { cleanupMessages, DEFAULT_DELETE_DELAY } = require('../utils/messageCleanup');

// User command handlers
const register = (bot, paymentManager) => {
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

    // Start command
    bot.command('start', async (ctx) => {
        // Check if there's a deep link parameter (e.g., subscribe_group_123456)
        const startParam = ctx.startPayload;
        const chat = await ctx.getChat();
        const isPrivate = chat.type === 'private';

        if (startParam && startParam.startsWith('subscribe_group_')) {
            // Extract group ID from the parameter
            const groupId = parseInt(startParam.replace('subscribe_group_', ''));
            if (groupId) {
                // Redirect to group-specific subscription flow
                return handleGroupSubscription(ctx, groupId);
            }
        }

        // Check if user is an admin directly rather than relying on ctx.state.isAdmin
        let isAdmin = false;
        try {
            if (!isPrivate) {
                const admins = await ctx.telegram.getChatAdministrators(chat.id);
                isAdmin = admins.some(admin => admin.user.id === ctx.from.id);
            }
        } catch (err) {
            console.error('Error checking admin status:', err);
        }

        let message = '🤖 *Welcome to the Subscription Bot!*\n\n'
            + 'MonitizeRobot bot helps manage subscriptions for groups.\n\n'
            + '*Available commands:*\n';

        if (!isAdmin || isPrivate) {
            message += '*User Commands:*\n'
            + '💳 /subscribe - Start subscription process\n'
            + '📊 /status - Check your subscription status\n';
        }

        message += '❓ /help - Show this help message\n';

        // Commands that only make sense in private chat
        if (isPrivate) {
            message += '🏢 /my\\_groups - Manage your groups as an admin\n';
        }

        // Admin commands - only show in groups or if specifically requested in private
        if (!isPrivate && isAdmin) {
            message += '\n*Admin Commands:*\n';
            message += '🔄 /admin\\_toggle - Toggle subscription requirement\n';
            message += '💬 /admin\\_welcome - Set welcome message\n';
            message += '📈 /admin\\_stats - View subscription statistics\n';
            message += '💰 /admin\\_subscription - Configure subscription settings\n';
            message += '💳 /admin\\_payment - Configure payment options\n';
            message += '⚙️ /manage - Access group management panel\n';
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // Help command
    bot.command('help', async (ctx) => {
        const chat = await ctx.getChat();
        const isPrivate = chat.type === 'private';

        // Check if user is an admin directly rather than relying on ctx.state.isAdmin
        let isAdmin = false;
        try {
            if (!isPrivate) {
                const admins = await ctx.telegram.getChatAdministrators(chat.id);
                isAdmin = admins.some(admin => admin.user.id === ctx.from.id);
            }
        } catch (err) {
            console.error('Error checking admin status:', err);
        }

        let message = '📚 *Available Commands*\n\n';

        if (!isAdmin || isPrivate) {
            message += '*User Commands:*\n';
            message += '💳 /subscribe - Start your subscription process\n';
            message += '📊 /status - Check your subscription status\n';
        }

        // Commands that only make sense in private chat
        if (isPrivate) {
            message += '🏢 /my\\_groups - Manage your groups as an admin\n';
        }

        // Admin commands - only show in groups where the user is an admin
        if (!isPrivate && isAdmin) {
            message += '\n*Admin Commands:*\n';
            message += '🔄 /admin\\_toggle - Toggle subscription requirement\n';
            message += '💬 /admin\\_welcome - Set welcome message\n';
            message += '📈 /admin\\_stats - View subscription statistics\n';
            message += '💰 /admin\\_subscription - Configure subscription settings\n';
            message += '💳 /admin\\_payment - Configure payment options\n';
            message += '⚙️ /manage - Access group management panel\n';
        }

        // Show a note about admin commands in private chat
        if (isPrivate) {
            message += '\n_To see admin commands, use /help in a group where you are an admin._';
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // Subscribe command
    bot.command('subscribe', async (ctx) => {
        const chat = await ctx.getChat();

        // Check if user is an admin - admins don't need to subscribe
        let isAdmin = false;
        try {
            if (chat.type !== 'private') {
                const admins = await ctx.telegram.getChatAdministrators(chat.id);
                isAdmin = admins.some(admin => admin.user.id === ctx.from.id);                if (isAdmin) {
                    const adminMsg = await ctx.reply('As an admin, you automatically have full access to this group. No subscription is needed.');
                    cleanupMessages(ctx, adminMsg);
                    return;
                }
            }
        } catch (err) {
            console.error('Error checking admin status:', err);
        }

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
                    text: `💳 ${group.groupTitle} (${group.subscriptionPrice} ${group.subscriptionCurrency})`,
                    callback_data: `subscribe_to_group:${group.groupId}`
                }]))
            };

            return ctx.reply(
                '🔔 *Available Subscriptions*\n\nSelect a group to subscribe to:',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        }

        // In groups, check if subscription is required
        const group = await Group.findOne({ groupId: chat.id });
        if (!group?.subscriptionRequired) {
            const notRequiredMsg = await ctx.reply('Subscriptions are not required in this group.');
            cleanupMessages(ctx, notRequiredMsg);
            return;
        }

        if (!group.isRegistered) {
            const notRegisteredMsg = await ctx.reply('This group has not been registered for subscription services yet.');
            cleanupMessages(ctx, notRegisteredMsg);
            return;
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

            const alreadySubMsg = await ctx.reply(
                `You are already subscribed to this group.\n` +
                `Your subscription is active until: ${groupSub.subscriptionExpiresAt.toLocaleDateString()}`
            );
            cleanupMessages(ctx, alreadySubMsg);
            return;
        }        // Direct them to private chat with deep link
        const keyboard = {
            inline_keyboard: [[{
                text: '💬 Subscribe in Private Chat',
                url: `https://t.me/${ctx.me.username}?start=subscribe_group_${chat.id}`
            }]]
        };
        const subscribeMsg = await ctx.reply('🔒 This group requires a subscription. Please click below to subscribe in a private chat:',
            { reply_markup: keyboard }
        );

        // Auto-delete the message after 30 seconds (longer than standard to give users time to click)
        cleanupMessages(ctx, subscribeMsg, 30000);
    });    // Status command
    bot.command('status', async (ctx) => {
        const user = await User.findOne({ userId: ctx.from.id });
        const chat = await ctx.getChat();
        const userId = ctx.from.id;

        // If in a group, send the status privately instead of in the group
        if (chat.type === 'group' || chat.type === 'supergroup') {
            try {
                // Check admin status
                let isAdmin = false;
                try {
                    const admins = await ctx.telegram.getChatAdministrators(chat.id);
                    isAdmin = admins.some(admin => admin.user.id === userId);
                } catch (err) {
                    console.error('Error checking admin status in status command:', err);
                }

                let statusMessage = '';

                // Prepare status message based on admin status and subscription
                if (isAdmin) {
                    statusMessage = `👑 *As a group admin of ${chat.title}, you have permanent access to this group*\n\n` +
                        'You do not need a subscription as long as you maintain admin status.';
                } else if (!user) {
                    statusMessage = `You have no subscription history for ${chat.title}.`;
                } else {
                    const groupSub = user.groupSubscriptions?.find(sub => sub.groupId === chat.id);

                    if (!groupSub || !groupSub.isSubscribed) {
                        statusMessage = `You are not currently subscribed to ${chat.title}.`;
                    } else {
                        statusMessage = `Your subscription to ${chat.title} is active until: ${groupSub.subscriptionExpiresAt.toLocaleDateString()}`;
                    }
                }                // Send the status as a private message
                await ctx.telegram.sendMessage(
                    userId,
                    statusMessage,
                    { parse_mode: 'Markdown' }
                );

                // Send a brief confirmation in the group that status was sent privately
                const replyMessage = await ctx.reply(`I've sent your subscription status in a private message.`);

                // Auto-delete both the command and reply message after 10 seconds
                cleanupMessages(ctx, replyMessage);
            } catch (err) {
                // If we can't send private message (user hasn't started the bot), suggest they start the bot
                if (err.description && err.description.includes("bot can't initiate conversation with a user")) {
                    const errorMsg = await ctx.reply(
                        `@${ctx.from.username || ctx.from.first_name}, I couldn't send you a private message. ` +
                        `Please start a private chat with me first by clicking @${ctx.botInfo.username} and pressing START.`
                    );
                    // Auto-delete this message too
                    cleanupMessages(ctx, errorMsg, 30000); // Keep error messages a bit longer (30 seconds)
                } else {
                    console.error('Error sending private status message:', err);
                    const errorMsg = await ctx.reply('An error occurred while checking your status. Please try again later.');
                    cleanupMessages(ctx, errorMsg);
                }
            }
            return;
        }

        // For private chat status checks
        if (!user) {
            return ctx.reply('You have no subscription history.');
        }

        // If in private chat, show all group subscriptions
        if (!user.groupSubscriptions || user.groupSubscriptions.length === 0) {
            return ctx.reply('📭 You are not currently subscribed to any groups.');
        }

        const activeSubscriptions = user.groupSubscriptions.filter(
            sub => sub.isSubscribed && sub.subscriptionExpiresAt > new Date()
        );

        if (activeSubscriptions.length === 0) {
            return ctx.reply('You have no active group subscriptions.');
        }

        let message = '📊 *Your Active Subscriptions*\n\n';
        activeSubscriptions.forEach(sub => {
            message += `• ${sub.groupTitle}\n`;
            message += `  ⏳ Expires: ${sub.subscriptionExpiresAt.toLocaleDateString()}\n`;
            message += `  💰 Amount: ${sub.paymentAmount} ${sub.paymentCurrency}\n\n`;
        });

        await ctx.reply(message, { parse_mode: 'Markdown' });
    });
};

module.exports = { register };