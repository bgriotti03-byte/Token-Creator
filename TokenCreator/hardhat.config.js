require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    alvey: {
      url: process.env.ALVEY_RPC_URL || process.env.ALVEY_RPC || "https://elves-core2.alvey.io/",
      chainId: 3797,
      accounts: process.env.BOT_PRIVATE_KEY ? [process.env.BOT_PRIVATE_KEY] : [],
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: process.env.BOT_PRIVATE_KEY ? [process.env.BOT_PRIVATE_KEY] : [],
      gasPrice: 10000000000, // 10 gwei
    },
    bsc: {
      url: process.env.BSC_RPC || "https://bsc-dataseed1.binance.org",
      chainId: 56,
      accounts: process.env.BOT_PRIVATE_KEY ? [process.env.BOT_PRIVATE_KEY] : [],
    },
    hardhat: {
      chainId: 1337,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  // Blockscout verification configuration
  etherscan: {
    apiKey: {
      alvey: "abc", // Blockscout doesn't require API key, but plugin needs something
      bscTestnet: process.env.BSCSCAN_API_KEY || "abc",
      bsc: process.env.BSCSCAN_API_KEY || "abc",
    },
    customChains: [
      {
        network: "alvey",
        chainId: 3797,
        urls: {
          apiURL: "https://alveyscan.com/api",  // Blockscout API endpoint
          browserURL: "https://alveyscan.com"
        }
      },
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com"
        }
      },
      {
        network: "bsc",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com"
        }
      }
    ]
  },
  // CRITICAL: Disable Sourcify completely (doesn't support Alvey Chain 3797)
  sourcify: {
    enabled: false,
  }
};

