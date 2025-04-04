const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    groupId: { type: Number, required: true, unique: true },
    groupTitle: { type: String, required: true },
    isRegistered: { type: Boolean, default: false },
    registrationDate: { type: Date },
    subscriptionRequired: { type: Boolean, default: false },
    subscriptionPrice: { type: Number },
    subscriptionCurrency: { type: String, default: 'ZAR' },
    paymentMethod: { type: String },
    welcomeMessage: { type: String },
    restrictNonSubsSending: { type: Boolean, default: false },
    restrictNonSubsViewing: { type: Boolean, default: false },

    // Trial related fields for the group
    trialActive: { type: Boolean, default: false },
    trialStartDate: { type: Date },
    trialEndDate: { type: Date },

    // New user trial settings
    userTrialEnabled: { type: Boolean, default: false },
    userTrialDays: { type: Number, default: 7 },

    // Payment settings
    feeStatus: { type: String, enum: ['paid', 'pending', 'overdue'], default: 'pending' },
    nextFeePaymentDate: { type: Date },

    // Custom payment settings by method
    customPaymentSettings: {
        payfast: {
            merchantId: String,
            merchantKey: String,
            passPhrase: String
        }
        // Other payment methods can be added here
    },

    // Admin users
    adminUsers: [Number],

    // Meta
    addedDate: { type: Date, default: Date.now },
    addedBy: { type: Number },
    lastEditDate: { type: Date, default: Date.now },
    lastEditBy: { type: Number }
});

// Create indexes for faster queries
groupSchema.index({ groupId: 1 });
groupSchema.index({ adminUsers: 1 });
groupSchema.index({ isRegistered: 1, subscriptionRequired: 1, autoKickNonSubscribers: 1 });

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
