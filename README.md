# Telegram Subscription Bot

A Telegram bot that handles payments and subscription management for groups and channels. This bot allows group and channel admins to monetize their content by limiting visibility of messages to paid subscribers only.

## Features

- Payment processing through PayFast integration
- One-time and recurring subscription options
- Subscription management for both groups and channels
- Automatic message filtering for non-subscribers
- Subscription status tracking and expiration management
- Notification system for users when their messages are hidden
- Admin dashboard with subscription statistics
- Customizable subscription pricing and plans
- Direct channel management with `/manage_this_channel` command
- Customizable welcome messages
- Support for multiple payment providers (through modular design)

## Prerequisites

- Node.js (v12 or higher)
- MongoDB
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- PayFast merchant account and API credentials

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
   PAYFAST_MERCHANT_ID=your_payfast_merchant_id
   PAYFAST_MERCHANT_KEY=your_payfast_merchant_key
   PAYFAST_PASSPHRASE=your_payfast_passphrase
   PAYFAST_SANDBOX=true
   PAYFAST_RETURN_URL=https://t.me/your_bot_username
   PAYFAST_CANCEL_URL=https://t.me/your_bot_username
   PAYFAST_NOTIFY_URL=https://your-server.com/payfast-itn
   ```

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
- `/admin_stats` - View subscription statistics for your group/channel
- `/admin_subscription` - Configure subscription settings
- `/admin_payment` - Configure payment options
- `/manage_this_channel` - Directly manage channel settings (in channels)
- `/manage_channel` - Manage your channels (in private chat with bot)
- `/add_admin @username` - Add another admin to the bot's database

## Setting Up in a Group

1. Add the bot to your group as an administrator
2. Give it permission to delete messages
3. Use `/admin` to configure the bot settings
4. Inform your group members to subscribe using the `/subscribe` command

## Setting Up in a Channel

1. Add the bot to your channel as an administrator
2. Use `/manage_this_channel` in the channel to access management options
3. Configure subscription settings, pricing, and welcome messages
4. When members type `/subscribe` in the channel, they'll be prompted to start a private chat with the bot to complete their subscription

## Channel Subscription Management

The new `/manage_this_channel` command provides an interactive way to manage channel subscriptions:

1. **Direct Channel Management**: Send the command in your channel, and the bot will provide a management panel
2. **Subscription Settings**: Toggle subscription requirements on/off, set pricing for one-time and recurring subscriptions
3. **Welcome Messages**: Create custom messages for new subscribers
4. **Statistics**: View detailed information about subscribers and conversion rates
5. **Admin Management**: Add other channel administrators to help manage subscriptions

When a user types `/subscribe` in your channel, the bot will now respond with instructions and a direct link to start the subscription process.

## PayFast Integration

This bot uses PayFast for payment processing. To set up PayFast:

1. Create a PayFast merchant account at [PayFast.co.za](https://www.payfast.co.za/)
2. Get your merchant ID, merchant key, and set a passphrase in your PayFast dashboard
3. Configure your return and cancel URLs to point to your bot
4. For testing, use the sandbox mode (`PAYFAST_SANDBOX=true`)
5. For production, set up a web server to handle IPNs (Instant Payment Notifications)

## Database Management

To backup your MongoDB database:
```
mongodump --db telegram-subscription-bot --out ./backup
```

To restore from backup:
```
mongorestore --db telegram-subscription-bot ./backup/telegram-subscription-bot
```

## Troubleshooting

### Common Issues

1. **Subscription commands not working in channels**: Make sure the bot has been added as an administrator to the channel.

2. **Messages not being filtered**: Check that the bot has delete message permissions in groups.

3. **Payment not completing**: Verify your PayFast API credentials and ensure the sandbox mode is set correctly.

4. **Database connection failures**: Check your MongoDB connection string and ensure the database is running.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT