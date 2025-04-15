// This file adds a function to send notifications to existing group members when a group becomes monetized
// To be imported in the group_toggle handler in callbacks.js

/**
 * Sends notifications to existing users when a group becomes monetized
 * @param {Object} ctx - The Telegram context
 * @param {Number} groupId - The group ID
 * @param {Object} group - The group document
 */
async function notifyUsersAboutMonetization(ctx, groupId, group) {
    try {
        // Get all users who are in this group
        const User = require('../models/user');
        const users = await User.find({ 'joinedGroups.groupId': groupId });
        console.log(`Found ${users.length} users in group ${groupId} to notify about monetization`);

        // Send a message to the group about monetization
        await ctx.telegram.sendMessage(
            groupId,
            `⚠️ *Important Group Update*\n\n` +
            `This group now requires a subscription to participate.\n\n` +
            `🕒 Existing members will have 24 hours to subscribe before restrictions take effect.\n\n` +
            `💳 To subscribe, use the /subscribe command in a private chat with the bot.`,
            { parse_mode: 'Markdown' }
        );

        // Try to notify individual users through DM
        for (const user of users) {
            try {
                await ctx.telegram.sendMessage(
                    user.userId,
                    `⚠️ *Important: Group Subscription Required*\n\n` +
                    `The group "${group.groupTitle}" now requires a subscription to participate.\n\n` +
                    `As an existing member, you have 24 hours to subscribe before restrictions take effect.\n\n` +
                    `Use /subscribe to get your subscription set up.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (dmError) {
                // Silently fail if we can't DM the user
                console.log(`Could not send monetization DM to user ${user.userId} for group ${groupId}`);
            }
        }
    } catch (notifyError) {
        console.error('Error notifying users about monetization:', notifyError);
    }
}

module.exports = { notifyUsersAboutMonetization };
