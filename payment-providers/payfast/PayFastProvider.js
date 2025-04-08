const PaymentProvider = require('../PaymentProvider');
const crypto = require('crypto');
const axios = require('axios');

/**
 * PayFast payment provider implementation with subscription support
 */
class PayFastProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.name = "payfast";
    }

    /**
     * Generate a payment URL for PayFast
     * @param {number} userId - Telegram user ID
     * @param {number} groupId - Telegram group ID
     * @param {number} amount - Payment amount
     * @param {string} itemName - Name of the subscription item
     * @param {string} itemDescription - Description of the subscription
     * @param {Object} options - Additional options including subscription parameters
     * @returns {string} Payment URL
     */
    generatePaymentUrl(userId, groupId, amount, itemName, itemDescription, options = {}) {
        // Set merchant details from environment variables
        const merchantId = this.config.merchantId;
        const merchantKey = this.config.merchantKey;
        const passphrase = this.config.passphrase;

        // Generate a unique payment ID
        const paymentId = `sub_${userId}_${Date.now()}`;

        // Set return and notify URLs
        const returnUrl = this.config.returnUrl || 'https://t.me/your_bot_username';
        const cancelUrl = this.config.cancelUrl || 'https://t.me/your_bot_username';

        // Use the new webhook URL format
        const baseUrl = this.config.baseUrl || 'https://your-server.com';
        const notifyUrl = this.config.notifyUrl || this.getWebhookUrl(baseUrl);

        // Format amount with 2 decimal places
        const formattedAmount = parseFloat(amount).toFixed(2);

        // Create data object similar to the PHP example
        const data = {
            // Merchant details
            'merchant_id': merchantId,
            'merchant_key': merchantKey,
            'return_url': returnUrl,
            'cancel_url': cancelUrl,
            'notify_url': notifyUrl,

            // Buyer details
            'name_first': 'Telegram',
            'name_last': 'User',
            'email_address': `user${userId}@telegram.org`,

            // Transaction details
            'm_payment_id': paymentId,
            'amount': formattedAmount,
            'item_name': itemName,
            'item_description': itemDescription,
            'custom_str1': userId.toString(),
            'custom_str2': groupId
        };

        // Add subscription parameters if this is a subscription
        if (options.subscription) {
            data.subscription_type = options.subscription.type || 1; // 1 for recurring

            // Use the properly formatted billing date in YYYY-MM-DD format
            data.billing_date = options.subscription.billingDate; // This should now be properly formatted
            data.recurring_amount = options.subscription.recurringAmount || formattedAmount;
            data.frequency = options.subscription.frequency || 3; // Default to monthly (3)
            data.cycles = options.subscription.cycles || 0; // 0 for indefinite

            // Add optional subscription parameters if provided
            if (options.subscription.initialAmount) {
                data.initial_amount = parseFloat(options.subscription.initialAmount).toFixed(2);
            }
        }

        // Generate signature
        const signature = this.generateSignature(data, passphrase);
        data.signature = signature;

        // Determine if in testing mode based on config
        const testingMode = this.config.sandbox === true;
        const pfHost = testingMode ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';

        // Create the URL with query parameters
        let queryString = Object.entries(data)
            .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%20/g, '+').replace(/ /g, '+')}`)
            .join('&');

        // Return the full URL
        return `https://${pfHost}/eng/process?${queryString}`;
    }

    /**
     * Validate a payment notification from PayFast
     */
    async validatePayment(data) {
        // Clone the data object
        const pfData = { ...data };
        const passphrase = this.config.passphrase;

        // Save the signature from the data
        const receivedSignature = pfData.signature;

        // Remove the signature field
        delete pfData.signature;

        // Calculate signature
        const calculatedSignature = this.generateSignature(pfData, passphrase);

        // Compare signatures
        if (calculatedSignature !== receivedSignature) {
            console.error('Signature validation failed', {
                calculated: calculatedSignature,
                received: receivedSignature
            });
            return false;
        }

        // Validate against PayFast server (optional but recommended)
        try {
            const pfHost = this.config.sandbox === true
                ? 'sandbox.payfast.co.za'
                : 'www.payfast.co.za';

            const validateUrl = `https://${pfHost}/eng/query/validate`;

            // Convert pfData to form-urlencoded string
            const formData = Object.entries(pfData)
                .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%20/g, '+').replace(/ /g, '+')}`)
                .join('&');

            const validateResponse = await axios.post(
                validateUrl,
                formData,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            return validateResponse.data.trim() === 'VALID';
        } catch (error) {
            console.error('Error validating ITN with PayFast server:', error);
            return false;
        }
    }

    /**
     * Process payment data from PayFast notification
     */
    processPaymentData(data) {
        const { m_payment_id, pf_payment_id, amount_gross, payment_status, token, subscription_id } = data;

        // Extract userId from the m_payment_id
        const paymentIdParts = m_payment_id.split('_');
        if (paymentIdParts.length < 2) {
            throw new Error('Invalid payment ID format: ' + m_payment_id);
        }

        const userId = parseInt(paymentIdParts[1], 10);

        // Create the payment data object
        const paymentData = {
            userId,
            amount: parseFloat(amount_gross || 0),
            currency: 'ZAR', // PayFast uses ZAR
            paymentId: pf_payment_id,
            status: 'completed',
            providerName: this.name
        };

        // Add subscription data if this is a subscription payment
        if (token && subscription_id) {
            paymentData.isSubscription = true;
            paymentData.subscriptionId = subscription_id;
            paymentData.token = token;
        }

        return paymentData;
    }

    /**
     * Set up webhook route for PayFast ITN notifications
     * @deprecated Use handleWebhook instead
     */
    setupWebhook(app, paymentSuccessCallback) {
        console.warn('PayFastProvider: setupWebhook is deprecated, using handleWebhook with new webhook system');

        // For backward compatibility, we'll register the old route
        app.post('/payfast-itn', async (req, res) => {
            console.log('Received PayFast ITN via deprecated route:', req.body);

            try {
                const result = await this.handleWebhook(req, paymentSuccessCallback);
                return res.status(result.status || 200).send(result.body || 'OK');
            } catch (error) {
                console.error('Error handling PayFast webhook:', error);
                return res.status(500).send('Internal Server Error');
            }
        });
    }

    /**
     * Get a custom webhook path for this provider
     * @returns {string} Custom webhook path
     */
    getCustomWebhookPath() {
        return '/webhook/payfast-itn';
    }

    /**
     * Handle webhook requests from PayFast
     * @param {Object} req - Express request object
     * @param {Function} successCallback - Callback for successful payments
     * @returns {Promise<Object>} Response object with status and body
     */
    async handleWebhook(req, successCallback) {
        console.log('Processing PayFast webhook with payload:', req.body);

        // Check for required fields
        if (!req.body || !req.body.m_payment_id) {
            console.error('PayFast webhook missing required fields');
            return { status: 400, body: 'Missing required fields' };
        }

        // Validate the ITN
        const isValid = await this.validatePayment(req.body);

        if (!isValid) {
            console.error('Invalid PayFast webhook payload');
            return { status: 400, body: 'Invalid ITN' };
        }

        const { payment_status } = req.body;

        // Process both regular and subscription payments
        if (payment_status === 'COMPLETE') {
            try {
                // Process the payment data
                const paymentData = this.processPaymentData(req.body);

                // Call the success callback
                if (successCallback) {
                    await successCallback(paymentData);
                }

                console.log(`Successfully processed PayFast payment for user ${paymentData.userId}`);
                return { status: 200, body: 'Payment processed successfully' };
            } catch (error) {
                console.error('Error processing PayFast payment:', error);
                return { status: 500, body: 'Error processing payment' };
            }
        }
        // Handle subscription notifications
        else if (payment_status === 'SUBSCRIPTION_CANCELLED') {
            console.log('Subscription cancelled:', req.body.subscription_id);
            // You could add subscription cancellation handling here
            return { status: 200, body: 'Subscription cancellation acknowledged' };
        }

        // For other statuses, just acknowledge receipt
        return { status: 200, body: 'Notification received' };
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
    generateSubscriptionUrl(userId, groupId, amount, itemName, itemDescription, subscriptionOptions = {}) {
        // Format the billing date properly in YYYY-MM-DD format as required by PayFast
        const today = new Date();
        const billingDate = subscriptionOptions.billingDate ?
            new Date(subscriptionOptions.billingDate) :
            today;

        // Format the date in YYYY-MM-DD format
        const formattedBillingDate = `${billingDate.getFullYear()}-${String(billingDate.getMonth() + 1).padStart(2, '0')}-${String(billingDate.getDate()).padStart(2, '0')}`;

        const options = {
            subscription: {
                type: 1, // 1 for recurring subscription
                billingDate: formattedBillingDate, // Proper YYYY-MM-DD format
                frequency: subscriptionOptions.frequency || 3, // 3 = Monthly
                cycles: subscriptionOptions.cycles || 0, // 0 = Until cancelled
                recurringAmount: amount,
                initialAmount: subscriptionOptions.initialAmount // Optional
            }
        };

        return this.generatePaymentUrl(userId, groupId, amount, itemName, itemDescription, options);
    }

    /**
     * Helper function to generate PayFast signature
     */
    generateSignature(data, passphrase = null) {
        // Create a copy of the data
        const pfData = { ...data };

        // Remove the signature field if it exists
        delete pfData.signature;

        const keys = Object.keys(pfData);

        // Initialize the signature string
        let signatureString = '';

        // Build the signature string exactly like the PHP example
        keys.forEach((key, index) => {
            signatureString += `${key}=${encodeURIComponent(pfData[key]).replace(/%20/g, '+').replace(/ /g, '+')}`;

            // Add an ampersand if not the last element
            if (index < keys.length - 1) {
                signatureString += '&';
            }
        });

        // Add passphrase if provided
        if (passphrase && passphrase.trim() !== '') {
            signatureString += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`;
        }

        // Remove any special characters that might cause issues
        signatureString = signatureString.replace(/%83%C2/g, '');

        // Calculate the MD5 hash (equivalent to generateSignature in PHP example)
        return crypto.createHash('md5').update(signatureString).digest('hex');
    }

    /**
     * Fetch details about a subscription (requires API integration key)
     * @param {string} subscriptionId - The PayFast subscription ID
     * @returns {Promise<Object>} Subscription details
     */
    async getSubscriptionDetails(subscriptionId) {
        if (!this.config.apiKey) {
            throw new Error('PayFast API key required for subscription operations');
        }

        try {
            const pfHost = this.config.sandbox === true
                ? 'sandbox.payfast.co.za'
                : 'api.payfast.co.za';

            const timestamp = Math.floor(Date.now() / 1000);
            const url = `https://${pfHost}/subscriptions/${subscriptionId}`;

            // Create authentication signature
            const pfData = {
                merchant_id: this.config.merchantId,
                version: 'v1',
                timestamp: timestamp
            };

            const signature = this.generateSignature(pfData, this.config.passphrase);

            // Make API request
            const response = await axios.get(url, {
                headers: {
                    'merchant-id': this.config.merchantId,
                    'version': 'v1',
                    'timestamp': timestamp,
                    'signature': signature,
                    'API-Key': this.config.apiKey
                }
            });

            return response.data;
        } catch (error) {
            console.error('Error fetching subscription details:', error);
            throw error;
        }
    }

    /**
     * Cancel a PayFast subscription
     * @param {string} subscriptionId - The PayFast subscription ID to cancel
     * @returns {Promise<boolean>} Success status
     */
    async cancelSubscription(subscriptionId) {
        if (!this.config.apiKey) {
            throw new Error('PayFast API key required for subscription operations');
        }

        try {
            const pfHost = this.config.sandbox === true
                ? 'sandbox.payfast.co.za'
                : 'api.payfast.co.za';

            const timestamp = Math.floor(Date.now() / 1000);
            const url = `https://${pfHost}/subscriptions/${subscriptionId}/cancel`;

            // Create authentication signature
            const pfData = {
                merchant_id: this.config.merchantId,
                version: 'v1',
                timestamp: timestamp
            };

            const signature = this.generateSignature(pfData, this.config.passphrase);

            // Make API request
            const response = await axios.put(url, {}, {
                headers: {
                    'merchant-id': this.config.merchantId,
                    'version': 'v1',
                    'timestamp': timestamp,
                    'signature': signature,
                    'API-Key': this.config.apiKey
                }
            });

            return response.status === 200;
        } catch (error) {
            console.error('Error cancelling subscription:', error);
            throw error;
        }
    }
}

module.exports = PayFastProvider;