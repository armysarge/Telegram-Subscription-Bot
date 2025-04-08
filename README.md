[![madewithlove](https://img.shields.io/badge/made_with-%E2%9D%A4-red?style=for-the-badge&labelColor=orange)](https://github.com/armysarge/Telegram-Subscription-Bot)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-brightgreen?logo=buymeacoffee)](https://www.buymeacoffee.com/armysarge)

[![NOdeJS](https://img.shields.io/badge/Node.js-v18.16.0-green.svg)](https://nodejs.org/en/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v8.0.0-green.svg)](https://www.mongodb.com/)
[![Telegram Bot API](https://img.shields.io/badge/Telegram%20Bot%20API-v8.3-blue.svg)](https://core.telegram.org/bots/api)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/armysarge/Telegram-Subscription-Bot)](https://github.com/armysarge/Telegram-Subscription-Bot/issues)

<div align="center">
  <img src="logo.webp" alt="Logo" width="400px">
</div>

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

   # Payment Gateway Configuration
   BASE_URL=https://your-server-domain.com
   PORT=3000

   # PayFast Configuration (if using PayFast)
   PAYFAST_MERCHANT_ID=your_merchant_id
   PAYFAST_MERCHANT_KEY=your_merchant_key
   PAYFAST_PASSPHRASE=your_passphrase
   PAYFAST_SANDBOX=true # Use false for production
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

## 📊 Analytics

The bot provides detailed analytics on:
- Total subscribers
- Revenue generated
- Active subscriptions
- Payment history
- Group activity metrics
- User engagement statistics

## 💲 Payment Gateway System

The bot features a robust plugin-based payment gateway architecture with a centralized webhook system that makes it easy to add new payment processors:

### Supported Payment Gateways
- **PayFast**: Complete integration with South African payment processor

### Centralized Webhook System

The bot now includes a unified webhook handling system that:

- ✅ **Single Entry Point**: Provides a central endpoint for all payment gateway callbacks
- 🔀 **Automatic Routing**: Routes webhook notifications to the appropriate payment provider
- 🛡️ **Validation & Security**: Each provider handles its own signature validation and security checks
- 🧩 **Extendable Design**: Makes adding new payment gateways simpler with standardized interfaces
- 🔌 **Custom Routes**: Supports provider-specific webhook URLs when required

### Webhook URLs

Payment gateway callbacks will be received at:
- Main endpoint: `https://your-server.com/api/payments/webhook/:provider`
- PayFast endpoint: `https://your-server.com/api/payments/webhook/payfast-itn`

A status endpoint is also available at `https://your-server.com/api/payments/webhook/status` that shows active payment providers.

### Payment Gateway Configuration

Payment gateways are configured through a centralized configuration system:

1. **Configuration File**: Payment gateways are defined in `config/paymentGateways.js`
2. **Easy Management**: Enable/disable gateways without code changes
3. **Structured Configuration**: Each gateway has its own configuration schema
4. **Display Name Mapping**: Consistent naming across the application

Example configuration:
```javascript
module.exports = {
    availableGateways: [
        {
            id: 'payfast',
            name: '💳 PayFast',
            enabled: true,
            configSteps: ['merchantId', 'merchantKey', 'passphrase']
        },
        // Additional payment gateways can be added here
    ],
    providerDisplayNames: {
        'payfast': '💳 PayFast',
        // More display names...
    }
};
```

### Adding New Payment Gateways

The system is designed with a modular approach that makes adding new payment gateways straightforward:

1. **Define the Gateway**: Add the new gateway to `config/paymentGateways.js`
2. **Implement Provider**: Create a new provider class that extends `PaymentProvider` in the `payment-providers` directory
3. **Register Provider**: Add the provider to the `bot.js` initialization

#### Steps to Add a New Payment Gateway:

1. Add the gateway to the configuration file:
   ```javascript
   // In config/paymentGateways.js
   module.exports = {
     availableGateways: [
       // ...existing gateways
       {
         id: 'newgateway',
         name: '💳 New Gateway',
         enabled: true,
         configSteps: ['apiKey', 'secretKey']
       }
     ],
     providerDisplayNames: {
       // ...existing display names
       'newgateway': '💳 New Gateway'
     }
   };
   ```

2. Create a new provider class that extends the base PaymentProvider:
   ```javascript
   // In payment-providers/newgateway/NewGatewayProvider.js
   const PaymentProvider = require('../PaymentProvider');

   class NewGatewayProvider extends PaymentProvider {
     constructor(config) {
       super(config);
       this.name = "newgateway";
     }

     // Generate payment URL for the payment gateway
     generatePaymentUrl(userId, amount, itemName, itemDescription, options = {}) {
       // Implementation
     }

     // Required method to handle webhook callbacks
     async handleWebhook(req, successCallback) {
       // Validate the webhook data
       const isValid = await this.validatePayment(req.body);

       if (!isValid) {
         return { status: 400, body: 'Invalid payment data' };
       }

       // Process payment data
       const paymentData = this.processPaymentData(req.body);

       // Call success callback with payment data
       await successCallback(paymentData);

       return { status: 200, body: 'Payment processed successfully' };
     }

     // Optional - Define a custom webhook path if needed
     getCustomWebhookPath() {
       return '/webhook/custom-newgateway-path';
     }

     // Other required methods...
   }

   module.exports = NewGatewayProvider;
   ```

3. Register the provider in `bot.js`:
   ```javascript
   const NewGatewayProvider = require('./payment-providers/newgateway/NewGatewayProvider');

   // Configure provider
   const newGatewayConfig = {
     apiKey: process.env.NEW_GATEWAY_API_KEY,
     secretKey: process.env.NEW_GATEWAY_SECRET_KEY,
     baseUrl: process.env.BASE_URL || 'https://your-server.com'
   };

   // Register provider with paymentManager
   paymentManager.registerProvider('newgateway', new NewGatewayProvider(newGatewayConfig));
   ```

### Payment Process Flow

1. Admin configures a payment gateway for their group
2. User selects payment method when subscribing
3. Bot generates a payment URL using the selected gateway
4. User completes payment on the provider's site
5. Provider sends webhook notification back to the bot's unified webhook endpoint
6. Webhook system routes the request to the appropriate provider
7. Provider validates the payment and processes the data
8. Bot activates the subscription when payment is confirmed

## 💾 Database Structure

The bot uses MongoDB to store:
- User information and subscriptions
- Group configurations and settings
- Payment history and analytics data

Key collections:
- `users` - Stores user data and subscription information
- `groups` - Contains group settings, including auto-kick configuration
- `payments` - Records payment transactions

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.