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
        }

        // Check if user is admin
        let isAdmin = false;
        try {
            const admins = await ctx.telegram.getChatAdministrators(groupId);
            isAdmin = admins.some(admin => admin.user.id === userId);
        } catch (err) {
            console.error('Error checking admin status:', err);
        }

        // Admins bypass subscription checks
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
        }

        // Handle restrictions for non-subscribers
        if (!isSubscribed) {
            // Restrict sending messages - only if the restriction is enabled
            if (group.restrictNonSubsSending && ctx.message) {
                // Delete the message and notify the user
                try {
                    await ctx.deleteMessage();
                    await ctx.telegram.sendMessage(
                        userId,
                        `Your message in "${group.groupTitle}" was removed because only subscribers can send messages in this group.\n\nUse /subscribe to get access.`,
                        { parse_mode: 'Markdown' }
                    );
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