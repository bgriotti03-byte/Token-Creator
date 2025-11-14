const { getToken, updateTokenOwner, getUser } = require("../utils/database");
const { transferOwnership } = require("../utils/blockchain");
const { isValidEthereumAddress } = require("../utils/validators");
const { NETWORKS } = require("../config/constants");
const { logActivity } = require("../utils/database");

// Session steps for management
const MANAGE_STEPS = {
  WAITING_OWNER_TRANSFER: "waiting_owner_transfer",
};

/**
 * Handle manage token callback
 * @param {object} bot - Telegram bot instance
 * @param {object} query - Callback query object
 */
const handleManageToken = async (bot, query) => {
  const chatId = query.message.chat.id;
  const tokenId = parseInt(query.data.split("_")[1], 10);

  try {
    const token = await getToken(tokenId);

    if (!token) {
      await bot.answerCallbackQuery(query.id, {
        text: "Token not found",
        show_alert: true,
      });
      return;
    }

    const message = `
🔧 Manage Token: ${token.token_name} (${token.token_symbol})

Current Owner: \`${token.owner_wallet}\`

What would you like to do?
`;

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔄 Transfer Ownership",
              callback_data: `transfer_owner_${token.id}`,
            },
          ],
          [
            {
              text: "📋 View Details",
              callback_data: `token_${token.id}`,
            },
          ],
        ],
      },
    });

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error("Error in handleManageToken:", error);
    await bot.answerCallbackQuery(query.id, {
      text: "Error loading management options",
      show_alert: true,
    });
  }
};

/**
 * Handle transfer ownership callback
 * @param {object} bot - Telegram bot instance
 * @param {object} query - Callback query object
 */
const handleTransferOwnershipStart = async (bot, query) => {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id;
  const tokenId = parseInt(query.data.split("_")[2], 10);

  try {
    const token = await getToken(tokenId);

    if (!token) {
      await bot.answerCallbackQuery(query.id, {
        text: "Token not found",
        show_alert: true,
      });
      return;
    }

    // Save session for ownership transfer
    const { saveUserSession } = require("../utils/database");
    await saveUserSession(telegramId, MANAGE_STEPS.WAITING_OWNER_TRANSFER, {
      tokenId: token.id,
      action: "transfer_ownership",
    });

    await bot.sendMessage(
      chatId,
      `Please send the new owner wallet address (Alvey Chain address) for token ${token.token_name}.`
    );

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error("Error in handleTransferOwnershipStart:", error);
    await bot.answerCallbackQuery(query.id, {
      text: "Error starting transfer",
      show_alert: true,
    });
  }
};

/**
 * Handle ownership transfer text input
 * @param {object} bot - Telegram bot instance
 * @param {object} msg - Telegram message object
 */
const handleOwnershipTransfer = async (bot, msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const newOwner = msg.text.trim();

  try {
    const { getUserSession, deleteUserSession } = require("../utils/database");
    const session = await getUserSession(telegramId);

    if (
      !session ||
      session.step !== MANAGE_STEPS.WAITING_OWNER_TRANSFER ||
      session.session_data.action !== "transfer_ownership"
    ) {
      return; // Not in ownership transfer flow
    }

    const { tokenId } = session.session_data;

    // Validate address
    if (!isValidEthereumAddress(newOwner)) {
      await bot.sendMessage(chatId, "❌ Invalid Alvey Chain address");
      return;
    }

    const token = await getToken(tokenId);
    if (!token) {
      await bot.sendMessage(chatId, "❌ Token not found");
      await deleteUserSession(telegramId);
      return;
    }

    // Check if same owner
    if (token.owner_wallet.toLowerCase() === newOwner.toLowerCase()) {
      await bot.sendMessage(chatId, "❌ This address is already the owner");
      await deleteUserSession(telegramId);
      return;
    }

    await bot.sendMessage(chatId, "⏳ Transferring ownership...");

    // Execute transfer on blockchain
    const txHash = await transferOwnership(
      token.token_address,
      newOwner,
      token.network || "alvey"
    );

    // Update database
    await updateTokenOwner(tokenId, newOwner);

    // Log activity
    const user = await getUser(telegramId);
    await logActivity(user.id, "ownership_transferred", {
      token_id: tokenId,
      token_address: token.token_address,
      old_owner: token.owner_wallet,
      new_owner: newOwner,
      tx_hash: txHash,
    });

    // Success message
    const successMessage = `
✅ Ownership transferred successfully!

New Owner: \`${newOwner}\`
Transaction: ${NETWORKS[token.network]?.explorer || NETWORKS.alvey.explorer}/tx/${txHash}
`;

    await bot.sendMessage(chatId, successMessage, { parse_mode: "Markdown" });

    // Clean up session
    await deleteUserSession(telegramId);
  } catch (error) {
    console.error("Error transferring ownership:", error);
    await bot.sendMessage(
      chatId,
      `❌ Error transferring ownership: ${error.message}`
    );
  }
};

module.exports = {
  handleManageToken,
  handleTransferOwnershipStart,
  handleOwnershipTransfer,
  MANAGE_STEPS,
};

