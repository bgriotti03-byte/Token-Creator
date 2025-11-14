require("dotenv").config();

// Network configurations
const NETWORKS = {
  alvey: {
    name: "Alvey Chain",
    rpc: process.env.ALVEY_RPC || "https://elves-core2.alvey.io/",
    chainId: 3797,
    explorer: "https://alveyscan.com",
  },
  bsc: {
    name: "Binance Smart Chain",
    rpc: process.env.BSC_RPC || "https://bsc-dataseed1.binance.org",
    chainId: 56,
    explorer: "https://bscscan.com",
  },
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

// USDT token ABI (minimal for transfer detection)
const USDT_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// Factory ABI (minimal)
const FACTORY_ABI = [
  "function createToken(string memory _name, string memory _symbol, uint256 _initialSupply, uint256 _taxPercent, address _taxWallet, address _initialOwner) external returns (address)",
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
  ADDRESSES,
  PAYMENT,
  TIMEOUTS,
  USDT_ABI,
  FACTORY_ABI,
  TOKEN_ABI,
  TEST_MODE,
};

