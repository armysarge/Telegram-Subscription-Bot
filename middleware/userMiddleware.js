const User = require('../models/user');

// Middleware to track users
module.exports = async (ctx, next) => {
    if (ctx.from) {
        try {
            await User.findOneAndUpdate(
                { userId: ctx.from.id },
                {
                    userId: ctx.from.id,
                    username: ctx.from.username
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error('Error updating user:', err);
        }
    }
    return next();
};
