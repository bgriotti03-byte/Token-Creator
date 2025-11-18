/**
 * Deploy TokenFactory to BSC Testnet
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying TokenFactory to BSC Testnet...\n");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "tBNB\n");

  if (balance === 0n) {
    console.error("❌ Error: Account has no balance. Please fund your account.");
    console.log("Get testnet tBNB from: https://testnet.bnbchain.org/faucet-smart");
    process.exit(1);
  }

  // Deploy TokenFactory
  const TokenFactory = await hre.ethers.getContractFactory("TokenFactory");
  console.log("Deploying TokenFactory...");

  const tokenFactory = await TokenFactory.deploy();
  await tokenFactory.waitForDeployment();

  const factoryAddress = await tokenFactory.getAddress();
  console.log("\n✅ TokenFactory deployed!");
  console.log("Address:", factoryAddress);
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);

  // Get deployment transaction
  const deployTx = tokenFactory.deploymentTransaction();
  if (deployTx) {
    const receipt = await deployTx.wait();
    console.log("Transaction hash:", receipt.hash);
    console.log(
      "Explorer:",
      `https://testnet.bscscan.com/tx/${receipt.hash}`
    );
  }

  // Save to .env file (optional)
  const envPath = path.join(__dirname, "..", ".env");
  let envContent = "";

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }

  // Update or add FACTORY_BSC_TESTNET_ADDRESS
  if (envContent.includes("FACTORY_BSC_TESTNET_ADDRESS=")) {
    envContent = envContent.replace(
      /FACTORY_BSC_TESTNET_ADDRESS=.*/,
      `FACTORY_BSC_TESTNET_ADDRESS=${factoryAddress}`
    );
  } else {
    envContent += `\nFACTORY_BSC_TESTNET_ADDRESS=${factoryAddress}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log("\n✅ Factory address saved to .env file");
  console.log("\nAdd to your .env:");
  console.log(`FACTORY_BSC_TESTNET_ADDRESS=${factoryAddress}`);
  
  console.log("\nVerify with:");
  console.log(`npx hardhat verify --network bscTestnet ${factoryAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

