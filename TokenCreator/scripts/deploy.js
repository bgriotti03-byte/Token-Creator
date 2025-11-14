const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/**
 * Deploy TokenFactory contract to Alvey Chain
 */
async function main() {
  console.log("Deploying TokenFactory to Alvey Chain...\n");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ALV\n");

  if (balance === 0n) {
    console.error("❌ Error: Account has no balance. Please fund your account.");
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
      `https://alveyscan.com/tx/${receipt.hash}`
    );
  }

  // Save to .env file (optional)
  const envPath = path.join(__dirname, "..", ".env");
  let envContent = "";

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }

  // Update or add FACTORY_ADDRESS
  if (envContent.includes("FACTORY_ADDRESS=")) {
    envContent = envContent.replace(
      /FACTORY_ADDRESS=.*/,
      `FACTORY_ADDRESS=${factoryAddress}`
    );
  } else {
    envContent += `\nFACTORY_ADDRESS=${factoryAddress}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log("\n✅ Factory address saved to .env file");

  console.log("\n📝 Next steps:");
  console.log("1. Update your .env file with the factory address");
  console.log("2. Configure PAYMENT_WALLET_BSC and PAYMENT_WALLET_ALVEY");
  console.log("3. Start the bot with: npm start");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

