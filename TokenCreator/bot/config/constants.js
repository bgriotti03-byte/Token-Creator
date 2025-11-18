require("dotenv").config();

// Multi-chain network configurations
const NETWORKS = {
  alvey: {
    name: "Alvey Chain",
    rpc: process.env.ALVEY_RPC_URL || process.env.ALVEY_RPC || "https://elves-core2.alvey.io/",
    chainId: 3797,
    currency: "ALV",
    explorer: "https://alveyscan.com",
    factoryAddress: process.env.FACTORY_ALVEY_ADDRESS || process.env.FACTORY_ADDRESS || "0x0000000000000000000000000000000000000000",
    nativeCurrency: {
      name: "Alvey",
      symbol: "ALV",
      decimals: 18,
    },
  },
  bscTestnet: {
    name: "BSC Testnet",
    rpc: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545",
    chainId: 97,
    currency: "tBNB",
    explorer: "https://testnet.bscscan.com",
    factoryAddress: process.env.FACTORY_BSC_TESTNET_ADDRESS || "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
    nativeCurrency: {
      name: "Test BNB",
      symbol: "tBNB",
      decimals: 18,
    },
  },
  bsc: {
    name: "Binance Smart Chain",
    rpc: process.env.BSC_RPC || "https://bsc-dataseed1.binance.org",
    chainId: 56,
    currency: "BNB",
    explorer: "https://bscscan.com",
    factoryAddress: process.env.FACTORY_BSC_ADDRESS || "0x0000000000000000000000000000000000000000",
    nativeCurrency: {
      name: "BNB",
      symbol: "BNB",
      decimals: 18,
    },
  },
};

// Helper to get network by key
function getNetwork(networkKey) {
  const network = NETWORKS[networkKey];
  if (!network) {
    throw new Error(`Network ${networkKey} not found`);
  }
  return network;
}

// Network display names for user selection
const NETWORK_DISPLAY_NAMES = {
  alvey: "🔷 Alvey Chain",
  bscTestnet: "🟡 BSC Testnet",
  bsc: "🟠 BSC Mainnet",
};

// Contract addresses
const ADDRESSES = {
  FACTORY_ADDRESS: process.env.FACTORY_ADDRESS || "0x0000000000000000000000000000000000000000",
  PAYMENT_WALLET_BSC: process.env.PAYMENT_WALLET_BSC || "0x0000000000000000000000000000000000000000",
  PAYMENT_WALLET_ALVEY: process.env.PAYMENT_WALLET_ALVEY || "0x0000000000000000000000000000000000000000",
  USDT_BSC: process.env.USDT_BSC || "0x55d398326f99059fF775485246999027B3197955",
  aUSDT_ALVEY: process.env.aUSDT_ALVEY || "0x0000000000000000000000000000000000000000",
};

// Payment configuration
const PAYMENT = {
  AMOUNT_USDT: parseFloat(process.env.PAYMENT_AMOUNT_USDT || "20"),
  TIMEOUT: parseInt(process.env.PAYMENT_TIMEOUT || "900000", 10), // 15 minutes
  CHECK_INTERVAL: parseInt(process.env.PAYMENT_CHECK_INTERVAL || "5000", 10), // 5 seconds
};

// Timeouts and limits
const TIMEOUTS = {
  PAYMENT_TIMEOUT: PAYMENT.TIMEOUT,
  PAYMENT_CHECK_INTERVAL: PAYMENT.CHECK_INTERVAL,
  SESSION_EXPIRY: 3600000, // 1 hour
  RATE_LIMIT_TOKEN_CREATION: 600000, // 10 minutes
};

// Test mode (skip payment verification)
const TEST_MODE = process.env.TEST_MODE === "true" || process.env.TEST_MODE === "1";

// Disable rate limit for testing
const DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT === "true" || process.env.DISABLE_RATE_LIMIT === "1";

// NEW: Feature validation limits
const FEATURE_LIMITS = {
  MIN_TAX: 0,
  MAX_TAX: 100,
  MIN_REFLECTION: 0,
  MAX_REFLECTION: 100,
  MIN_BURN: 0,
  MAX_BURN: 100,
  MAX_TOTAL_FEES: 100,  // Tax + Reflection + Burn cannot exceed
};

// USDT token ABI (minimal for transfer detection)
const USDT_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// Factory ABI (minimal)
const FACTORY_ABI = [
  "function createToken(string memory _name, string memory _symbol, uint256 _initialSupply, uint8 _taxPercent, address _taxWallet, uint8 _reflectionPercent, uint8 _burnPercent, bool _enableReflection, bool _enableBurn, address _initialOwner) external returns (address)",
  "function getTokenFeatures(address tokenAddress) external view returns (bool hasReflection, bool hasBurn, uint8 reflectionPercent, uint8 burnPercent, address taxWallet, uint8 taxPercent)",
  "event TokenDeployed(address indexed tokenAddress, address indexed creator, string name, string symbol, uint256 initialSupply, uint256 taxPercent, address taxWallet, address initialOwner)",
];

// Token ABI (minimal)
const TOKEN_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "function owner() external view returns (address)",
  "function transferOwnership(address newOwner) external",
];

module.exports = {
  NETWORKS,
  getNetwork,
  NETWORK_DISPLAY_NAMES,
  ADDRESSES,
  PAYMENT,
  TIMEOUTS,
  USDT_ABI,
  FACTORY_ABI,
  TOKEN_ABI,
  TEST_MODE,
  FEATURE_LIMITS,
  DISABLE_RATE_LIMIT,
};

