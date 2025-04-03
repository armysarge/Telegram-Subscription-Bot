const mongoose = require('mongoose');

// Create notification log schema to prevent spam
const notificationLogSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    groupId: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
