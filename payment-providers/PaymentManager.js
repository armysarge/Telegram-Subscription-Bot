/**
 * Payment manager that handles all payment providers
 */
class PaymentManager {
    constructor() {
        this.providers = {};
        this.defaultProvider = null;
        // Import the webhook handler
        this.webhookHandler = require('./webhooks');
    }

    /**
     * Register a payment provider
     * @param {string} name - Provider name
     * @param {Object} provider - Payment provider instance
     * @param {boolean} isDefault - Set as default provider
     */
    registerProvider(name, provider, isDefault = false) {
        this.providers[name] = provider;

        // Also register the provider with the webhook handler
        this.webhookHandler.registerProvider(name, provider);

        if (isDefault || !this.defaultProvider) {
            this.defaultProvider = name;
        }
    }

    /**
     * Get a payment provider by name
     * @param {string} name - Provider name
     * @returns {Object} Payment provider
     */
    getProvider(name) {
        if (!name && this.defaultProvider) {
            return this.providers[this.defaultProvider];
        }

        if (!this.providers[name]) {
            throw new Error(`Payment provider '${name}' not found`);
        }

        return this.providers[name];
    }

    /**
     * Generate a payment URL using the specified provider
     * @param {string} providerName - Provider name (optional, uses default if not specified)
     * @param {number} userId - Telegram user ID
     * @param {number} groupId - Telegram group ID
     * @param {number} amount - Payment amount
     * @param {string} itemName - Name of the subscription item
     * @param {string} itemDescription - Description of the subscription
     * @param {Object} options - Additional options for the payment
     * @returns {string} Payment URL
     */
    generatePaymentUrl(providerName, userId, groupId, amount, itemName, itemDescription, options = {}) {
        const provider = this.getProvider(providerName);
        return provider.generatePaymentUrl(userId, groupId, amount, itemName, itemDescription, options);
    }

    /**
     * Generate a subscription URL using the specified provider
     * @param {string} providerName - Provider name (optional, uses default if not specified)
     * @param {number} userId - Telegram user ID
     * @param {number} groupId - Telegram group ID
     * @param {number} amount - Payment amount
     * @param {string} itemName - Name of the subscription item
     * @param {string} itemDescription - Description of the subscription
     * @param {Object} subscriptionOptions - Subscription specific parameters
     * @returns {string} Subscription URL
     */
    generateSubscriptionUrl(providerName, userId, groupId, amount, itemName, itemDescription, subscriptionOptions = {}) {
        const provider = this.getProvider(providerName);
        return provider.generateSubscriptionUrl(userId, groupId, amount, itemName, itemDescription, subscriptionOptions);
    }

    /**
     * Get details about a subscription
     * @param {string} providerName - Provider name (optional, uses default if not specified)
     * @param {string} subscriptionId - The subscription ID
     * @returns {Promise<Object>} Subscription details
     */
    async getSubscriptionDetails(providerName, subscriptionId) {
        const provider = this.getProvider(providerName);
        return provider.getSubscriptionDetails(subscriptionId);
    }

    /**
     * Cancel a subscription
     * @param {string} providerName - Provider name (optional, uses default if not specified)
     * @param {string} subscriptionId - The subscription ID to cancel
     * @returns {Promise<boolean>} Success status
     */
    async cancelSubscription(providerName, subscriptionId) {
        const provider = this.getProvider(providerName);
        return provider.cancelSubscription(subscriptionId);
    }

    /**
     * Set up webhooks for all registered payment providers
     * @param {Object} app - Express app
     * @param {Function} paymentSuccessCallback - Callback for successful payments
     */
    setupWebhooks(app, paymentSuccessCallback) {
        // Set the payment success callback in the webhook handler
        this.webhookHandler.setPaymentSuccessCallback(paymentSuccessCallback);

        // Initialize all webhook routes
        this.webhookHandler.initializeRoutes(app);

        console.log(`Payment webhook system initialized with ${Object.keys(this.providers).length} providers`);
    }
}

module.exports = PaymentManager;