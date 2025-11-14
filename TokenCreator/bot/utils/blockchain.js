const { ethers } = require("ethers");
const { NETWORKS, ADDRESSES, USDT_ABI, FACTORY_ABI, TOKEN_ABI } = require("../config/constants");
require("dotenv").config();

/**
 * Connect to blockchain provider
 * @param {string} network - Network name ('alvey' or 'bsc')
 * @returns {ethers.Provider} Provider instance
 */
const connectProvider = (network) => {
  const networkConfig = NETWORKS[network];
  if (!networkConfig) {
    throw new Error(`Unknown network: ${network}`);
  }
  return new ethers.JsonRpcProvider(networkConfig.rpc);
};

/**
 * Get token details from blockchain
 * @param {string} tokenAddress - Token contract address
 * @param {string} network - Network name
 * @returns {Promise<object>} Token details
 */
const getTokenDetails = async (tokenAddress, network = "alvey") => {
  try {
    const provider = connectProvider(network);
    const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);

    const [name, symbol, totalSupply, owner] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.totalSupply(),
      tokenContract.owner(),
    ]);

    return {
      name,
      symbol,
      totalSupply: totalSupply.toString(),
      owner,
    };
  } catch (error) {
    console.error("Error in getTokenDetails:", error);
    throw error;
  }
};

/**
 * Deploy token using factory
 * @param {string} factoryAddress - Factory contract address
 * @param {object} params - Token parameters
 * @param {string} network - Network name
 * @returns {Promise<object>} Transaction hash and token address
 */
const deployToken = async (factoryAddress, params, network = "alvey") => {
  try {
    if (!process.env.BOT_PRIVATE_KEY) {
      throw new Error("BOT_PRIVATE_KEY not set in environment");
    }

    const provider = connectProvider(network);
    const wallet = new ethers.Wallet(process.env.BOT_PRIVATE_KEY, provider);
    const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, wallet);

    // Convert supply to BigNumber
    const initialSupply = ethers.parseUnits(params.initialSupply.toString(), 18);

    // If taxPercent is 0 and no taxWallet provided, use owner address as taxWallet
    // (it won't be used anyway since tax is 0)
    // This is a workaround for the deployed contract that requires taxWallet even when tax is 0
    let taxWallet = params.taxWallet;
    if (!taxWallet || taxWallet === ethers.ZeroAddress || taxWallet === "0x0000000000000000000000000000000000000000") {
      if (params.taxPercent === 0 || !params.taxPercent) {
        // Use owner address when tax is 0 (won't be used since tax is 0%)
        taxWallet = params.initialOwner;
      } else {
        // Tax > 0 requires a valid wallet - this should not happen
        throw new Error("Tax wallet is required when tax percent > 0");
      }
    }
    
    // Ensure taxWallet is a valid address string
    if (typeof taxWallet === "string") {
      taxWallet = taxWallet;
    } else {
      taxWallet = taxWallet.toString();
    }
    
    // Call factory.createToken
    const tx = await factory.createToken(
      params.name,
      params.symbol,
      initialSupply,
      params.taxPercent,
      taxWallet,
      params.initialOwner
    );

    // Wait for transaction receipt
    const receipt = await tx.wait();

    // Get token address from event
    const event = receipt.logs.find((log) => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed && parsed.name === "TokenDeployed";
      } catch {
        return false;
      }
    });

    let tokenAddress;
    if (event) {
      const parsed = factory.interface.parseLog(event);
      tokenAddress = parsed.args.tokenAddress;
    } else {
      // Fallback: get from factory events
      const filter = factory.filters.TokenDeployed();
      const events = await factory.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
      if (events.length > 0) {
        tokenAddress = events[0].args.tokenAddress;
      } else {
        throw new Error("Could not find TokenDeployed event");
      }
    }

    return {
      txHash: receipt.hash,
      tokenAddress,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error("Error in deployToken:", error);
    throw error;
  }
};

/**
 * Transfer token ownership
 * @param {string} tokenAddress - Token contract address
 * @param {string} newOwner - New owner address
 * @param {string} network - Network name
 * @returns {Promise<string>} Transaction hash
 */
