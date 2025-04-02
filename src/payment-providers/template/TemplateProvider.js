/**
 * Template for adding new payment providers to the system
 * Copy this file, rename it to YourProviderName.js, and implement the methods
 */
const PaymentProvider = require('../PaymentProvider');

class TemplateProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.name = "template_provider"; // Set your provider name here
    }

    /**
     * Generate a payment URL for this provider
     * Implement this method according to the provider's API documentation
     */
    generatePaymentUrl(userId, amount, itemName, itemDescription) {
        // 1. Format the amount as required by the payment provider
        const formattedAmount = parseFloat(amount).toFixed(2);

        // 2. Create a unique payment ID that includes the userId
        const paymentId = `payment_${userId}_${Date.now()}`;

        // 3. Prepare any authentication details from config
        // const apiKey = this.config.apiKey;

        // 4. Create payment data according to the provider's API
        // const paymentData = { ... };

        // 5. Make API request if needed or generate URL directly
        // const paymentUrl = `https://payment-provider.com/pay?amount=${formattedAmount}&ref=${paymentId}`;

        // 6. Return the payment URL
        // return paymentUrl;

        throw new Error('generatePaymentUrl not implemented');
    }

    /**
     * Validate a payment notification from this provider
     * Implement this according to the provider's webhook documentation
     */
    async validatePayment(data) {
        // 1. Verify the authenticity of the webhook notification
        // - Check signatures, tokens, or other security measures

        // 2. Validate amounts match expected values

        // 3. Check payment status is valid/completed

        // 4. Return true if valid, false otherwise
        // return isValid;

        throw new Error('validatePayment not implemented');
    }

    /**
     * Extract user and payment data from the webhook notification
     */
    processPaymentData(data) {
        // 1. Extract relevant payment data from the notification
        // const paymentId = data.transaction_id;
        // const amount = parseFloat(data.amount);

        // 2. Extract the userId from your reference/metadata
        // For example, if you stored it in the payment ID:
        // const paymentIdParts = data.reference.split('_');
        // const userId = parseInt(paymentIdParts[1], 10);

        // 3. Return standardized payment data
        // return {
        //     userId,
        //     amount,
        //     currency: 'USD', // Set appropriate currency
        //     paymentId,
        //     status: 'completed',
        //     providerName: this.name
        // };

        throw new Error('processPaymentData not implemented');
    }

    /**
     * Set up webhook route for this payment provider
     */
    setupWebhook(app, paymentSuccessCallback) {
        // 1. Define the webhook endpoint path
        const webhookPath = '/your-provider-webhook'; // Change this to match your provider

        // 2. Set up the endpoint to receive notifications
        app.post(webhookPath, async (req, res) => {
            console.log(`Received ${this.name} webhook:`, req.body);

            // 3. Validate the payment notification
            if (await this.validatePayment(req.body)) {
                // 4. Check payment status as defined by the provider
                // if (req.body.status === 'SUCCESSFUL') {
                    try {
                        // 5. Process the payment data
                        // const paymentData = this.processPaymentData(req.body);

                        // 6. Call the success callback
                        // await paymentSuccessCallback(paymentData);

                        // 7. Log success
                        // console.log(`Successfully processed ${this.name} payment`);
                    } catch (error) {
                        console.error(`Error processing ${this.name} payment:`, error);
                    }
                // }

                // 8. Return appropriate response to the provider
                // res.status(200).send('OK');
            } else {
                console.error(`Invalid ${this.name} webhook data`);
                res.status(400).send('Invalid webhook data');
            }
        });

        console.log(`Set up ${this.name} webhook at ${webhookPath}`);
    }
}

module.exports = TemplateProvider;