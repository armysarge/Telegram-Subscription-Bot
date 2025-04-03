/**
 * Base interface for payment providers
 * All payment providers should implement these methods
 */
class PaymentProvider {
    /**
     * Initialize the payment provider with configuration
     * @param {Object} config - Configuration for the payment provider
     */
    constructor(config) {
        this.config = config;
        this.name = "base"; // Override in subclasses
    }

    /**
     * Generate a payment URL for a subscription
     * @param {number} userId - Telegram user ID
     * @param {number} amount - Payment amount
     * @param {string} itemName - Name of the subscription item
     * @param {string} itemDescription - Description of the subscription
     * @param {Object} options - Additional options for the payment
     * @returns {string} Payment URL
     */
    generatePaymentUrl(userId, amount, itemName, itemDescription, options = {}) {
        throw new Error('Method not implemented');
    }

    /**
     * Generate a URL specifically for subscription payments
     * @param {number} userId - Telegram user ID
     * @param {number} amount - Payment amount
     * @param {string} itemName - Name of the subscription item
     * @param {string} itemDescription - Description of the subscription
     * @param {Object} subscriptionOptions - Subscription specific parameters
     * @returns {string} Subscription URL
     */
    generateSubscriptionUrl(userId, amount, itemName, itemDescription, subscriptionOptions = {}) {
        throw new Error('Method not implemented');
    }

    /**
     * Validate a payment notification from the payment provider
     * @param {Object} data - Payment notification data
     * @returns {Promise<boolean>} True if valid, false otherwise
     */
    async validatePayment(data) {
        throw new Error('Method not implemented');
    }

    /**
     * Process a successful payment
     * @param {Object} data - Payment data
     * @returns {Object} Processed payment data with userId, amount, and paymentId
     */
    processPaymentData(data) {
        throw new Error('Method not implemented');
    }

    /**
     * Set up the webhook route for the payment provider
     * @param {Object} app - Express app
     * @param {Function} paymentSuccessCallback - Callback for successful payments
     */
    setupWebhook(app, paymentSuccessCallback) {
        throw new Error('Method not implemented');
    }

    /**
     * Get details about a subscription
     * @param {string} subscriptionId - The subscription ID
     * @returns {Promise<Object>} Subscription details
     */
    async getSubscriptionDetails(subscriptionId) {
        throw new Error('Method not implemented');
    }

    /**
     * Cancel a subscription
     * @param {string} subscriptionId - The subscription ID to cancel
     * @returns {Promise<boolean>} Success status
     */
    async cancelSubscription(subscriptionId) {
        throw new Error('Method not implemented');
    }
}

module.exports = PaymentProvider;