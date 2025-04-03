const User = require('../models/user');
const Group = require('../models/group');
const NotificationLog = require('../models/notificationLog');

// Message handlers
const register = (bot) => {
    // Handle group messages
    bot.on('message', async (ctx) => {
        // Only process group messages
        if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;

        try {
            const Group = require('../models/group');
            const User = require('../models/user');

            // Get group info
            const group = await Group.findOne({ groupId: ctx.chat.id });
            if (!group?.subscriptionRequired) return; // Skip if subscription not required

            // Get user info
            const user = await User.findOne({ userId: ctx.from.id });
            if (!user || !user.isSubscribed) {
                // Delete non-subscriber message
                await ctx.deleteMessage();

                // Send subscription prompt if haven't recently
                const now = Date.now();
                if (!user?.lastSubscriptionPrompt || (now - user.lastSubscriptionPrompt) > 3600000) { // 1 hour
                    const keyboard = {
                        inline_keyboard: [[{
                            text: 'Subscribe',
                            url: `https://t.me/${ctx.me.username}?start=subscribe`
                        }]]
                    };

                    const message = await ctx.reply(
                        'This group requires an active subscription to participate. Please subscribe to continue.',
                        { reply_markup: keyboard }
                    );

                    // Delete prompt after 30 seconds
                    setTimeout(() => {
                        ctx.deleteMessage(message.message_id).catch(console.error);
                    }, 30000);

                    // Update last prompt time
                    await User.findOneAndUpdate(
                        { userId: ctx.from.id },
                        {
                            $set: { lastSubscriptionPrompt: now },
                            $setOnInsert: { userId: ctx.from.id }
                        },
                        { upsert: true }
                    );
                }
            }
        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    // Handle bot being added to a group
    bot.on('my_chat_member', async (ctx) => {
        // Only handle when bot is added to a group
        if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;

        // Check if this is a new addition (status changed to member or administrator)
        const { old_chat_member, new_chat_member } = ctx.update.my_chat_member;
        const wasInChat = old_chat_member.status !== 'left' && old_chat_member.status !== 'kicked';
        const isNowInChat = new_chat_member.status === 'member' || new_chat_member.status === 'administrator';

        // If bot was just added to the group
        if (!wasInChat && isNowInChat) {
            try {
                const groupId = ctx.chat.id;
                const groupTitle = ctx.chat.title;
                const addedByUserId = ctx.from.id;

                // Check if group already exists in database
                let group = await Group.findOne({ groupId });

                if (!group) {
                    // Create new group record with default settings
                    group = new Group({
                        groupId,
                        groupTitle,
                        adminUsers: [addedByUserId],
                        subscriptionRequired: false, // Initially disabled until registration
                        isRegistered: false,
                        trialActive: false
                    });
                    await group.save();

                    // Welcome message in the group
                    await ctx.telegram.sendMessage(
                        groupId,
                        `👋 Hello! I'm a subscription bot that can help manage paid access to this group.\n\n` +
                        `Before I can start working, the group needs to be registered. I've sent registration instructions to the person who added me.\n\n` +
                        `Once registered, group administrators can configure subscription requirements and payment methods.`
                    );

                    // Send personal message to the person who added the bot
                    const keyboard = {
                        inline_keyboard: [
                            [{ text: 'Register This Group', callback_data: `register_group:${groupId}` }]
                        ]
                    };

                    await ctx.telegram.sendMessage(
                        addedByUserId,
                        `👋 Thank you for adding me to *${groupTitle}*!\n\n` +
                        `*Group Details:*\n` +
                        `- Group ID: \`${groupId}\`\n` +
                        `- Title: ${groupTitle}\n\n` +
                        `This group is not yet registered for subscription services. As the group owner, you need to register to enable subscription features.\n\n` +
                        `Group registration includes:\n` +
                        `• 7-day free trial period\n` +
                        `• Ability to collect subscription payments from your users\n` +
                        `• Full control over subscription settings\n\n` +
                        `After the trial, a monthly fee will be charged to keep the subscription service active.`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: keyboard
                        }
                    );
                }
            } catch (err) {
                console.error('Error handling bot being added to group:', err);
            }
        }
    });

    // Handle new chat members
    bot.on('new_chat_members', async (ctx) => {
        if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;

        try {
            const Group = require('../models/group');
            const group = await Group.findOne({ groupId: ctx.chat.id });

            if (!group) return;

            // Send welcome message if configured
            if (group.welcomeMessage) {
                const message = await ctx.reply(group.welcomeMessage);

                // Delete welcome message after 1 minute
                setTimeout(() => {
                    ctx.deleteMessage(message.message_id).catch(console.error);
                }, 60000);
            }

            // Check subscription requirement
            if (group.subscriptionRequired) {
                const User = require('../models/user');
                const newMembers = ctx.message.new_chat_members;

                for (const member of newMembers) {
                    if (member.is_bot) continue;

                    const user = await User.findOne({ userId: member.id });
                    if (!user?.isSubscribed) {
                        const keyboard = {
                            inline_keyboard: [[{
                                text: 'Subscribe Now',
                                url: `https://t.me/${ctx.me.username}?start=subscribe`
                            }]]
                        };

                        const message = await ctx.reply(
                            `Welcome ${member.first_name}! This group requires an active subscription to participate. Please subscribe to continue.`,
                            { reply_markup: keyboard }
                        );

                        // Delete message after 1 minute
                        setTimeout(() => {
                            ctx.deleteMessage(message.message_id).catch(console.error);
                        }, 60000);
                    }
                }
            }
        } catch (err) {
            console.error('Error handling new members:', err);
        }
    });
}

module.exports = { register };
