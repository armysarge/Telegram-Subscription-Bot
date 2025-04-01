const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram-subscription-bot';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// User Schema
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: String,
    isSubscribed: { type: Boolean, default: false },
    subscriptionExpiresAt: Date,
    joinedGroups: [{ groupId: Number, groupTitle: String }]
});

// Payment Schema
const paymentSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    paymentId: { type: String, required: true, unique: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

// Notification Log Schema
const notificationLogSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    groupId: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Create models
const User = mongoose.model('User', userSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

// Create indexes for better performance
async function createIndexes() {
    try {
        console.log('Creating indexes...');
        await User.collection.createIndex({ userId: 1 }, { unique: true });
        await Payment.collection.createIndex({ userId: 1 });
        await Payment.collection.createIndex({ paymentId: 1 }, { unique: true });
        await NotificationLog.collection.createIndex({ userId: 1, groupId: 1 });
        await NotificationLog.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // Auto-delete after 24 hours
        console.log('Indexes created successfully');
    } catch (error) {
        console.error('Error creating indexes:', error);
    }
}

// Initialize database
async function initializeDatabase() {
    try {
        await createIndexes();
        console.log('Database setup completed successfully');

        // Exit the process when done
        mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Database setup failed:', error);
        process.exit(1);
    }
}

// Run initialization
initializeDatabase();