const transferOwnership = async (tokenAddress, newOwner, network = "alvey") => {
  try {
    if (!process.env.BOT_PRIVATE_KEY) {
      throw new Error("BOT_PRIVATE_KEY not set in environment");
    }

    const provider = connectProvider(network);
    const wallet = new ethers.Wallet(process.env.BOT_PRIVATE_KEY, provider);
    const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, wallet);

    const tx = await tokenContract.transferOwnership(newOwner);
    const receipt = await tx.wait();

    return receipt.hash;
  } catch (error) {
    console.error("Error in transferOwnership:", error);
    throw error;
  }
};

/**
 * Verify payment transaction
 * @param {string} txHash - Transaction hash
 * @param {number} expectedAmount - Expected amount in USDT
 * @param {string} expectedFrom - Expected sender address
 * @param {string} expectedTo - Expected recipient address
 * @param {string} network - Network name ('bsc' for USDT)
 * @returns {Promise<boolean>} True if payment is valid
 */
const verifyPayment = async (
  txHash,
  expectedAmount,
  expectedFrom,
  expectedTo,
  network = "bsc"
) => {
  try {
    const provider = connectProvider(network);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt || receipt.status !== 1) {
      return false;
    }

    // Get USDT contract
    const usdtAddress = network === "bsc" ? ADDRESSES.USDT_BSC : ADDRESSES.aUSDT_ALVEY;
    const usdtContract = new ethers.Contract(usdtAddress, USDT_ABI, provider);

    // Parse Transfer events
    const transferInterface = new ethers.Interface(USDT_ABI);
    const transferEvent = transferInterface.getEvent("Transfer");

    for (const log of receipt.logs) {
      try {
        const parsed = transferInterface.parseLog(log);
        if (
          parsed &&
          parsed.name === "Transfer" &&
          parsed.args.from.toLowerCase() === expectedFrom.toLowerCase() &&
          parsed.args.to.toLowerCase() === expectedTo.toLowerCase()
        ) {
          // USDT has 18 decimals
          const amount = Number(ethers.formatUnits(parsed.args.value, 18));
          if (Math.abs(amount - expectedAmount) < 0.01) {
            // Allow small difference for rounding
            return true;
          }
        }
      } catch {
        // Not a Transfer event, continue
      }
    }

    return false;
  } catch (error) {
    console.error("Error in verifyPayment:", error);
    return false;
  }
};

/**
 * Get transaction receipt
 * @param {string} txHash - Transaction hash
 * @param {string} network - Network name
 * @returns {Promise<object>} Transaction receipt
 */
const getTransactionReceipt = async (txHash, network = "alvey") => {
  try {
    const provider = connectProvider(network);
    const receipt = await provider.getTransactionReceipt(txHash);
    return receipt;
  } catch (error) {
    console.error("Error in getTransactionReceipt:", error);
    throw error;
  }
};

/**
 * Get recent transactions to an address
 * @param {string} toAddress - Recipient address
 * @param {number} fromBlock - Starting block number
 * @param {string} network - Network name
 * @returns {Promise<Array>} Array of transaction hashes
 */
const getRecentTransactions = async (toAddress, fromBlock, network = "bsc") => {
  try {
    const provider = connectProvider(network);
    const currentBlock = await provider.getBlockNumber();
    const usdtAddress = network === "bsc" ? ADDRESSES.USDT_BSC : ADDRESSES.aUSDT_ALVEY;
    const usdtContract = new ethers.Contract(usdtAddress, USDT_ABI, provider);

    // Get Transfer events
    const filter = usdtContract.filters.Transfer(null, toAddress);
    const events = await usdtContract.queryFilter(filter, fromBlock, currentBlock);

    return events.map((event) => ({
      txHash: event.transactionHash,
      from: event.args.from,
      to: event.args.to,
      value: event.args.value.toString(),
      blockNumber: event.blockNumber,
      timestamp: event.blockTimestamp,
    }));
  } catch (error) {
    console.error("Error in getRecentTransactions:", error);
    return [];
  }
};

module.exports = {
  connectProvider,
  getTokenDetails,
  deployToken,
  transferOwnership,
  verifyPayment,
  getTransactionReceipt,
  getRecentTransactions,
};

