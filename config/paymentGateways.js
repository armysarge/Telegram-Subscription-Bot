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
            configSteps: ['merchantId', 'merchantKey', 'passphrase']
        },
        // Commented examples of other payment gateways that could be added in the future
        // {
        //     id: 'stripe',
        //     name: '💳 Stripe',
        //     enabled: false,
        //     configSteps: ['apiKey', 'secretKey', 'webhookSecret']
        // },
        // {
        //     id: 'paypal',
        //     name: '💰 PayPal',
        //     enabled: false,
        //     configSteps: ['clientId', 'clientSecret']
        // }
    ],

    // Display name mapping (used for consistency across the application)
    providerDisplayNames: {
        'payfast': '💳 PayFast',
        //'stripe': '💳 Stripe',
        //'paypal': '💰 PayPal'
    }
};