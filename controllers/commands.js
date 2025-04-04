const User = require('../models/user');
const Group = require('../models/group');
const { verifyAdmin } = require('./adminCommands');
const userCommands = require('./userCommands');
const adminCommands = require('./adminCommands');

// Command handlers
const register = (bot, paymentManager) => {
    // Register user commands
    userCommands.register(bot, paymentManager);

    // Register admin commands
    adminCommands.register(bot, paymentManager);

    // Handle text inputs for interactive flows
    bot.on('text', async (ctx) => {
        // Add comprehensive debugging at the start
        console.log('Text handler triggered');
        console.log('Session state:', JSON.stringify(ctx.session || {}));
        console.log('Message text:', ctx.message.text);

        // Skip if not expecting any input
        if (!ctx.session?.awaitingWelcomeFor && !ctx.session?.awaitingPriceFor &&
            !ctx.session?.configuringPaymentFor && !ctx.session?.awaitingTrialDaysFor) {
            console.log('No pending input expected, skipping handler');
            return;
        }

        try {
            const messageText = ctx.message.text;

            // Handle subscription price input
            if (ctx.session?.awaitingPriceFor) {
                console.log('Processing price input for group:', ctx.session.awaitingPriceFor);
                const groupId = ctx.session.awaitingPriceFor;
                const fromSubscriptionSettings = ctx.session.fromSubscriptionSettings || false;

                // Handle cancel command
                if (messageText.toLowerCase() === '/cancel') {
                    console.log('Price update canceled');
                    delete ctx.session.awaitingPriceFor;
                    delete ctx.session.fromSubscriptionSettings;

                    // Show different back button based on context
                    const keyboard = {
                        inline_keyboard: [[
                            {
                                text: fromSubscriptionSettings ? '◀️ Back to Subscription Settings' : '◀️ Back to Registration',
                                callback_data: fromSubscriptionSettings ? `admin_subscription:${groupId}` : `register_group:${groupId}`
                            }
                        ]]
                    };
                    return ctx.reply('Price update canceled.', { reply_markup: keyboard });
                }

                // Validate price
                const price = parseFloat(messageText);
                console.log('Parsed price:', price, 'from input:', messageText);

                if (isNaN(price) || price <= 0) {
                    console.log('Invalid price entered');
                    return ctx.reply('Please enter a valid price (a positive number).');
                }

                try {
                    console.log('Updating group with price:', price);
                    // Update group with new price
                    await Group.findOneAndUpdate(
                        { groupId },
                        {
                            subscriptionPrice: price,
                            subscriptionCurrency: 'ZAR'
                        }
                    );

                    console.log('Group updated, clearing session state');
                    delete ctx.session.awaitingPriceFor;

                    // Show different back button based on context
                    const keyboard = {
                        inline_keyboard: [[
                            {
                                text: fromSubscriptionSettings ? '◀️ Back to Subscription Settings' : '◀️ Back to Registration',
                                callback_data: fromSubscriptionSettings ? `admin_subscription:${groupId}` : `register_group:${groupId}`
                            }
                        ]]
                    };

                    // Also clear the context flag
                    delete ctx.session.fromSubscriptionSettings;

                    await ctx.reply(
                        `✅ Subscription price set to ${price} ZAR successfully!`,
                        { reply_markup: keyboard }
                    );
                    console.log('Price update confirmation sent');
                } catch (dbError) {
                    console.error('Database error while saving price:', dbError);
                    await ctx.reply('Failed to save the subscription price. Please try again.');
                }
                return;
            }

            // Handle welcome message updates
            if (ctx.session?.awaitingWelcomeFor) {
                const groupId = ctx.session.awaitingWelcomeFor;
                const fromManagementMenu = ctx.session.fromManagementMenu;

                // Handle cancel command
                if (messageText.toLowerCase() === '/cancel') {
                    delete ctx.session.awaitingWelcomeFor;
                    delete ctx.session.fromManagementMenu;

                    if (fromManagementMenu) {
                        const keyboard = {
                            inline_keyboard: [[
                                { text: '◀️ Back to Group Management', callback_data: `manage_group:${groupId}` }
                            ]]
                        };
                        return ctx.reply('Welcome message update canceled.', { reply_markup: keyboard });
                    }
                    return ctx.reply('Welcome message update canceled.');
                }

                try {
                    await Group.findOneAndUpdate(
                        { groupId },
                        { welcomeMessage: messageText }
                    );

                    delete ctx.session.awaitingWelcomeFor;
                    delete ctx.session.fromManagementMenu;

                    if (fromManagementMenu) {
                        const keyboard = {
                            inline_keyboard: [[
                                { text: '◀️ Back to Group Management', callback_data: `manage_group:${groupId}` }
                            ]]
                        };
                        return ctx.reply('✅ Welcome message updated successfully!', { reply_markup: keyboard });
                    }

                    await ctx.reply('✅ Welcome message updated successfully!');
                } catch (err) {
                    console.error('Error saving welcome message:', err);
                    await ctx.reply('Failed to update welcome message. Please try again.');
                }
                return;
            }

            // Handle PayFast configuration
            if (ctx.session?.configuringPaymentFor) {
                const { groupId, step } = ctx.session.configuringPaymentFor;

                // Handle cancel command
                if (messageText.toLowerCase() === '/cancel') {
                    delete ctx.session.configuringPaymentFor;
                    const keyboard = {
                        inline_keyboard: [[
                            { text: 'Back to Payment Settings', callback_data: `payment_method:${groupId}:payfast` }
                        ]]
                    };
                    return ctx.reply('PayFast configuration canceled.', { reply_markup: keyboard });
                }

                if (step === 'merchant_id') {
                    // Update merchant ID and move to next step
                    await Group.findOneAndUpdate(
                        { groupId },
                        { $set: { 'customPaymentSettings.payfast.merchantId': messageText } },
                        { upsert: true }
                    );

                    // Update session to next step
                    ctx.session.configuringPaymentFor.step = 'merchant_key';

                    await ctx.reply(
                        `PayFast Merchant ID saved.\n\n` +
                        `Step 2/3: Please enter your PayFast Merchant Key.`
                    );
                } else if (step === 'merchant_key') {
                    // Update merchant key and move to final step
                    await Group.findOneAndUpdate(
                        { groupId },
                        { $set: { 'customPaymentSettings.payfast.merchantKey': messageText } },
                        { upsert: true }
                    );

                    // Update session to next step
                    ctx.session.configuringPaymentFor.step = 'passphrase';

                    await ctx.reply(
                        `PayFast Merchant Key saved.\n\n` +
                        `Step 3/3: Please enter your PayFast Passphrase (or type "skip" if you don't have one).`
                    );
                } else if (step === 'passphrase') {
                    // Only save passphrase if not "skip"
                    if (messageText.toLowerCase() !== 'skip') {
                        await Group.findOneAndUpdate(
                            { groupId },
                            { $set: { 'customPaymentSettings.payfast.passPhrase': messageText } },
                            { upsert: true }
                        );
                    }

                    // Configuration complete
                    delete ctx.session.configuringPaymentFor;

                    // Send back to registration menu
                    const keyboard = {
                        inline_keyboard: [[
                            { text: '▶️ Continue Registration', callback_data: `register_group:${groupId}` }
                        ]]
                    };

                    await ctx.reply(
                        `✅ PayFast configuration complete!\n\nClick below to continue with the registration:`,
                        { reply_markup: keyboard }
                    );
                }
                return;
            }

            // Handle trial duration input
            if (ctx.session?.awaitingTrialDaysFor) {
                const groupId = ctx.session.awaitingTrialDaysFor;

                // Handle cancel command
                if (messageText.toLowerCase() === '/cancel') {
                    delete ctx.session.awaitingTrialDaysFor;

                    const keyboard = {
                        inline_keyboard: [[
                            { text: '◀️ Back to Trial Settings', callback_data: `set_user_trial:${groupId}` }
                        ]]
                    };

                    return ctx.reply('Trial duration update canceled.', { reply_markup: keyboard });
                }

                // Validate trial duration
                const trialDays = parseInt(messageText);
                console.log('Parsed trial days:', trialDays, 'from input:', messageText);

                if (isNaN(trialDays) || trialDays < 1 || trialDays > 30) {
                    console.log('Invalid trial duration entered');
                    return ctx.reply('Please enter a valid number of days (1-30).');
                }

                try {
                    console.log('Updating group with trial duration:', trialDays);

                    // Update group with new trial duration and enable trial
                    await Group.findOneAndUpdate(
                        { groupId },
                        {
                            userTrialDays: trialDays,
                            userTrialEnabled: true
                        }
                    );

                    console.log('Group updated, clearing session state');
                    delete ctx.session.awaitingTrialDaysFor;

                    const keyboard = {
                        inline_keyboard: [[
                            { text: '◀️ Back to Trial Settings', callback_data: `set_user_trial:${groupId}` }
                        ]]
                    };

                    await ctx.reply(
                        `✅ User trial duration set to ${trialDays} days and trials enabled successfully!`,
                        { reply_markup: keyboard }
                    );
                    console.log('Trial duration update confirmation sent');
                } catch (dbError) {
                    console.error('Database error while saving trial duration:', dbError);
                    await ctx.reply('Failed to save the trial duration. Please try again.');
                }
                return;
            }
        } catch (err) {
            console.error('Error handling text input:', err);
            console.error('Error details:', err.stack); // Add stack trace for better debugging
            await ctx.reply('An error occurred while processing your input. Please try again.');
        }
    });
};

module.exports = { register };
