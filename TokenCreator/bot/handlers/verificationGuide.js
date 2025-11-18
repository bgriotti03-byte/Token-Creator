/**
 * User-friendly verification guide with interactive buttons
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { getNetwork } = require('../config/constants');

/**
 * Send interactive verification buttons after token creation
 */
async function sendInteractiveVerification(bot, chatId, tokenAddress, tokenId, networkKey, sessionData, ownerWallet) {
  try {
    const network = getNetwork(networkKey);

    const message = `
✅ <b>Token Created Successfully!</b>

Your contract is visible on Blockscout.
To add a green checkmark ✅, use the buttons below:

💡 <b>Tip:</b> The source code is already flattened (no imports needed) - ready to paste!
    `;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: '📋 Get Source Code', 
              callback_data: `verify_code_${tokenId}` 
            },
            { 
              text: '🔑 Get Constructor Args', 
              callback_data: `verify_args_${tokenId}` 
            }
          ],
          [
            { 
              text: '📖 Step-by-Step Guide', 
              callback_data: `verify_guide_${tokenId}` 
            },
          ],
          [
            { 
              text: '✅ Auto Verify', 
              callback_data: `verify_${tokenId}` 
            },
            { 
              text: '🔗 Go to Verification', 
              url: `${network.explorer}/address/${tokenAddress}#code` 
            }
          ]
        ]
      }
    };

    await bot.sendMessage(chatId, message, { 
      parse_mode: 'HTML', 
      ...keyboard 
    });
  } catch (error) {
    console.error('Error sending interactive verification:', error);
  }
}

/**
 * Send source code to user (flattened version - ready to paste)
 */
async function sendSourceCode(bot, chatId, queryId) {
  try {
    // Use flattened code instead of original (no imports, ready to paste)
    const { getFlattenedSecureToken } = require('../utils/contractFlattener');
    const sourceCode = getFlattenedSecureToken();

    // If code is too long, send as document
    if (sourceCode.length > 4000) {
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFile = path.join(tempDir, `SecureToken_${Date.now()}.sol`);
      fs.writeFileSync(tempFile, sourceCode);

      try {
        await bot.sendDocument(
          chatId,
          tempFile,
          {
            caption: '📄 <b>Flattened Contract Code</b>\n\n✅ Ready to paste in Blockscout!\n\nNo imports - everything is included.\nCopy the entire file content.',
            parse_mode: 'HTML'
          }
        );
        
        // Clean up temp file after sending
        setTimeout(() => {
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (e) {
            console.error('Error deleting temp file:', e);
          }
        }, 5000);
      } catch (error) {
        console.error('Error sending document:', error);
        // Fallback: send as text message (truncated)
        await bot.sendMessage(
          chatId,
          `<b>📋 Flattened Code (first part):</b>\n\n<code>${sourceCode.substring(0, 3000)}...</code>\n\n<i>File is too long. Please download the file above.</i>`,
          { parse_mode: 'HTML' }
        );
      }
    } else {
      await bot.sendMessage(
        chatId,
        `<b>📋 Flattened Contract Code (copy this):</b>\n\n✅ <b>Ready to paste!</b> No imports needed.\n\n<code>${sourceCode}</code>`,
        { parse_mode: 'HTML' }
      );
    }

    await bot.answerCallbackQuery(queryId, { text: 'Source code sent!' });
  } catch (error) {
    console.error('Error sending source code:', error);
    await bot.answerCallbackQuery(queryId, { 
      text: 'Error loading source code', 
      show_alert: true 
    });
  }
}

/**
 * Send constructor arguments to user
 */
