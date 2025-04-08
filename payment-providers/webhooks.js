/**
 * Centralized webhook handler for payment gateways
 * This file provides endpoints for receiving callbacks from payment providers
 */

const express = require('express');
const router = express.Router();

class WebhookHandler {
    constructor() {
        this.providers = {};
        this.successCallback = null;
    }

    /**
     * Register a payment provider for webhook handling
     * @param {string} providerName - Name of the payment provider
     * @param {Object} provider - The payment provider instance
     */
    registerProvider(providerName, provider) {
        this.providers[providerName] = provider;
        console.log(`Registered ${providerName} for webhook handling`);
    }

    /**
     * Set the callback to be called when a payment is successful
     * @param {Function} callback - The callback function
     */
    setPaymentSuccessCallback(callback) {
        this.successCallback = callback;
    }

    /**
     * Initialize all webhook routes
     * @param {Object} app - Express app instance
     */
    initializeRoutes(app) {
        // Main webhook endpoint that routes to specific providers
        router.post('/webhook/:provider', async (req, res) => {
            const providerName = req.params.provider;

            console.log(`Received webhook callback for provider: ${providerName}`);

            // Check if the provider exists
            if (!this.providers[providerName]) {
                console.error(`Payment provider '${providerName}' not found for webhook handling`);
                return res.status(404).json({ error: 'Provider not found' });
            }

            try {
                // Delegate validation and processing to the provider
                const result = await this.providers[providerName].handleWebhook(req, this.successCallback);

                // Return the response as specified by the provider
                return res.status(result.status || 200).send(result.body || 'OK');
            } catch (error) {
                console.error(`Error handling ${providerName} webhook:`, error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Provider-specific webhook endpoints (for legacy support or providers with specific needs)
        for (const [providerName, provider] of Object.entries(this.providers)) {
            if (typeof provider.getCustomWebhookPath === 'function') {
                const customPath = provider.getCustomWebhookPath();
                if (customPath) {
                    router.post(customPath, async (req, res) => {
                        try {
                            const result = await provider.handleWebhook(req, this.successCallback);
                            return res.status(result.status || 200).send(result.body || 'OK');
                        } catch (error) {
                            console.error(`Error handling ${providerName} custom webhook:`, error);
                            return res.status(500).json({ error: 'Internal server error' });
                        }
                    });
                    console.log(`Set up custom webhook path for ${providerName}: ${customPath}`);
                }
            }
        }

        // Add a status endpoint to check if webhook service is running
        router.get('/webhook/status', (req, res) => {
            return res.status(200).json({
                status: 'active',
                providers: Object.keys(this.providers),
                timestamp: new Date().toISOString()
            });
        });

        // Register the router with the Express app
        app.use('/api/payments', router);
        console.log('Payment webhook routes initialized');
    }
}

module.exports = new WebhookHandler();