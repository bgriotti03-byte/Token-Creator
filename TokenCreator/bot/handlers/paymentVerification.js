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
const { ADDRESSES, PAYMENT, NETWORKS, getNetwork } = require("../config/constants");
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

          // NEW: Get network from session to show correct network name
          const { getNetwork } = require("../config/constants");
          const network = session ? getNetwork(session.session_data?.network || "alvey") : getNetwork("alvey");
          
          // Notify user
          await bot.sendMessage(
            chatId,
            `✅ Payment confirmed! Please send your ${network.name.toUpperCase()} wallet address to receive token ownership.`
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
    // NEW: Get network from tokenParams or default to alvey
    const networkKey = tokenParams.network || "alvey";
    const network = getNetwork(networkKey);
    
    await bot.sendMessage(chatId, `⏳ Deploying token to ${network.name}...`);

    // Use network factory address
    const factoryAddress = network.factoryAddress;

    if (!factoryAddress || factoryAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error(`Factory address not configured for ${network.name}`);
    }

    // Deploy token
    const result = await deployToken(
      factoryAddress,
      {
        ...tokenParams,
        initialOwner: ownerWallet,
      },
      networkKey
    );

    // NEW: Validate deployment result
    if (!result || !result.tokenAddress) {
      throw new Error('DEPLOYMENT FAILED: No token address returned from deployment');
    }

    // NEW: Additional validation - verify contract exists
    const { connectProvider } = require("../utils/blockchain");
    const provider = connectProvider(networkKey);
    const code = await provider.getCode(result.tokenAddress);
    
    if (code === '0x' || code.length < 100) {
      throw new Error(
        `VALIDATION FAILED: No contract code at ${result.tokenAddress}\n` +
        `Bytecode: ${code.length} bytes (expected >1000)\n` +
        'Contract deployment verification failed'
      );
    }

    console.log('✅ Deployment validated - Contract has', Math.floor((code.length - 2) / 2), 'bytes of code');

    // NEW: Use verification helper (no source code comparison)
    const { validateDeployment, storeDeploymentInfo, generateVerificationInstructions } = require('../utils/verificationHelper');
    const { ethers } = require('ethers');
    
    // Get receipt from result if available, otherwise construct minimal receipt
    const receipt = result.receipt || {
      contractAddress: result.tokenAddress,
      transactionHash: result.txHash,
      blockNumber: result.blockNumber,
      gasUsed: { toString: () => '0' }
    };

    // Additional validation using helper
    const validation = await validateDeployment(provider, result.tokenAddress);
    console.log('✅', validation.message);

    // Convert initialSupply to string
    const initialSupplyBigInt = ethers.parseUnits(tokenParams.initialSupply.toString(), 18);
    const initialSupplyString = initialSupplyBigInt.toString();

    // Store comprehensive deployment info
    const deploymentInfo = storeDeploymentInfo({
      contractAddress: result.tokenAddress,
      txHash: result.txHash,
      blockNumber: receipt.blockNumber || result.blockNumber,
      gasUsed: receipt.gasUsed ? (typeof receipt.gasUsed === 'bigint' ? receipt.gasUsed.toString() : receipt.gasUsed.toString()) : '0',
      gasPrice: '0', // Will be updated if available
      tokenName: tokenParams.name,
      tokenSymbol: tokenParams.symbol,
      initialSupply: initialSupplyString,
      taxPercent: tokenParams.taxPercent || 0,
      taxWallet: tokenParams.taxWallet || ethers.ZeroAddress,
      reflectionPercent: tokenParams.reflectionPercent || 0,
      burnPercent: tokenParams.burnPercent || 0,
      enableReflection: tokenParams.enableReflection || false,
      enableBurn: tokenParams.enableBurn || false,
      owner: ownerWallet
    });

    // Generate verification instructions
    const instructions = generateVerificationInstructions(deploymentInfo);

    // Save token to database with deployment info
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
      network: networkKey,
      reflection_percent: tokenParams.reflectionPercent || 0,
      burn_percent: tokenParams.burnPercent || 0,
      has_reflection: tokenParams.enableReflection || false,
      has_burn: tokenParams.enableBurn || false,
      compiler_version: deploymentInfo.compilation.compiler,
      evm_version: deploymentInfo.compilation.evmVersion,
      optimization_enabled: deploymentInfo.compilation.optimizationEnabled,
      optimization_runs: deploymentInfo.compilation.optimizationRuns,
      constructor_arguments: deploymentInfo.constructorArguments,
      is_verified: false,
      verification_status: 'deployment_validated',
      deployment_info: deploymentInfo,
      verification_notes: 'Immutable variables embedded in bytecode. Manual or Blockscout support verification required.',
      verification_instructions: instructions,
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

