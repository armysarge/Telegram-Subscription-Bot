const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    lastName: String,
    isSubscribed: { type: Boolean, default: false },
    subscriptionExpiresAt: Date,

    // Track group-specific subscriptions
    groupSubscriptions: [{
        groupId: Number,
        groupTitle: String,
        isSubscribed: { type: Boolean, default: false },
        subscriptionExpiresAt: Date,
        subscriptionStartDate: Date,
        paymentAmount: Number,
        paymentCurrency: String
    }],

    joinedGroups: [{ groupId: Number, groupTitle: String }],
    lastSubscriptionPrompt: Date, // Track last time we prompted about subscription
    paymentHistory: [{
        amount: Number,
        currency: String,
        paymentId: String,
        status: String,
        timestamp: Date,
        provider: String,
        groupId: Number // Which group this payment is for
    }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
