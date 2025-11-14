const {
  getUser,
  saveUserSession,
  getUserSession,
  deleteUserSession,
  savePayment,
  getPayment,
  logActivity,
} = require("../utils/database");
const {
  isValidTokenName,
  isValidTokenSymbol,
  isValidSupply,
  isValidTaxPercent,
  isValidEthereumAddress,
  sanitizeInput,
} = require("../utils/validators");
const { ADDRESSES, PAYMENT, NETWORKS, TEST_MODE } = require("../config/constants");
const {
  startPaymentListener,
  deployTokenAfterPayment,
} = require("./paymentVerification");

// Session steps
const STEPS = {
  WAITING_NAME: "waiting_name",
  WAITING_SYMBOL: "waiting_symbol",
  WAITING_SUPPLY: "waiting_supply",
  WAITING_TAX_CHOICE: "waiting_tax_choice",
  WAITING_TAX_PERCENT: "waiting_tax_percent",
  WAITING_TAX_WALLET: "waiting_tax_wallet",
  WAITING_CONFIRMATION: "waiting_confirmation",
  WAITING_PAYER_WALLET: "waiting_payer_wallet",
  WAITING_PAYMENT: "waiting_payment",
  WAITING_OWNER_WALLET: "waiting_owner_wallet",
};

/**
 * Generate unique payment ID
 * @returns {string}
 */
const generatePaymentId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `PAY_${timestamp}_${random}`;
};

/**
 * Handle /create_token command
 * @param {object} bot - Telegram bot instance
 * @param {object} msg - Telegram message object
 */
