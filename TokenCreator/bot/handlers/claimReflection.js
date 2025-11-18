/**
 * claimReflection.js
 * Handles claiming reflection rewards for token holders
 */

const { ethers } = require('ethers');
const { getClaimableReflection, claimReflectionRewards } = require('../utils/blockchain');
const { getTokenDetails } = require('../utils/blockchain');
const { logActivity } = require('../utils/database');
const { NETWORKS } = require('../config/constants');

/**
 * Handle claim reflection flow
 */
async function handleClaimReflection(bot, chatId, userId, tokenAddress) {
    try {
        // Validate address format
        if (!ethers.isAddress(tokenAddress)) {
            bot.sendMessage(chatId, '❌ Invalid Ethereum address format');
            return;
        }

        // Send checking message
        await bot.sendMessage(chatId, '🔍 Checking reflection rewards...');

        // Get token details to verify it exists
        const details = await getTokenDetails(tokenAddress, 'alvey');
        if (!details) {
            bot.sendMessage(chatId, '❌ Token not found on blockchain');
            return;
        }

        // Get claimable reflection amount
        // Note: We need the holder's wallet address - for now we'll ask for it
        await bot.sendMessage(
            chatId,
            '💰 <b>Claim Reflection Rewards</b>\n\n' +
            `Token: ${details.name} (${details.symbol})\n\n` +
            '⚠️ <b>Important:</b> To claim reflection rewards, you need to call the function from your wallet.\n\n' +
            '<b>How to claim:</b>\n' +
            '1. Connect your wallet to Alvey Chain\n' +
            '2. Go to the token contract: <code>' + tokenAddress + '</code>\n' +
            '3. Call function: <code>claimReflectionRewards()</code>\n' +
            '4. Pay gas fee and receive your rewards\n\n' +
            'Or provide your wallet address to check claimable amount:',
            { parse_mode: 'HTML' }
        );

        // Note: Session should be saved by the caller (bot/index.js)
        // This function just shows instructions and asks for wallet

    } catch (error) {
        console.error('Error in handleClaimReflection:', error);
        bot.sendMessage(
            chatId,
            `❌ Error: ${error.message}`,
            { parse_mode: 'HTML' }
        );
    }
}

/**
 * Check claimable reflection for a wallet address
 */
async function checkClaimableReflection(bot, chatId, userId, tokenAddress, walletAddress) {
    try {
        // Validate addresses
        if (!ethers.isAddress(tokenAddress) || !ethers.isAddress(walletAddress)) {
            bot.sendMessage(chatId, '❌ Invalid address format');
            return;
        }

        await bot.sendMessage(chatId, '🔍 Checking claimable reflection...');

        // Get token details
        const details = await getTokenDetails(tokenAddress, 'alvey');
        if (!details) {
            bot.sendMessage(chatId, '❌ Token not found');
            return;
        }

        // Get claimable amount
        const claimableAmount = await getClaimableReflection(tokenAddress, walletAddress, 'alvey');
        const claimableFormatted = (parseFloat(claimableAmount) / Math.pow(10, 18)).toLocaleString('en-US', {
            maximumFractionDigits: 6
        });

        if (claimableAmount === "0" || parseFloat(claimableAmount) === 0) {
            await bot.sendMessage(
                chatId,
                `💰 <b>Reflection Status</b>\n\n` +
                `Token: ${details.name} (${details.symbol})\n` +
                `Wallet: <code>${walletAddress}</code>\n\n` +
                `❌ No reflection rewards available to claim.\n\n` +
                `You may need to wait for more transactions to accumulate reflection rewards.`,
                { parse_mode: 'HTML' }
            );
        } else {
            await bot.sendMessage(
                chatId,
                `💰 <b>Reflection Status</b>\n\n` +
                `Token: ${details.name} (${details.symbol})\n` +
                `Wallet: <code>${walletAddress}</code>\n\n` +
                `✅ Claimable: <b>${claimableFormatted}</b> ${details.symbol}\n\n` +
                `<b>To claim:</b>\n` +
                `1. Connect wallet <code>${walletAddress}</code> to Alvey Chain\n` +
                `2. Go to contract: <code>${tokenAddress}</code>\n` +
                `3. Call function: <code>claimReflectionRewards()</code>\n` +
                `4. Pay gas fee (~0.001 ALV)\n\n` +
                `🔗 <a href="${NETWORKS.alvey.explorer}/token/${tokenAddress}">View Contract on Explorer</a>`,
                { parse_mode: 'HTML' }
            );
        }

        // Log activity
        try {
            await logActivity(userId, 'checked_reflection', {
                tokenAddress,
                walletAddress,
                claimableAmount: claimableAmount.toString()
            });
        } catch (logError) {
            console.error('Failed to log activity:', logError.message);
        }

    } catch (error) {
        console.error('Error checking claimable reflection:', error);
        bot.sendMessage(
            chatId,
            `❌ Error: ${error.message}`,
            { parse_mode: 'HTML' }
        );
    }
}

module.exports = {
    handleClaimReflection,
    checkClaimableReflection
};

