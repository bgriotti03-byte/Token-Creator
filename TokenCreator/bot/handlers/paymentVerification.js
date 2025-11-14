const {
  getRecentTransactions,
  verifyPayment,
  deployToken,
} = require("../utils/blockchain");
const {
  updatePaymentStatus,
  getPayment,
  saveToken,
  getUser,
} = require("../utils/database");
const { ADDRESSES, PAYMENT, NETWORKS } = require("../config/constants");
const { logActivity } = require("../utils/database");

/**
 * Start payment listener that checks for payment every 5 seconds
 * @param {object} bot - Telegram bot instance
 * @param {string} payerWallet - Wallet address that should send payment
 * @param {string} paymentId - Payment ID
 * @param {number} userId - User ID
 * @param {number} chatId - Telegram chat ID
 * @param {number} telegramId - Telegram user ID
 * @param {object} tokenParams - Token parameters for deployment
 * @returns {Promise<void>}
 */
const startPaymentListener = async (
  bot,
  payerWallet,
  paymentId,
  userId,
  chatId,
  telegramId,
  tokenParams
) => {
  const startTime = Date.now();
  const timeout = PAYMENT.TIMEOUT; // 15 minutes
  const checkInterval = PAYMENT.CHECK_INTERVAL; // 5 seconds
  let lastCheckedBlock = null;

  const checkPayment = async () => {
    try {
      // Check if timeout exceeded
      if (Date.now() - startTime > timeout) {
        await updatePaymentStatus(paymentId, "expired");
        await bot.sendMessage(
          chatId,
          "❌ Payment expired (15 minutes without confirmation)"
        );
        return;
      }

      // Get payment from DB
      const payment = await getPayment(paymentId);
      if (!payment || payment.status !== "pending") {
        return; // Payment already processed or expired
      }

      // Get current block number
      const { connectProvider } = require("../utils/blockchain");
      const provider = connectProvider("bsc");
      const currentBlock = await provider.getBlockNumber();

      // Initialize lastCheckedBlock if not set
      if (lastCheckedBlock === null) {
        lastCheckedBlock = Math.max(currentBlock - 100, 0); // Check last 100 blocks
      }

      // Get recent transactions
      const transactions = await getRecentTransactions(
        ADDRESSES.PAYMENT_WALLET_BSC,
        lastCheckedBlock,
        "bsc"
      );

      // Update last checked block
      lastCheckedBlock = currentBlock;

      // Filter transactions by payer wallet
      const matchingTxs = transactions.filter(
        (tx) => tx.from.toLowerCase() === payerWallet.toLowerCase()
      );

      for (const tx of matchingTxs) {
        // Verify payment
        const isValid = await verifyPayment(
          tx.txHash,
          PAYMENT.AMOUNT_USDT,
          payerWallet,
          ADDRESSES.PAYMENT_WALLET_BSC,
          "bsc"
        );

        if (isValid) {
          // Check if this tx_hash was already used
          const existingPayment = await getPayment(paymentId);
          if (existingPayment && existingPayment.tx_hash === tx.txHash) {
            continue; // Already processed
          }

          // Update payment status
          await updatePaymentStatus(paymentId, "confirmed", tx.txHash);

          // Update session to wait for owner wallet
          const { getUserSession, saveUserSession } = require("../utils/database");
          const { STEPS } = require("./createToken");
          const session = await getUserSession(telegramId);
          
          if (session) {
            session.session_data.paymentConfirmed = true;
            await saveUserSession(telegramId, STEPS.WAITING_OWNER_WALLET, session.session_data);
          }

          // Notify user
          await bot.sendMessage(
            chatId,
            "✅ Payment confirmed! Please send your ALVEY CHAIN wallet address to receive token ownership."
          );

          // Log activity
          await logActivity(userId, "payment_confirmed", {
            payment_id: paymentId,
            tx_hash: tx.txHash,
          });

          return; // Stop checking
        }
      }

      // Schedule next check
      setTimeout(checkPayment, checkInterval);
    } catch (error) {
      console.error("Error in payment listener:", error);
      // Continue checking even on error
      setTimeout(checkPayment, checkInterval);
    }
  };

  // Start checking
  checkPayment();
};

/**
 * Deploy token after payment confirmation
 * @param {object} bot - Telegram bot instance
 * @param {number} chatId - Telegram chat ID
 * @param {number} userId - User ID
 * @param {object} tokenParams - Token parameters
 * @param {string} ownerWallet - Owner wallet address
 * @returns {Promise<object>} Deployment result
 */
const deployTokenAfterPayment = async (
  bot,
  chatId,
  userId,
  tokenParams,
  ownerWallet
) => {
  try {
    await bot.sendMessage(chatId, "⏳ Deploying token to Alvey Chain...");

    const { ADDRESSES } = require("../config/constants");
    const factoryAddress = ADDRESSES.FACTORY_ADDRESS;

    if (!factoryAddress || factoryAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error("Factory address not configured");
    }

    // Deploy token
    const result = await deployToken(
      factoryAddress,
      {
        ...tokenParams,
        initialOwner: ownerWallet,
      },
      "alvey"
    );

    // Save token to database
    const tokenId = await saveToken(userId, {
      token_name: tokenParams.name,
      token_symbol: tokenParams.symbol,
      initial_supply: tokenParams.initialSupply,
      tax_percent: tokenParams.taxPercent || 0,
      tax_wallet: tokenParams.taxWallet || null,
      token_address: result.tokenAddress,
      owner_wallet: ownerWallet,
      factory_address: factoryAddress,
      tx_hash: result.txHash,
      network: "alvey",
      reflection_percent: tokenParams.reflectionPercent || 0,
      burn_percent: tokenParams.burnPercent || 0,
      has_reflection: tokenParams.enableReflection || false,
      has_burn: tokenParams.enableBurn || false,
    });

    await logActivity(userId, "token_deployed", {
      token_id: tokenId,
      token_address: result.tokenAddress,
      tx_hash: result.txHash,
    });

    return {
      success: true,
      tokenId,
      ...result,
    };
  } catch (error) {
    console.error("Error deploying token:", error);
    throw error;
  }
};

module.exports = {
  startPaymentListener,
  deployTokenAfterPayment,
};

