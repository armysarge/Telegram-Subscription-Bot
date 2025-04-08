/**
 * Payment Gateway Configuration
 *
 * This file contains the configuration for available payment gateways.
 * Add new payment gateways here as they're implemented.
 */

module.exports = {
    // List of available payment gateways with their display names
    availableGateways: [
        {
            id: 'payfast',
            name: '💳 PayFast',
            enabled: true,
            providerClass: 'PayFastProvider',
            configSteps: ['merchantId', 'merchantKey', 'passphrase'],
            configParams: ['merchantId', 'merchantKey', 'passPhrase'],
            default: true
        },
        // Examples of other payment gateways that could be added in the future
        // {
        //     id: 'stripe',
        //     name: '💳 Stripe',
        //     enabled: false,
        //     providerClass: 'StripeProvider',
        //     configSteps: ['apiKey', 'secretKey', 'webhookSecret'],
        //     configParams: ['apiKey', 'secretKey', 'webhookSecret'],
        //     default: false
        // },
        // {
        //     id: 'paypal',
        //     name: '💰 PayPal',
        //     enabled: false,
        //     providerClass: 'PayPalProvider',
        //     configSteps: ['clientId', 'clientSecret'],
        //     configParams: ['clientId', 'clientSecret'],
        //     default: false
        // }
    ],

    // Display name mapping (used for consistency across the application)
    providerDisplayNames: {
        'payfast': '💳 PayFast',
        //'stripe': '💳 Stripe',
        //'paypal': '💰 PayPal'
    },

    // Generic configuration UI template strings for each payment gateway config step
    configStepTemplates: {
        'merchantId': {
            name: 'Merchant ID',
            prompt: 'Please enter your Merchant ID',
            helpText: 'You can find this in your payment gateway account dashboard'
        },
        'merchantKey': {
            name: 'Merchant Key',
            prompt: 'Please enter your Merchant Key',
            helpText: 'This is the secret key provided by your payment gateway'
        },
        'passphrase': {
            name: 'Passphrase',
            prompt: 'Please enter your Passphrase (or type "skip" if not applicable)',
            helpText: 'This is an optional security measure for some payment gateways'
        },
        'apiKey': {
            name: 'API Key',
            prompt: 'Please enter your API Key',
            helpText: 'This is the public API key from your account'
        },
        'secretKey': {
            name: 'Secret Key',
            prompt: 'Please enter your Secret Key',
            helpText: 'Keep this secure and never share it publicly'
        },
        'webhookSecret': {
            name: 'Webhook Secret',
            prompt: 'Please enter your Webhook Secret',
            helpText: 'Used to verify webhook notifications from the payment gateway'
        },
        'clientId': {
            name: 'Client ID',
            prompt: 'Please enter your Client ID',
            helpText: 'This identifies your application to the payment gateway'
        },
        'clientSecret': {
            name: 'Client Secret',
            prompt: 'Please enter your Client Secret',
            helpText: 'This is used for authentication with the payment gateway API'
        }
    }
};