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
     * @param {number} groupId - Telegram group ID
     * @param {number} amount - Payment amount
     * @param {string} itemName - Name of the subscription item
     * @param {string} itemDescription - Description of the subscription
     * @param {Object} options - Additional options for the payment
     * @returns {string} Payment URL
     */
    generatePaymentUrl(userId, groupId, amount, itemName, itemDescription, options = {}) {
        throw new Error('Method not implemented');
    }

    /**
     * Generate a URL specifically for subscription payments
     * @param {number} userId - Telegram user ID
     * @param {number} groupId - Telegram group ID
     * @param {number} amount - Payment amount
     * @param {string} itemName - Name of the subscription item
     * @param {string} itemDescription - Description of the subscription
     * @param {Object} subscriptionOptions - Subscription specific parameters
     * @returns {string} Subscription URL
     */
    generateSubscriptionUrl(userId, groupId, amount, itemName, itemDescription, subscriptionOptions = {}) {
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
     * @deprecated Use handleWebhook instead
     */
    setupWebhook(app, paymentSuccessCallback) {
        console.warn(`${this.name}: setupWebhook is deprecated, implement handleWebhook instead`);
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

    /**
     * Handle webhook requests from the payment provider
     * @param {Object} req - Express request object
     * @param {Function} successCallback - Callback for successful payments
     * @returns {Promise<Object>} Response object with status and body
     */
    async handleWebhook(req, successCallback) {
        throw new Error('Method not implemented');
    }

    /**
     * Get a custom webhook path for this provider (optional)
     * Implement this if your provider needs a specific URL path
     * @returns {string|null} Custom webhook path or null
     */
    getCustomWebhookPath() {
        return null; // Default implementation returns null (uses standard path)
    }

    /**
     * Get the URL to use in provider dashboard for webhook configuration
     * @param {string} baseUrl - Base URL of the application (e.g., https://example.com)
     * @returns {string} Full webhook URL
     */
    getWebhookUrl(baseUrl) {
        const customPath = this.getCustomWebhookPath();
        if (customPath) {
            return `${baseUrl}/api/payments${customPath}`;
        }
        return `${baseUrl}/api/payments/webhook/${this.name}`;
    }
}

module.exports = PaymentProvider;