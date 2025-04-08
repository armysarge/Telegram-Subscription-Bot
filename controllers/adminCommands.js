const User = require('../models/user');
const Group = require('../models/group');

// Helper function to verify admin status
async function verifyAdmin(ctx, chatId) {
    try {
        const userId = ctx.from.id;
        const admins = await ctx.telegram.getChatAdministrators(chatId);
        return admins.some(admin => admin.user.id === userId);
    } catch (err) {
        console.error('Error verifying group admin:', err);
        return false;
    }
}

// Admin command handlers
const register = (bot, paymentManager) => {
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
                    text: `${group.isRegistered ? '✅' : '⭕'} ${group.groupTitle}`,
                    callback_data: `manage_group:${group.groupId}`
                }]))
            };

            await ctx.reply(
                '🏢 *Your Groups*\n\n' +
                'Select a group to manage:\n' +
                '(✅ = registered, ⭕ = not registered)',
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

    // Admin toggle command
    bot.command('admin_toggle', async (ctx) => {
        try {
            const chat = await ctx.getChat();

            if (chat.type === 'private') {
                return ctx.reply('This command can only be used in groups.');
            }

            // Directly check admin status instead of using ctx.state.isAdmin
            const userId = ctx.from.id;
            const chatId = chat.id;

            let isAdmin = false;
            try {
                const admins = await ctx.telegram.getChatAdministrators(chatId);
                isAdmin = admins.some(admin => admin.user.id === userId);
            } catch (err) {
                console.error('Error checking admin status:', err);
                return ctx.reply('An error occurred while checking your administrator status.');
            }

            if (!isAdmin) {
                return ctx.reply('Sorry, this command is only available to administrators.');
            }

            let group = await Group.findOne({ groupId: chatId });
            if (!group) {
                group = new Group({
                    groupId: chatId,
                    groupTitle: chat.title,
                    adminUsers: [userId]  // Add the admin to the group's admin list
                });
            } else if (!group.adminUsers.includes(userId)) {
                // Make sure the admin is in the group's admin list
                group.adminUsers.push(userId);
            }

            // Check if the group is registered
            if (!group.isRegistered && !group.subscriptionRequired) {
                return ctx.reply('This group is not registered. Please register the group before enabling subscriptions.');
            }

            group.subscriptionRequired = !group.subscriptionRequired;
            await group.save();

            await ctx.reply(`Subscription requirement has been ${group.subscriptionRequired ? 'enabled' : 'disabled'} for this group.`);
        } catch (err) {
            console.error('Error in admin_toggle command:', err);
            ctx.reply('An error occurred while processing the command.');
        }
    });

    // Admin welcome command
    bot.command('admin_welcome', async (ctx) => {
        try {
            const chat = await ctx.getChat();

            if (chat.type === 'private') {
                return ctx.reply('This command can only be used in groups.');
            }

            // Directly check admin status
            const userId = ctx.from.id;
            const chatId = chat.id;

            let isAdmin = false;
            try {
                const admins = await ctx.telegram.getChatAdministrators(chatId);
                isAdmin = admins.some(admin => admin.user.id === userId);
            } catch (err) {
                console.error('Error checking admin status:', err);
                return ctx.reply('An error occurred while checking your administrator status.');
            }

            if (!isAdmin) {
                return ctx.reply('Sorry, this command is only available to administrators.');
            }

            const messageText = ctx.message.text.split('/admin_welcome ')[1];
            if (!messageText) {
                return ctx.reply('Please provide a welcome message. Example:\n/admin_welcome Welcome to our group!');
            }

            let group = await Group.findOne({ groupId: chatId });
            if (!group) {
                group = new Group({
                    groupId: chatId,
                    groupTitle: chat.title,
                    adminUsers: [userId]
                });
            } else if (!group.adminUsers.includes(userId)) {
                group.adminUsers.push(userId);
            }

            group.welcomeMessage = messageText;
            await group.save();

            await ctx.reply('Welcome message has been updated.');
        } catch (err) {
            console.error('Error in admin_welcome command:', err);
            ctx.reply('An error occurred while processing the command.');
        }
    });

    // Admin stats command
    bot.command('admin_stats', async (ctx) => {
        console.log('Admin stats command received');
        try {
            // Verify admin status
            const chatId = ctx.chat.id;
            const isAdmin = await verifyAdmin(ctx, chatId);

            if (!isAdmin) {
                return ctx.reply('Not authorized. You must be an admin to use this command.');
            }

            // Get the group
            const group = await Group.findOne({ groupId: chatId });
            if (!group) {
                return ctx.reply('Group not found in database');
            }

            // Get statistics - reusing the same logic as in the action handler
            const subscriberCount = await User.countDocuments({
                'groupSubscriptions': {
                    $elemMatch: {
                        groupId: chatId,
                        isSubscribed: true,
                        subscriptionExpiresAt: { $gt: new Date() }
                    }
                }
            });

            const totalMembers = await User.countDocuments({
                'joinedGroups.groupId': chatId
            });

            await ctx.reply(
                `📊 *Group Statistics*\n\n` +
                `*Subscription Status:* ${group.subscriptionRequired ? 'Required ✅' : 'Not Required ❌'}\n` +
                `*Active Subscribers:* ${subscriberCount}\n` +
                `*Total Members:* ${totalMembers}\n` +
                `*Subscription Rate:* ${totalMembers > 0 ? Math.round((subscriberCount / totalMembers) * 100) : 0}%\n\n` +
                `_Note: Statistics only include users who have interacted with the bot._`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('Error in admin_stats command:', err);
            ctx.reply('An error occurred while retrieving statistics');
        }
    });

    // Admin subscription command
    bot.command('admin_subscription', async (ctx) => {
        console.log('Admin subscription command received');
        try {
            // Verify admin status
            const chatId = ctx.chat.id;
            const isAdmin = await verifyAdmin(ctx, chatId);

            if (!isAdmin) {
                return ctx.reply('Not authorized. You must be an admin to use this command.');
            }

            const group = await Group.findOne({ groupId: chatId });
            if (!group) {
                return ctx.reply('Group not found in database');
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: '💰 Set Price', callback_data: `set_group_price:${chatId}` }],
                    [{ text: `${group.subscriptionRequired ? '🔴 Disable' : '🟢 Enable'} Subscription`, callback_data: `group:toggle:${chatId}` }]
                ]
            };

            await ctx.reply(
                `⚙️ *Subscription Settings*\n\n` +
                `Current Subs Price: ${group.subscriptionPrice || 'Not set'} ${group.subscriptionCurrency || 'ZAR'}\n` +
                `Subscription Required: ${group.subscriptionRequired ? '✅ Yes' : '❌ No'}\n\n` +
                `Select an option to configure:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (err) {
            console.error('Error in admin_subscription command:', err);
            ctx.reply('An error occurred while managing subscription settings');
        }
    });

    // Admin payment command
    bot.command("admin_payment", (async e => {
        console.log("Admin payment command received");
        try {
            const r = e.chat.id;
            if (!await verifyAdmin(e, r)) return e.reply("Not authorized. You must be an admin to use this command.");

            const t = await Group.findOne({groupId: r});
            if (!t) return e.reply("Group not found in database");

            // Get available payment gateways from config file
            const paymentGatewaysConfig = require('../config/paymentGateways');

            // Create buttons for each available payment gateway
            const gatewayButtons = paymentGatewaysConfig.availableGateways
                .filter(gateway => gateway.enabled)
                .map(gateway => [{
                    text: `💳 Configure ${gateway.name}`,
                    callback_data: `payment_method:${r}:${gateway.id}`
                }]);

            const n = {
                inline_keyboard: gatewayButtons
            };

            await e.reply(`💵 *Payment Settings*\n\nCurrent Method: ${t.paymentMethod || "Not set"}\n\nSelect a payment method to configure:`, {
                parse_mode: "Markdown",
                reply_markup: n
            });
        } catch (r) {
            console.error("Error in admin_payment command:", r), e.reply("An error occurred while managing payment settings")
        }
    }));

    // Group management command
    bot.command('manage', async (ctx) => {
        try {
            // Check if command is used in a group
            if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
                return ctx.reply('This command can only be used in groups.');
            }

            // Check if user has admin rights in the group
            const userId = ctx.from.id;
            const chatId = ctx.chat.id;

            const chatMember = await ctx.telegram.getChatMember(chatId, userId);

            // Check if user is admin or creator
            if (!['creator', 'administrator'].includes(chatMember.status)) {
                return ctx.reply('Only group administrators can use this command.');
            }

            return ctx.reply('⚙️ *Group Management Panel*\n\nSelect an option to configure this group:', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💰 Configure Subscription Settings', callback_data: `configure_group:${chatId}` }],
                        [{ text: '📋 View Current Settings', callback_data: `view_group_settings:${chatId}` }],
                        [{ text: '💬 Set Welcome Message', callback_data: `group:welcome:${chatId}` }],
                        [{ text: '💳 Configure Payment Methods', callback_data: `group_payment:${chatId}` }]
                    ]
                }
            });
        } catch (error) {
            console.error('Error in manage command:', error);
            return ctx.reply('An error occurred while trying to manage this group.');
        }
    });

    // Debug command
    bot.command('debugtext', (ctx) => {
        console.log('Debug command received');
        ctx.session = ctx.session || {};
        ctx.session.awaitingPriceFor = 'DEBUG';
        return ctx.reply('Debug mode activated. Please send any text message to test the handler.');
    });
};

module.exports = { register, verifyAdmin };