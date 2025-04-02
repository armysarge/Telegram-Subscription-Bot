/**
 * Payment manager that handles all payment providers
 */
class PaymentManager {
    constructor() {
        this.providers = {};
        this.defaultProvider = null;
    }

    /**
     * Register a payment provider
     * @param {string} name - Provider name
     * @param {Object} provider - Payment provider instance
     * @param {boolean} isDefault - Set as default provider
     */
    registerProvider(name, provider, isDefault = false) {
        this.providers[name] = provider;

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
     * @param {number} amount - Payment amount
     * @param {string} itemName - Name of the subscription item
     * @param {string} itemDescription - Description of the subscription
     * @param {Object} options - Additional options for the payment
     * @returns {string} Payment URL
     */
    generatePaymentUrl(providerName, userId, amount, itemName, itemDescription, options = {}) {
        const provider = this.getProvider(providerName);
        return provider.generatePaymentUrl(userId, amount, itemName, itemDescription, options);
    }

    /**
     * Generate a subscription URL using the specified provider
     * @param {string} providerName - Provider name (optional, uses default if not specified)
     * @param {number} userId - Telegram user ID
     * @param {number} amount - Payment amount
     * @param {string} itemName - Name of the subscription item
     * @param {string} itemDescription - Description of the subscription
     * @param {Object} subscriptionOptions - Subscription specific parameters
     * @returns {string} Subscription URL
     */
    generateSubscriptionUrl(providerName, userId, amount, itemName, itemDescription, subscriptionOptions = {}) {
        const provider = this.getProvider(providerName);
        return provider.generateSubscriptionUrl(userId, amount, itemName, itemDescription, subscriptionOptions);
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
        for (const [name, provider] of Object.entries(this.providers)) {
            provider.setupWebhook(app, paymentSuccessCallback);
            console.log(`Set up webhook for ${name} payment provider`);
        }
    }
}

module.exports = PaymentManager;