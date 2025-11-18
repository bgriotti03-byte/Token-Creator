/**
 * Verify token contract on Blockscout/Etherscan
 * Usage: node scripts/verifyToken.js <tokenAddress> <network> <constructorArgs...>
 */

const hre = require("hardhat");

async function verifyToken(tokenAddress, networkName, constructorArgs) {
    console.log(`\nVerifying token on ${networkName}...`);
    console.log(`Token address: ${tokenAddress}`);
    console.log(`Constructor args:`, constructorArgs);

    try {
        await hre.run("verify:verify", {
            address: tokenAddress,
            constructorArguments: constructorArgs,
            contract: "contracts/SecureToken.sol:SecureToken"
        });

        console.log("✅ Token verified successfully!");
        return true;

    } catch (error) {
        if (error.message.includes("Already Verified") || 
            error.message.includes("already verified") ||
            error.message.includes("Contract source code already verified")) {
            console.log("✅ Contract already verified!");
            return true;
        }
        
        console.error("❌ Verification failed:", error.message);
        return false;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 12) {
        console.error("Usage: node scripts/verifyToken.js <address> <network> <name> <symbol> <supply> <taxPercent> <taxWallet> <reflectionPercent> <burnPercent> <enableReflection> <enableBurn> <owner>");
        process.exit(1);
    }

    const [address, network, name, symbol, supply, taxPercent, taxWallet, reflectionPercent, burnPercent, enableReflection, enableBurn, owner] = args;

    const constructorArgs = [
        name,
        symbol,
        supply,
        parseInt(taxPercent),
        taxWallet,
        parseInt(reflectionPercent),
        parseInt(burnPercent),
        enableReflection === 'true',
        enableBurn === 'true',
        owner
    ];

    verifyToken(address, network, constructorArgs)
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { verifyToken };

