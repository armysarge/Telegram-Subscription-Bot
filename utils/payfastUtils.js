const crypto = require('crypto');

// Function to generate PayFast payment URL
function generatePayfastPaymentUrl(userId, amount, itemName, itemDescription) {
    const payfastMerchantId = process.env.PAYFAST_MERCHANT_ID;
    const payfastMerchantKey = process.env.PAYFAST_MERCHANT_KEY;
    const payfastPassphrase = process.env.PAYFAST_PASSPHRASE;

    // Generate a unique payment ID
    const paymentId = `sub_${userId}_${Date.now()}`;

    // Set return and notify URLs
    const returnUrl = process.env.PAYFAST_RETURN_URL || 'https://t.me/your_bot_username';
    const cancelUrl = process.env.PAYFAST_CANCEL_URL || 'https://t.me/your_bot_username';
    const notifyUrl = process.env.PAYFAST_NOTIFY_URL || 'https://your-server.com/payfast-itn';

    // Create data object for PayFast
    const pfData = {
        merchant_id: payfastMerchantId,
        merchant_key: payfastMerchantKey,
        return_url: returnUrl,
        cancel_url: cancelUrl,
        notify_url: notifyUrl,
        name_first: 'Telegram',
        name_last: 'User',
        email_address: `user${userId}@telegram.org`, // Use dummy email
        m_payment_id: paymentId,
        amount: amount.toFixed(2),
        item_name: itemName,
        item_description: itemDescription,
        custom_str1: userId.toString()
    };

    // Create the signature string
    const signatureString = Object.entries(pfData)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%20/g, '+').replace(/[!'()]/g, escape)}`)
        .join('&');

    // Add passphrase if set
    const signatureWithPassphrase = payfastPassphrase
        ? `${signatureString}&passphrase=${encodeURIComponent(payfastPassphrase)}`
        : signatureString;

    // Calculate the signature using MD5
    const signature = crypto
        .createHash('md5')
        .update(signatureWithPassphrase)
        .digest('hex');

    // Add signature to data
    pfData.signature = signature;

    // Determine the correct PayFast host
    const pfHost = process.env.PAYFAST_SANDBOX === 'true'
        ? 'sandbox.payfast.co.za'
        : 'www.payfast.co.za';

    // Create the query string
    const queryString = Object.entries(pfData)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

    // Construct the final URL
    return `https://${pfHost}/eng/process?${queryString}`;
}

// Function to validate PayFast ITN
async function validatePayfastITN(data) {
    // Clone the data object and remove fields used in signature calculation
    const validateData = { ...data };
    delete validateData.signature;

    // Create the signature string
    const signatureString = Object.entries(validateData)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%20/g, '+').replace(/[!'()]/g, escape)}`)
        .join('&');

    // Calculate the signature using MD5
    const calculatedSignature = crypto
        .createHash('md5')
        .update(signatureString)
        .digest('hex');

    // Compare with the received signature
    if (calculatedSignature !== data.signature) {
        console.error('Signature validation failed');
        return false;
    }

    // Validate against PayFast server (optional but recommended)
    try {
        const axios = require('axios');
        const pfHost = process.env.PAYFAST_SANDBOX === 'true'
            ? 'sandbox.payfast.co.za'
            : 'www.payfast.co.za';

        const validateResponse = await axios.post(
            `https://${pfHost}/eng/query/validate`,
            signatureString,
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

module.exports = {
    generatePayfastPaymentUrl,
    validatePayfastITN
};
