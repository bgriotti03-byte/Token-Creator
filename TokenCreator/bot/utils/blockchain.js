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
    
    // Try to call factory.createToken with new parameters first
    // If Factory is old version, fallback to old signature
    let tx;
    try {
      // Try new signature (with reflection and burn)
      tx = await factory.createToken(
        params.name,
        params.symbol,
        initialSupply,
        params.taxPercent || 0,
        taxWallet,
        params.reflectionPercent || 0,
        params.burnPercent || 0,
        params.enableReflection || false,
        params.enableBurn || false,
        params.initialOwner
      );
    } catch (error) {
      // Factory might be old version - try old signature
      console.log('New Factory signature failed, trying old signature...');
      const OLD_FACTORY_ABI = [
        "function createToken(string memory _name, string memory _symbol, uint256 _initialSupply, uint256 _taxPercent, address _taxWallet, address _initialOwner) external returns (address)",
      ];
      const oldFactory = new ethers.Contract(factoryAddress, OLD_FACTORY_ABI, wallet);
      
      // Check if reflection/burn are actually enabled with non-zero percentages
      const hasReflection = params.enableReflection && (params.reflectionPercent || 0) > 0;
      const hasBurn = params.enableBurn && (params.burnPercent || 0) > 0;
      
      if (hasReflection || hasBurn) {
        throw new Error(
          "⚠️ Reflection and Burn features require the new Factory contract.\n\n" +
          "Your token will be created WITHOUT reflection/burn features.\n" +
          "To use these features, please deploy the updated Factory contract first.\n\n" +
          "You can still create tokens with Tax only using the current Factory."
        );
      }
      
      // Use old signature (reflection/burn are disabled or 0, so it's safe)
      tx = await oldFactory.createToken(
        params.name,
        params.symbol,
        initialSupply,
        params.taxPercent || 0,
        taxWallet,
        params.initialOwner
      );
    }

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

/**
 * NEW: Get token features directly from SecureToken contract
 * Reads public variables instead of using Factory (for backward compatibility)
 */
const getTokenFeatures = async (tokenAddress, network = "alvey") => {
  try {
    const provider = connectProvider(network);
    
    // ABI for reading public variables from SecureToken
    const SECURE_TOKEN_FEATURES_ABI = [
      "function HAS_REFLECTION() external view returns (bool)",
      "function HAS_BURN() external view returns (bool)",
      "function REFLECTION_PERCENT() external view returns (uint8)",
      "function BURN_PERCENT() external view returns (uint8)",
      "function taxWallet() external view returns (address)",
      "function taxPercent() external view returns (uint256)",
    ];

    const tokenContract = new ethers.Contract(tokenAddress, SECURE_TOKEN_FEATURES_ABI, provider);
    
    // Try to read new features (for new tokens with reflection/burn)
    try {
      const [hasReflection, hasBurn, reflectionPercent, burnPercent, taxWallet, taxPercent] = await Promise.all([
        tokenContract.HAS_REFLECTION().catch(() => false),
        tokenContract.HAS_BURN().catch(() => false),
        tokenContract.REFLECTION_PERCENT().catch(() => 0),
        tokenContract.BURN_PERCENT().catch(() => 0),
        tokenContract.taxWallet().catch(() => ethers.ZeroAddress),
        tokenContract.taxPercent().catch(() => 0),
      ]);
      
      return {
        hasReflection: hasReflection || false,
        hasBurn: hasBurn || false,
        reflectionPercent: Number(reflectionPercent) || 0,
        burnPercent: Number(burnPercent) || 0,
        taxWallet: taxWallet || ethers.ZeroAddress,
        taxPercent: Number(taxPercent) || 0
      };
    } catch (error) {
      // Fallback: try reading only tax (for old tokens)
      try {
        const taxPercent = await tokenContract.taxPercent();
        const taxWallet = await tokenContract.taxWallet().catch(() => ethers.ZeroAddress);
        
        return {
          hasReflection: false,
          hasBurn: false,
          reflectionPercent: 0,
          burnPercent: 0,
          taxWallet: taxWallet || ethers.ZeroAddress,
          taxPercent: Number(taxPercent) || 0
        };
      } catch (fallbackError) {
        console.error('Error reading token features (fallback):', fallbackError);
        return null;
      }
    }
  } catch (error) {
    console.error('Error getting token features:', error);
    return null;
  }
};

/**
 * NEW: Check if a specific feature is enabled on token
 */
const checkTokenFeature = async (tokenAddress, featureName, network = "alvey") => {
  try {
    const features = await getTokenFeatures(tokenAddress, network);
    if (!features) return false;
    
    const featureMap = {
      'reflection': features.hasReflection,
      'burn': features.hasBurn,
      'tax': features.taxPercent > 0
    };
    
    return featureMap[featureName] || false;
  } catch (error) {
    console.error('Error checking feature:', error);
    return false;
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
  getTokenFeatures,
  checkTokenFeature,
};

