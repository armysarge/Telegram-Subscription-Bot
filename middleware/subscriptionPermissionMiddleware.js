const User = require('../models/user');
const Group = require('../models/group');

// Middleware to check subscription permissions for messages
module.exports = async (ctx, next) => {
    // Skip if not in a group
    if (!ctx.chat?.type || !['group', 'supergroup'].includes(ctx.chat.type)) {
        return next();
    }

    // Get group ID and user ID
    const groupId = ctx.chat.id;
    const userId = ctx.from?.id;

    // If no user ID (e.g., service messages), skip
    if (!userId) {
        return next();
    }

    try {
        // Get group settings
        const group = await Group.findOne({ groupId });

        // If group not found or not registered or subscription not required, let messages through
        if (!group || !group.isRegistered || !group.subscriptionRequired) {
            return next();
        }        // Check if user is admin
        let isAdmin = false;
        try {
            const admins = await ctx.telegram.getChatAdministrators(groupId);
            isAdmin = admins.some(admin => admin.user.id === userId);
        } catch (err) {
            console.error('Error checking admin status:', err);
        }

        // Admins bypass subscription checks - they're automatically considered subscribed
        if (isAdmin) {
            return next();
        }

        // Get user's subscription status for this group
        const user = await User.findOne({ userId });
        let isSubscribed = false;

        if (user) {
            // Find any active subscription for this group
            const subscription = user.groupSubscriptions?.find(
                s => s.groupId === groupId && s.isSubscribed && s.subscriptionExpiresAt > new Date()
            );
            isSubscribed = !!subscription;

            // If user is an admin but doesn't have an active subscription yet, add one automatically
            if (isAdmin && !isSubscribed) {
                console.log(`Admin user ${userId} automatically subscribed to group ${groupId}`);

                // Calculate subscription end date (1 year from now for admins)
                const adminSubEndDate = new Date();
                adminSubEndDate.setFullYear(adminSubEndDate.getFullYear() + 1);

                // Add admin subscription
                await User.findOneAndUpdate(
                    { userId },
                    {
                        $push: {
                            groupSubscriptions: {
                                groupId: groupId,
                                groupTitle: ctx.chat.title,
                                isSubscribed: true,
                                subscriptionStartDate: new Date(),
                                subscriptionExpiresAt: adminSubEndDate,
                                paymentAmount: 0,
                                paymentCurrency: group.subscriptionCurrency || 'ZAR',
                                isAdminSubscription: true
                            }
                        }
                    }
                );

                // Consider them subscribed now
                isSubscribed = true;
            }
        }        // Handle restrictions for non-subscribers
        if (!isSubscribed) {
            // Check if we're in the grace period after monetization
            let inGracePeriod = false;
            if (group.monetizationDate) {
                const now = new Date();
                const gracePeriodEndTime = new Date(group.monetizationDate);
                gracePeriodEndTime.setHours(gracePeriodEndTime.getHours() + (group.existingUserGracePeriod || 24));

                if (now < gracePeriodEndTime) {
                    // User is within grace period
                    inGracePeriod = true;

                    // Check if the user was in the group before monetization
                    // We consider users with a record in joinedGroups to be existing users
                    const wasInGroupBeforeMonetization = user?.joinedGroups?.some(g => g.groupId === groupId);

                    if (wasInGroupBeforeMonetization) {
                        // Let existing users through during grace period
                        return next();
                    }
                }
            }

            // If the group requires subscription to view messages, kick non-subscribers immediately
            // This ensures they can't see any messages (old or new) until they subscribe
            if (group.restrictNonSubsViewing) {
                try {
                    // Check if the bot has kick permissions
                    const botMember = await ctx.telegram.getChatMember(groupId, ctx.botInfo.id);
                    const canKick = botMember &&
                                   (botMember.status === 'creator' ||
                                    botMember.status === 'administrator' &&
                                    botMember.can_restrict_members);

                    if (canKick) {
                        // First, send a notification to the user about why they're being kicked
                        try {
                            // Try to direct message the user first
                            await ctx.telegram.sendMessage(
                                userId,
                                `You've been removed from "${group.groupTitle}" because this group requires a subscription to view messages.\n\n` +
                                `To join the group, please subscribe first using the /subscribe command, and then join the group again.`,
                                { parse_mode: 'Markdown' }
                            );
                        } catch (dmError) {
                            // If direct message fails, we'll notify them in the group briefly before kicking
                            if (dmError.description && dmError.description.includes("bot can't initiate conversation with a user")) {
                                // Get the username to mention them in the group
                                const username = ctx.from.username
                                    ? `@${ctx.from.username}`
                                    : ctx.from.first_name || 'User';

                                // Send a notification in the group that will be visible briefly before they're kicked
                                await ctx.reply(
                                    `${username}: You need a subscription to view this group.\n` +
                                    `Click @${ctx.botInfo.username}, start a chat, and use /subscribe first.`,
                                    { parse_mode: 'HTML' }
                                );
                            }
                        }

                        // Now kick the user
                        await ctx.telegram.kickChatMember(groupId, userId);
                        // Immediately unban so they can join again after subscribing
                        await ctx.telegram.unbanChatMember(groupId, userId);

                        console.log(`Kicked non-subscriber ${userId} from group ${groupId} (can't view without subscription)`);
                        return; // Stop processing after kicking
                    } else {
                        console.warn(`Bot can't kick non-subscribers from group ${groupId}. Missing permissions.`);
                    }
                } catch (kickError) {
                    console.error('Error kicking non-subscriber from group:', kickError);
                }
            }
            // Restrict sending messages - only if the restriction is enabled
            if (group.restrictNonSubsSending && ctx.message) {
                // Delete the message and notify the user
                try {
                    // Check if the bot has delete permissions
                    const botMember = await ctx.telegram.getChatMember(groupId, ctx.botInfo.id);
                    const canDelete = botMember &&
                                     (botMember.status === 'creator' ||
                                      botMember.status === 'administrator' &&
                                      botMember.can_delete_messages);

                    if (canDelete) {
                        await ctx.deleteMessage();
                    }

                    // Try to send a notification to the user, but handle the case where the user hasn't started the bot
                    try {
                        await ctx.telegram.sendMessage(
                            userId,
                            `Your message in "${group.groupTitle}" ${canDelete ? 'was removed' : 'is not allowed'} because only subscribers can send messages in this group.\n\nUse /subscribe to get access.`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (notifyError) {
                        // If we can't message the user directly (they haven't started the bot),
                        // send a message in the group instead
                        if (notifyError.description && notifyError.description.includes("bot can't initiate conversation with a user")) {
                            console.log(`User ${userId} hasn't started the bot. Sending notification in group instead.`);

                            // Get the username to mention them in the group
                            const username = ctx.from.username
                                ? `@${ctx.from.username}`
                                : ctx.from.first_name || 'User';
                            try {
                                // Send a temporary message in the group that will be deleted after a few seconds
                                const notificationMsg = await ctx.reply(
                                    `${username}: Only subscribers can send messages in this group.\n` +
                                    `Please start a private chat with me by clicking @${ctx.botInfo.username} and pressing START, ` +
                                    `then use /subscribe to get access.`,
                                    {
                                        parse_mode: 'HTML', // Changed to HTML which is more reliable
                                        disable_notification: true // Make it a silent notification to be less intrusive
                                    }
                                );

                                // Set a timeout to delete this notification message after 15 seconds
                                setTimeout(async () => {
                                    try {
                                        await ctx.telegram.deleteMessage(groupId, notificationMsg.message_id);
                                    } catch (err) {
                                        console.log(`Couldn't delete temporary notification message: ${err.message}`);
                                    }
                                }, 15000);
                            } catch (groupNotifyError) {
                                console.error('Failed to send group notification:', groupNotifyError);
                            }
                        } else {
                            console.error('Error sending notification to user:', notifyError);
                        }
                    }

                    if (!canDelete) {
                        console.warn(`Bot doesn't have permission to delete messages in group ${groupId}. Make sure the bot is an admin with 'Delete Messages' permission.`);
                    }
                } catch (err) {
                    console.error('Error deleting non-subscriber message:', err);
                }
                return; // Stop processing
            }

            // Restrict viewing messages - only if the restriction is enabled
            if (group.restrictNonSubsViewing && ctx.message?.new_chat_members) {
                const newMembers = ctx.message.new_chat_members;

                // Check if the joining user is a non-subscriber
                for (const member of newMembers) {
                    if (member.id === userId && !member.is_bot) {
                        // User is joining and is not a subscriber
                        try {
                            await ctx.telegram.kickChatMember(groupId, userId);
                            await ctx.telegram.unbanChatMember(groupId, userId); // Unban so they can join again
                            await ctx.telegram.sendMessage(
                                userId,
                                `You were removed from "${group.groupTitle}" because this group is only visible to subscribers.\n\nUse /subscribe to get access and then join the group again.`,
                                { parse_mode: 'Markdown' }
                            );
                        } catch (err) {
                            console.error('Error removing non-subscriber from group:', err);
                        }
                        return; // Stop processing
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error in subscription permission middleware:', err);
    }

    return next();
};