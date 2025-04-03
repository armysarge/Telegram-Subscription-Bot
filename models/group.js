const mongoose = require('mongoose');

// Create group schema for group-specific settings
const groupSchema = new mongoose.Schema({
    groupId: { type: Number, required: true, unique: true },
    groupTitle: String,
    adminUsers: [{ type: Number }], // User IDs who are admins for the group
    subscriptionRequired: { type: Boolean, default: true },
    welcomeMessage: String,
    createdAt: { type: Date, default: Date.now },

    // Group registration status
    isRegistered: { type: Boolean, default: false },
    registrationDate: Date,

    // Trial period fields
    trialActive: { type: Boolean, default: false },
    trialStartDate: Date,
    trialEndDate: Date,

    // Group subscription settings
    monthlyFee: { type: Number, default: 0 }, // Monthly fee paid to the bot owner
    feeStatus: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
    lastFeePaymentDate: Date,
    nextFeePaymentDate: Date,

    // Group payment settings for their users
    paymentMethod: { type: String, default: 'payfast' }, // Default payment method
    customPaymentSettings: {
        payfast: {
            merchantId: String,
            merchantKey: String,
            passPhrase: String
        },
        // Can be extended for other payment providers
    },

    // Subscription pricing for users
    subscriptionPrice: { type: Number, default: 0 },
    subscriptionCurrency: { type: String, default: 'ZAR' }
});

module.exports = mongoose.model('Group', groupSchema);
