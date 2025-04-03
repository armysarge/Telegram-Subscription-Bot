# Telegram Subscription Bot

A Telegram bot that handles payments and subscription management for groups. This bot allows group admins to monetize their content by limiting visibility of messages to paid subscribers only.

## Features

- Payment processing through modular payment provider system
- PayFast integration with support for easily adding additional payment providers
- One-time and recurring subscription options
- Subscription management for groups
- Automatic message filtering for non-subscribers
- Subscription status tracking and expiration management
- Notification system for users when their messages are hidden
- Admin dashboard with subscription statistics
- Customizable subscription pricing and plans
- Customizable welcome messages
- Extensible architecture for adding new payment methods

## Prerequisites

- Node.js (v12 or higher)
- MongoDB
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- PayFast merchant account and API credentials (or other supported payment providers)

## Quick Installation

### Windows

Run the included installation script:
```
install.bat
```
This will check prerequisites, install MongoDB if needed, and set up the environment.

### Linux

Run the included Linux installation script:
```
chmod +x install.sh
./install.sh
```
The script will:
- Check for Node.js and MongoDB
- Offer to install MongoDB if not present
- Configure the database
- Set up the environment variables
- Optionally install PM2 for production use

## MongoDB Installation

### Windows Installation
1. Download the MongoDB Community Server from the [official website](https://www.mongodb.com/try/download/community)
2. Run the installer and follow the installation wizard
3. Select "Complete" installation
4. Choose "Install MongoDB as a Service" and keep the default settings
5. Complete the installation

### Linux Installation
#### Ubuntu/Debian
```
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### RHEL/CentOS/Fedora
```
echo "[mongodb-org-6.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/6.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-6.0.asc" | sudo tee /etc/yum.repos.d/mongodb-org-6.0.repo
sudo dnf install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### Arch Linux
```
sudo pacman -S mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

### Verify MongoDB Installation
#### Windows
Open Command Prompt and run:
```
mongod --version
```

#### Linux
```
mongod --version
systemctl status mongod
```

### Start MongoDB Service (if not started automatically)
#### Windows
```
net start MongoDB
```

#### Linux
```
sudo systemctl start mongod
```

### Configure MongoDB for the Bot
1. Open MongoDB Compass (installed with MongoDB) to manage your database visually
2. Connect to your local MongoDB instance (default: mongodb://localhost:27017)
3. Create a new database named `telegram-subscription-bot`

## Manual Setup Instructions

1. Clone this repository:
   ```
   git clone [repository URL]
   cd telegram-subscription-bot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   BOT_TOKEN=your_telegram_bot_token
   MONGODB_URI=mongodb://localhost:27017/telegram-subscription-bot

   # PayFast Settings
   PAYFAST_SANDBOX=true
   PAYFAST_RETURN_URL=https://t.me/your_bot_username
   PAYFAST_CANCEL_URL=https://t.me/your_bot_username
   PAYFAST_NOTIFY_URL=https://your-server.com/payfast-itn
   ```
   Note: Make sure to replace the placeholder PAYFAST_NOTIFY_URL with your actual server URL before going to production. You do NOT need to add the merchant details, as these will be configured per group during registration.

4. Set up your bot with BotFather:
   - Create a new bot with `/newbot`
   - Enable inline mode and group privacy mode based on your needs

5. Initialize the database:
   ```
   npm run setup-db
   ```

6. Start the bot:
   ```
   npm start
   ```

## Production Deployment

### With PM2 (Linux)
```
npm install -g pm2
pm2 start bot.js --name telegram-subscription-bot
pm2 startup
pm2 save
```

### Windows Service
Consider using [NSSM](https://nssm.cc/) to run the bot as a Windows service.

## Using MongoDB Atlas (Cloud Option)

If you prefer a cloud-based MongoDB solution:

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster (the free tier is sufficient for starting)
3. In the Security tab, create a database user with read/write permissions
4. In the Network Access tab, add your IP address to the whitelist
5. In the Clusters tab, click "Connect" and choose "Connect your application"
6. Copy the connection string and update it in your `.env` file:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/telegram-subscription-bot?retryWrites=true&w=majority
   ```

## Payment Provider System

The bot now uses a modular payment provider system that makes it easy to add support for additional payment methods:

### Supported Payment Providers
- **PayFast**: Enabled by default for South African payments

### Adding New Payment Providers

To add a new payment provider:

1. Create a new provider class in the `payment-providers` directory
2. Extend the base `PaymentProvider` class and implement all required methods
3. Add your new provider to the `index.js` exports
4. Register the provider in `bot.js`

Example of adding a new payment provider in `bot.js`:

```javascript
// Import the new provider
const { PaymentManager, PayFastProvider, NewProvider } = require('./payment-providers');

// Initialize payment providers
const paymentManager = new PaymentManager();

// Configure and register PayFast (default)
const payfastProvider = new PayFastProvider(payfastConfig);
paymentManager.registerProvider('payfast', payfastProvider, true);

// Configure and register a new provider
const newProviderConfig = {
    // Provider-specific configuration
};
const newProvider = new NewProvider(newProviderConfig);
paymentManager.registerProvider('new-provider', newProvider);
```

### Payment Provider Interface

All payment providers must implement these core methods:

- `generatePaymentUrl()`: Create a payment URL for one-time payments
- `generateSubscriptionUrl()`: Create a URL for subscription payments
- `validatePayment()`: Validate payment notifications from the provider
- `processPaymentData()`: Extract user and payment details from notifications
- `setupWebhook()`: Set up the webhook route for the payment provider

See the `PaymentProvider.js` file for the complete interface definition.

## Bot Commands

### User Commands
- `/start` - Introduction to the bot
- `/help` - Display help information
- `/subscribe` - Initiate the subscription process
- `/status` - Check current subscription status

### Admin Commands
- `/admin` - Access admin dashboard
- `/admin_toggle` - Toggle subscription requirement on/off
- `/admin_welcome [message]` - Set custom welcome message
- `/admin_stats` - View subscription statistics for your group
- `/admin_subscription` - Configure subscription settings
- `/admin_payment` - Configure payment options
- `/add_admin @username` - Add another admin to the bot's database

## Setting Up in a Group

1. Add the bot to your group as an administrator
2. Give it permission to delete messages
3. Use `/admin` or `/manage_this_group` to configure the bot settings
4. Inform your group members to subscribe using the `/subscribe` command

## Troubleshooting

### Common Issues

1. **Messages not being filtered**: Check that the bot has delete message permissions in groups.

2. **Payment not completing**: Verify your payment provider credentials and ensure the sandbox mode is set correctly.

3. **Database connection failures**: Check your MongoDB connection string and ensure the database is running.

4. **Adding new payment providers**: If you encounter issues when adding a new payment provider, check that you've properly extended the base PaymentProvider class and implemented all required methods.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT