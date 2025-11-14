const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

// Import handlers
const { handleCreateToken, handleTokenCreationFlow, STEPS } = require("./handlers/createToken");
const { handleMyTokens, handleTokenDetail } = require("./handlers/myTokens");
const {
  handleManageToken,
  handleTransferOwnershipStart,
  handleOwnershipTransfer,
  MANAGE_STEPS,
} = require("./handlers/manageToken");
const { getUser, getUserSession, deleteUserSession, saveUserSession } = require("./utils/database");
const { startPaymentListener } = require("./handlers/paymentVerification");

// Initialize bot
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("ERROR: BOT_TOKEN not set in environment variables");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Store active payment listeners
const activeListeners = new Map();

/**
 * Handle /start command
 */
bot.onText(/\/start/, async (msg) => {
  // Validate message structure
  if (!msg || !msg.chat || !msg.from) {
    console.error("Invalid message structure:", msg);
    return;
  }

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  try {
    await getUser(telegramId, {
      username: msg.from.username,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name,
    });

    const welcomeMessage = `
🤖 Welcome to Token Creator Bot!

Create ERC-20 tokens on Alvey Chain securely.

Commands:
/create_token - Create a new token
/my_tokens - View your created tokens
/manage - Manage your tokens
/analyze - Analyze any token
/help - Get help and information

Let's get started! 🚀
`;

    await bot.sendMessage(chatId, welcomeMessage, {
      reply_markup: {
        keyboard: [
          [{ text: "📝 Create Token" }, { text: "📋 My Tokens" }],
          [{ text: "❓ Help" }],
        ],
        resize_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Error in /start:", error);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
});

/**
 * Handle /create_token command
 */
bot.onText(/\/create_token/, (msg) => handleCreateToken(bot, msg));

/**
 * Handle /my_tokens command
 */
bot.onText(/\/my_tokens/, (msg) => handleMyTokens(bot, msg));

/**
 * NEW: Handle /analyze command - analyze any token
 */
bot.onText(/\/analyze/, async (msg) => {
  // Validate message structure
  if (!msg || !msg.chat || !msg.from) {
    console.error("Invalid message structure:", msg);
    return;
  }

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  
  try {
    await getUser(telegramId, {
      username: msg.from.username,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name,
    });
    
    await bot.sendMessage(
      chatId,
      '🔍 <b>Token Analyzer</b>\n\n' +
      'Paste the token address you want to analyze:',
      { parse_mode: 'HTML' }
    );
    
    await saveUserSession(telegramId, 'waiting_analyze_address', {});
  } catch (error) {
    console.error("Error in /analyze:", error);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
});

/**
 * Handle /manage command
 */
bot.onText(/\/manage/, async (msg) => {
  // Validate message structure
  if (!msg || !msg.chat) {
    return;
  }

  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
    "Use /my_tokens to view your tokens and manage them."
  );
});

/**
 * Handle /help command
 */
bot.onText(/\/help/, async (msg) => {
  // Validate message structure
  if (!msg || !msg.chat) {
    return;
  }

  const chatId = msg.chat.id;

  const helpMessage = `
📖 Token Creator Bot - Help

🔹 Creating a Token:
1. Use /create_token to start
2. Follow the prompts:
   - Token name
   - Token symbol
   - Initial supply
   - Tax fee (optional)
3. Confirm and pay 20 USDT (BSC)
4. Provide your Alvey Chain wallet
5. Token will be deployed automatically

🔹 Viewing Tokens:
- Use /my_tokens to see all your tokens
- Click on a token to view details
- Manage ownership from token details

🔹 Analyzing Tokens:
- Use /analyze to analyze any token by address
- Or click "🔍 Analyze" button on your tokens
- Shows all features: Tax, Reflection, Burn
- Displays security status and explorer links

🔹 Payment:
- Send exactly 20 USDT from BSC
- Payment is verified automatically
- You have 15 minutes to complete payment

🔹 Security:
- Tokens are immutable (except ownership)
- Tax fees cannot be changed after creation
- You control your wallet private keys

Need more help? Contact support.
`;

  await bot.sendMessage(chatId, helpMessage);
});

/**
 * Handle callback queries (inline buttons)
 */
bot.on("callback_query", async (query) => {
  const data = query.data;

  try {
    if (data.startsWith("token_")) {
      await handleTokenDetail(bot, query);
    } else if (data.startsWith("manage_")) {
      await handleManageToken(bot, query);
    } else if (data.startsWith("transfer_owner_")) {
      await handleTransferOwnershipStart(bot, query);
    } else if (data.startsWith("analyze_")) {
      // NEW: Handle analyze button click
      const tokenId = data.split("_")[1];
      
      const { getToken } = require("./utils/database");
      const token = await getToken(parseInt(tokenId, 10));
      
      if (!token) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Token not found', show_alert: true });
        return;
      }
      
      const tokenAddress = token.token_address;
      
      // Get user to ensure they exist and get userId
      const user = await getUser(query.from.id, {
        username: query.from.username,
        first_name: query.from.first_name,
        last_name: query.from.last_name,
      });
      
      // Import and call analyzer
      const { analyzeToken } = require('./handlers/analyzeToken');
      await analyzeToken(bot, query.message.chat.id, user.id, tokenAddress);
      
      await bot.answerCallbackQuery(query.id);
    }
  } catch (error) {
    console.error("Error handling callback query:", error);
    await bot.answerCallbackQuery(query.id, {
      text: "An error occurred",
      show_alert: true,
    });
  }
});

/**
 * Handle text messages (for token creation flow and ownership transfer)
 */
bot.on("message", async (msg) => {
  // Validate message structure
  if (!msg || !msg.chat || !msg.from) {
    return;
  }

  // Skip commands
  if (msg.text && msg.text.startsWith("/")) {
    return;
  }

  // Skip non-text messages
  if (!msg.text) {
    return;
  }

  const telegramId = msg.from.id;

  try {
    const session = await getUserSession(telegramId);

    if (session) {
      // Check if in token creation flow
      if (Object.values(STEPS).includes(session.step)) {
        await handleTokenCreationFlow(bot, msg);
        return;
      }

      // Check if in ownership transfer flow
      if (session.step === MANAGE_STEPS.WAITING_OWNER_TRANSFER) {
        await handleOwnershipTransfer(bot, msg);
        return;
      }

      // NEW: Handle analyze address input
      if (session.step === 'waiting_analyze_address') {
        const tokenAddress = msg.text.trim();
        
        // Get user to ensure they exist and get userId
        const user = await getUser(telegramId, {
          username: msg.from.username,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
        });
        
        // Import analyzer
        const { analyzeToken } = require('./handlers/analyzeToken');
        
        // Analyze the token
        await analyzeToken(bot, msg.chat.id, user.id, tokenAddress);
        
        // Clear session
        await deleteUserSession(telegramId);
        return;
      }
    }

    // Handle button text shortcuts
    if (msg.text === "📝 Create Token") {
      await handleCreateToken(bot, msg);
    } else if (msg.text === "📋 My Tokens") {
      await handleMyTokens(bot, msg);
    } else if (msg.text === "❓ Help") {
      await bot.onText(/\/help/, msg);
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
});

/**
 * Handle errors
 */
bot.on("polling_error", (error) => {
  console.error("Polling error:", error);
});

bot.on("error", (error) => {
  console.error("Bot error:", error);
});

// Graceful shutdown
process.once("SIGINT", () => {
  console.log("\nShutting down bot...");
  bot.stopPolling();
  process.exit(0);
});

process.once("SIGTERM", () => {
  console.log("\nShutting down bot...");
  bot.stopPolling();
  process.exit(0);
});

console.log("Token Creator Bot is running...");

