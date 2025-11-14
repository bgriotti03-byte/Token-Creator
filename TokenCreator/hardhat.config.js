require("@nomicfoundation/hardhat-toolbox");
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
      url: process.env.ALVEY_RPC || "https://elves-core2.alvey.io/",
      chainId: 3797,
      accounts: process.env.BOT_PRIVATE_KEY ? [process.env.BOT_PRIVATE_KEY] : [],
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
};

