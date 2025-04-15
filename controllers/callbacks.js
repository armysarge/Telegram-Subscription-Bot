const User = require('../models/user');
const Group = require('../models/group');
const { message } = require('telegraf/filters'); // Add this import for message filters

// Helper function to verify admin status
async function verifyAdmin(ctx, chatId) {
    try {
        const userId = ctx.from.id;
        const admins = await ctx.telegram.getChatAdministrators(chatId);
        return admins.some(admin => admin.user.id === userId);
    } catch (err) {
        console.error('Error verifying group admin:', err);
        return false;
    }
}

const register = (bot) => {
    // Debugging catch-all at the VERY beginning
    bot.catch((err, ctx) => {
        console.error('Bot error encountered:', err);
        console.log('Error context:', ctx?.updateType, ctx?.update);
    });

    // Admin dashboard callbacks
    bot.action('admin_toggle', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.answerCbQuery('Not authorized');
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: '🟢 Enable Subscription', callback_data: 'toggle_on' }],
                [{ text: '🔴 Disable Subscription', callback_data: 'toggle_off' }]
            ]
        };

        await ctx.editMessageText('⚙️ Choose an option:', { reply_markup: keyboard });
    });

    bot.action('admin_stats', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.answerCbQuery('Not authorized');
        }

        const stats = await User.aggregate([
            {
                $group: {
                    _id: null,
                    totalSubscribed: {
                        $sum: { $cond: ['$isSubscribed', 1, 0] }
                    },
                    totalUsers: { $sum: 1 }
                }
            }
        ]);

        const { totalSubscribed = 0, totalUsers = 0 } = stats[0] || {};
        const message = '📊 *Subscription Statistics*\n\n'
            + `👥 Total Users: ${totalUsers}\n`
            + `✅ Active Subscribers: ${totalSubscribed}\n`
            + `📈 Subscription Rate: ${((totalSubscribed / totalUsers) * 100).toFixed(1)}%`;

        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    });

    bot.action('admin_subscription', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.answerCbQuery('Not authorized');
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: '💰 Set Price', callback_data: 'set_price' }],
                [{ text: '⏱️ Set Duration', callback_data: 'set_duration' }],
                [{ text: '◀️ Back to Admin Menu', callback_data: 'admin_back' }]
            ]
        };

        await ctx.editMessageText('💳 *Subscription Settings*:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    });

    bot.action('admin_payment', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.answerCbQuery('Not authorized');
        }

        // Get available payment gateways from config file
        const paymentGatewaysConfig = require('../config/paymentGateways');

        // Create buttons for each enabled payment gateway
        const gatewayButtons = paymentGatewaysConfig.availableGateways
            .filter(gateway => gateway.enabled)
            .map(gateway => ([{
                text: `💳 Configure ${gateway.name}`,
                callback_data: `config_payment_${gateway.id}`
            }]));

        // Add back button
        gatewayButtons.push([{ text: '◀️ Back to Admin Menu', callback_data: 'admin_back' }]);

        const keyboard = {
            inline_keyboard: gatewayButtons
        };

        await ctx.editMessageText('💵 *Payment Settings*:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    });

    bot.action('admin_back', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.answerCbQuery('Not authorized');
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: '🔄 Toggle Subscription', callback_data: 'admin_toggle' }],
                [{ text: '💬 Set Welcome Message', callback_data: 'admin_welcome' }],
                [{ text: '📊 View Stats', callback_data: 'admin_stats' }],
                [{ text: '💰 Configure Subscription', callback_data: 'admin_subscription' }],
                [{ text: '💳 Configure Payment', callback_data: 'admin_payment' }]
            ]
        };

        await ctx.editMessageText('⚙️ *Admin Dashboard*:', {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    });

    // Group management callbacks
    bot.action(/^group:toggle:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Toggle subscription requirement
            const newStatus = !group.subscriptionRequired;
            await Group.findOneAndUpdate(
                { groupId },
                { subscriptionRequired: newStatus }
            );

            await ctx.editMessageText(
                `🏢 *Group Management*\n\n` +
                `Current Settings:\n` +
                `- Subscription Required: ${newStatus ? '✅ Yes' : '❌ No'}\n` +
                `- Welcome Message: ${group.welcomeMessage ? '✅ Custom' : '❌ Default'}\n\n` +
                'Use these commands to manage your group:\n' +
                '🔄 /admin\\_toggle - Toggle subscription requirement\n' +
                '💬 /admin\\_welcome [message] - Set welcome message\n' +
                '📊 /admin\\_stats - View statistics',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: newStatus ? '🔴 Disable Subscription' : '🟢 Enable Subscription', callback_data: `group:toggle:${groupId}` }],
                            [{ text: '💬 Set Welcome Message', callback_data: `group:welcome:${groupId}` }],
                            [{ text: '📊 View Statistics', callback_data: `group:stats:${groupId}` }]
                        ]
                    }
                }
            );

            await ctx.answerCbQuery(`Subscription requirement ${newStatus ? '✅ enabled' : '❌ disabled'}`);
        } catch (err) {
            console.error('Error in group toggle callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    bot.action(/^group:welcome:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            ctx.session = ctx.session || {};
            ctx.session.awaitingWelcomeFor = groupId;
            ctx.session.fromManagementMenu = true;

            // Escape any markdown characters in the welcome message to avoid parsing errors
            let currentWelcomeMsg = group.welcomeMessage || 'Default system message';

            // Escape special markdown characters
            currentWelcomeMsg = currentWelcomeMsg
                .replace(/\_/g, '\\_')
                .replace(/\*/g, '\\*')
                .replace(/\[/g, '\\[')
                .replace(/\]/g, '\\]')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/\~/g, '\\~')
                .replace(/\`/g, '\\`')
                .replace(/\>/g, '\\>')
                .replace(/\#/g, '\\#')
                .replace(/\+/g, '\\+')
                .replace(/\-/g, '\\-')
                .replace(/\=/g, '\\=')
                .replace(/\|/g, '\\|')
                .replace(/\{/g, '\\{')
                .replace(/\}/g, '\\}')
                .replace(/\./g, '\\.')
                .replace(/\!/g, '\\!');

            await ctx.answerCbQuery();
            await ctx.reply(
                `✏️ *Set Welcome Message*\n\n` +
                `Please send the new welcome message for ${group.groupTitle}.\n\n` +
                `Current welcome message: ${currentWelcomeMsg}\n\n` +
                `Reply with your new welcome text, or send /cancel to keep the current message.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('Error in group welcome callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    bot.action(/^group:stats:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can view statistics');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Get statistics
            const subscriberCount = await User.countDocuments({
                isSubscribed: true,
                'joinedGroups.groupId': groupId
            });

            const totalMembers = await User.countDocuments({
                'joinedGroups.groupId': groupId
            });

            await ctx.answerCbQuery();
            await ctx.reply(
                `📊 *Group Statistics*\n\n` +
                `Subscription Status: ${group.subscriptionRequired ? '✅ Required' : '❌ Not Required'}\n` +
                `👥 Subscribers: ${subscriberCount}\n` +
                `👥 Total Members: ${totalMembers}\n` +
                `📈 Subscription Rate: ${totalMembers > 0 ? Math.round((subscriberCount / totalMembers) * 100) : 0}%\n\n` +
                `ℹ️ Note: Statistics only include users who have interacted with the bot.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('Error in group stats callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Group registration process
    bot.action(/^register_group:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            // Verify the user is an admin of the group
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can register the group');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            if (group.isRegistered) {
                return ctx.answerCbQuery('This group is already registered');
            }

            // Start registration process
            const keyboard = {
                inline_keyboard: [
                    [{ text: '💰 Set Subscription Price', callback_data: `set_group_price:${groupId}` }],
                    [{ text: '💳 Select Payment Method', callback_data: `select_payment_method:${groupId}` }],
                    [{ text: '✅ Complete Registration', callback_data: `complete_registration:${groupId}` }]
                ]
            };

            await ctx.editMessageText(
                `🔄 *Registration for ${group.groupTitle}*\n\n` +
                `Please complete the following steps to register your group:\n\n` +
                `1️⃣ Set the subscription price for your users\n` +
                `2️⃣ Select payment method and configure settings\n` +
                `3️⃣ Complete the registration\n\n` +
                `After registration, you'll receive a 7-day free trial. Following the trial period, a monthly fee will be charged to maintain the subscription service.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (err) {
            console.error('Error handling group registration:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    bot.action(/^set_group_price:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            ctx.session = ctx.session || {}; // Ensure session is initialized
            ctx.session.awaitingPriceFor = groupId; // Set the session state

            // Add a flag to indicate if we're coming from subscription settings
            // Check if we got here from the group_subscription menu
            const callback = ctx.callbackQuery.data;
            ctx.session.fromSubscriptionSettings = callback.includes('group_subscription');

            console.log('Session updated: awaitingPriceFor set to', groupId); // Debugging log
            console.log('From subscription settings:', ctx.session.fromSubscriptionSettings);

            await ctx.answerCbQuery();
            await ctx.reply(
                `💰 *Set Subscription Price*\n\n` +
                `Please enter the monthly subscription price for users of your group.\n\n` +
                `Current price: ${group.subscriptionPrice || 'Not set'} ${group.subscriptionCurrency || 'ZAR'}\n\n` +
                `Reply with just the number (e.g., "50" for ${group.subscriptionCurrency || 'ZAR'} 50).\n\n` +
                `⚠️ IMPORTANT: Please send a new message with just the price amount.`,
                { parse_mode: 'Markdown' }
            );

        } catch (err) {
            console.error('Error in set group price callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    bot.action(/^select_payment_method:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Get available payment gateways from config file
            const paymentGatewaysConfig = require('../config/paymentGateways');
            let availableGateways = [];

            try {
                // First try to get gateways from PaymentManager if it exists
                const { PaymentManager } = require('../payment-providers');
                const paymentManager = new PaymentManager();

                const providers = Object.keys(paymentManager.providers || {});
                if (providers && providers.length > 0) {
                    // Use provider display names from config if available
                    availableGateways = providers.map(id => ({
                        id,
                        name: paymentGatewaysConfig.providerDisplayNames[id] ||
                              `💳 ${id.charAt(0).toUpperCase() + id.slice(1)}`
                    }));
                }
            } catch (error) {
                console.error('Error loading payment providers from PaymentManager:', error);
                // Continue with config file approach
            }

            // If no gateways found from PaymentManager or error occurred, use config file
            if (availableGateways.length === 0) {
                // Filter only enabled gateways from the config
                availableGateways = paymentGatewaysConfig.availableGateways
                    .filter(gateway => gateway.enabled)
                    .map(gateway => ({
                        id: gateway.id,
                        name: gateway.name
                    }));
            }

            // If still no gateways found, show an error message
            if (availableGateways.length === 0) {
                return ctx.answerCbQuery('No payment gateways are currently available');
            }

            // Build keyboard dynamically based on available gateways
            const gatewayButtons = availableGateways.map(gateway => ([{
                text: gateway.name,
                callback_data: `payment_method:${groupId}:${gateway.id}`
            }]));

            // Add back button
            gatewayButtons.push([{
                text: '◀️ Back to Registration',
                callback_data: `register_group:${groupId}`
            }]);

            const keyboard = {
                inline_keyboard: gatewayButtons
            };

            await ctx.editMessageText(
                `💵 *Select Payment Method*\n\n` +
                `Select a payment method for your group's subscribers:\n\n` +
                `Current method: ${group.paymentMethod || 'Not set'}\n\n` +
                `Each payment method requires its own configuration.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (err) {
            console.error('Error in select payment method callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    bot.action(/^payment_method:(.+):(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];
            const method = ctx.match[2];

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Update payment method
            await Group.findOneAndUpdate(
                { groupId },
                { paymentMethod: method }
            );

            // Get payment gateway configuration
            const paymentGatewaysConfig = require('../config/paymentGateways');
            const gateway = paymentGatewaysConfig.availableGateways.find(g => g.id === method);

            if (!gateway) {
                return ctx.answerCbQuery(`Payment method ${method} not found in configuration`);
            }

            // Initialize session for configuration
            ctx.session = ctx.session || {};
            ctx.session.configuringPaymentFor = {
                groupId,
                method,
                configSteps: gateway.configSteps,
                currentStepIndex: 0,
                step: gateway.configSteps[0]
            };

            // Get the configuration prompt for the first step
            const configStep = ctx.session.configuringPaymentFor.step;
            const stepConfig = paymentGatewaysConfig.configStepTemplates[configStep] || {
                prompt: `Please enter your ${configStep}`,
                helpText: ''
            };

            await ctx.answerCbQuery(`${gateway.name} selected as payment method`);
            await ctx.reply(
                `💳 *Configure ${gateway.name}*\n\n` +
                `Let's configure ${gateway.name} for your group.\n\n` +
                `Step 1/${gateway.configSteps.length}: ${stepConfig.prompt}.\n\n` +
                `${stepConfig.helpText ? `${stepConfig.helpText}\n\n` : ''}` +
                `Type /cancel at any time to cancel this configuration.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('Error in payment method selection:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    bot.action(/^complete_registration:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Check if all required settings are configured
            if (!group.subscriptionPrice) {
                return ctx.answerCbQuery('Please set a subscription price first');
            }

            // Make sure the selected payment method is properly configured
            if (group.paymentMethod) {
                const paymentGatewaysConfig = require('../config/paymentGateways');
                const gateway = paymentGatewaysConfig.availableGateways.find(g => g.id === group.paymentMethod);

                if (gateway) {
                    // Check if all required configuration steps are completed
                    const isConfigured = gateway.configSteps.every(step => {
                        // Skip passphrase check since it's optional
                        if (step === 'passphrase') return true;
                        return group.customPaymentSettings?.[group.paymentMethod]?.[step];
                    });

                    if (!isConfigured) {
                        return ctx.answerCbQuery(`Please complete the ${gateway.name} configuration`);
                    }
                }
            } else {
                return ctx.answerCbQuery('Please select a payment method');
            }

            // Calculate trial period dates
            const now = new Date();
            const trialEnd = new Date();
            trialEnd.setDate(now.getDate() + 7); // 7-day trial

            // Calculate first billing date (after trial)
            const firstBillingDate = new Date();
            firstBillingDate.setDate(now.getDate() + 7);

            // Update group as registered with trial active
            await Group.findOneAndUpdate(
                { groupId },
                {
                    isRegistered: true,
                    registrationDate: now,
                    trialActive: true,
                    trialStartDate: now,
                    trialEndDate: trialEnd,
                    feeStatus: 'pending',
                    nextFeePaymentDate: firstBillingDate,
                    // Enable subscription requirement
                    subscriptionRequired: true
                }
            );

            // Send confirmation
            await ctx.editMessageText(
                `🎉 *Registration Complete!*\n\n` +
                `Your group "${group.groupTitle}" is now registered and your 7-day free trial has started.\n\n` +
                `⏳ Trial Period: ${now.toLocaleDateString()} - ${trialEnd.toLocaleDateString()}\n` +
                `📅 First Billing Date: ${firstBillingDate.toLocaleDateString()}\n\n` +
                `*Subscription Details:*\n` +
                `- 💰 Price for Users: ${group.subscriptionPrice} ${group.subscriptionCurrency}\n` +
                `- 💳 Payment Method: ${group.paymentMethod}\n\n` +
                `You can now use /manage in your group to configure additional settings.`,
                { parse_mode: 'Markdown' }
            );

            // Send message to the group
            await ctx.telegram.sendMessage(
                groupId,
                `✅ This group has been registered for subscription services!\n\n` +
                `Members will now need to subscribe to participate in the group.` +
                `\n\n` +
                `Use /manage to configure additional settings.`,
            );
        } catch (err) {
            console.error('Error completing registration:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle welcome message text input
    // Enhanced text handler with better debugging
    bot.on('text', async (ctx) => {
        console.log('Text handler triggered');
        console.log('Session state:', JSON.stringify(ctx.session || {}));
        console.log('Message text:', ctx.message.text);

        // Skip if not expecting any input
        if (!ctx.session?.awaitingWelcomeFor && !ctx.session?.awaitingPriceFor &&
            !ctx.session?.configuringPaymentFor && !ctx.session?.awaitingTrialDaysFor) {
            console.log('No pending input expected, skipping handler');
            return next();
        }

        try {
            const messageText = ctx.message.text;

            // Handle trial duration input
            if (ctx.session?.awaitingTrialDaysFor) {
                console.log('Processing trial duration input for group:', ctx.session.awaitingTrialDaysFor);
                const groupId = ctx.session.awaitingTrialDaysFor;

                // Handle cancel command
                if (messageText.toLowerCase() === '/cancel') {
                    console.log('Trial duration update canceled');
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

            // Handle subscription price input
            if (ctx.session?.awaitingPriceFor) {
                console.log('Processing price input for group:', ctx.session.awaitingPriceFor);
                const groupId = ctx.session.awaitingPriceFor;

                // Handle cancel command
                if (messageText.toLowerCase() === '/cancel') {
                    console.log('Price update canceled');
                    delete ctx.session.awaitingPriceFor;
                    const keyboard = {
                        inline_keyboard: [[
                            { text: ctx.session.fromSubscriptionSettings ? 'Back to Subscription Settings' : 'Back to Registration', callback_data: ctx.session.fromSubscriptionSettings ? `group_subscription:${groupId}` : `register_group:${groupId}` }
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

                    const keyboard = {
                        inline_keyboard: [[
                            { text: ctx.session.fromSubscriptionSettings ? 'Back to Subscription Settings' : 'Back to Registration', callback_data: ctx.session.fromSubscriptionSettings ? `group_subscription:${groupId}` : `register_group:${groupId}` }
                        ]]
                    };

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

            // Handle welcome message text input
            if (ctx.session?.awaitingWelcomeFor) {
                const groupId = ctx.session.awaitingWelcomeFor;
                const fromManagementMenu = ctx.session.fromManagementMenu;

                // Handle cancel command
                if (messageText.toLowerCase() === '/cancel') {
                    console.log('Welcome message update canceled');
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

            // Handle payment gateway configuration
            if (ctx.session?.configuringPaymentFor) {
                const { groupId, method, step, configSteps, currentStepIndex } = ctx.session.configuringPaymentFor;

                // Handle cancel command
                if (messageText.toLowerCase() === '/cancel') {
                    delete ctx.session.configuringPaymentFor;
                    const keyboard = {
                        inline_keyboard: [[
                            { text: 'Back to Payment Settings', callback_data: `group_payment:${groupId}` }
                        ]]
                    };
                    return ctx.reply(`Payment configuration canceled.`, { reply_markup: keyboard });
                }

                // Get the gateway configuration
                const paymentGatewaysConfig = require('../config/paymentGateways');
                const gateway = paymentGatewaysConfig.availableGateways.find(g => g.id === method);

                if (!gateway) {
                    delete ctx.session.configuringPaymentFor;
                    return ctx.reply(`Payment gateway configuration not found.`);
                }

                // Create the path for storing configuration
                const configPath = `customPaymentSettings.${method}.${step}`;

                // Special handling for "skip" on optional parameters
                if (messageText.toLowerCase() === 'skip' && step === 'passphrase') {
                    // Skip this step without saving anything
                } else {
                    // Save the current step's value
                    await Group.findOneAndUpdate(
                        { groupId },
                        { $set: { [configPath]: messageText } },
                        { upsert: true }
                    );
                }

                // Check if this was the last step
                if (currentStepIndex >= configSteps.length - 1) {
                    // Configuration complete
                    delete ctx.session.configuringPaymentFor;

                    // Send back to registration menu
                    const keyboard = {
                        inline_keyboard: [[
                            { text: 'Continue Registration', callback_data: `register_group:${groupId}` }
                        ]]
                    };

                    return ctx.reply(
                        `✅ ${gateway.name} configuration complete!\n\nClick below to continue with the registration:`,
                        { reply_markup: keyboard }
                    );
                }

                // Move to the next step
                const nextStepIndex = currentStepIndex + 1;
                const nextStep = configSteps[nextStepIndex];
                ctx.session.configuringPaymentFor.currentStepIndex = nextStepIndex;
                ctx.session.configuringPaymentFor.step = nextStep;

                // Get the next step configuration
                const nextStepConfig = paymentGatewaysConfig.configStepTemplates[nextStep] || {
                    prompt: `Please enter your ${nextStep}`,
                    helpText: ''
                };

                await ctx.reply(
                    `${step.charAt(0).toUpperCase() + step.slice(1)} saved.\n\n` +
                    `Step ${nextStepIndex + 1}/${configSteps.length}: ${nextStepConfig.prompt}.\n\n` +
                    `${nextStepConfig.helpText ? `${nextStepConfig.helpText}\n\n` : ''}` +
                    `Type /cancel at any time to cancel this configuration.`
                );
                return;
            }

        } catch (err) {
            console.error('Error handling text input:', err);
            console.error('Error details:', err.stack); // Add stack trace for better debugging
            await ctx.reply('An error occurred while processing your input. Please try again.');
        }
    });

    // Subscription process callbacks
    bot.action('subscribe_init', async (ctx) => {
        const user = await User.findOne({ userId: ctx.from.id });

        if (user?.isSubscribed) {
            return ctx.answerCbQuery('You are already subscribed!');
        }

        // Get default payment method from config
        const paymentGatewaysConfig = require('../config/paymentGateways');
        const defaultGateway = paymentGatewaysConfig.availableGateways.find(g => g.default) ||
                              paymentGatewaysConfig.availableGateways[0];

        const paymentMethodName = defaultGateway?.name || 'Default';
        const paymentMethodId = defaultGateway?.id || 'default';

        const keyboard = {
            inline_keyboard: [
                [{ text: `Pay with ${paymentMethodName}`, callback_data: `pay_${paymentMethodId}` }],
                [{ text: 'Cancel', callback_data: 'subscribe_cancel' }]
            ]
        };

        await ctx.editMessageText('Choose your payment method:', { reply_markup: keyboard });
    });

    bot.action('subscribe_cancel', async (ctx) => {
        await ctx.editMessageText('Subscription process cancelled. Use /subscribe to try again.');
    });

    // Group-specific subscription process
    bot.action(/^subscribe_to_group:(.+)$/, async (ctx) => {
        try {
            const groupId = parseInt(ctx.match[1]);

            // Get group details
            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found');
            }

            // Check if the group is registered and has subscription enabled
            if (!group.isRegistered || !group.subscriptionRequired) {
                return ctx.answerCbQuery('This group does not require subscription');
            }

            // Check if user is already subscribed to this group
            const user = await User.findOne({ userId: ctx.from.id });
            const existingSubscription = user?.groupSubscriptions?.find(
                s => s.groupId === groupId && s.isSubscribed && s.subscriptionExpiresAt > new Date()
            );

            if (existingSubscription) {
                return ctx.answerCbQuery('You are already subscribed to this group');
            }

            // Check if the group has a payment method configured
            if (!group.paymentMethod) {
                return ctx.answerCbQuery('No payment method configured for this group');
            }

            // Set up payment button based on the group's configured payment method
            const paymentCallback = `pay_group_${group.paymentMethod}:${groupId}`;

            // Get display name for the payment method
            const paymentGatewaysConfig = require('../config/paymentGateways');
            const gateway = paymentGatewaysConfig.availableGateways.find(g => g.id === group.paymentMethod);
            const paymentMethodName = gateway?.name || group.paymentMethod.charAt(0).toUpperCase() + group.paymentMethod.slice(1);

            const keyboard = {
                inline_keyboard: [
                    [{
                        text: `Pay with ${paymentMethodName}`,
                        callback_data: paymentCallback
                    }],
                    [{ text: 'Cancel', callback_data: 'subscribe_cancel' }]
                ]
            };

            await ctx.editMessageText(
                `Subscribe to ${group.groupTitle}\n\n` +
                `Member Subscription Price: ${group.subscriptionPrice} ${group.subscriptionCurrency} per month\n\n` +
                `Please select your payment method:`,
                { reply_markup: keyboard }
            );
        } catch (err) {
            console.error('Error in subscribe_to_group callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle payment for a specific group - dynamic handler based on payment method
    bot.action(/^pay_group_([^:]+):(.+)$/, async (ctx) => {
        try {
            const paymentMethod = ctx.match[1];
            const groupId = parseInt(ctx.match[2]);

            // Get group details
            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found');
            }

            // Make sure the group has necessary payment information configured
            if (!group.paymentMethod ||
                !group.customPaymentSettings?.[group.paymentMethod]) {
                return ctx.answerCbQuery('Payment method not properly configured');
            }

            try {
                // Access the payment manager
                const { PaymentManager } = require('../payment-providers');
                const paymentManager = new PaymentManager();

                // Get the provider based on the group's payment method
                const provider = paymentManager.getProvider(group.paymentMethod);

                if (!provider) {
                    return ctx.answerCbQuery(`Payment provider ${group.paymentMethod} is not available`);
                }

                // Create payment data
                const paymentData = {
                    amount: group.subscriptionPrice,
                    itemName: `Subscription to ${group.groupTitle}`,
                    itemDescription: `Monthly subscription payment for ${group.groupTitle}`,
                    userId: ctx.from.id,
                    groupId: group.groupId,
                    returnUrl: `https://t.me/${ctx.me.username}?start=payment_success_${groupId}`,
                    cancelUrl: `https://t.me/${ctx.me.username}?start=payment_cancel_${groupId}`,
                    notifyUrl: process.env.PAYMENT_NOTIFY_URL || process.env[`${group.paymentMethod.toUpperCase()}_NOTIFY_URL`],
                    providerConfig: group.customPaymentSettings[group.paymentMethod]
                };

                // Generate payment URL using the provider
                const paymentUrl = provider.generatePaymentUrl(
                    paymentData.userId,
                    paymentData.amount,
                    paymentData.itemName,
                    paymentData.itemDescription,
                    paymentData.providerConfig
                );

                const keyboard = {
                    inline_keyboard: [
                        [{ text: 'Pay Now', url: paymentUrl }],
                        [{ text: 'Cancel', callback_data: 'subscribe_cancel' }]
                    ]
                };

                await ctx.editMessageText(
                    `Complete your payment for ${group.groupTitle}\n\n` +
                    `Amount: ${group.subscriptionPrice} ${group.subscriptionCurrency}\n\n` +
                    `Click the button below to complete payment:`,
                    { reply_markup: keyboard }
                );
            } catch (err) {
                console.error(`Error generating payment URL: ${err.message}`);
                await ctx.answerCbQuery('Unable to generate payment URL. Please try again later.');
            }
        } catch (err) {
            console.error(`Error in pay_group_${ctx.match[1]} callback:`, err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle group management from private chat
    bot.action(/^manage_group:(.+)$/, async (ctx) => {
        try {
            const groupId = parseInt(ctx.match[1]);

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can manage this group');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Show different options based on registration status
            const keyboard = {
                inline_keyboard: []
            };

            if (!group.isRegistered) {
                keyboard.inline_keyboard.push([
                    { text: '🔄 Register Group', callback_data: `register_group:${groupId}` }
                ]);
            } else {
                // Group is registered, show management options
                keyboard.inline_keyboard = [
                    [{ text: '💰 Subscription Settings', callback_data: `group_subscription:${groupId}` }],
                    [{ text: '💳 Payment Settings', callback_data: `group_payment:${groupId}` }],
                    [{ text: '📊 View Statistics', callback_data: `group_stats:${groupId}` }],
                    [{ text: `${group.subscriptionRequired ? '🔴 Disable' : '🟢 Enable'} Subscription`, callback_data: `group_toggle:${groupId}` }],
                    [{ text: '✏️ Edit Welcome Message', callback_data: `group_welcome:${groupId}` }]
                ];

                // If in trial, add trial info
                if (group.trialActive) {
                    const trialEnd = new Date(group.trialEndDate);
                    const now = new Date();
                    const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

                    keyboard.inline_keyboard.unshift([
                        { text: `⏳ Trial Period: ${daysLeft} days left`, callback_data: `trial_info:${groupId}` }
                    ]);
                }
            }

            // Add back button
            keyboard.inline_keyboard.push([
                { text: '◀️ Back to Groups List', callback_data: 'list_groups' }
            ]);

            let statusEmoji = group.isRegistered ? '✅' : '❌';
            let subscriptionEmoji = group.subscriptionRequired ? '🔒' : '🔓';

            await ctx.editMessageText(
                `🏢 *Group Management: ${group.groupTitle}*\n\n` +
                `Registration: ${statusEmoji} ${group.isRegistered ? 'Registered' : 'Not Registered'}\n` +
                `Subscription: ${subscriptionEmoji} ${group.subscriptionRequired ? 'Required' : 'Not Required'}\n` +
                (group.subscriptionPrice ? `💰 Member Subscription Price: ${group.subscriptionPrice} ${group.subscriptionCurrency}\n` : '') +
                (group.paymentMethod ? `💳 Payment Method: ${group.paymentMethod}\n` : '') +
                (group.trialActive ? `\n⏳ Trial active until: ${new Date(group.trialEndDate).toLocaleDateString()}\n` : '') +
                `\nSelect an option to manage this group:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (err) {
            console.error('Error in manage_group callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle going back to groups list
    bot.action('list_groups', async (ctx) => {
        try {
            const userId = ctx.from.id;

            // Find all groups where the user is an admin
            const adminGroups = await Group.find({ adminUsers: userId });

            if (!adminGroups || adminGroups.length === 0) {
                await ctx.answerCbQuery();
                return ctx.editMessageText(
                    'You don\'t have admin rights for any groups in my database. Add me to a group as an admin to get started.'
                );
            }

            // Create keyboard with admin groups
            const keyboard = {
                inline_keyboard: adminGroups.map(group => ([{
                    text: `${group.groupTitle} ${group.isRegistered ? '✅' : '❌'}`,
                    callback_data: `manage_group:${group.groupId}`
                }]))
            };

            await ctx.answerCbQuery();
            await ctx.editMessageText(
                '*Your Groups*\n\n' +
                'Select a group to manage:\n' +
                '(✅ = registered, ❌ = not registered)',
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (err) {
            console.error('Error in list_groups callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle trial info display
    bot.action(/^trial_info:(.+)$/, async (ctx) => {
        try {
            const groupId = parseInt(ctx.match[1]);

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can view trial info');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            if (!group.trialActive) {
                return ctx.answerCbQuery('Trial period has ended');
            }

            const trialEnd = new Date(group.trialEndDate);
            const now = new Date();
            const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

            await ctx.answerCbQuery(
                `Trial ends on ${trialEnd.toLocaleDateString()}. ${daysLeft} days remaining.`,
                { show_alert: true }
            );
        } catch (err) {
            console.error('Error in trial_info callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle subscription settings
    bot.action(/^group_subscription:(.+)$/, async (ctx) => {
        try {
            const groupId = parseInt(ctx.match[1]);

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            const keyboard = {
                inline_keyboard: [
                    [{ text: '💰 Set Price', callback_data: `set_group_price:${groupId}` }],
                    [{ text: '◀️ Back to Group Management', callback_data: `manage_group:${groupId}` }]
                ]
            };

            await ctx.editMessageText(
                `💰 *Subscription Settings for ${group.groupTitle}*\n\n` +
                `Current Price: ${group.subscriptionPrice || 'Not set'} ${group.subscriptionCurrency || 'ZAR'}\n\n` +
                `Select an option to configure:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (err) {
            console.error('Error in group_subscription callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle payment settings
    bot.action(/^group_payment:(.+)$/, async (ctx) => {
        try {
            const groupId = parseInt(ctx.match[1]);

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Get available payment gateways from config file
            const paymentGatewaysConfig = require('../config/paymentGateways');

            // Create buttons for each enabled payment gateway
            const gatewayButtons = paymentGatewaysConfig.availableGateways
                .filter(gateway => gateway.enabled)
                .map(gateway => ([{
                    text: `💳 Configure ${gateway.name}`,
                    callback_data: `payment_method:${groupId}:${gateway.id}`
                }]));

            // Add back button
            gatewayButtons.push([{ text: '◀️ Back to Group Management', callback_data: `manage_group:${groupId}` }]);

            const keyboard = {
                inline_keyboard: gatewayButtons
            };

            await ctx.editMessageText(
                `💳 *Payment Settings for ${group.groupTitle}*\n\n` +
                `Current Method: ${group.paymentMethod || 'Not set'}\n\n` +
                `Select a payment method to configure:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (err) {
            console.error('Error in group_payment callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle group toggle from management menu
    bot.action(/^group_toggle:(.+)$/, async (ctx) => {
        try {
            const groupId = parseInt(ctx.match[1]);

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Can't enable subscription if group isn't registered
            if (!group.isRegistered && !group.subscriptionRequired) {
                return ctx.answerCbQuery('Please register the group first');
            }

            const wasSubscriptionRequired = group.subscriptionRequired;
            const newSubscriptionRequired = !wasSubscriptionRequired;

            // Set monetization date when enabling subscription for the first time or after it was disabled
            const updateData = { subscriptionRequired: newSubscriptionRequired };

            // If we're enabling subscription, set monetization date
            if (newSubscriptionRequired && !wasSubscriptionRequired) {
                updateData.monetizationDate = new Date();
                console.log(`Setting monetization date for group ${groupId}`);
            }            await Group.findOneAndUpdate(
                { groupId },
                updateData
            );

            await ctx.answerCbQuery(
                `Subscription requirement ${newSubscriptionRequired ? '✅ enabled' : '❌ disabled'}`
            );

            // If subscription was just enabled, notify users in the group
            if (newSubscriptionRequired && !wasSubscriptionRequired) {
                try {
                    // Import the notification utility
                    const { notifyUsersAboutMonetization } = require('../utils/notificationUtils');

                    // Send notifications to existing users about monetization with 24-hour grace period
                    await notifyUsersAboutMonetization(ctx, groupId, group);
                } catch (notifyError) {
                    console.error('Error sending monetization notifications:', notifyError);
                }
            }

            // Refresh the settings view by directly rendering it instead of using trigger
            const updatedGroup = await Group.findOne({ groupId });
            if (!updatedGroup) {
                return ctx.editMessageText('Group not found in database');
            }

            let statusEmoji = updatedGroup.isRegistered ? '✅' : '❌';
            let subscriptionEmoji = updatedGroup.subscriptionRequired ? '🔒' : '🔓';

            const keyboard = {
                inline_keyboard: [
                    [{ text: '💰 Subscription Settings', callback_data: `group_subscription:${groupId}` }],
                    [{ text: '💳 Payment Settings', callback_data: `group_payment:${groupId}` }],
                    [{ text: '📊 View Statistics', callback_data: `group_stats:${groupId}` }],
                    [{ text: `${updatedGroup.subscriptionRequired ? '🔴 Disable' : '🟢 Enable'} Subscription`, callback_data: `group_toggle:${groupId}` }],
                    [{ text: '✏️ Edit Welcome Message', callback_data: `group_welcome:${groupId}` }],
                    { text: '◀️ Back to Groups List', callback_data: 'list_groups' }
                ]
            };

            await ctx.editMessageText(
                `🏢 *Group Management: ${updatedGroup.groupTitle}*\n\n` +
                `Registration: ${statusEmoji} ${updatedGroup.isRegistered ? 'Registered' : 'Not Registered'}\n` +
                `Subscription: ${subscriptionEmoji} ${updatedGroup.subscriptionRequired ? 'Required' : 'Not Required'}\n` +
                (updatedGroup.subscriptionPrice ? `💰 Price: ${updatedGroup.subscriptionPrice} ${updatedGroup.subscriptionCurrency}\n` : '') +
                (updatedGroup.paymentMethod ? `💳 Payment Method: ${updatedGroup.paymentMethod}\n` : '') +
                (updatedGroup.trialActive ? `\n⏳ Trial active until: ${new Date(updatedGroup.trialEndDate).toLocaleDateString()}\n` : '') +
                `\nSelect an option to manage this group:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch ( err) {
            console.error('Error in group_toggle callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle welcome message editing from management menu
    bot.action(/^group_welcome:(.+)$/, async (ctx) => {
        try {
            const groupId = parseInt(ctx.match[1]);

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            ctx.session = ctx.session || {};
            ctx.session.awaitingWelcomeFor = groupId;
            ctx.session.fromManagementMenu = true;

            await ctx.answerCbQuery();
            await ctx.reply(
                `✏️ *Set Welcome Message*\n\n` +
                `Please send the new welcome message for ${group.groupTitle}.\n\n` +
                `Current welcome message: ${group.welcomeMessage || 'Default system message'}\n\n` +
                `Reply with your new welcome text, or send /cancel to keep the current message.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('Error in group_welcome callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle stats from management menu
    bot.action(/^group_stats:(.+)$/, async (ctx) => {
        try {
            const groupId = parseInt(ctx.match[1]);

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can view statistics');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Get detailed statistics
            const subscriberCount = await User.countDocuments({
                'groupSubscriptions': {
                    $elemMatch: {
                        groupId: groupId,
                        isSubscribed: true,
                        subscriptionExpiresAt: { $gt: new Date() }
                    }
                }
            });

            const totalMembers = await User.countDocuments({
                'joinedGroups.groupId': groupId
            });

            // Calculate revenue stats if possible
            let monthlyRevenue = 0;
            let paymentsCount = 0;

            try {
                // Check if Payment model exists before using it
                if (typeof Payment !== 'undefined') {
                    const payments = await Payment.find({
                        'groupId': groupId,
                        'status': 'completed',
                        'timestamp': { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
                    });

                    if (payments && payments.length > 0) {
                        monthlyRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);
                        paymentsCount = payments.length;
                    }
                }
            } catch (paymentErr) {
                console.error('Error fetching payment data:', paymentErr);
                // Continue without payment data
            }

            const keyboard = {
                inline_keyboard: [[
                    { text: '« Back to Group Management', callback_data: `manage_group:${groupId}` }
                ]]
            };

            await ctx.editMessageText(
                `📊 *Statistics for ${group.groupTitle}*\n\n` +
                `*Subscription Status:* ${group.subscriptionRequired ? '✅ Required' : '❌ Not Required'}\n` +
                `*👥 Active Subscribers:* ${subscriberCount}\n` +
                `*👥 Total Members:* ${totalMembers}\n` +
                `*📈 Subscription Rate:* ${totalMembers > 0 ? Math.round((subscriberCount / totalMembers) * 100) : 0}%\n\n` +
                `*💰 Payment Statistics (30 days):*\n` +
                `- Total Revenue: ${monthlyRevenue} ${group.subscriptionCurrency || 'ZAR'}\n` +
                `- Number of Payments: ${paymentsCount}\n\n` +
                `_Note: Statistics only include users who have interacted with the bot._`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );
        } catch (err) {
            console.error('Error in group_stats callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Add group configuration callbacks
    const handleGroupConfigCallbacks = async (ctx) => {
        try {
            const callbackData = ctx.callbackQuery.data;

            // Handle configure_group callback
            if (callbackData.startsWith('configure_group:')) {
                const groupId = callbackData.split(':')[1];

                // Get current settings
                const group = await Group.findOne({ groupId });
                if (!group) {
                    return ctx.answerCbQuery('Group not found in database');
                }

                const restrictSending = group.restrictNonSubsSending || false;
                const restrictViewing = group.restrictNonSubsViewing || false;

                // Add your group configuration logic here
                return ctx.editMessageText('⚙️ *Group Configuration Options*:', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔒 Set Subscriptions as Required', callback_data: `set_group_sub:${groupId}:required` }],
                            [{ text: '🔓 Set Subscriptions as Optional', callback_data: `set_group_sub:${groupId}:optional` }],
                            [{ text: `${restrictSending ? '✅ Allow' : '🚫 Restrict'} Non-subscribers Sending Messages`, callback_data: `set_group_restrict_sending:${groupId}:${!restrictSending}` }],
                            [{ text: `${restrictViewing ? '✅ Allow' : '🚫 Restrict'} Non-subscribers Viewing Messages`, callback_data: `set_group_restrict_viewing:${groupId}:${!restrictViewing}` }],
                            [{ text: `${group.userTrialEnabled ? '🔄 Update' : '🆕 Enable'} User Trial Period`, callback_data: `set_user_trial:${groupId}` }],
                            [{ text: '◀️ Back', callback_data: `view_group_settings:${groupId}` }]
                        ]
                    }
                });
            }

            // Handle view_group_settings callback
            if (callbackData.startsWith('view_group_settings:')) {
                const groupId = callbackData.split(':')[1];

                // Get group settings from database
                const group = await Group.findOne({ groupId });
                if (!group) {
                    return ctx.answerCbQuery('Group not found in database');
                }


                return ctx.editMessageText(
                    '📋 *Current Group Settings*:\n\n' +
                    `• Subscription is: ${group.subscriptionRequired ? '🔒 Required' : '🔓 Optional'}\n` +
                    `• Restrict Non-subscribers Sending Messages: ${group.restrictNonSubsSending ? '🚫 Yes' : '✅ No'}\n` +
                    `• Restrict Non-subscribers Viewing Messages: ${group.restrictNonSubsViewing ? '🚫 Yes' : '✅ No'}\n`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⚙️ Configure Settings', callback_data: `configure_group:${groupId}` }]
                            ]
                        }
                    }
                );
            }

            // Handle set_group_sub callback
            if (callbackData.startsWith('set_group_sub:')) {
                const parts = callbackData.split(':');
                const groupId = parts[1];
                const setting = parts[2];

                // Logic to save this setting to database would go here

                await ctx.answerCbQuery(`Group subscription set to ${setting}`);
                return ctx.editMessageText(`✅ Group setting updated: Subscription is now ${setting}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ Back to Settings', callback_data: `view_group_settings:${groupId}` }]
                        ]
                    }
                });
            }
        } catch (err) {
            console.error('Error in group configuration callback:', err);
            try {
                await ctx.answerCbQuery('An error occurred');
            } catch (cbError) {
                console.error('Error sending callback answer:', cbError);
            }
        }
    };

    bot.action(/configure_group:|view_group_settings:|set_group_sub:/, handleGroupConfigCallbacks);

    // Add handlers for restricting non-subscribers from sending messages
    bot.action(/^set_group_restrict_sending:(.+):(.+)$/, async (ctx) => {
        try {
            const parts = ctx.callbackQuery.data.split(':');
            const groupId = parts[1];
            const restrictSending = parts[2] === 'true';

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            // Update the setting
            await Group.findOneAndUpdate(
                { groupId },
                { restrictNonSubsSending: restrictSending }
            );

            await ctx.answerCbQuery(
                `${restrictSending ? 'Only subscribers can now send messages' : 'All members can now send messages'}`
            );

            // Refresh the settings view by directly rendering it instead of using trigger
            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.editMessageText('Group not found in database');
            }

            // Get the updated restrictions
            const updatedRestrictSending = group.restrictNonSubsSending || false;
            const restrictViewing = group.restrictNonSubsViewing || false;

            return ctx.editMessageText('⚙️ *Group Configuration Options*:', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔒 Set Subscriptions as Required', callback_data: `set_group_sub:${groupId}:required` }],
                        [{ text: '🔓 Set Subscriptions as Optional', callback_data: `set_group_sub:${groupId}:optional` }],
                        [{ text: `${updatedRestrictSending ? '✅ Allow' : '🚫 Restrict'} Non-subscribers Sending Messages`, callback_data: `set_group_restrict_sending:${groupId}:${!updatedRestrictSending}` }],
                        [{ text: `${restrictViewing ? '✅ Allow' : '🚫 Restrict'} Non-subscribers Viewing Messages`, callback_data: `set_group_restrict_viewing:${groupId}:${!restrictViewing}` }],
                        [{ text: `${group.userTrialEnabled ? '🔄 Update' : '🆕 Enable'} User Trial Period`, callback_data: `set_user_trial:${groupId}` }],
                        [{ text: '◀️ Back', callback_data: `view_group_settings:${groupId}` }]
                    ]
                }
            });
        } catch (err) {
            console.error('Error updating message sending restriction setting:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Add handlers for restricting non-subscribers from viewing messages
    bot.action(/^set_group_restrict_viewing:(.+):(.+)$/, async (ctx) => {
        try {
            const parts = ctx.callbackQuery.data.split(':');
            const groupId = parts[1];
            const restrictViewing = parts[2] === 'true';

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify settings');
            }

            // Update the setting
            await Group.findOneAndUpdate(
                { groupId },
                { restrictNonSubsViewing: restrictViewing }
            );

            await ctx.answerCbQuery(
                `${restrictViewing ? 'Only subscribers can now view messages' : 'All members can now view messages'}`
            );

            // Refresh the settings view by directly rendering it instead of using trigger
            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.editMessageText('Group not found in database');
            }

            // Get the updated restrictions
            const restrictSending = group.restrictNonSubsSending || false;
            const updatedRestrictViewing = group.restrictNonSubsViewing || false;

            return ctx.editMessageText('⚙️ *Group Configuration Options*:', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔒 Set Subscriptions as Required', callback_data: `set_group_sub:${groupId}:required` }],
                        [{ text: '🔓 Set Subscriptions as Optional', callback_data: `set_group_sub:${groupId}:optional` }],
                        [{ text: `${restrictSending ? '✅ Allow' : '🚫 Restrict'} Non-subscribers Sending Messages`, callback_data: `set_group_restrict_sending:${groupId}:${!restrictSending}` }],
                        [{ text: `${updatedRestrictViewing ? '✅ Allow' : '🚫 Restrict'} Non-subscribers Viewing Messages`, callback_data: `set_group_restrict_viewing:${groupId}:${!updatedRestrictViewing}` }],
                        [{ text: `${group.userTrialEnabled ? '🔄 Update' : '🆕 Enable'} User Trial Period`, callback_data: `set_user_trial:${groupId}` }],
                        [{ text: '◀️ Back', callback_data: `view_group_settings:${groupId}` }]
                    ]
                }
            });
        } catch (err) {
            console.error('Error updating message viewing restriction setting:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Add handler for user trial settings
    bot.action(/^set_user_trial:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify trial settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Show current trial settings and options to modify
            await ctx.editMessageText(
                `🔄 *User Trial Period Settings*\n\n` +
                `When new users join your group, they can receive a free trial period before needing to subscribe.\n\n` +
                `Current status: ${group.userTrialEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                (group.userTrialEnabled ? `Trial duration: ${group.userTrialDays} days\n\n` : '\n') +
                `What would you like to do?`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: group.userTrialEnabled ? '🔄 Change Trial Duration' : '⏱️ Set Trial Duration', callback_data: `set_trial_duration:${groupId}` }],
                            [{ text: group.userTrialEnabled ? '🔴 Disable User Trial' : '🟢 Enable User Trial', callback_data: `toggle_user_trial:${groupId}` }],
                            [{ text: '◀️ Back to Settings', callback_data: `configure_group:${groupId}` }]
                        ]
                    }
                }
            );

        } catch (err) {
            console.error('Error in set_user_trial callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handler to toggle user trial on/off
    bot.action(/^toggle_user_trial:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify trial settings');
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found in database');
            }

            // Toggle the trial setting
            const newStatus = !group.userTrialEnabled;

            await Group.findOneAndUpdate(
                { groupId },
                { userTrialEnabled: newStatus }
            );

            await ctx.answerCbQuery(
                `User trial period ${newStatus ? 'enabled' : 'disabled'}`
            );

            // Refresh the trial settings view
            const updatedGroup = await Group.findOne({ groupId });

            await ctx.editMessageText(
                `🔄 *User Trial Period Settings*\n\n` +
                `When new users join your group, they can receive a free trial period before needing to subscribe.\n\n` +
                `Current status: ${updatedGroup.userTrialEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                (updatedGroup.userTrialEnabled ? `Trial duration: ${updatedGroup.userTrialDays} days\n\n` : '\n') +
                `What would you like to do?`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: updatedGroup.userTrialEnabled ? '🔄 Change Trial Duration' : '⏱️ Set Trial Duration', callback_data: `set_trial_duration:${groupId}` }],
                            [{ text: updatedGroup.userTrialEnabled ? '🔴 Disable User Trial' : '🟢 Enable User Trial', callback_data: `toggle_user_trial:${groupId}` }],
                            [{ text: '◀️ Back to Settings', callback_data: `configure_group:${groupId}` }]
                        ]
                    }
                }
            );

        } catch (err) {
            console.error('Error toggling user trial:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handler for setting trial duration
    bot.action(/^set_trial_duration:(.+)$/, async (ctx) => {
        try {
            const groupId = ctx.match[1];

            // Verify admin
            if (!await verifyAdmin(ctx, groupId)) {
                return ctx.answerCbQuery('Only group administrators can modify trial settings');
            }

            // Initialize session
            ctx.session = ctx.session || {};
            ctx.session.awaitingTrialDaysFor = groupId;

            await ctx.answerCbQuery();
            await ctx.reply(
                `⏱️ *Set Trial Duration*\n\n` +
                `Please enter the number of days for the user trial period (1-30).\n\n` +
                `Reply with just the number (e.g., "7" for 7 days).\n\n` +
                `Send /cancel to cancel this operation.`,
                { parse_mode: 'Markdown' }
            );

        } catch (err) {
            console.error('Error in set_trial_duration callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });
};

module.exports = { register };
