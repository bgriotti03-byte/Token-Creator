/**
 * Smart Contract Verification Helper
 * Handles deployment validation and stores exact compilation data
 * Does NOT use source code comparison (which fails with immutable variables)
 */

const fs = require('fs');
const path = require('path');

/**
 * Store comprehensive deployment information
 * This data can be used for manual verification or future API-based verification
 */
function storeDeploymentInfo(deploymentData) {
    return {
        // Basic info
        contractAddress: deploymentData.contractAddress,
        txHash: deploymentData.txHash,
        blockNumber: deploymentData.blockNumber,
        timestamp: new Date().toISOString(),
        
        // Token parameters (EXACT values deployed)
        tokenInfo: {
            name: deploymentData.tokenName,
            symbol: deploymentData.tokenSymbol,
            initialSupply: deploymentData.initialSupply,
            decimals: 18
        },
        
        // Fee configuration (EXACT values deployed)
        fees: {
            taxPercent: deploymentData.taxPercent,
            taxWallet: deploymentData.taxWallet,
            reflectionPercent: deploymentData.reflectionPercent,
            burnPercent: deploymentData.burnPercent,
            enableReflection: deploymentData.enableReflection,
            enableBurn: deploymentData.enableBurn
        },
        
        // Contract owner
        owner: deploymentData.owner,
        
        // Compilation settings (what was used)
        compilation: {
            solidityVersion: "0.8.28",
            compiler: "solc@0.8.28+commit.7893614a",
            evmVersion: "paris",
            optimizationEnabled: true,
            optimizationRuns: 200,
            license: "MIT"
        },
        
        // Constructor arguments (EXACT JSON)
        constructorArguments: [
            deploymentData.tokenName,
            deploymentData.tokenSymbol,
            deploymentData.initialSupply,
            deploymentData.taxPercent,
            deploymentData.taxWallet,
            deploymentData.reflectionPercent,
            deploymentData.burnPercent,
            deploymentData.enableReflection,
            deploymentData.enableBurn,
            deploymentData.owner
        ],
        
        // Gas information
        gas: {
            used: deploymentData.gasUsed,
            price: deploymentData.gasPrice
        },
        
        // Verification status
        verification: {
            status: 'pending',
            method: 'immutable_variables_embedded',
            notes: 'Immutable variables are embedded in bytecode. Use manual verification or contact Blockscout support.',
            verified: false,
            verificationUrl: `https://alveyscan.com/address/${deploymentData.contractAddress}#code`
        }
    };
}

/**
 * Generate verification instructions for user
 */
function generateVerificationInstructions(deploymentInfo) {
    return `
📋 <b>VERIFICACIÓN MANUAL - INSTRUCCIONES</b>

Tu contrato tiene variables immutable que se incrustan en el bytecode.
La verificación automática de source code NO funcionará.

<b>OPCIONES:</b>

<b>1️⃣ VERIFICACIÓN SIMPLIFICADA (RECOMENDADO):</b>
   - Ve a: <a href="${deploymentInfo.verification.verificationUrl}">${deploymentInfo.verification.verificationUrl}</a>
   - Haz clic en "Verify Contract"
   - Selecciona: "Solidity (Standard JSON Input)"
   - Sigue los pasos (solo necesitas el JSON de compilación)

<b>2️⃣ VERIFICACIÓN CON BLOCKSCOUT SUPPORT:</b>
   - Contacta a Blockscout support
   - Comparte esta información de deployment
   - Ellos pueden verificar manualmente

<b>3️⃣ INFORMACIÓN DE DEPLOYMENT (Guardar para referencia):</b>

<b>Token Address:</b> <code>${deploymentInfo.contractAddress}</code>
<b>TX Hash:</b> <code>${deploymentInfo.txHash}</code>

<b>TOKEN INFO:</b>
- Name: ${deploymentInfo.tokenInfo.name}
- Symbol: ${deploymentInfo.tokenInfo.symbol}
- Supply: ${deploymentInfo.tokenInfo.initialSupply}

<b>FEES:</b>
- Tax: ${deploymentInfo.fees.taxPercent}%
- Tax Wallet: <code>${deploymentInfo.fees.taxWallet}</code>
- Reflection: ${deploymentInfo.fees.reflectionPercent}%
- Burn: ${deploymentInfo.fees.burnPercent}%

<b>Owner:</b> <code>${deploymentInfo.owner}</code>

<b>Compiler:</b> ${deploymentInfo.compilation.compiler}
<b>EVM Version:</b> ${deploymentInfo.compilation.evmVersion}
<b>Optimization:</b> ${deploymentInfo.compilation.optimizationEnabled ? 'Enabled' : 'Disabled'} (${deploymentInfo.compilation.optimizationRuns} runs)

🔍 El bytecode está disponible en: <a href="${deploymentInfo.verification.verificationUrl}">${deploymentInfo.verification.verificationUrl}</a>
    `;
}

/**
 * Validate deployment bytecode exists and has expected size
 */
async function validateDeployment(provider, contractAddress, expectedMinSize = 5000) {
    const bytecode = await provider.getCode(contractAddress);
    
    if (bytecode === '0x') {
        throw new Error(`❌ NO BYTECODE: Contract not found at ${contractAddress}`);
    }
    
    const codeSize = (bytecode.length - 2) / 2; // Remove 0x and convert hex pairs to bytes
    
    if (codeSize < expectedMinSize) {
        throw new Error(`❌ CODE TOO SMALL: Expected >${expectedMinSize} bytes, got ${codeSize} bytes`);
    }
    
    return {
        valid: true,
        bytecode: bytecode,
        codeSize: codeSize,
        message: `✅ Contract verified: ${codeSize} bytes of bytecode`
    };
}

module.exports = {
    storeDeploymentInfo,
    generateVerificationInstructions,
    validateDeployment
};

