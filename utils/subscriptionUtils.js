const User = require('../models/user');

// Function to check expired subscriptions
async function checkExpiredSubscriptions(bot) {
    const now = new Date();

    try {
        // Find users with expired subscriptions
        const expiredUsers = await User.find({
            isSubscribed: true,
            subscriptionExpiresAt: { $lt: now }
        });

        console.log(`Found ${expiredUsers.length} expired subscriptions`);

        // Update subscription status for each expired user
        for (const user of expiredUsers) {
            await User.findOneAndUpdate(
                { userId: user.userId },
                { isSubscribed: false }
            );

            // Notify user about expired subscription
            try {
                await bot.telegram.sendMessage(
                    user.userId,
                    'Your subscription has expired. Use /subscribe to renew your subscription and continue accessing premium content.'
                );
            } catch (err) {
                console.error(`Error notifying user ${user.userId} about expired subscription:`, err);
            }
        }
    } catch (err) {
        console.error('Error checking expired subscriptions:', err);
    }
}

module.exports = {
    checkExpiredSubscriptions
};
