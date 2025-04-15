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

                    // Check if this group has subscription settings
                    const group = await Group.findOne({ groupId: chatId });

                    // Get the user's display name (username or first name)
                    const username = ctx.from.username
                        ? `@${ctx.from.username}`
                        : ctx.from.first_name || 'New member';

                    // Always send a welcome message in the group first
                    let welcomeMessage = `👋 ${username}, welcome to ${ctx.chat.title}!`;

                    // If trials are enabled and subscription is required, set up the trial
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

                        // Add trial information to the welcome message
                        welcomeMessage += `\n\nA ${group.userTrialDays}-day free trial is available for you.`;
                    }                    // Always add the instruction to start a private chat with the bot
                    welcomeMessage += `\n\n*Important:* Please start a private chat with me by clicking @${ctx.botInfo.username} and pressing START to ${group && group.userTrialEnabled ? 'unlock your trial and ' : ''}receive important notifications.`;

                    // Send the welcome message in the group
                    await ctx.reply(
                        welcomeMessage,
                        {
                            parse_mode: 'Markdown',
                            disable_notification: false // Make this notification visible
                        }
                    );

                    // If trial is enabled, also try to send a private message, but don't worry if it fails
                    if (group && group.userTrialEnabled && group.subscriptionRequired) {
                        try {
                            await ctx.telegram.sendMessage(
                                userId,
                                `🎉 *Welcome to ${ctx.chat.title.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}*\n\n` +
                                `You've been granted a ${group.userTrialDays}-day free trial subscription to this group.\n\n` +
                                `Your trial will expire on ${trialEndDate.toLocaleDateString()}.\n\n` +
                                `To continue accessing the group after your trial, you'll need to subscribe using the /subscribe command.`,
                                { parse_mode: 'MarkdownV2' }
                            );
                            console.log(`Successfully sent private trial message to user ${userId}`);
                        } catch (dmError) {
                            console.log(`Could not send private trial message to user ${userId}, but group welcome was sent.`);
                            // No need to handle this error further since we already sent a group message
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