const handleCreateToken = async (bot, msg) => {
  // Validate message structure - msg could be the message object or match array
  if (!msg) {
    return;
  }
  
  // If msg is an array (match result), it's invalid
  if (Array.isArray(msg)) {
    console.error("Received match array instead of message:", msg);
    return;
  }
  
  // Validate message object structure
  if (!msg.chat || !msg.from) {
    console.error("Invalid message structure:", msg);
    return;
  }

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  try {
    // Get or create user
    const user = await getUser(telegramId, {
      username: msg.from.username,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name,
    });

    // Check rate limit (1 token every 10 minutes)
    const { getUserTokens } = require("../utils/database");
    const userTokens = await getUserTokens(user.id);
    if (userTokens.length > 0) {
      const lastToken = userTokens[0];
      const timeSinceLastToken = Date.now() - new Date(lastToken.deployed_at).getTime();
      if (timeSinceLastToken < 600000) {
        // 10 minutes
        const remainingMinutes = Math.ceil((600000 - timeSinceLastToken) / 60000);
        await bot.sendMessage(
          chatId,
          `⏳ Rate limit: Please wait ${remainingMinutes} minute(s) before creating another token.`
        );
        return;
      }
    }

    // Delete any existing session
    await deleteUserSession(telegramId);

    // Start new session
    await saveUserSession(telegramId, STEPS.WAITING_NAME, {});

    await bot.sendMessage(chatId, "What is your token name?");
    await logActivity(user.id, "create_token_started", {});
  } catch (error) {
    console.error("Error in handleCreateToken:", error);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
};

/**
 * Handle text messages during token creation flow
 * @param {object} bot - Telegram bot instance
 * @param {object} msg - Telegram message object
 */
const handleTokenCreationFlow = async (bot, msg) => {
  // Validate message structure
  if (!msg || !msg.chat || !msg.from || !msg.text) {
    return;
  }

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const text = sanitizeInput(msg.text);

  try {
    const user = await getUser(telegramId, {
      username: msg.from.username,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name,
    });

    const session = await getUserSession(telegramId);
    if (!session) {
      return; // Not in token creation flow
    }

    const { step, session_data } = session;

    if (step === STEPS.WAITING_NAME) {
      if (!isValidTokenName(text)) {
        await bot.sendMessage(
          chatId,
          "❌ Invalid token name. Please enter a valid name (1-50 characters)."
        );
        return;
      }
      session_data.name = text;
      await saveUserSession(telegramId, STEPS.WAITING_SYMBOL, session_data);
      await bot.sendMessage(chatId, "Token symbol? (e.g., MYT)");
    } else if (step === STEPS.WAITING_SYMBOL) {
      if (!isValidTokenSymbol(text)) {
        await bot.sendMessage(
          chatId,
          "❌ Invalid token symbol. Please enter 1-10 uppercase letters/numbers only."
        );
        return;
      }
      session_data.symbol = text.toUpperCase();
      await saveUserSession(telegramId, STEPS.WAITING_SUPPLY, session_data);
      await bot.sendMessage(chatId, "Initial supply? (e.g., 1000000)");
    } else if (step === STEPS.WAITING_SUPPLY) {
      if (!isValidSupply(text)) {
        await bot.sendMessage(
          chatId,
          "❌ Supply must be a positive integer greater than 0."
        );
        return;
      }
      session_data.initialSupply = text;
      await saveUserSession(telegramId, STEPS.WAITING_TAX_CHOICE, session_data);
      await bot.sendMessage(chatId, "Do you want a tax fee? (Yes/No)", {
        reply_markup: {
          keyboard: [[{ text: "Yes" }, { text: "No" }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else if (step === STEPS.WAITING_TAX_CHOICE) {
      const choice = text.toLowerCase();
      if (choice === "yes" || choice === "y") {
        await saveUserSession(telegramId, STEPS.WAITING_TAX_PERCENT, session_data);
        await bot.sendMessage(chatId, "Tax percentage? (0-100)");
      } else if (choice === "no" || choice === "n") {
        session_data.taxPercent = 0;
        session_data.taxWallet = null;
        await showPreview(bot, chatId, telegramId, session_data);
      } else {
        await bot.sendMessage(chatId, "Please answer Yes or No.");
      }
    } else if (step === STEPS.WAITING_TAX_PERCENT) {
      if (!isValidTaxPercent(text)) {
        await bot.sendMessage(
          chatId,
          "❌ Tax must be between 0 and 100."
        );
        return;
      }
      session_data.taxPercent = parseInt(text, 10);
      await saveUserSession(telegramId, STEPS.WAITING_TAX_WALLET, session_data);
      await bot.sendMessage(
        chatId,
        "Which wallet receives tax tokens? (Ethereum address)"
      );
    } else if (step === STEPS.WAITING_TAX_WALLET) {
      if (!isValidEthereumAddress(text)) {
        await bot.sendMessage(chatId, "❌ Invalid address");
        return;
      }
      session_data.taxWallet = text;
      await showPreview(bot, chatId, telegramId, session_data);
    } else if (step === STEPS.WAITING_CONFIRMATION) {
      if (text.toLowerCase() === "confirm" || text === "✅ Confirm") {
        if (TEST_MODE) {
          // Skip payment in test mode - go directly to owner wallet
          await bot.sendMessage(
            chatId,
            "🧪 TEST MODE: Skipping payment verification.\n\nPlease send your ALVEY CHAIN wallet address to receive token ownership."
          );
          await saveUserSession(telegramId, STEPS.WAITING_OWNER_WALLET, session_data);
        } else {
          await saveUserSession(telegramId, STEPS.WAITING_PAYER_WALLET, session_data);
          await bot.sendMessage(
            chatId,
            "Which wallet will you send payment from? (BSC address)"
          );
        }
      } else if (text.toLowerCase() === "cancel" || text === "❌ Cancel") {
        await deleteUserSession(telegramId);
        await bot.sendMessage(chatId, "Token creation cancelled.");
      } else {
        await bot.sendMessage(chatId, "Please use the buttons to confirm or cancel.");
      }
    } else if (step === STEPS.WAITING_PAYER_WALLET) {
      if (!isValidEthereumAddress(text)) {
        await bot.sendMessage(chatId, "❌ Invalid address");
        return;
      }
      session_data.payerWallet = text;
      await handlePaymentRequest(bot, chatId, telegramId, user.id, session_data);
    } else if (step === STEPS.WAITING_PAYMENT) {
      if (text === "✅ Already sent" || text.toLowerCase().includes("sent")) {
        // Payment listener is already running, just acknowledge
        await bot.sendMessage(
          chatId,
          "⏳ Checking for your payment... Please wait."
        );
      }
    } else if (step === STEPS.WAITING_OWNER_WALLET) {
      if (!isValidEthereumAddress(text)) {
        await bot.sendMessage(chatId, "❌ Invalid Alvey Chain address");
        return;
      }
      await handleTokenDeployment(bot, chatId, telegramId, user.id, session_data, text);
    }
  } catch (error) {
    console.error("Error in handleTokenCreationFlow:", error);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
};

/**
 * Show token preview
 * @param {object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {number} telegramId - Telegram user ID
 * @param {object} sessionData - Session data
 */
const showPreview = async (bot, chatId, telegramId, sessionData) => {
  const paymentInfo = TEST_MODE 
    ? "🧪 TEST MODE: Payment verification skipped"
    : `Payment: ${PAYMENT.AMOUNT_USDT} USDT (BSC)`;
  
  const preview = `
📋 Token Preview:

Name: ${sessionData.name}
Symbol: ${sessionData.symbol}
Supply: ${parseInt(sessionData.initialSupply).toLocaleString()}
Tax: ${sessionData.taxPercent || 0}%
${sessionData.taxWallet ? `Tax Wallet: ${sessionData.taxWallet}` : ""}

${paymentInfo}
`;

  await saveUserSession(telegramId, STEPS.WAITING_CONFIRMATION, sessionData);
  await bot.sendMessage(chatId, preview, {
    reply_markup: {
      keyboard: [[{ text: "✅ Confirm" }, { text: "❌ Cancel" }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
};

/**
 * Handle payment request
 * @param {object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {number} telegramId - Telegram user ID
 * @param {number} userId - User ID
 * @param {object} sessionData - Session data
 */
const handlePaymentRequest = async (
  bot,
  chatId,
  telegramId,
  userId,
  sessionData
) => {
  const paymentId = generatePaymentId();

  // Save payment to DB
  await savePayment(userId, paymentId, {
    amount: PAYMENT.AMOUNT_USDT,
    currency: "USDT",
    payer_wallet: sessionData.payerWallet,
    status: "pending",
  });

  sessionData.paymentId = paymentId;
  await saveUserSession(telegramId, STEPS.WAITING_PAYMENT, sessionData);

  const paymentMessage = `
💳 Payment Instructions:

Send exactly ${PAYMENT.AMOUNT_USDT} USDT to:
\`${ADDRESSES.PAYMENT_WALLET_BSC}\`

From your wallet: \`${sessionData.payerWallet}\`

Payment ID: \`${paymentId}\`

⏱️ You have 15 minutes to complete the payment.
`;

  await bot.sendMessage(chatId, paymentMessage, {
    parse_mode: "Markdown",
    reply_markup: {
      keyboard: [[{ text: "✅ Already sent" }, { text: "⏳ Waiting..." }]],
      resize_keyboard: true,
    },
  });

  // Start payment listener
  await startPaymentListener(
    bot,
    sessionData.payerWallet,
    paymentId,
    userId,
    chatId,
    telegramId,
    {
      name: sessionData.name,
      symbol: sessionData.symbol,
      initialSupply: sessionData.initialSupply,
      taxPercent: sessionData.taxPercent || 0,
      taxWallet: sessionData.taxWallet || null,
    }
  );
};

/**
 * Handle token deployment after payment confirmation
 * @param {object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {number} telegramId - Telegram user ID
 * @param {number} userId - User ID
 * @param {object} sessionData - Session data
 * @param {string} ownerWallet - Owner wallet address
 */
const handleTokenDeployment = async (
  bot,
  chatId,
  telegramId,
  userId,
  sessionData,
  ownerWallet
) => {
  try {
    // In test mode, skip payment verification
    if (!TEST_MODE) {
      // Verify payment is confirmed
      const payment = await getPayment(sessionData.paymentId);
      if (!payment || payment.status !== "confirmed") {
        await bot.sendMessage(
          chatId,
          "❌ Payment not verified yet. Please wait..."
        );
        return;
      }
    }

    // Deploy token
    const result = await deployTokenAfterPayment(
      bot,
      chatId,
      userId,
      {
        name: sessionData.name,
        symbol: sessionData.symbol,
        initialSupply: sessionData.initialSupply,
        taxPercent: sessionData.taxPercent || 0,
        taxWallet: sessionData.taxWallet || null,
      },
      ownerWallet
    );

    // Success message
    const successMessage = `
✅ Token created successfully!

📋 Details:
Name: ${sessionData.name}
Symbol: ${sessionData.symbol}
Address: \`${result.tokenAddress}\`
Owner: \`${ownerWallet}\`
Supply: ${parseInt(sessionData.initialSupply).toLocaleString()}
Tax: ${sessionData.taxPercent || 0}%

🔗 Transaction: ${NETWORKS.alvey.explorer}/tx/${result.txHash}
🔗 Token: ${NETWORKS.alvey.explorer}/address/${result.tokenAddress}
`;

    await bot.sendMessage(chatId, successMessage, { parse_mode: "Markdown" });

    // Clean up session
    await deleteUserSession(telegramId);
  } catch (error) {
    console.error("Error deploying token:", error);
    await bot.sendMessage(
      chatId,
      `❌ Error deploying token: ${error.message}`
    );
  }
};

module.exports = {
  handleCreateToken,
  handleTokenCreationFlow,
  STEPS,
};

