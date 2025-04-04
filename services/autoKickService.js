const Group = require('../models/group');
const User = require('../models/user');

class AutoKickService {
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Initialize the auto-kick service
     * This should be called when the bot starts
     */
    initialize() {
        // Run the auto-kick check every hour
        setInterval(() => this.processAutoKicks(), 60 * 60 * 1000);
        console.log('🚀 Auto-kick service initialized');
    }

    /**
     * Process auto-kicks for all groups with the feature enabled
     */
    async processAutoKicks() {
        try {
            console.log('⚙️ Running auto-kick process...');

            // Find all groups with auto-kick enabled
            const groups = await Group.find({
                autoKickNonSubscribers: true,
                isRegistered: true,
                subscriptionRequired: true
            });

            console.log(`📊 Found ${groups.length} groups with auto-kick enabled`);

            // Process each group
            for (const group of groups) {
                await this.processGroupAutoKick(group);
            }

            console.log('✅ Auto-kick process completed');
        } catch (error) {
            console.error('❌ Error in auto-kick process:', error);
        }
    }

    /**
     * Process auto-kick for a specific group
     * @param {Object} group The group document
     */
    async processGroupAutoKick(group) {
        try {
            console.log(`🔍 Processing auto-kick for group: ${group.groupTitle} (${group.groupId})`);

            // Find all users in this group
            const groupMembers = await User.find({
                'joinedGroups.groupId': group.groupId
            });

            console.log(`👥 Found ${groupMembers.length} members in group`);

            // Check each member's subscription status
            for (const member of groupMembers) {
                const isSubscribed = this.isUserSubscribed(member, group.groupId);

                if (!isSubscribed) {
                    await this.kickMember(group.groupId, member.userId);
                }
            }
        } catch (error) {
            console.error(`❌ Error processing auto-kick for group ${group.groupId}:`, error);
        }
    }

    /**
     * Check if a user is subscribed to a group
     * @param {Object} user The user document
     * @param {number} groupId The group ID
     * @returns {boolean} Whether the user is subscribed
     */
    isUserSubscribed(user, groupId) {
        // Find the subscription for this group
        const subscription = user.groupSubscriptions?.find(sub =>
            sub.groupId === groupId &&
            sub.isSubscribed === true &&
            sub.subscriptionExpiresAt > new Date()
        );

        return !!subscription;
    }

    /**
     * Kick a member from a group
     * @param {number} groupId The group ID
     * @param {number} userId The user ID
     */
    async kickMember(groupId, userId) {
        try {
            console.log(`👢 Kicking user ${userId} from group ${groupId} due to missing subscription`);

            // Kick the user from the group
            await this.bot.telegram.kickChatMember(groupId, userId);

            // Immediately unban to allow them to rejoin if they subscribe
            await this.bot.telegram.unbanChatMember(groupId, userId);

            console.log(`✅ Successfully kicked user ${userId} from group ${groupId}`);

            // Update the user's joined groups in the database
            await User.updateOne(
                { userId },
                { $pull: { joinedGroups: { groupId } } }
            );
        } catch (error) {
            console.error(`❌ Error kicking user ${userId} from group ${groupId}:`, error);
        }
    }
}

module.exports = AutoKickService;
