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
const { ADDRESSES, PAYMENT, NETWORKS, getNetwork, NETWORK_DISPLAY_NAMES, TEST_MODE, DISABLE_RATE_LIMIT } = require("../config/constants");
const {
  startPaymentListener,
  deployTokenAfterPayment,
} = require("./paymentVerification");

// Session steps
const STEPS = {
  WAITING_NETWORK: "waiting_network",
  WAITING_NAME: "waiting_name",
  WAITING_SYMBOL: "waiting_symbol",
  WAITING_SUPPLY: "waiting_supply",
  WAITING_TAX_CHOICE: "waiting_tax_choice",
  WAITING_TAX_PERCENT: "waiting_tax_percent",
  WAITING_TAX_WALLET: "waiting_tax_wallet",
  WAITING_REFLECTION_CHOICE: "waiting_reflection_choice",
  WAITING_REFLECTION_PERCENT: "waiting_reflection_percent",
  WAITING_BURN_CHOICE: "waiting_burn_choice",
  WAITING_BURN_PERCENT: "waiting_burn_percent",
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

    // Check rate limit (1 token every 10 minutes) - disabled in test mode
    if (!DISABLE_RATE_LIMIT) {
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
    }

    // Delete any existing session
    await deleteUserSession(telegramId);

    // NEW: Start with network selection
    const networkKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: NETWORK_DISPLAY_NAMES.alvey, callback_data: "network_alvey" }],
          [{ text: NETWORK_DISPLAY_NAMES.bscTestnet, callback_data: "network_bscTestnet" }],
        ],
      },
    };

    await bot.sendMessage(
      chatId,
      "🌐 <b>Select Blockchain Network</b>\n\nChoose which network you want to deploy your token on:",
      { parse_mode: "HTML", ...networkKeyboard }
    );

    await saveUserSession(telegramId, STEPS.WAITING_NETWORK, {});
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
        // NEW: Continue to reflection choice instead of going to preview
        await saveUserSession(telegramId, STEPS.WAITING_REFLECTION_CHOICE, session_data);
        await bot.sendMessage(chatId, '💰 Enable Reflection Rewards?\n\nHolders will automatically earn rewards just by holding tokens.', {
          reply_markup: {
            keyboard: [[{ text: "✅ Yes" }, { text: "❌ No" }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
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
      // NEW: Ask about Reflection
      await saveUserSession(telegramId, STEPS.WAITING_REFLECTION_CHOICE, session_data);
      await bot.sendMessage(chatId, '💰 Enable Reflection Rewards?\n\nHolders will automatically earn rewards just by holding tokens.', {
        reply_markup: {
          keyboard: [[{ text: "✅ Yes" }, { text: "❌ No" }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } else if (step === STEPS.WAITING_REFLECTION_CHOICE) {
      const choice = text.toLowerCase();
      if (choice === "yes" || choice === "y" || choice === "✅ yes") {
        await saveUserSession(telegramId, STEPS.WAITING_REFLECTION_PERCENT, session_data);
        await bot.sendMessage(chatId, '📊 What reflection percentage? (0-100%)');
      } else if (choice === "no" || choice === "n" || choice === "❌ no") {
        session_data.enableReflection = false;
        session_data.reflectionPercent = 0;
        await saveUserSession(telegramId, STEPS.WAITING_BURN_CHOICE, session_data);
        await bot.sendMessage(
          chatId,
          '🔥 Enable Burn on Transfer?\n\nTokens will be deflated with each transaction.',
          {
            reply_markup: {
              keyboard: [[{ text: "✅ Yes" }, { text: "❌ No" }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      } else {
        await bot.sendMessage(chatId, "Please answer Yes or No.");
      }
    } else if (step === STEPS.WAITING_REFLECTION_PERCENT) {
      const reflectionPercent = parseInt(text);
      
      if (isNaN(reflectionPercent) || reflectionPercent < 0 || reflectionPercent > 100) {
        await bot.sendMessage(chatId, '❌ Reflection must be a number between 0 and 100');
        return;
      }
      
      session_data.reflectionPercent = reflectionPercent;
      session_data.enableReflection = true;
      await saveUserSession(telegramId, STEPS.WAITING_BURN_CHOICE, session_data);
      await bot.sendMessage(
        chatId,
        '🔥 Enable Burn on Transfer?\n\nTokens will be deflated with each transaction.',
        {
          reply_markup: {
            keyboard: [[{ text: "✅ Yes" }, { text: "❌ No" }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } else if (step === STEPS.WAITING_BURN_CHOICE) {
      const choice = text.toLowerCase();
      if (choice === "yes" || choice === "y" || choice === "✅ yes") {
        await saveUserSession(telegramId, STEPS.WAITING_BURN_PERCENT, session_data);
        await bot.sendMessage(chatId, '🔥 What burn percentage? (0-100%)');
      } else if (choice === "no" || choice === "n" || choice === "❌ no") {
        session_data.enableBurn = false;
        session_data.burnPercent = 0;
        await showPreview(bot, chatId, telegramId, session_data);
      } else {
        await bot.sendMessage(chatId, "Please answer Yes or No.");
      }
    } else if (step === STEPS.WAITING_BURN_PERCENT) {
      const burnPercent = parseInt(text);
      
      if (isNaN(burnPercent) || burnPercent < 0 || burnPercent > 100) {
        await bot.sendMessage(chatId, '❌ Burn must be a number between 0 and 100');
        return;
      }
      
      session_data.burnPercent = burnPercent;
      session_data.enableBurn = true;
      
      // NEW: Validate total fees
      const totalFees = (session_data.taxPercent || 0) + 
                        (session_data.reflectionPercent || 0) + 
                        (burnPercent || 0);
      
      if (totalFees > 100) {
        await bot.sendMessage(
          chatId,
          `❌ Error: Total fees (${totalFees}%) exceed 100%\n\n` +
          `Tax: ${session_data.taxPercent || 0}%\n` +
          `Reflection: ${session_data.reflectionPercent || 0}%\n` +
          `Burn: ${burnPercent}%\n\n` +
          `Please reduce one or more percentages.`
        );
        await saveUserSession(telegramId, STEPS.WAITING_BURN_PERCENT, session_data);
        return;
      }
      
      await showPreview(bot, chatId, telegramId, session_data);
    } else if (step === STEPS.WAITING_CONFIRMATION) {
      if (text.toLowerCase() === "confirm" || text === "✅ Confirm") {
        if (TEST_MODE) {
          // Skip payment in test mode - go directly to owner wallet
          const network = getNetwork(session_data.network || "alvey");
          await bot.sendMessage(
            chatId,
            `🧪 TEST MODE: Skipping payment verification.\n\nPlease send your ${network.name.toUpperCase()} wallet address to receive token ownership.`
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
  
  // NEW: Calculate total fees
  const totalFees = (sessionData.taxPercent || 0) + 
                    (sessionData.reflectionPercent || 0) + 
                    (sessionData.burnPercent || 0);
  
  // NEW: Get network info
  const network = getNetwork(sessionData.network || "alvey");
  
  const preview = `
📋 Token Preview:

🌐 Network: <b>${network.name}</b>
📝 Name: ${sessionData.name}
🏷️ Symbol: ${sessionData.symbol}
📊 Supply: ${parseInt(sessionData.initialSupply).toLocaleString()}

💰 TAX: ${sessionData.taxPercent || 0}%
${sessionData.taxWallet ? `Tax Wallet: ${sessionData.taxWallet}` : ""}
✨ REFLECTION: ${sessionData.reflectionPercent || 0}%
🔥 BURN: ${sessionData.burnPercent || 0}%

💾 Total Fees: ${totalFees}%

${paymentInfo}

<i>Blockchain: ${network.name} (${network.currency})</i>
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

    // NEW: Get network info
    const network = getNetwork(sessionData.network || "alvey");

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
        reflectionPercent: sessionData.reflectionPercent || 0,
        burnPercent: sessionData.burnPercent || 0,
        enableReflection: sessionData.enableReflection || false,
        enableBurn: sessionData.enableBurn || false,
        network: sessionData.network || "alvey",
      },
      ownerWallet
    );

    // Success message
    const successMessage = `
✅ <b>Token created successfully!</b>

📋 <b>Details:</b>
🌐 Network: <b>${network.name}</b>
📝 Name: ${sessionData.name}
🏷️ Symbol: ${sessionData.symbol}
📍 Address: <code>${result.tokenAddress}</code>
👤 Owner: <code>${ownerWallet}</code>
📊 Supply: ${parseInt(sessionData.initialSupply).toLocaleString()}
💰 Tax: ${sessionData.taxPercent || 0}%

🔗 <a href="${network.explorer}/tx/${result.txHash}">View Transaction</a>
🔗 <a href="${network.explorer}/token/${result.tokenAddress}">View Token</a>

<b>Next Steps:</b>
1. Save your token address
2. Verification info sent separately
3. See manual verification guide
`;

    // Send success message with deployment info button
    await bot.sendMessage(chatId, successMessage, { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: '🔗 View Token', 
              url: `${network.explorer}/address/${result.tokenAddress}` 
            },
            { 
              text: '📋 Deployment Info', 
              callback_data: `di_${result.tokenAddress}` 
            }
          ]
        ]
      }
    });

    // Send detailed verification instructions if available
    if (result.verificationInstructions) {
      await bot.sendMessage(chatId, result.verificationInstructions, { parse_mode: 'HTML' });
    }

    // Clean up session
    await deleteUserSession(telegramId);
  } catch (error) {
    console.error("DEPLOYMENT ERROR:", error);
    console.error("Error type:", error.constructor.name);
    console.error("Full error:", error);

    let errorMessage = '❌ <b>Deployment failed:</b>\n\n';

    if (error.message && error.message.includes('insufficient funds')) {
      errorMessage += '💰 Not enough ALV for gas fees\n';
    } else if (error.message && error.message.includes('CALL_EXCEPTION')) {
      errorMessage += '⚠️ Constructor arguments rejected\n';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage += '⏱️ RPC timeout - network congested\n';
    } else if (error.message && error.message.includes('VALIDATION FAILED')) {
      errorMessage += error.message + '\n';
    } else if (error.message && error.message.includes('DEPLOYMENT FAILED')) {
      errorMessage += error.message + '\n';
    } else if (error.message && error.message.includes('TX FAILED')) {
      errorMessage += error.message + '\n';
    } else if (error.message && error.message.includes("Reflection and Burn features require")) {
      // Factory version error - show specific message
      await bot.sendMessage(
        chatId,
        `❌ ${error.message}\n\n` +
        `💡 <b>Solution:</b>\n` +
        `To use Reflection and Burn features, you need to deploy the updated Factory contract.\n\n` +
        `1. Compile the new TokenFactory.sol contract\n` +
        `2. Deploy it to Alvey Chain\n` +
        `3. Update FACTORY_ADDRESS in your .env file\n\n` +
        `Alternatively, you can create tokens without Reflection/Burn using the current Factory.`,
        { parse_mode: 'HTML' }
      );
    } else {
      // Generic error handling
      errorMessage += error.message + '\n';
    }

    errorMessage += '\n<b>Debug info:</b>\n<code>';
    errorMessage += error.message.substring(0, 200);
    errorMessage += '</code>';

    await bot.sendMessage(chatId, errorMessage, { parse_mode: 'HTML' });
    
    // Log for debugging
    console.error('Full error logged above');
  }
};

module.exports = {
  handleCreateToken,
  handleTokenCreationFlow,
  STEPS,
};

