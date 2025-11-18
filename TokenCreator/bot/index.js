const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { ethers } = require("ethers");
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
/claim_reflection - Claim reflection rewards
/verify - Verify a token contract
/cancel - Cancel current process
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
 * NEW: Handle /claim_reflection command - claim reflection rewards
 */
bot.onText(/\/claim_reflection/, async (msg) => {
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
      '💰 <b>Claim Reflection Rewards</b>\n\n' +
      'Paste the token address to claim reflection from:',
      { parse_mode: 'HTML' }
    );
    
    await saveUserSession(telegramId, 'waiting_claim_token_address', {});
  } catch (error) {
    console.error("Error in /claim_reflection:", error);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
});

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
 * Handle /cancel command - cancel current process
 */
bot.onText(/\/cancel/, async (msg) => {
  // Validate message structure
  if (!msg || !msg.chat || !msg.from) {
    console.error("Invalid message structure:", msg);
    return;
  }

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  try {
    const session = await getUserSession(telegramId);
    
    if (session) {
      // Delete the session
      await deleteUserSession(telegramId);
      await bot.sendMessage(
        chatId,
        '❌ <b>Process Cancelled</b>\n\n' +
        'Your current process has been cancelled. You can start a new one anytime.',
        { parse_mode: 'HTML' }
      );
    } else {
      // No active session
      await bot.sendMessage(
        chatId,
        'ℹ️ There is no active process to cancel.',
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error("Error in /cancel:", error);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
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

🔹 Claiming Reflection Rewards:
- Use /claim_reflection to check and claim reflection rewards
- Provide token address and your wallet address
- Shows how much reflection you can claim
- Instructions to claim from your wallet

🔹 Verifying Contracts:
- Use /verify to manually verify a token contract
- Provide token address from your account
- Contracts are automatically verified after deployment
- Manual verification available if auto-verification fails

🔹 Cancelling Processes:
- Use /cancel at any time to cancel your current process
- Works for token creation, analysis, reflection claims, etc.
- Your session will be cleared and you can start fresh

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
 * NEW: Handle /verify command for manual contract verification
 */
bot.onText(/\/verify/, async (msg) => {
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

    await bot.sendMessage(
      chatId,
      '🔍 <b>Manual Contract Verification</b>\n\n' +
      'Paste the token address you want to verify:',
      { parse_mode: 'HTML' }
    );

    // Set session to wait for verify address
    await saveUserSession(telegramId, 'waiting_verify_address', {});
  } catch (error) {
    console.error("Error in /verify:", error);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
});

/**
 * Handle callback queries (inline buttons)
 */
bot.on("callback_query", async (query) => {
  const data = query.data;

  try {
    // NEW: Handle network selection
    if (data.startsWith("network_")) {
      const networkKey = data.replace("network_", "");
      const { getNetwork, NETWORK_DISPLAY_NAMES } = require("./config/constants");
      const { getUserSession, saveUserSession } = require("./utils/database");
      const { STEPS } = require("./handlers/createToken");
      
      try {
        const network = getNetwork(networkKey);
        const telegramId = query.from.id;
        const session = await getUserSession(telegramId);
        
        if (session && session.step === STEPS.WAITING_NETWORK) {
          session.session_data.network = networkKey;
          session.session_data.networkName = network.name;
          
          await saveUserSession(telegramId, STEPS.WAITING_NAME, session.session_data);
          
          await bot.editMessageText(
            `✅ Network Selected: <b>${network.name}</b>\n\n📝 What is your token name?`,
            {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id,
              parse_mode: "HTML",
            }
          );
          
          await bot.answerCallbackQuery(query.id);
          return;
        }
      } catch (error) {
        console.error("Error handling network selection:", error);
        await bot.answerCallbackQuery(query.id, { text: "Error selecting network", show_alert: true });
        return;
      }
    } else if (data.startsWith("token_")) {
      await handleTokenDetail(bot, query);
    } else if (data.startsWith("manage_")) {
      await handleManageToken(bot, query);
    } else if (data.startsWith("transfer_owner_")) {
      await handleTransferOwnershipStart(bot, query);
    } else if (data.startsWith("analyze_")) {
      // NEW: Handle analyze with network selection (format: analyze_NETWORK_ADDRESS)
      const parts = data.split("_");
      
      if (parts.length === 3) {
        // Format: analyze_NETWORK_ADDRESS (from /analyze command)
        const networkKey = parts[1];
        const tokenAddress = parts[2];
        
        const user = await getUser(query.from.id, {
          username: query.from.username,
          first_name: query.from.first_name,
          last_name: query.from.last_name,
        });
        
        const { analyzeToken } = require('./handlers/analyzeToken');
        await analyzeToken(bot, query.message.chat.id, user.id, tokenAddress, networkKey);
        
        await bot.answerCallbackQuery(query.id);
      } else {
        // Format: analyze_TOKENID (from myTokens button)
        const tokenId = parts[1];
        
        const { getToken } = require("./utils/database");
        const token = await getToken(parseInt(tokenId, 10));
        
        if (!token) {
          await bot.answerCallbackQuery(query.id, { text: '❌ Token not found', show_alert: true });
          return;
        }
        
        const tokenAddress = token.token_address;
        const networkKey = token.network || "alvey";
        
        // Get user to ensure they exist and get userId
        const user = await getUser(query.from.id, {
          username: query.from.username,
          first_name: query.from.first_name,
          last_name: query.from.last_name,
        });
        
        // Import and call analyzer with network
        const { analyzeToken } = require('./handlers/analyzeToken');
        await analyzeToken(bot, query.message.chat.id, user.id, tokenAddress, networkKey);
        
        await bot.answerCallbackQuery(query.id);
      }
    } else if (data.startsWith("verify_code_")) {
      // NEW: Handle get source code button
      const tokenId = parseInt(data.replace("verify_code_", ""), 10);
      const { sendSourceCode } = require('./handlers/verificationGuide');
      await sendSourceCode(bot, query.message.chat.id, query.id);
      return;
    } else if (data.startsWith("verify_args_")) {
      // NEW: Handle get constructor args button
      const tokenId = parseInt(data.replace("verify_args_", ""), 10);
      const { sendConstructorArgs } = require('./handlers/verificationGuide');
      await sendConstructorArgs(bot, query.message.chat.id, query.id, tokenId);
      return;
    } else if (data.startsWith("verify_guide_")) {
      // NEW: Handle get verification guide button
      const tokenId = parseInt(data.replace("verify_guide_", ""), 10);
      const { sendVerificationGuide } = require('./handlers/verificationGuide');
      await sendVerificationGuide(bot, query.message.chat.id, query.id, tokenId);
      return;
    } else if (data.startsWith("vc_") && data.endsWith("_code")) {
      // NEW: Handle dynamic flattener code button
      const tokenAddress = data.match(/0x[a-fA-F0-9]{40}/)?.[0];
      if (!tokenAddress) {
        await bot.answerCallbackQuery(query.id, { text: 'Invalid token address', show_alert: true });
        return;
      }

      const { getToken } = require('./utils/database');
      const user = await getUser(query.from.id);
      const tokens = await require('./utils/database').getUserTokens(user.id);
      const token = tokens.find(t => t.token_address.toLowerCase() === tokenAddress.toLowerCase());

      if (!token) {
        await bot.answerCallbackQuery(query.id, { text: 'Token not found', show_alert: true });
        return;
      }

      const { generateFlattenedSecureToken } = require('./utils/dynamicFlattener');
      const { encodeConstructorArgs } = require('./handlers/verificationGuide');
      
      const code = generateFlattenedSecureToken({
        name: token.token_name,
        symbol: token.token_symbol,
        taxPercent: token.tax_percent || 0,
        taxWallet: token.tax_wallet || ethers.ZeroAddress,
        reflectionPercent: token.reflection_percent || 0,
        burnPercent: token.burn_percent || 0,
        enableReflection: token.has_reflection || false,
        enableBurn: token.has_burn || false
      });

      // Send as file if too large
      const fs = require('fs');
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempFile = path.join(tempDir, `SecureToken_${tokenAddress}_${Date.now()}.sol`);
      fs.writeFileSync(tempFile, code);

      try {
        await bot.sendDocument(
          query.message.chat.id,
          tempFile,
          {
            caption: '📄 <b>Flattened Contract Code</b>\n\n✅ Copy ALL content to Blockscout verification form.\n\nNo imports needed - everything is included!',
            parse_mode: 'HTML'
          }
        );
        
        setTimeout(() => {
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (e) {
            console.error('Error deleting temp file:', e);
          }
        }, 5000);
      } catch (error) {
        console.error('Error sending document:', error);
        await bot.sendMessage(
          query.message.chat.id,
          `<b>📋 Flattened Code (first part):</b>\n\n<code>${code.substring(0, 3000)}...</code>\n\n<i>File is too long. Please download the file above.</i>`,
          { parse_mode: 'HTML' }
        );
      }

      await bot.answerCallbackQuery(query.id, { text: '✅ Code ready!' });
      return;
    } else if (data.startsWith("vc_") && data.endsWith("_args")) {
      // NEW: Handle dynamic constructor args button
      const tokenAddress = data.match(/0x[a-fA-F0-9]{40}/)?.[0];
      if (!tokenAddress) {
        await bot.answerCallbackQuery(query.id, { text: 'Invalid token address', show_alert: true });
        return;
      }

      const { getToken } = require('./utils/database');
      const user = await getUser(query.from.id);
      const tokens = await require('./utils/database').getUserTokens(user.id);
      const token = tokens.find(t => t.token_address.toLowerCase() === tokenAddress.toLowerCase());

      if (!token) {
        await bot.answerCallbackQuery(query.id, { text: 'Token not found', show_alert: true });
        return;
      }

      // Get constructor arguments from database or generate them
      let args;
      if (token.constructor_arguments) {
        try {
          args = typeof token.constructor_arguments === 'string' 
            ? JSON.parse(token.constructor_arguments) 
            : token.constructor_arguments;
        } catch (e) {
          // Fallback: generate from token data
          const { encodeConstructorArgs } = require('./handlers/verificationGuide');
          args = encodeConstructorArgs({
            name: token.token_name,
            symbol: token.token_symbol,
            supply: token.initial_supply,
            taxPercent: token.tax_percent || 0,
            taxWallet: token.tax_wallet || ethers.ZeroAddress,
            reflectionPercent: token.reflection_percent || 0,
            burnPercent: token.burn_percent || 0,
            enableReflection: token.has_reflection || false,
            enableBurn: token.has_burn || false,
            owner: token.owner_wallet
          });
        }
      } else {
        // Generate from token data
        const { encodeConstructorArgs } = require('./handlers/verificationGuide');
        args = encodeConstructorArgs({
          name: token.token_name,
          symbol: token.token_symbol,
          supply: token.initial_supply,
          taxPercent: token.tax_percent || 0,
          taxWallet: token.tax_wallet || ethers.ZeroAddress,
          reflectionPercent: token.reflection_percent || 0,
          burnPercent: token.burn_percent || 0,
          enableReflection: token.has_reflection || false,
          enableBurn: token.has_burn || false,
          owner: token.owner_wallet
        });
      }

      await bot.sendMessage(
        query.message.chat.id,
        `<b>🔑 Constructor Arguments</b>\n\n` +
        `<b>Copy this EXACTLY:</b>\n\n` +
        `<code>${typeof args === 'string' ? args : JSON.stringify(args, null, 2)}</code>\n\n` +
        `ℹ️ Paste in Blockscout "Constructor Arguments" field`,
        { parse_mode: 'HTML' }
      );

      await bot.answerCallbackQuery(query.id, { text: '✅ Arguments ready!' });
      return;
    } else if (data.startsWith("di_")) {
      // NEW: Handle deployment info request
      const tokenAddress = data.replace("di_", "");
      
      const user = await getUser(query.from.id);
      const tokens = await require('./utils/database').getUserTokens(user.id);
      const token = tokens.find(t => t.token_address.toLowerCase() === tokenAddress.toLowerCase());

      if (!token) {
        await bot.answerCallbackQuery(query.id, { text: 'Token not found', show_alert: true });
        return;
      }

      let deploymentInfo = null;
      if (token.deployment_info) {
        try {
          deploymentInfo = typeof token.deployment_info === 'string' 
            ? JSON.parse(token.deployment_info) 
            : token.deployment_info;
        } catch (e) {
          console.error('Error parsing deployment_info:', e);
        }
      }

      if (deploymentInfo) {
        const formatted = `
<b>📋 DEPLOYMENT INFORMATION</b>

<b>Contract Details:</b>
Address: <code>${tokenAddress}</code>
TX Hash: <code>${deploymentInfo.txHash || token.tx_hash}</code>

<b>Token Info:</b>
- Name: ${deploymentInfo.tokenInfo?.name || token.token_name}
- Symbol: ${deploymentInfo.tokenInfo?.symbol || token.token_symbol}
- Supply: ${deploymentInfo.tokenInfo?.initialSupply || token.initial_supply}

<b>Fees:</b>
- Tax: ${deploymentInfo.fees?.taxPercent || token.tax_percent}%
- Tax Wallet: <code>${deploymentInfo.fees?.taxWallet || token.tax_wallet || 'N/A'}</code>
- Reflection: ${deploymentInfo.fees?.reflectionPercent || token.reflection_percent}%
- Burn: ${deploymentInfo.fees?.burnPercent || token.burn_percent}%

<b>Owner:</b> <code>${deploymentInfo.owner || token.owner_wallet}</code>

<b>Compiler:</b> ${deploymentInfo.compilation?.compiler || token.compiler_version || 'N/A'}
<b>EVM Version:</b> ${deploymentInfo.compilation?.evmVersion || token.evm_version || 'N/A'}

<b>Full Info:</b>
<pre>${JSON.stringify(deploymentInfo, null, 2)}</pre>
        `;

        await bot.sendMessage(query.message.chat.id, formatted, { parse_mode: 'HTML' });
      } else {
        // Fallback: show basic info
        await bot.sendMessage(
          query.message.chat.id,
          `<b>📋 Token Information</b>\n\n` +
          `Address: <code>${tokenAddress}</code>\n` +
          `Name: ${token.token_name}\n` +
          `Symbol: ${token.token_symbol}\n` +
          `Owner: <code>${token.owner_wallet}</code>\n\n` +
          `ℹ️ Deployment info not available. This token was created before the update.`,
          { parse_mode: 'HTML' }
        );
      }

      await bot.answerCallbackQuery(query.id, { text: '✅ Info sent!' });
      return;
    } else if (data.startsWith("verify_")) {
      // NEW: Handle contract verification button
      const tokenId = parseInt(data.replace("verify_", ""), 10);
      
      const { getToken } = require("./utils/database");
      const token = await getToken(tokenId);
      
      if (!token) {
        await bot.answerCallbackQuery(query.id, {
          text: "❌ Token not found",
          show_alert: true,
        });
        return;
      }
      
      // Check if token belongs to user
      const user = await getUser(query.from.id, {
        username: query.from.username,
        first_name: query.from.first_name,
        last_name: query.from.last_name,
      });
      
      if (token.user_id !== user.id) {
        await bot.answerCallbackQuery(query.id, {
          text: "❌ You can only verify your own tokens",
          show_alert: true,
        });
        return;
      }
      
      // Check if already verified (only if column exists)
      if (token.is_verified !== undefined && token.is_verified) {
        const { getNetwork } = require("./config/constants");
        const network = getNetwork(token.network || "alvey");
        await bot.answerCallbackQuery(query.id, {
          text: "✅ Contract already verified!",
          show_alert: true,
        });
        await bot.sendMessage(
          query.message.chat.id,
          `✅ <b>Contract Already Verified</b>\n\n` +
          `<a href="${network.explorer}/address/${token.token_address}#code">View Verified Code</a>`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      // Start verification
      await bot.answerCallbackQuery(query.id, { text: "⏳ Starting verification..." });
      
      await bot.sendMessage(
        query.message.chat.id,
        `⏳ Verifying contract on ${token.network || "alvey"} explorer...`,
        { parse_mode: 'HTML' }
      );
      
      const { verifyContractWithFallback } = require("./utils/blockchain");
      const { ethers } = require("ethers");
      const { getNetwork } = require("./config/constants");
      const network = getNetwork(token.network || "alvey");
      
      const verificationResult = await verifyContractWithFallback(
        token.token_address,
        token.network || "alvey",
        {
          name: token.token_name,
          symbol: token.token_symbol,
          supply: token.initial_supply,
          taxPercent: token.tax_percent || 0,
          taxWallet: token.tax_wallet || ethers.ZeroAddress,
          reflectionPercent: token.reflection_percent || 0,
          burnPercent: token.burn_percent || 0,
          enableReflection: token.has_reflection || false,
          enableBurn: token.has_burn || false,
          owner: token.owner_wallet
        }
      );
      
      // Update database
      const { updateTokenVerification } = require("./utils/database");
      if (verificationResult.success) {
        await updateTokenVerification(token.token_address, true, 'verified');
        await bot.sendMessage(
          query.message.chat.id,
          `✅ <b>Contract Verified!</b>\n\n` +
          `Your contract source code is now verified and visible on Blockscout.\n\n` +
          `<a href="${verificationResult.explorerUrl}">View Verified Code</a>`,
          { parse_mode: 'HTML' }
        );
      } else {
        await updateTokenVerification(token.token_address, false, 'failed');
        
        // Escape HTML special characters in error message
        const escapedMessage = verificationResult.message
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        
        await bot.sendMessage(
          query.message.chat.id,
          `⚠️ <b>Verification Failed</b>\n\n` +
          `Error: <code>${escapedMessage}</code>\n\n` +
          `ℹ️ <b>Manual Verification Available</b>\n` +
          `The source code is already visible on Blockscout.\n` +
          `To verify manually:\n` +
          `<a href="${network.explorer}/address/${token.token_address}#code">Click here to verify</a>\n\n` +
          `Or use the verification form:\n` +
          `<a href="${network.explorer}/address/${token.token_address}/contract-verification">Verification Form</a>`,
          { parse_mode: 'HTML' }
        );
      }
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

      // NEW: Handle claim reflection token address input
      if (session.step === 'waiting_claim_token_address') {
        const tokenAddress = msg.text.trim();
        
        // Get user to ensure they exist and get userId
        const user = await getUser(telegramId, {
          username: msg.from.username,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
        });
        
        // Import claim handler
        const { handleClaimReflection } = require('./handlers/claimReflection');
        
        // Handle claim reflection (will ask for wallet address)
        await handleClaimReflection(bot, msg.chat.id, user.id, tokenAddress);
        
        // Save session with token address to wait for wallet
        await saveUserSession(telegramId, 'waiting_claim_wallet_address', { tokenAddress });
        return;
      }

      // NEW: Handle verify token address input
      if (session.step === 'waiting_verify_address') {
        const tokenAddress = msg.text.trim();
        const { ethers } = require('ethers');
        
        if (!ethers.isAddress(tokenAddress)) {
          await bot.sendMessage(msg.chat.id, '❌ Invalid address format');
          return;
        }

        // Get user
        const user = await getUser(telegramId, {
          username: msg.from.username,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
        });

        // Check if token belongs to user
        const { getUserTokens } = require('./utils/database');
        const tokens = await getUserTokens(user.id);
        const token = tokens.find(t => t.token_address.toLowerCase() === tokenAddress.toLowerCase());

        if (!token) {
          await bot.sendMessage(msg.chat.id, '❌ Token not found in your account. You can only verify tokens you created.');
          await deleteUserSession(telegramId);
          return;
        }

        await bot.sendMessage(msg.chat.id, '⏳ Verifying contract...');

        // Verify contract
        const { verifyContract } = require('./utils/blockchain');
        const { getNetwork } = require('./config/constants');
        const network = getNetwork(token.network || 'alvey');

        const result = await verifyContract(tokenAddress, token.network || 'alvey', {
          name: token.token_name,
          symbol: token.token_symbol,
          supply: token.initial_supply,
          taxPercent: token.tax_percent || 0,
          taxWallet: token.tax_wallet || ethers.ZeroAddress,
          reflectionPercent: token.reflection_percent || 0,
          burnPercent: token.burn_percent || 0,
          enableReflection: token.has_reflection || false,
          enableBurn: token.has_burn || false,
          owner: token.owner_wallet
        });

        // Update database
        const { updateTokenVerification } = require('./utils/database');
        if (result.success) {
          await updateTokenVerification(tokenAddress, true, 'verified');
          await bot.sendMessage(
            msg.chat.id,
            `✅ <b>Contract Verified!</b>\n\n` +
            `<a href="${result.explorerUrl}">View Verified Code</a>`,
            { parse_mode: 'HTML' }
          );
        } else {
          await updateTokenVerification(tokenAddress, false, 'failed');
          await bot.sendMessage(
            msg.chat.id,
            `❌ Verification failed: ${result.message}\n\n` +
            `You can try verifying manually at:\n` +
            `<a href="${network.explorer}/address/${tokenAddress}/contract-verification">${network.explorer}/address/${tokenAddress}/contract-verification</a>`,
            { parse_mode: 'HTML' }
          );
        }

        await deleteUserSession(telegramId);
        return;
      }

      // NEW: Handle claim reflection wallet address input
      if (session.step === 'waiting_claim_wallet_address') {
        const walletAddress = msg.text.trim();
        const tokenAddress = session.session_data?.tokenAddress;
        
        if (!tokenAddress) {
          await bot.sendMessage(msg.chat.id, '❌ Token address not found. Please start over with /claim_reflection');
          await deleteUserSession(telegramId);
          return;
        }
        
        // Get user
        const user = await getUser(telegramId, {
          username: msg.from.username,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
        });
        
        // Import claim handler
        const { checkClaimableReflection } = require('./handlers/claimReflection');
        
        // Check claimable reflection
        await checkClaimableReflection(bot, msg.chat.id, user.id, tokenAddress, walletAddress);
        
        // Clear session
        await deleteUserSession(telegramId);
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

