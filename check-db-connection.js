const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Set strictQuery option to suppress deprecation warning
mongoose.set('strictQuery', false);

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram-subscription-bot';

console.log('Attempting to connect to MongoDB at:', MONGODB_URI);

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('✅ Successfully connected to MongoDB!');

    // Get connection status info
    const db = mongoose.connection;
    console.log('Database name:', db.name);
    console.log('Connection state:', db.readyState === 1 ? 'connected' : 'disconnected');

    // Check if collections exist
    db.db.listCollections().toArray()
        .then(collections => {
            console.log('\nExisting collections:');
            if (collections.length === 0) {
                console.log('No collections found. Run setup-database.js to initialize the database.');
            } else {
                collections.forEach(collection => console.log(`- ${collection.name}`));
            }

            // Close connection and exit
            mongoose.connection.close()
                .then(() => {
                    console.log('\nConnection closed successfully');
                    process.exit(0);
                });
        })
        .catch(err => {
            console.error('Error listing collections:', err);
            process.exit(1);
        });
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    console.log('\nPossible solutions:');
    console.log('1. Make sure MongoDB is installed and running');
    console.log('2. Check if the connection string in your .env file is correct');
    console.log('3. If using MongoDB Atlas, ensure your IP is whitelisted');
    console.log('4. Verify network connectivity to the MongoDB server');
    process.exit(1);
});