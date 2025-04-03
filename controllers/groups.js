const User = require('../models/user');
const Group = require('../models/group');

// Group handlers
const register = (bot) => {
    // Handle manage_this_group command
    bot.command('manage_this_group', async (ctx) => {
        try {
            // Only works in groups
            if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
                return ctx.reply('This command can only be used in groups.');
            }

            const groupId = ctx.chat.id;
            const userId = ctx.from.id;

            // Check if user is an admin
            try {
                const chatMember = await ctx.telegram.getChatMember(groupId, userId);
                if (!['creator', 'administrator'].includes(chatMember.status)) {
                    return ctx.reply('Only group administrators can use this command.');
                }

                // Get or create group record
                let group = await Group.findOne({ groupId });
                if (!group) {
                    group = await new Group({
                        groupId,
                        groupTitle: ctx.chat.title,
                        subscriptionRequired: true,
                        adminUsers: [userId] // Add current admin
                    }).save();
                } else if (!group.adminUsers.includes(userId)) {
                    // Add this admin if not already in the list
                    group.adminUsers.push(userId);
                    await group.save();
                }

                // Send management options
                const message = `
Group Management for "${group.groupTitle}"

Current Settings:
- Subscription Required: ${group.subscriptionRequired ? 'Yes' : 'No'}
- Welcome Message: ${group.welcomeMessage ? 'Custom' : 'Default'}

Use these commands to manage your group:
- /admin_toggle - Toggle subscription requirement on/off
- /admin_welcome [message] - Set custom welcome message
- /admin_stats - View subscription statistics
- /admin_subscription - Configure subscription settings
                `;

                // Create inline keyboard for management options
                const keyboard = {
                    inline_keyboard: [
                        [
                            {
                                text: group.subscriptionRequired ? 'Disable Subscription' : 'Enable Subscription',
                                callback_data: `group:toggle:${groupId}`
                            }
                        ],
                        [
                            {
                                text: 'Set Welcome Message',
                                callback_data: `group:welcome:${groupId}`
                            }
                        ],
                        [
                            {
                                text: 'View Statistics',
                                callback_data: `group:stats:${groupId}`
                            }
                        ],
                        [
                            {
                                text: 'Subscription Settings',
                                callback_data: `group:subscription:${groupId}`
                            }
                        ]
                    ]
                };

                await ctx.reply(message, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });

                // Try to delete the command message to keep the group clean
                try {
                    await ctx.deleteMessage();
                } catch (err) {
                    console.log('Could not delete group command message:', err.message);
                }

            } catch (err) {
                console.error('Error checking admin status:', err);
                return ctx.reply('Failed to verify your admin status. Please make sure the bot is an admin of this group.');
            }
        } catch (err) {
            console.error('Error in manage_this_group command:', err);
            await ctx.reply('An error occurred while managing the group. Please try again later.');
        }
    });

    // Filter messages in groups
    bot.on('message', async (ctx) => {
        // Only process if it's a group message
        if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;

        const groupId = ctx.chat.id;
        const userId = ctx.from.id;

        // Get group settings
        const group = await Group.findOne({ groupId });

        // If no group record or subscription not required, allow all messages
        if (!group || !group.subscriptionRequired) return;

        // Check if user is subscribed
        const user = await User.findOne({ userId });

        // Allow messages from admins
        try {
            const chatMember = await ctx.telegram.getChatMember(groupId, userId);
            if (['creator', 'administrator'].includes(chatMember.status)) return;
        } catch (err) {
            console.error('Error checking member status:', err);
        }

        // If user is not subscribed, delete message and notify
        if (!user || !user.isSubscribed) {
            try {
                await ctx.deleteMessage();
                // Send notification to user about subscription requirement
                const warningMsg = await ctx.reply(
                    'Your message was removed because this group requires a subscription. Use /subscribe to get access.',
                    { reply_to_message_id: ctx.message.message_id }
                );
                // Delete the warning message after 10 seconds
                setTimeout(async () => {
                    try {
                        await ctx.telegram.deleteMessage(ctx.chat.id, warningMsg.message_id);
                    } catch (err) {
                        console.log('Could not delete warning message:', err.message);
                    }
                }, 10000);
            } catch (err) {
                console.error('Error handling non-subscribed message:', err);
            }
        }
    });
};

module.exports = { register };
