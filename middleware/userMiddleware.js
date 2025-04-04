const User = require('../models/user');
const Group = require('../models/group');

// Middleware to track users and handle trial periods
module.exports = async (ctx, next) => {
    if (ctx.from) {
        try {
            const userId = ctx.from.id;
            const chatId = ctx.chat?.id;
            const chatType = ctx.chat?.type;

            // Basic user tracking
            const user = await User.findOneAndUpdate(
                { userId },
                {
                    userId,
                    username: ctx.from.username,
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name
                },
                { upsert: true, new: true }
            );

            // Track group membership if this is a group message
            if (chatId && (chatType === 'group' || chatType === 'supergroup')) {
                // Check if the user has already been tracked in this group
                const isInGroup = user.joinedGroups.some(g => g.groupId === chatId);

                if (!isInGroup) {
                    // This appears to be the first time we're seeing this user in this group
                    console.log(`User ${userId} first detected in group ${chatId}`);

                    // Add the group to the user's joined groups
                    await User.findOneAndUpdate(
                        { userId },
                        {
                            $push: {
                                joinedGroups: {
                                    groupId: chatId,
                                    groupTitle: ctx.chat.title
                                }
                            }
                        }
                    );

                    // Check if this group has user trials enabled
                    const group = await Group.findOne({ groupId: chatId });

                    if (group && group.userTrialEnabled && group.subscriptionRequired) {
                        console.log(`Applying ${group.userTrialDays}-day trial for user ${userId} in group ${chatId}`);

                        // Calculate trial end date
                        const trialEndDate = new Date();
                        trialEndDate.setDate(trialEndDate.getDate() + group.userTrialDays);

                        // Give the user a trial subscription for this group
                        await User.findOneAndUpdate(
                            { userId },
                            {
                                $push: {
                                    groupSubscriptions: {
                                        groupId: chatId,
                                        groupTitle: ctx.chat.title,
                                        isSubscribed: true,
                                        subscriptionStartDate: new Date(),
                                        subscriptionExpiresAt: trialEndDate,
                                        paymentAmount: 0,
                                        paymentCurrency: group.subscriptionCurrency || 'ZAR'
                                    }
                                }
                            }
                        );

                        // Notify the user about their trial (in private chat to avoid group spam)
                        try {
                            await ctx.telegram.sendMessage(
                                userId,
                                `🎉 *Welcome to ${ctx.chat.title}!*\\n\\n` +
                                `You've been granted a ${group.userTrialDays}-day free trial subscription to this group.\\n\\n` +
                                `Your trial will expire on ${trialEndDate.toLocaleDateString()}.\\n\\n` +
                                `To continue accessing the group after your trial, you'll need to subscribe using the /subscribe command.`,
                                { parse_mode: 'Markdown' }
                            );
                        } catch (dmError) {
                            console.error('Could not send trial notification to user:', dmError);
                            // Failed to DM the user, possibly because they haven't started the bot
                            // We could fall back to a group message, but that might be spammy
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error in user middleware:', err);
        }
    }
    return next();
};