async function sendConstructorArgs(bot, chatId, queryId, tokenId) {
  try {
    const { getToken } = require('../utils/database');
    const token = await getToken(tokenId);

    if (!token) {
      await bot.answerCallbackQuery(queryId, { 
        text: 'Token not found', 
        show_alert: true 
      });
      return;
    }

    // Encode constructor arguments
    const constructorArgs = encodeConstructorArgs({
      name: token.token_name,
      symbol: token.token_symbol,
      supply: token.initial_supply,
      taxPercent: token.tax_percent || 0,
      taxWallet: token.tax_wallet || ethers.ZeroAddress,
      reflectionPercent: token.reflection_percent || 0,
      burnPercent: token.burn_percent || 0,
      enableReflection: token.has_reflection || false,
      enableBurn: token.has_burn || false,
      owner: token.owner_wallet
    });

    const argsMessage = `
<b>🔑 Constructor Arguments</b>

When verification asks for "Constructor Arguments", use this encoded value:

<code>${constructorArgs}</code>

<i>This is pre-calculated for your token.</i>
    `;

    await bot.sendMessage(chatId, argsMessage, { parse_mode: 'HTML' });
    await bot.answerCallbackQuery(queryId, { text: 'Constructor args sent!' });
  } catch (error) {
    console.error('Error sending constructor args:', error);
    await bot.answerCallbackQuery(queryId, { 
      text: 'Error preparing constructor args', 
      show_alert: true 
    });
  }
}

/**
 * Send step-by-step verification guide
 */
async function sendVerificationGuide(bot, chatId, queryId, tokenId) {
  try {
    const { getToken } = require('../utils/database');
    const token = await getToken(tokenId);

    if (!token) {
      await bot.answerCallbackQuery(queryId, { 
        text: 'Token not found', 
        show_alert: true 
      });
      return;
    }

    const network = getNetwork(token.network || 'alvey');

    const guideMessage = `
📖 <b>Step-by-Step Verification Guide</b>

<b>Step 1:</b> Get the flattened source code
→ Click "📋 Get Source Code" button above
→ Copy the ENTIRE code (it's already flattened, no imports!)

<b>Step 2:</b> Get constructor arguments
→ Click "🔑 Get Constructor Args" button above
→ Copy the encoded hex string

<b>Step 3:</b> Go to verification page
→ Click "🔗 Go to Verification" button above

<b>Step 4:</b> Fill the Blockscout form:
• <b>Contract Name:</b> SecureToken
• <b>Compiler Version:</b> v0.8.28+commit.7893614a
• <b>Optimization:</b> Yes (200 runs)
• <b>EVM Version:</b> paris
• <b>License:</b> MIT
• <b>Source Code:</b> Paste the flattened code from Step 1
• <b>Constructor Arguments:</b> Paste the hex string from Step 2

<b>Step 5:</b> Click "Verify & Publish"

✅ After verification, your contract will have a green checkmark!

💡 <b>Tip:</b> The flattened code includes everything - no need to add imports!
    `;

    await bot.sendMessage(chatId, guideMessage, { parse_mode: 'HTML' });
    await bot.answerCallbackQuery(queryId, { text: 'Guide sent!' });
  } catch (error) {
    console.error('Error sending verification guide:', error);
    await bot.answerCallbackQuery(queryId, { 
      text: 'Error loading guide', 
      show_alert: true 
    });
  }
}

/**
 * Encode constructor arguments for Blockscout verification
 */
function encodeConstructorArgs(params) {
  try {
    const abiCoder = new ethers.AbiCoder();

    // Convert supply to wei if it's a string number
    let supply = params.supply;
    if (typeof supply === 'string' && !supply.startsWith('0x')) {
      try {
        supply = ethers.parseUnits(supply, 18);
      } catch (error) {
        supply = BigInt(supply) * BigInt(10 ** 18);
      }
    } else if (typeof supply === 'number') {
      supply = ethers.parseUnits(supply.toString(), 18);
    }

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
        params.owner
      ]
    );

    // Return without '0x' prefix for Blockscout
    return encoded.substring(2);
  } catch (error) {
    console.error('Error encoding constructor args:', error);
    throw error;
  }
}

module.exports = {
  sendInteractiveVerification,
  sendSourceCode,
  sendConstructorArgs,
  sendVerificationGuide,
  encodeConstructorArgs,
};

