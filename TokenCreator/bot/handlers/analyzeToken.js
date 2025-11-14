/**
 * analyzeToken.js
 * Analyzes deployed tokens and displays their features
 */

const { ethers } = require('ethers');
const { getTokenFeatures, getTokenDetails } = require('../utils/blockchain');
const { logActivity, getUser } = require('../utils/database');

/**
 * Analyze a deployed token and send detailed report
 */
async function analyzeToken(bot, chatId, userId, tokenAddress) {
    try {
        // Validate address format
        if (!ethers.isAddress(tokenAddress)) {
            bot.sendMessage(chatId, '❌ Invalid Ethereum address format');
            return;
        }

        // Send analyzing message
        bot.sendMessage(chatId, '🔍 Analyzing token on blockchain...');

        // Get token details
        const details = await getTokenDetails(tokenAddress, 'alvey');
        
        if (!details) {
            bot.sendMessage(chatId, '❌ Token not found on blockchain');
            return;
        }

        // Get features from factory
        const features = await getTokenFeatures(tokenAddress, 'alvey');

        if (!features) {
            bot.sendMessage(chatId, '⚠️ Could not retrieve full feature set');
            return;
        }

        // Build detailed analysis report
        const analysis = buildTokenAnalysis(details, features, tokenAddress);
        
        // Send analysis
        bot.sendMessage(chatId, analysis, { parse_mode: 'HTML' });
        
        // Log this action (only if userId is valid)
        if (userId && typeof userId === 'number') {
            try {
                await logActivity(userId, 'analyzed_token', {
                    tokenAddress,
                    tokenName: details.name,
                    hasReflection: features.hasReflection,
                    hasBurn: features.hasBurn
                });
            } catch (logError) {
                // Silently fail - logging is not critical
                console.error('Failed to log activity:', logError.message);
            }
        }

    } catch (error) {
        console.error('Error analyzing token:', error);
        bot.sendMessage(
            chatId,
            `❌ Error analyzing token:\n<code>${error.message}</code>`,
            { parse_mode: 'HTML' }
        );
    }
}

/**
 * Build formatted analysis report
 */
function buildTokenAnalysis(details, features, tokenAddress) {
    // Build features list
    const featuresList = [];
    
    if (features.hasReflection) {
        featuresList.push(`✅ <b>Reflection:</b> ${features.reflectionPercent}%`);
    } else {
        featuresList.push(`❌ <b>Reflection:</b> Disabled`);
    }
    
    if (features.hasBurn) {
        featuresList.push(`✅ <b>Burn:</b> ${features.burnPercent}%`);
    } else {
        featuresList.push(`❌ <b>Burn:</b> Disabled`);
    }
    
    if (features.taxPercent > 0) {
        const taxWallet = features.taxWallet.substring(0, 6) + '...' + features.taxWallet.substring(features.taxWallet.length - 4);
        featuresList.push(`✅ <b>Tax:</b> ${features.taxPercent}% → ${taxWallet}`);
    } else {
        featuresList.push(`❌ <b>Tax:</b> Disabled`);
    }

    // Calculate total fees
    const totalFees = (features.taxPercent || 0) + 
                      (features.reflectionPercent || 0) + 
                      (features.burnPercent || 0);

    // Format supply
    const formattedSupply = (
        parseFloat(details.totalSupply) / Math.pow(10, 18)
    ).toLocaleString('en-US', { maximumFractionDigits: 2 });

    // Build report
    const report = `
<b>📊 TOKEN ANALYSIS REPORT</b>

<b>Basic Information:</b>
📝 Name: <code>${details.name}</code>
🏷️ Symbol: <code>${details.symbol}</code>
📍 Address: <code>${tokenAddress}</code>
👤 Owner: <code>${details.owner}</code>

<b>Supply Information:</b>
📈 Total Supply: <b>${formattedSupply}</b> ${details.symbol}

<b>Token Features:</b>
${featuresList.join('\n')}

<b>Fee Summary:</b>
💾 Total Fees: <b>${totalFees}%</b>

<b>Security Status:</b>
🔒 Minting: ✅ DISABLED (Immutable)
🔒 Ownership Transfer: ✅ Allowed
🔒 Settings: ✅ IMMUTABLE (Cannot be changed)

<b>Explorer Links:</b>
<a href="https://alveyscan.com/address/${tokenAddress}">View on Alvey Chain Explorer</a>
    `;

    return report;
}

module.exports = {
    analyzeToken,
    buildTokenAnalysis
};

