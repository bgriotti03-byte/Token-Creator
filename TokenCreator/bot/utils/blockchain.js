const { ethers } = require("ethers");
const { NETWORKS, getNetwork, ADDRESSES, USDT_ABI, FACTORY_ABI, TOKEN_ABI } = require("../config/constants");
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
require("dotenv").config();

/**
 * Connect to blockchain provider
 * @param {string} networkKey - Network key ('alvey', 'bscTestnet', 'bsc')
 * @returns {ethers.Provider} Provider instance
 */
const connectProvider = (networkKey) => {
  const network = getNetwork(networkKey);
  
  console.log(`Connecting to ${network.name} (${network.rpc})`);
  
  // Use WebSocket if URL starts with wss:// or ws://, otherwise HTTP
  if (network.rpc.startsWith("wss://") || network.rpc.startsWith("ws://")) {
    return new ethers.WebSocketProvider(network.rpc);
  } else {
    return new ethers.JsonRpcProvider(network.rpc);
  }
};

/**
 * Get token details from blockchain
 * @param {string} tokenAddress - Token contract address
 * @param {string} networkKey - Network key
 * @returns {Promise<object>} Token details
 */
const getTokenDetails = async (tokenAddress, networkKey = "alvey") => {
  try {
    const provider = connectProvider(networkKey);
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
 * @param {string} factoryAddress - Factory contract address (optional, will use network.factoryAddress if not provided)
 * @param {object} params - Token parameters
 * @param {string} networkKey - Network key ('alvey', 'bscTestnet', etc.)
 * @returns {Promise<object>} Transaction hash and token address
 */
const deployToken = async (factoryAddress, params, networkKey = "alvey") => {
  try {
    if (!process.env.BOT_PRIVATE_KEY) {
      throw new Error("BOT_PRIVATE_KEY not set in environment");
    }

    const network = getNetwork(networkKey);
    
    // Use network factory address if not provided
    const actualFactoryAddress = factoryAddress || network.factoryAddress;
    if (!actualFactoryAddress || actualFactoryAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error(`Factory address not configured for ${network.name}`);
    }

    const provider = connectProvider(networkKey);
    const wallet = new ethers.Wallet(process.env.BOT_PRIVATE_KEY, provider);
    const factory = new ethers.Contract(actualFactoryAddress, FACTORY_ABI, wallet);
    
    console.log('\n=== DEPLOYMENT STARTING ===');
    console.log('Network:', network.name);
    console.log('Token:', params.name, params.symbol);
    console.log('Owner:', params.initialOwner);
    console.log('Factory:', actualFactoryAddress);

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
    if (typeof taxWallet !== "string") {
      taxWallet = taxWallet.toString();
    }

    // NEW: Log parameters before sending (after taxWallet is initialized)
    console.log('\n=== CONSTRUCTOR PARAMETERS ===');
    console.log('Name:', params.name);
    console.log('Symbol:', params.symbol);
    console.log('Supply:', ethers.formatUnits(initialSupply, 18));
    console.log('Tax %:', params.taxPercent || 0);
    console.log('Tax Wallet:', taxWallet);
    console.log('Reflection %:', params.reflectionPercent || 0);
    console.log('Burn %:', params.burnPercent || 0);
    console.log('Enable Reflection:', params.enableReflection || false);
    console.log('Enable Burn:', params.enableBurn || false);
    console.log('Owner:', params.initialOwner);
    
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
        params.initialOwner,
        {
          gasLimit: 5000000, // 5M gas limit
          gasPrice: networkKey === 'alvey' ? ethers.parseUnits('100', 'gwei') : undefined, // 100 gwei for Alvey
        }
      );
      
      console.log('TX Hash:', tx.hash);
      console.log('Waiting for confirmations...');
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
        params.initialOwner,
        {
          gasLimit: 5000000, // 5M gas limit
          gasPrice: networkKey === 'alvey' ? ethers.parseUnits('100', 'gwei') : undefined, // 100 gwei for Alvey
        }
      );
      
      console.log('TX Hash:', tx.hash);
      console.log('Waiting for confirmations...');
    }

    // Wait for transaction receipt (2 confirmations)
    const receipt = await tx.wait(2);

    console.log('\n=== DEPLOYMENT RECEIPT ===');
    console.log('TX Hash:', tx.hash);
    console.log('TX Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
    console.log('Contract Address:', receipt.contractAddress);
    console.log('Gas Used:', receipt.gasUsed.toString());

    // NEW: Validate TX didn't fail
    if (!receipt || receipt.status === 0) {
      throw new Error(
        'TX FAILED: Transaction was reverted by network\n' +
        'Possible causes:\n' +
        '- Invalid constructor arguments\n' +
        '- Out of gas\n' +
        '- RPC error'
      );
    }

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

    console.log('Token address from event:', tokenAddress);

    // NEW: Verify contract actually exists on blockchain
    console.log('Verifying contract bytecode...');
    const code = await provider.getCode(tokenAddress);

    console.log('Bytecode length:', code.length);
    console.log('First 100 chars:', code.substring(0, 100));

    if (code === '0x' || code.length < 100) {
      throw new Error(
        `VALIDATION FAILED: No contract code at ${tokenAddress}\n` +
        `Bytecode: ${code.length} bytes (expected >1000)\n` +
        'Deployment failed or was not included in block'
      );
    }

    console.log('✅ CONTRACT VERIFIED - Bytecode size:', Math.floor((code.length - 2) / 2), 'bytes');

    return {
      txHash: receipt.hash,
      tokenAddress,
      blockNumber: receipt.blockNumber,
      receipt: receipt,
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
 * @param {string} networkKey - Network key ('bsc' for USDT)
 * @returns {Promise<boolean>} True if payment is valid
 */
const verifyPayment = async (
  txHash,
  expectedAmount,
  expectedFrom,
  expectedTo,
  networkKey = "bsc"
) => {
  try {
    const provider = connectProvider(networkKey);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt || receipt.status !== 1) {
      return false;
    }

    // Get USDT contract
    const usdtAddress = networkKey === "bsc" || networkKey === "bscTestnet" ? ADDRESSES.USDT_BSC : ADDRESSES.aUSDT_ALVEY;
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
 * @param {string} networkKey - Network key
 * @returns {Promise<object>} Transaction receipt
 */
const getTransactionReceipt = async (txHash, networkKey = "alvey") => {
  try {
    const provider = connectProvider(networkKey);
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
 * @param {string} networkKey - Network key
 * @returns {Promise<Array>} Array of transaction hashes
 */
const getRecentTransactions = async (toAddress, fromBlock, networkKey = "bsc") => {
  try {
    const provider = connectProvider(networkKey);
    const currentBlock = await provider.getBlockNumber();
    const usdtAddress = networkKey === "bsc" || networkKey === "bscTestnet" ? ADDRESSES.USDT_BSC : ADDRESSES.aUSDT_ALVEY;
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
const getTokenFeatures = async (tokenAddress, networkKey = "alvey") => {
  try {
    const provider = connectProvider(networkKey);
    
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
const checkTokenFeature = async (tokenAddress, featureName, networkKey = "alvey") => {
  try {
    const features = await getTokenFeatures(tokenAddress, networkKey);
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

/**
 * NEW: Claim reflection rewards for a holder
 * @param {string} tokenAddress - Token contract address
 * @param {string} networkKey - Network key
 * @returns {Promise<object>} Transaction hash and claimed amount
 */
const claimReflectionRewards = async (tokenAddress, networkKey = "alvey") => {
  try {
    if (!process.env.BOT_PRIVATE_KEY) {
      throw new Error("BOT_PRIVATE_KEY not set in environment");
    }

    const provider = connectProvider(networkKey);
    const wallet = new ethers.Wallet(process.env.BOT_PRIVATE_KEY, provider);
    
    // ABI for claimReflectionRewards
    const TOKEN_REFLECTION_ABI = [
      "function claimReflectionRewards() external returns (uint256)",
      "function getClaimableReflection(address holder) external view returns (uint256)",
      "function HAS_REFLECTION() external view returns (bool)",
    ];
    
    const tokenContract = new ethers.Contract(tokenAddress, TOKEN_REFLECTION_ABI, wallet);
    
    // Check if reflection is enabled
    const hasReflection = await tokenContract.HAS_REFLECTION();
    if (!hasReflection) {
      throw new Error("Reflection is not enabled for this token");
    }
    
    // Check claimable amount before claiming
    const claimableAmount = await tokenContract.getClaimableReflection(wallet.address);
    if (claimableAmount === 0n) {
      throw new Error("No reflection rewards available to claim");
    }
    
    // Claim reflection rewards
    const tx = await tokenContract.claimReflectionRewards();
    const receipt = await tx.wait();
    
    return {
      txHash: receipt.hash,
      claimedAmount: claimableAmount.toString(),
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error("Error claiming reflection rewards:", error);
    throw error;
  }
};

/**
 * NEW: Get claimable reflection amount for an address
 * @param {string} tokenAddress - Token contract address
 * @param {string} holderAddress - Holder address
 * @param {string} networkKey - Network key
 * @returns {Promise<string>} Claimable reflection amount
 */
const getClaimableReflection = async (tokenAddress, holderAddress, networkKey = "alvey") => {
  try {
    const provider = connectProvider(networkKey);
    
    const TOKEN_REFLECTION_ABI = [
      "function getClaimableReflection(address holder) external view returns (uint256)",
      "function HAS_REFLECTION() external view returns (bool)",
    ];
    
    const tokenContract = new ethers.Contract(tokenAddress, TOKEN_REFLECTION_ABI, provider);
    
    const hasReflection = await tokenContract.HAS_REFLECTION();
    if (!hasReflection) {
      return "0";
    }
    
    const claimable = await tokenContract.getClaimableReflection(holderAddress);
    return claimable.toString();
  } catch (error) {
    console.error("Error getting claimable reflection:", error);
    return "0";
  }
};

/**
 * NEW: Verify contract on Blockscout/Etherscan using Hardhat
 * @param {string} tokenAddress - Token contract address
 * @param {string} networkKey - Network key ('alvey', 'bscTestnet', 'bsc')
 * @param {object} params - Constructor parameters
 * @returns {Promise<object>} Verification result
 */
async function verifyContract(tokenAddress, networkKey, params) {
    try {
        const network = getNetwork(networkKey);

        console.log(`Starting verification for ${tokenAddress} on ${network.name}`);

        // Prepare constructor arguments in correct order
        const constructorArgs = [
            params.name,
            params.symbol,
            params.supply,
            params.taxPercent || 0,
            params.taxWallet || ethers.ZeroAddress,
            params.reflectionPercent || 0,
            params.burnPercent || 0,
            params.enableReflection || false,
            params.enableBurn || false,
            params.owner
        ];

        // Build verification command
        const argsString = constructorArgs
            .map(arg => {
                if (typeof arg === 'string' && arg.startsWith('0x')) {
                    return `"${arg}"`;
                } else if (typeof arg === 'string') {
                    return `"${arg}"`;
                } else if (typeof arg === 'boolean') {
                    return arg.toString();
                } else {
                    return arg.toString();
                }
            })
            .join(' ');

        const command = `npx hardhat verify --network ${networkKey} ${tokenAddress} ${argsString}`;

        console.log('Verification command:', command);

        // Execute verification (with timeout)
        const { stdout, stderr } = await execPromise(command, {
            timeout: 60000, // 60 second timeout
            cwd: process.cwd()
        });

        console.log('Verification output:', stdout);

        if (stderr && !stderr.includes('Warning')) {
            console.error('Verification stderr:', stderr);
        }

        // Check if verification was successful
        if (stdout.includes('Successfully verified') || 
            stdout.includes('Already Verified') ||
            stdout.includes('Contract source code already verified')) {
            return {
                success: true,
                message: 'Contract verified successfully',
                explorerUrl: `${network.explorer}/address/${tokenAddress}#code`
            };
        }

        return {
            success: false,
            message: 'Verification pending or failed',
            output: stdout
        };

    } catch (error) {
        console.error('Error verifying contract:', error);
        
        // If error is "Already Verified", treat as success
        if (error.message && (
            error.message.includes('Already Verified') ||
            error.message.includes('already verified') ||
            error.message.includes('Contract source code already verified')
        )) {
            const network = getNetwork(networkKey);
            return {
                success: true,
                message: 'Contract already verified',
                explorerUrl: `${network.explorer}/address/${tokenAddress}#code`
            };
        }

        // Clean error message - remove ANSI color codes and extract useful info
        let cleanMessage = error.message || 'Unknown error';
        
        // Remove ANSI color codes (e.g., \x1B[31m, \x1B[39m, etc.)
        cleanMessage = cleanMessage.replace(/\x1B\[[0-9;]*m/g, '');
        
        // Extract useful error info
        if (error.stderr) {
            const stderrClean = error.stderr.replace(/\x1B\[[0-9;]*m/g, '');
            if (stderrClean.includes('Unexpected token') && stderrClean.includes('<!DOCTYPE')) {
                cleanMessage = 'Blockscout API returned HTML instead of JSON. Automatic verification may not be supported. Please verify manually on the explorer.';
            } else if (stderrClean.includes('Unexpected token')) {
                cleanMessage = 'Blockscout API error: Invalid response format. Please verify manually on the explorer.';
            } else if (stderrClean.includes('network request failed')) {
                cleanMessage = 'Network request failed. The explorer API may be temporarily unavailable. Please try again later or verify manually.';
            } else {
                // Extract the main error line
                const errorLines = stderrClean.split('\n').filter(line => 
                    line.trim() && 
                    !line.includes('WARNING') && 
                    !line.includes('hardhat-verify') &&
                    !line.includes('Etherscan:')
                );
                if (errorLines.length > 0) {
                    cleanMessage = errorLines[0].trim();
                }
            }
        }
        
        // Limit message length for Telegram
        if (cleanMessage.length > 200) {
            cleanMessage = cleanMessage.substring(0, 197) + '...';
        }

        return {
            success: false,
            message: cleanMessage,
            error: error
        };
    }
}

/**
 * NEW: Verify contract with fallback to direct Blockscout API
 * Tries Hardhat first, then falls back to direct API if Hardhat fails
 */
async function verifyContractWithFallback(tokenAddress, networkKey, params) {
    // Try Hardhat verification first
    let result = await verifyContract(tokenAddress, networkKey, params);
    
    // If Hardhat fails and it's Alvey Chain, try direct Blockscout API
    if (!result.success && networkKey === 'alvey') {
        console.log('Hardhat verify failed, trying direct Blockscout API...');
        try {
            const { verifyContractDirect } = require('./blockscoutVerify');
            const directResult = await verifyContractDirect(tokenAddress, networkKey, params);
            
            if (directResult.success) {
                return directResult;
            }
            
            // If direct API also fails, return the original Hardhat error
            return {
                success: false,
                message: `Hardhat verification failed: ${result.message}. Direct API also failed: ${directResult.message}`,
                error: result.error
            };
        } catch (fallbackError) {
            console.error('Fallback verification error:', fallbackError);
            return result; // Return original Hardhat error
        }
    }
    
    return result;
}

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
  claimReflectionRewards,
  getClaimableReflection,
  verifyContract,
  verifyContractWithFallback,
};

