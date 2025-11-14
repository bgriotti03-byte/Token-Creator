const { getUser, getUserTokens } = require("../utils/database");
const { NETWORKS } = require("../config/constants");

/**
 * Handle /my_tokens command
 * @param {object} bot - Telegram bot instance
 * @param {object} msg - Telegram message object
 */
const handleMyTokens = async (bot, msg) => {
  // Validate message structure
  if (!msg || !msg.chat || !msg.from) {
    console.error("Invalid message structure:", msg);
    return;
  }

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  try {
    const user = await getUser(telegramId, {
      username: msg.from.username,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name,
    });

    const tokens = await getUserTokens(user.id);

    if (tokens.length === 0) {
      await bot.sendMessage(
        chatId,
        "You haven't created any tokens yet. Use /create_token to create one."
      );
      return;
    }

    let message = `📋 Your Tokens (${tokens.length}):\n\n`;

    // Create inline keyboard with token buttons
    const keyboard = [];

    tokens.forEach((token, index) => {
      const date = new Date(token.deployed_at).toLocaleDateString();
      message += `${index + 1}. ${token.token_name} (${token.token_symbol})\n`;
      message += `   Address: \`${token.token_address}\`\n`;
      message += `   Created: ${date}\n\n`;

      keyboard.push([
        {
          text: `${token.token_name} (${token.token_symbol})`,
          callback_data: `token_${token.id}`,
        },
      ]);
    });

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (error) {
    console.error("Error in handleMyTokens:", error);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
};

/**
 * Handle token detail callback
 * @param {object} bot - Telegram bot instance
 * @param {object} query - Callback query object
 */
const handleTokenDetail = async (bot, query) => {
  const chatId = query.message.chat.id;
  const tokenId = parseInt(query.data.split("_")[1], 10);

  try {
    const { getToken } = require("../utils/database");
    const token = await getToken(tokenId);

    if (!token) {
      await bot.answerCallbackQuery(query.id, {
        text: "Token not found",
        show_alert: true,
      });
      return;
    }

    const date = new Date(token.deployed_at).toLocaleString();
    const message = `
📋 Token Details:

Name: ${token.token_name}
Symbol: ${token.token_symbol}
Address: \`${token.token_address}\`
Owner: \`${token.owner_wallet}\`
Supply: ${parseInt(token.initial_supply).toLocaleString()}
Tax: ${token.tax_percent}%
${token.tax_wallet ? `Tax Wallet: \`${token.tax_wallet}\`` : ""}
Network: ${token.network}
Created: ${date}

🔗 Explorer: ${NETWORKS[token.network]?.explorer || NETWORKS.alvey.explorer}/address/${token.token_address}
🔗 TX: ${NETWORKS[token.network]?.explorer || NETWORKS.alvey.explorer}/tx/${token.tx_hash}
`;

    // NEW: Add analyze button
    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔍 Analyze",
              callback_data: `analyze_${token.id}`,
            },
            {
              text: "🔧 Manage Token",
              callback_data: `manage_${token.id}`,
            },
          ],
        ],
      },
    });

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error("Error in handleTokenDetail:", error);
    await bot.answerCallbackQuery(query.id, {
      text: "Error loading token details",
      show_alert: true,
    });
  }
};

module.exports = {
  handleMyTokens,
  handleTokenDetail,
};

