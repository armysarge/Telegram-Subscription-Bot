const User = require('../models/user');
const Group = require('../models/group');

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
    // Admin dashboard callbacks
    bot.action('admin_toggle', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.answerCbQuery('Not authorized');
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: 'Enable Subscription', callback_data: 'toggle_on' }],
                [{ text: 'Disable Subscription', callback_data: 'toggle_off' }]
            ]
        };

        await ctx.editMessageText('Choose an option:', { reply_markup: keyboard });
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
        const message = 'Subscription Statistics:\n\n'
            + `Total Users: ${totalUsers}\n`
            + `Active Subscribers: ${totalSubscribed}\n`
            + `Subscription Rate: ${((totalSubscribed / totalUsers) * 100).toFixed(1)}%`;

        await ctx.editMessageText(message);
    });

    bot.action('admin_subscription', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.answerCbQuery('Not authorized');
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: 'Set Price', callback_data: 'set_price' }],
                [{ text: 'Set Duration', callback_data: 'set_duration' }],
                [{ text: 'Back to Admin Menu', callback_data: 'admin_back' }]
            ]
        };

        await ctx.editMessageText('Subscription Settings:', { reply_markup: keyboard });
    });

    bot.action('admin_payment', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.answerCbQuery('Not authorized');
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: 'Configure PayFast', callback_data: 'config_payfast' }],
                [{ text: 'Back to Admin Menu', callback_data: 'admin_back' }]
            ]
        };

        await ctx.editMessageText('Payment Settings:', { reply_markup: keyboard });
    });

    bot.action('admin_back', async (ctx) => {
        const { isAdmin } = ctx.state;
        if (!isAdmin) {
            return ctx.answerCbQuery('Not authorized');
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: 'Toggle Subscription', callback_data: 'admin_toggle' }],
                [{ text: 'Set Welcome Message', callback_data: 'admin_welcome' }],
                [{ text: 'View Stats', callback_data: 'admin_stats' }],
                [{ text: 'Configure Subscription', callback_data: 'admin_subscription' }],
                [{ text: 'Configure Payment', callback_data: 'admin_payment' }]
            ]
        };

        await ctx.editMessageText('Admin Dashboard:', { reply_markup: keyboard });
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
                `Group Management\n\n` +
                `Current Settings:\n` +
                `- Subscription Required: ${newStatus ? 'Yes ✅' : 'No ❌'}\n` +
                `- Welcome Message: ${group.welcomeMessage ? 'Custom' : 'Default'}\n\n` +
                'Use these commands to manage your group:\n' +
                '/admin_toggle - Toggle subscription requirement\n' +
                '/admin_welcome [message] - Set welcome message\n' +
                '/admin_stats - View statistics',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: newStatus ? 'Disable Subscription' : 'Enable Subscription', callback_data: `group:toggle:${groupId}` }],
                            [{ text: 'Set Welcome Message', callback_data: `group:welcome:${groupId}` }],
                            [{ text: 'View Statistics', callback_data: `group:stats:${groupId}` }]
                        ]
                    }
                }
            );

            await ctx.answerCbQuery(`Subscription requirement ${newStatus ? 'enabled' : 'disabled'}`);
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

            await ctx.answerCbQuery();
            await ctx.reply(
                `Please send the new welcome message for your group.\n\n` +
                `Current welcome message: ${group.welcomeMessage || 'Default system message'}\n\n` +
                `Reply with your new welcome text, or send /cancel to keep the current message.`
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
                `Group Statistics\n\n` +
                `Subscription Status: ${group.subscriptionRequired ? 'Required ✅' : 'Not Required ❌'}\n` +
                `Subscribers: ${subscriberCount}\n` +
                `Total Members: ${totalMembers}\n` +
                `Subscription Rate: ${totalMembers > 0 ? Math.round((subscriberCount / totalMembers) * 100) : 0}%\n\n` +
                `Note: Statistics only include users who have interacted with the bot.`
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
                    [{ text: 'Set Subscription Price', callback_data: `set_group_price:${groupId}` }],
                    [{ text: 'Select Payment Method', callback_data: `select_payment_method:${groupId}` }],
                    [{ text: 'Complete Registration', callback_data: `complete_registration:${groupId}` }]
                ]
            };

            await ctx.editMessageText(
                `*Registration for ${group.groupTitle}*\n\n` +
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

            ctx.session = ctx.session || {};
            ctx.session.awaitingPriceFor = groupId;

            await ctx.answerCbQuery();
            await ctx.reply(
                `Please enter the monthly subscription price for users of your group.\n\n` +
                `Current price: ${group.subscriptionPrice || 'Not set'} ${group.subscriptionCurrency || 'ZAR'}\n\n` +
                `Reply with just the number (e.g., "50" for ${group.subscriptionCurrency || 'ZAR'} 50).`
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

            const keyboard = {
                inline_keyboard: [
                    [{ text: 'PayFast', callback_data: `payment_method:${groupId}:payfast` }],
                    // Add other payment methods here in the future
                    [{ text: '« Back to Registration', callback_data: `register_group:${groupId}` }]
                ]
            };

            await ctx.editMessageText(
                `Select a payment method for your group's subscribers:\n\n` +
                `Current method: ${group.paymentMethod || 'Not set'}\n\n` +
                `Each payment method requires its own configuration.`,
                { reply_markup: keyboard }
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

            // If method is PayFast, prompt for merchant details
            if (method === 'payfast') {
                ctx.session = ctx.session || {};
                ctx.session.configuringPaymentFor = {
                    groupId,
                    step: 'merchant_id'
                };

                await ctx.answerCbQuery('PayFast selected as payment method');
                await ctx.reply(
                    `Let's configure PayFast for your group.\n\n` +
                    `Step 1/3: Please enter your PayFast Merchant ID.\n\n` +
                    `If you don't have a PayFast account, you can sign up at https://www.payfast.co.za`
                );
            } else {
                // For future payment methods
                await ctx.answerCbQuery(`${method} selected as payment method`);
                await ctx.reply(`${method} configuration will be implemented soon.`);
            }
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

            // For PayFast, make sure settings exist
            if (group.paymentMethod === 'payfast') {
                if (!group.customPaymentSettings?.payfast?.merchantId ||
                    !group.customPaymentSettings?.payfast?.merchantKey) {
                    return ctx.answerCbQuery('Please complete the PayFast configuration');
                }
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
                `Trial Period: ${now.toLocaleDateString()} - ${trialEnd.toLocaleDateString()}\n` +
                `First Billing Date: ${firstBillingDate.toLocaleDateString()}\n\n` +
                `*Subscription Details:*\n` +
                `- Price for Users: ${group.subscriptionPrice} ${group.subscriptionCurrency}\n` +
                `- Payment Method: ${group.paymentMethod}\n\n` +
                `You can now use /manage_this_group in your group to configure additional settings.`,
                { parse_mode: 'Markdown' }
            );

            // Send message to the group
            await ctx.telegram.sendMessage(
                groupId,
                `✅ This group has been registered for subscription services!\n\n` +
                `Members will now need to subscribe to participate in the group.`
            );
        } catch (err) {
            console.error('Error completing registration:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle welcome message text input
    bot.on('text', async (ctx) => {
        // Skip if we're not expecting a welcome message
        if (!ctx.session?.awaitingWelcomeFor) return;

        const messageText = ctx.message.text;
        const groupId = ctx.session.awaitingWelcomeFor;

        // Handle cancel command
        if (messageText === '/cancel') {
            delete ctx.session.awaitingWelcomeFor;
            return ctx.reply('Welcome message update canceled.');
        }

        try {
            await Group.findOneAndUpdate(
                { groupId: groupId },
                { welcomeMessage: messageText }
            );

            delete ctx.session.awaitingWelcomeFor;
            await ctx.reply('Welcome message updated successfully!');
        } catch (err) {
            console.error('Error saving welcome message:', err);
            await ctx.reply('Failed to update welcome message. Please try again.');
        }
    });

    // Handle subscription price input
    bot.on('text', async (ctx) => {
        // Handle welcome message updates (existing code)
        if (ctx.session?.awaitingWelcomeFor) {
            const messageText = ctx.message.text;
            const groupId = ctx.session.awaitingWelcomeFor;

            // Handle cancel command
            if (messageText === '/cancel') {
                delete ctx.session.awaitingWelcomeFor;
                return ctx.reply('Welcome message update canceled.');
            }

            try {
                await Group.findOneAndUpdate(
                    { groupId: groupId },
                    { welcomeMessage: messageText }
                );

                delete ctx.session.awaitingWelcomeFor;
                await ctx.reply('Welcome message updated successfully!');
            } catch (err) {
                console.error('Error saving welcome message:', err);
                await ctx.reply('Failed to update welcome message. Please try again.');
            }
            return;
        }

        // Handle subscription price input
        if (ctx.session?.awaitingPriceFor) {
            const messageText = ctx.message.text;
            const groupId = ctx.session.awaitingPriceFor;

            // Validate price
            const price = parseFloat(messageText);
            if (isNaN(price) || price <= 0) {
                return ctx.reply('Please enter a valid price (a positive number).');
            }

            try {
                await Group.findOneAndUpdate(
                    { groupId },
                    {
                        subscriptionPrice: price,
                        subscriptionCurrency: 'ZAR' // Default to ZAR, can make this configurable
                    }
                );

                delete ctx.session.awaitingPriceFor;

                // Send back to registration menu
                const keyboard = {
                    inline_keyboard: [
                        [{ text: 'Back to Registration', callback_data: `register_group:${groupId}` }]
                    ]
                };

                await ctx.reply(
                    `Subscription price set to ${price} ZAR successfully!`,
                    { reply_markup: keyboard }
                );
            } catch (err) {
                console.error('Error saving subscription price:', err);
                await ctx.reply('Failed to update subscription price. Please try again.');
            }
            return;
        }

        // Handle PayFast configuration
        if (ctx.session?.configuringPaymentFor) {
            const messageText = ctx.message.text;
            const { groupId, step } = ctx.session.configuringPaymentFor;

            try {
                if (step === 'merchant_id') {
                    // Update merchant ID and move to next step
                    await Group.findOneAndUpdate(
                        { groupId },
                        {
                            'customPaymentSettings.payfast.merchantId': messageText
                        }
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
                        {
                            'customPaymentSettings.payfast.merchantKey': messageText
                        }
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
                            {
                                'customPaymentSettings.payfast.passPhrase': messageText
                            }
                        );
                    }

                    // Configuration complete
                    delete ctx.session.configuringPaymentFor;

                    // Send back to registration menu
                    const keyboard = {
                        inline_keyboard: [
                            [{ text: 'Back to Registration', callback_data: `register_group:${groupId}` }]
                        ]
                    };

                    await ctx.reply(
                        `PayFast configuration complete! Your users will now be able to pay with PayFast.`,
                        { reply_markup: keyboard }
                    );
                }
            } catch (err) {
                console.error('Error saving payment configuration:', err);
                await ctx.reply('Failed to update payment settings. Please try again.');
            }
            return;
        }
    });

    // Subscription process callbacks
    bot.action('subscribe_init', async (ctx) => {
        const user = await User.findOne({ userId: ctx.from.id });

        if (user?.isSubscribed) {
            return ctx.answerCbQuery('You are already subscribed!');
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: 'Pay with PayFast', callback_data: 'pay_payfast' }],
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

            // Set up payment options based on group's configured payment method
            let paymentButtons = [];

            if (group.paymentMethod === 'payfast') {
                paymentButtons.push({
                    text: 'Pay with PayFast',
                    callback_data: `pay_group_payfast:${groupId}`
                });
            }
            // Add other payment methods as they're supported

            const keyboard = {
                inline_keyboard: [
                    paymentButtons,
                    [{ text: 'Cancel', callback_data: 'subscribe_cancel' }]
                ]
            };

            await ctx.editMessageText(
                `Subscribe to ${group.groupTitle}\n\n` +
                `Price: ${group.subscriptionPrice} ${group.subscriptionCurrency} per month\n\n` +
                `Please select your payment method:`,
                { reply_markup: keyboard }
            );
        } catch (err) {
            console.error('Error in subscribe_to_group callback:', err);
            await ctx.answerCbQuery('An error occurred');
        }
    });

    // Handle PayFast payment for a specific group
    bot.action(/^pay_group_payfast:(.+)$/, async (ctx) => {
        try {
            const groupId = parseInt(ctx.match[1]);

            // Get group details
            const group = await Group.findOne({ groupId });
            if (!group) {
                return ctx.answerCbQuery('Group not found');
            }

            // Make sure the group has PayFast configured
            if (group.paymentMethod !== 'payfast' ||
                !group.customPaymentSettings?.payfast?.merchantId ||
                !group.customPaymentSettings?.payfast?.merchantKey) {
                return ctx.answerCbQuery('Payment method not properly configured');
            }

            // Create a custom PayFast configuration for this group
            const payfastConfig = {
                merchantId: group.customPaymentSettings.payfast.merchantId,
                merchantKey: group.customPaymentSettings.payfast.merchantKey,
                passPhrase: group.customPaymentSettings.payfast.passPhrase || '',
                testMode: process.env.NODE_ENV !== 'production'
            };

            // Use payment manager to generate a payment URL
            // Note: The actual implementation might differ based on your payment system
            const paymentData = {
                amount: group.subscriptionPrice,
                item_name: `Subscription to ${group.groupTitle}`,
                user_id: ctx.from.id,
                group_id: group.groupId,
                return_url: `https://t.me/${ctx.me.username}?start=payment_success_${groupId}`,
                cancel_url: `https://t.me/${ctx.me.username}?start=payment_cancel_${groupId}`,
                notify_url: process.env.PAYFAST_NOTIFY_URL
            };

            // This is a placeholder - your actual implementation would depend on how your payment system works
            const paymentUrl = `https://www.payfast.co.za/eng/process?merchant_id=${payfastConfig.merchantId}&merchant_key=${payfastConfig.merchantKey}&amount=${group.subscriptionPrice}&item_name=${encodeURIComponent(`Subscription to ${group.groupTitle}`)}&custom_str1=${ctx.from.id}&custom_str2=${groupId}`;

            const keyboard = {
                inline_keyboard: [
                    [{ text: 'Pay Now', url: paymentUrl }],
                    [{ text: 'Cancel', callback_data: 'subscribe_cancel' }]
                ]
            };

            await ctx.editMessageText(
                `Complete your payment for ${group.groupTitle}\n\n` +
                `Amount: ${group.subscriptionPrice} ${group.subscriptionCurrency}\n\n` +
                `Click the button below to complete payment with PayFast:`,
                { reply_markup: keyboard }
            );
        } catch (err) {
            console.error('Error in pay_group_payfast callback:', err);
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
                { text: '« Back to Groups List', callback_data: 'list_groups' }
            ]);

            let statusEmoji = group.isRegistered ? '✅' : '❌';
            let subscriptionEmoji = group.subscriptionRequired ? '🔒' : '🔓';

            await ctx.editMessageText(
                `*Group Management: ${group.groupTitle}*\n\n` +
                `Registration: ${statusEmoji} ${group.isRegistered ? 'Registered' : 'Not Registered'}\n` +
                `Subscription: ${subscriptionEmoji} ${group.subscriptionRequired ? 'Required' : 'Not Required'}\n` +
                (group.subscriptionPrice ? `Price: ${group.subscriptionPrice} ${group.subscriptionCurrency}\n` : '') +
                (group.paymentMethod ? `Payment Method: ${group.paymentMethod}\n` : '') +
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
                    [{ text: '« Back to Group Management', callback_data: `manage_group:${groupId}` }]
                ]
            };

            await ctx.editMessageText(
                `*Subscription Settings for ${group.groupTitle}*\n\n` +
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

            const keyboard = {
                inline_keyboard: [
                    [{ text: '💳 Configure PayFast', callback_data: `payment_method:${groupId}:payfast` }],
                    [{ text: '« Back to Group Management', callback_data: `manage_group:${groupId}` }]
                ]
            };

            await ctx.editMessageText(
                `*Payment Settings for ${group.groupTitle}*\n\n` +
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

            // Toggle subscription requirement
            await Group.findOneAndUpdate(
                { groupId },
                { subscriptionRequired: !group.subscriptionRequired }
            );

            await ctx.answerCbQuery(
                `Subscription requirement ${!group.subscriptionRequired ? 'enabled' : 'disabled'}`
            );

            // Refresh management menu
            ctx.trigger('manage_group:' + groupId);
        } catch (err) {
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
                `Please send the new welcome message for ${group.groupTitle}.\n\n` +
                `Current welcome message: ${group.welcomeMessage || 'Default system message'}\n\n` +
                `Reply with your new welcome text, or send /cancel to keep the current message.`
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
            const payments = await Payment.find({
                'groupId': groupId,
                'status': 'completed',
                'timestamp': { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
            });

            let monthlyRevenue = 0;
            if (payments && payments.length > 0) {
                monthlyRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);
            }

            const keyboard = {
                inline_keyboard: [[
                    { text: '« Back to Group Management', callback_data: `manage_group:${groupId}` }
                ]]
            };

            await ctx.editMessageText(
                `📊 *Statistics for ${group.groupTitle}*\n\n` +
                `*Subscription Status:* ${group.subscriptionRequired ? 'Required ✅' : 'Not Required ❌'}\n` +
                `*Active Subscribers:* ${subscriberCount}\n` +
                `*Total Members:* ${totalMembers}\n` +
                `*Subscription Rate:* ${totalMembers > 0 ? Math.round((subscriberCount / totalMembers) * 100) : 0}%\n\n` +
                `*Payment Statistics (30 days):*\n` +
                `- Total Revenue: ${monthlyRevenue} ${group.subscriptionCurrency || 'ZAR'}\n` +
                `- Number of Payments: ${payments.length}\n\n` +
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

    // Enhanced text handler to support welcome message updates from management menu
    bot.on('text', async (ctx) => {
        // Skip if not expecting any input
        if (!ctx.session?.awaitingWelcomeFor && !ctx.session?.awaitingPriceFor && !ctx.session?.configuringPaymentFor) {
            return;
        }

        // Handle welcome message updates
        if (ctx.session?.awaitingWelcomeFor) {
            const messageText = ctx.message.text;
            const groupId = ctx.session.awaitingWelcomeFor;
            const fromManagementMenu = ctx.session.fromManagementMenu;

            // Handle cancel command
            if (messageText.toLowerCase() === '/cancel') {
                delete ctx.session.awaitingWelcomeFor;
                delete ctx.session.fromManagementMenu;

                if (fromManagementMenu) {
                    const keyboard = {
                        inline_keyboard: [[
                            { text: 'Back to Group Management', callback_data: `manage_group:${groupId}` }
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

                // If update was from management menu, provide button to go back
                if (fromManagementMenu) {
                    const keyboard = {
                        inline_keyboard: [[
                            { text: 'Back to Group Management', callback_data: `manage_group:${groupId}` }
                        ]]
                    };
                    return ctx.reply('Welcome message updated successfully!', { reply_markup: keyboard });
                }

                await ctx.reply('Welcome message updated successfully!');
            } catch (err) {
                console.error('Error saving welcome message:', err);
                await ctx.reply('Failed to update welcome message. Please try again.');
            }
            return;
        }

        // Handle subscription price input
        if (ctx.session?.awaitingPriceFor) {
            // ...existing price handling code...
        }

        // Handle PayFast configuration
        if (ctx.session?.configuringPaymentFor) {
            // ...existing PayFast config handling code...
        }
    });
};

module.exports = { register };
