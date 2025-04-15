/**
 * Utilities for auto-deleting messages in groups to keep chats clean
 */

// Default deletion delay in milliseconds (10 seconds)
const DEFAULT_DELETE_DELAY = 10000;

/**
 * Schedule a message for auto-deletion after a delay
 *
 * @param {Object} ctx - Telegram context object
 * @param {number} messageId - ID of the message to delete
 * @param {number} chatId - ID of the chat where the message is
 * @param {number} deleteDelay - Time in milliseconds before deletion (default: 10 seconds)
 * @returns {Promise} - Promise that resolves when message is deleted
 */
const scheduleMessageDeletion = (ctx, messageId, chatId, deleteDelay = DEFAULT_DELETE_DELAY) => {
    return new Promise((resolve) => {
        setTimeout(async () => {
            try {
                await ctx.telegram.deleteMessage(chatId, messageId);
                resolve(true);
            } catch (err) {
                console.log(`Could not delete message ${messageId} in chat ${chatId}: ${err.message}`);
                resolve(false);
            }
        }, deleteDelay);
    });
};

/**
 * Auto-delete a bot reply message and the original command message if possible
 *
 * @param {Object} ctx - Telegram context object
 * @param {Object} sentMessage - Message object returned from ctx.reply
 * @param {number} deleteDelay - Time in milliseconds before deletion (default: 10 seconds)
 * @returns {Promise} - Promise that resolves when messages are deleted
 */
const cleanupMessages = async (ctx, sentMessage, deleteDelay = DEFAULT_DELETE_DELAY) => {
    if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
        return; // Only auto-delete in groups
    }

    const chatId = ctx.chat.id;

    // Schedule deletion for bot's reply message
    scheduleMessageDeletion(ctx, sentMessage.message_id, chatId, deleteDelay);

    // Try to delete the original command message if it exists
    if (ctx.message && ctx.message.message_id) {
        scheduleMessageDeletion(ctx, ctx.message.message_id, chatId, deleteDelay);
    }
};

module.exports = {
    scheduleMessageDeletion,
    cleanupMessages,
    DEFAULT_DELETE_DELAY
};
