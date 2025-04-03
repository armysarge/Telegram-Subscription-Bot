const mongoose = require('mongoose');

// Create payment schema
const paymentSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    paymentId: { type: String, required: true, unique: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);
