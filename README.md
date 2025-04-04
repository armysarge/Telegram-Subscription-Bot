# 🤖 MonitizeRobot - Telegram Subscription Bot

MonitizeRobot is a powerful, feature-rich Telegram bot designed to help group administrators manage subscription-based access to their groups.

## ✨ Features

- 💰 **Monetize Your Telegram Groups**: Turn your communities into revenue streams
- 🔒 **Subscription Management**: Control access to your groups through paid subscriptions
- 💳 **Payment Integration**: Built-in support for PayFast with expandable payment options
- 📊 **Detailed Analytics**: Track subscribers, revenue, and group activity
- ⚙️ **Customizable Settings**: Configure subscription prices, welcome messages, and more
- 🔐 **Advanced Permission Control**: Restrict non-subscribers from sending or viewing messages
- 🆓 **User Trial Periods**: Automatically grant trial access to new group members
- 🧩 **Modular Design**: Easily extendable for additional features

## 🚀 Getting Started

### Prerequisites

- Node.js v14+
- MongoDB database
- Telegram Bot Token (from @BotFather)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/telegram-subscription-bot.git
   cd telegram-subscription-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the root directory:
   ```
   BOT_TOKEN=your_telegram_bot_token
   MONGODB_URI=your_mongodb_connection_string
   PAYFAST_MERCHANT_ID=your_payfast_merchant_id
   PAYFAST_MERCHANT_KEY=your_payfast_merchant_key
   PAYFAST_PASSPHRASE=your_payfast_passphrase (optional)
   PAYFAST_NOTIFY_URL=your_webhook_url
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

## 📝 Usage

### Bot Commands

**User Commands:**
- 💳 `/subscribe` - Start subscription process
- 📊 `/status` - Check your subscription status
- ❓ `/help` - Display help information

**Admin Commands:**
- 🔄 `/admin_toggle` - Toggle subscription requirement
- 💬 `/admin_welcome` - Set welcome message
- 📈 `/admin_stats` - View subscription statistics
- 💰 `/admin_subscription` - Configure subscription settings
- 💳 `/admin_payment` - Configure payment options
- ⚙️ `/manage` - Access group management panel
- 🏢 `/my_groups` - Manage your groups (in private chat)

### Group Management

Group administrators can configure several aspects of their groups:
- Subscription prices and currency
- Payment methods
- Welcome messages
- Subscription requirement toggle
- Message permissions for non-subscribers:
  - Restrict non-subscribers from sending messages
  - Restrict non-subscribers from viewing messages (auto-kick on join)

This helps maintain a paid community with minimal administrative overhead.

## 🔐 Permission Controls

### Restricting Non-Subscribers from Sending Messages

When enabled, this feature:
1. Monitors all messages sent to the group
2. Automatically deletes messages from users without an active subscription
3. Notifies the user privately that they need to subscribe to send messages
4. Respects existing Telegram group permissions (doesn't override group-level permissions)

### Restricting Non-Subscribers from Viewing Messages

When enabled, this feature:
1. Automatically removes non-subscribers when they attempt to join the group
2. Notifies removed users that they need to subscribe to view the group
3. Users can rejoin after subscribing

Note: Group admins are exempt from these restrictions.

## 🆓 User Trial Periods

The User Trial feature allows group administrators to automatically grant new members a free trial subscription when they join:

### How It Works

1. **Enable User Trials**: Admins can enable this feature from the group configuration menu
2. **Set Trial Duration**: Choose how many days (1-30) new users get access for free
3. **Automatic Application**: When a new user joins a group with trials enabled, they automatically receive a trial subscription
4. **User Notification**: Users receive a private message from the bot informing them of their trial period and expiration date
5. **Seamless Conversion**: When the trial expires, users are prompted to subscribe to maintain access

### Configuration

To configure user trials:
1. Use the `/manage` command in your group or access group settings from `/my_groups` in private chat
2. Navigate to "Group Configuration Options"
3. Select "Enable User Trial Period" or "Update User Trial Period"
4. Toggle the setting on/off and set your preferred trial duration

This feature helps increase conversion rates by letting users experience the value of your group before committing to a paid subscription.

## 💾 Database Structure

The bot uses MongoDB to store:
- User information and subscriptions
- Group configurations and settings
- Payment history and analytics data

Key collections:
- `users` - Stores user data and subscription information
- `groups` - Contains group settings, including auto-kick configuration
- `payments` - Records payment transactions