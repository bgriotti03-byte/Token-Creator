const axios = require('axios');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

/**
 * Verify contract on Blockscout via form submission (API v2)
 * Works with Alvey Chain Blockscout using the correct endpoint
 */
async function verifyContractDirect(tokenAddress, networkKey, params) {
    try {
        const { getNetwork } = require('../config/constants');
        const network = getNetwork(networkKey);

        console.log(`\n🔍 Verifying ${tokenAddress} on ${network.name} via Blockscout API v2...`);

        // Only works for Alvey for now
        if (networkKey !== 'alvey') {
            throw new Error('Direct API verification only supports Alvey chain currently');
        }

        // Read contract source
        const contractPath = path.join(__dirname, '../../contracts/SecureToken.sol');
        const contractSource = fs.readFileSync(contractPath, 'utf8');

        // Prepare form data for Blockscout verification
        const formData = new FormData();

        // Blockscout form fields (using API v2 endpoint)
        formData.append('addressHash', tokenAddress);
        formData.append('contractSourceCode', contractSource);
        formData.append('contractName', 'SecureToken');
        formData.append('compilerVersion', 'v0.8.28+commit.7893614a');
        formData.append('optimizationUsed', 'true');
        formData.append('optimizationRuns', '200');
        formData.append('evmVersion', 'paris');
        formData.append('licenseType', 'MIT');
        
        // Encode constructor args
        const constructorArgs = encodeConstructorArgs(params);
        formData.append('constructorArguments', constructorArgs);

        console.log('📤 Submitting verification to Blockscout API v2...');

        // IMPORTANT: Use the correct Blockscout API v2 endpoint
        const verificationUrl = `${network.explorer}/api/v2/smart-contracts/${tokenAddress}/verification`;

        const response = await axios.post(verificationUrl, formData, {
            headers: formData.getHeaders(),
            timeout: 30000,
            validateStatus: () => true, // Accept all status codes to check response
        });

        console.log('Blockscout Response Status:', response.status);
        console.log('Blockscout Response Data:', response.data);

        // Blockscout returns 200 on success
        if (response.status === 200) {
            console.log('✅ Contract verification submitted successfully!');
            return {
                success: true,
                message: 'Contract submitted for verification',
                explorerUrl: `${network.explorer}/address/${tokenAddress}#code`,
            };
        }

        // Check for error messages
        if (response.data?.errors) {
            const errorMsg = JSON.stringify(response.data.errors);
            console.error('Blockscout verification error:', errorMsg);
            return {
                success: false,
                message: `Blockscout verification error: ${errorMsg}`,
                data: response.data,
            };
        }

        if (response.data?.error) {
            console.error('Blockscout error:', response.data.error);
            return {
                success: false,
                message: `Blockscout error: ${response.data.error}`,
                data: response.data,
            };
        }

        // Fallback: check old API response format
        if (response.data.status === '1' || response.data.result === 'Pass - Verified') {
            console.log('✅ Contract verified successfully!');
            return {
                success: true,
                message: 'Contract verified on Blockscout',
                explorerUrl: `${network.explorer}/address/${tokenAddress}#code`,
            };
        }

        if (response.data.result === 'Already Verified') {
            console.log('✅ Contract already verified');
            return {
                success: true,
                message: 'Contract already verified',
                explorerUrl: `${network.explorer}/address/${tokenAddress}#code`,
            };
        }

        console.warn('⚠️ Verification response:', response.data);
        return {
            success: false,
            message: `Unexpected response: ${response.status}. ${response.data.result || JSON.stringify(response.data)}`,
            data: response.data,
        };

    } catch (error) {
        console.error('❌ Blockscout API Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return {
            success: false,
            message: error.message,
            error: error,
        };
    }
}

/**
 * Encode constructor arguments for Blockscout verification
 */
function encodeConstructorArgs(params) {
    try {
        const abiCoder = new ethers.AbiCoder();

        // Convert supply to wei if it's a string number
        // The supply from database is stored as string (e.g., "1000000")
        // We need to convert it to wei (multiply by 10^18)
        let supply = params.supply;
        if (typeof supply === 'string' && !supply.startsWith('0x')) {
            // If it's a numeric string, convert to BigInt and multiply by 10^18
            try {
                supply = ethers.parseUnits(supply, 18);
            } catch (error) {
                // If parseUnits fails, try direct conversion
                supply = BigInt(supply) * BigInt(10 ** 18);
            }
        } else if (typeof supply === 'number') {
            supply = ethers.parseUnits(supply.toString(), 18);
        }

        // Order MUST match SecureToken constructor exactly
        const encoded = abiCoder.encode(
            [
                'string',    // name
                'string',    // symbol
                'uint256',   // initialSupply
                'uint8',     // taxPercent
                'address',   // taxWallet
                'uint8',     // reflectionPercent
                'uint8',     // burnPercent
                'bool',      // enableReflection
                'bool',      // enableBurn
                'address',   // initialOwner
            ],
            [
                params.name,
                params.symbol,
                supply,
                params.taxPercent || 0,
                params.taxWallet || ethers.ZeroAddress,
                params.reflectionPercent || 0,
                params.burnPercent || 0,
                params.enableReflection || false,
                params.enableBurn || false,
                params.owner,
            ]
        );

        // Return without 0x prefix for Blockscout
        return encoded.substring(2);
    } catch (error) {
        console.error('❌ Error encoding constructor args:', error);
        throw error;
    }
}

module.exports = {
    verifyContractDirect,
    encodeConstructorArgs,
};

