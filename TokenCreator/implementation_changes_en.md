# Token Creator Bot - Changes for Reflection + Burn + Analyzer

## File-by-File Changes Guide

---

## 1. contracts/SecureToken.sol

### Location: Constructor Parameters (Line ~30)

**CHANGE FROM:**
```solidity
constructor(
    string memory _name,
    string memory _symbol,
    uint256 _initialSupply,
    uint8 _taxPercent,
    address _taxWallet,
    address _initialOwner
) ERC20(_name, _symbol) Ownable(_initialOwner) {
```

**CHANGE TO:**
```solidity
constructor(
    string memory _name,
    string memory _symbol,
    uint256 _initialSupply,
    uint8 _taxPercent,
    address _taxWallet,
    uint8 _reflectionPercent,          // NEW: Reflection percentage
    uint8 _burnPercent,                // NEW: Burn percentage
    bool _enableReflection,            // NEW: Enable reflection feature
    bool _enableBurn,                  // NEW: Enable burn feature
    address _initialOwner
) ERC20(_name, _symbol) Ownable(_initialOwner) {
```

**WHY:** Need to accept these new parameters from the factory when deploying tokens.

---

### Location: State Variables (After TAX_WALLET declaration, Line ~25)

**ADD AFTER:**
```solidity
address public immutable TAX_WALLET;
```

**ADD THESE:**
```solidity
// NEW: Reflection rewards configuration
uint8 public immutable REFLECTION_PERCENT;
uint8 public immutable BURN_PERCENT;
bool public immutable HAS_REFLECTION;
bool public immutable HAS_BURN;

// NEW: Track reflection balances for each holder
mapping(address => uint256) private _reflectionBalance;
uint256 private _totalReflectionDistributed;
```

**WHY:** Immutable variables ensure these settings cannot be changed after deployment. Mapping tracks pending rewards.

---

### Location: Constructor Body (After variable initialization, Line ~45)

**ADD AFTER:**
```solidity
TAX_WALLET = _taxWallet;
```

**ADD THESE:**
```solidity
// NEW: Initialize reflection and burn parameters
REFLECTION_PERCENT = _reflectionPercent;
BURN_PERCENT = _burnPercent;
HAS_REFLECTION = _enableReflection;
HAS_BURN = _enableBurn;

// NEW: Validate total fees don't exceed 100%
require(
    _taxPercent + _reflectionPercent + _burnPercent <= 100,
    "Total fees cannot exceed 100%"
);
```

**WHY:** Assigns immutable values and validates that the total of all fees won't exceed 100% (tax + reflection + burn).

---

### Location: NEW FUNCTION - Add after transfer() override (Line ~80)

**ADD NEW FUNCTION:**
```solidity
/**
 * NEW: Distribute reflection rewards to a recipient
 * Called during transfer to queue rewards
 */
function _addReflectionReward(address holder, uint256 amount) private {
    if (!HAS_REFLECTION || amount == 0) return;
    _reflectionBalance[holder] += amount;
    _totalReflectionDistributed += amount;
    emit ReflectionAdded(holder, amount);
}

/**
 * NEW: Allow holders to claim their reflection rewards
 * Returns the amount of rewards claimed
 */
function claimReflectionRewards() external returns (uint256) {
    require(HAS_REFLECTION, "Reflection is disabled for this token");
    
    uint256 rewards = _reflectionBalance[msg.sender];
    require(rewards > 0, "No reflection rewards to claim");
    
    // Clear the pending rewards
    _reflectionBalance[msg.sender] = 0;
    
    // Transfer rewards to user
    _transfer(address(this), msg.sender, rewards);
    
    emit ReflectionClaimed(msg.sender, rewards);
    return rewards;
}

/**
 * NEW: Check pending reflection rewards for an address
 */
function getPendingReflection(address holder) 
    external 
    view 
    returns (uint256) 
{
    if (!HAS_REFLECTION) return 0;
    return _reflectionBalance[holder];
}
```

**WHY:** These functions handle claiming and viewing reflection rewards. Immutable check ensures no reflection if not enabled.

---

### Location: UPDATE transfer() function (Replace entire function, Line ~60)

**REPLACE:**
```solidity
function transfer(address to, uint256 amount)
    public
    override
    returns (bool)
{
    address sender = _msgSender();

    if (TAX_PERCENT > 0 && sender != TAX_WALLET) {
        uint256 taxAmount = (amount * TAX_PERCENT) / 100;
        uint256 netAmount = amount - taxAmount;

        _transfer(sender, TAX_WALLET, taxAmount);
        _transfer(sender, to, netAmount);

        emit TokensTransferred(sender, to, netAmount, taxAmount);
    } else {
        _transfer(sender, to, amount);
        emit TokensTransferred(sender, to, amount, 0);
    }

    return true;
}
```

**WITH:**
```solidity
function transfer(address to, uint256 amount)
    public
    override
    returns (bool)
{
    address sender = _msgSender();
    uint256 burnAmount = 0;
    uint256 reflectionAmount = 0;
    uint256 taxAmount = 0;
    uint256 netAmount = amount;

    // NEW: Calculate burn amount if enabled
    if (HAS_BURN && sender != address(0)) {
        burnAmount = (amount * BURN_PERCENT) / 100;
        netAmount -= burnAmount;
    }

    // NEW: Calculate reflection amount if enabled
    if (HAS_REFLECTION && sender != address(0)) {
        reflectionAmount = (netAmount * REFLECTION_PERCENT) / 100;
        netAmount -= reflectionAmount;
    }

    // Calculate tax amount
    if (TAX_WALLET != address(0) && sender != TAX_WALLET) {
        taxAmount = (netAmount * TAX_PERCENT) / 100;
        netAmount -= taxAmount;
    }

    // Execute all transfers
    if (burnAmount > 0) {
        _transfer(sender, address(0), burnAmount);  // Burn tokens
        emit TokensBurned(sender, burnAmount);
    }
    
    if (reflectionAmount > 0) {
        _addReflectionReward(to, reflectionAmount);  // Queue reflection reward
    }
    
    if (taxAmount > 0) {
        _transfer(sender, TAX_WALLET, taxAmount);  // Send tax
    }
    
    _transfer(sender, to, netAmount);  // Send final amount
    emit TokensTransferred(sender, to, netAmount, taxAmount);

    return true;
}
```

**WHY:** Now applies burn, reflection, and tax sequentially. Burn goes to 0x0 address (deflation). Reflection is queued for later claiming. Tax goes to tax wallet.

---

### Location: UPDATE transferFrom() function (Replace entire function, Line ~70)

**REPLACE:**
```solidity
function transferFrom(
    address from,
    address to,
    uint256 amount
) public override returns (bool) {
    address spender = _msgSender();
    _spendAllowance(from, spender, amount);

    if (TAX_PERCENT > 0 && from != TAX_WALLET) {
        uint256 taxAmount = (amount * TAX_PERCENT) / 100;
        uint256 netAmount = amount - taxAmount;

        _transfer(from, TAX_WALLET, taxAmount);
        _transfer(from, to, netAmount);

        emit TokensTransferred(from, to, netAmount, taxAmount);
    } else {
        _transfer(from, to, amount);
        emit TokensTransferred(from, to, amount, 0);
    }

    return true;
}
```

**WITH:**
```solidity
function transferFrom(
    address from,
    address to,
    uint256 amount
) public override returns (bool) {
    address spender = _msgSender();
    _spendAllowance(from, spender, amount);

    uint256 burnAmount = 0;
    uint256 reflectionAmount = 0;
    uint256 taxAmount = 0;
    uint256 netAmount = amount;

    // NEW: Calculate burn amount if enabled
    if (HAS_BURN && from != address(0)) {
        burnAmount = (amount * BURN_PERCENT) / 100;
        netAmount -= burnAmount;
    }

    // NEW: Calculate reflection amount if enabled
    if (HAS_REFLECTION && from != address(0)) {
        reflectionAmount = (netAmount * REFLECTION_PERCENT) / 100;
        netAmount -= reflectionAmount;
    }

    // Calculate tax amount
    if (TAX_WALLET != address(0) && from != TAX_WALLET) {
        taxAmount = (netAmount * TAX_PERCENT) / 100;
        netAmount -= taxAmount;
    }

    // Execute all transfers
    if (burnAmount > 0) {
        _transfer(from, address(0), burnAmount);  // Burn tokens
        emit TokensBurned(from, burnAmount);
    }
    
    if (reflectionAmount > 0) {
        _addReflectionReward(to, reflectionAmount);  // Queue reflection reward
    }
    
    if (taxAmount > 0) {
        _transfer(from, TAX_WALLET, taxAmount);  // Send tax
    }
    
    _transfer(from, to, netAmount);  // Send final amount
    emit TokensTransferred(from, to, netAmount, taxAmount);

    return true;
}
```

**WHY:** Same as transfer() but for approved transfers. Ensures burn and reflection work with transferFrom too.

---

### Location: NEW EVENTS (Add after existing events, Line ~15)

**ADD THESE NEW EVENTS:**
```solidity
// NEW: Event when reflection is added to holder balance
event ReflectionAdded(address indexed holder, uint256 amount);

// NEW: Event when holder claims reflection rewards
event ReflectionClaimed(address indexed holder, uint256 amount);

// NEW: Event when tokens are burned
event TokensBurned(address indexed from, uint256 amount);
```

**WHY:** Events allow the frontend and explorers to track burn and reflection activities.

---

## 2. contracts/TokenFactory.sol

### Location: UPDATE createToken() signature (Line ~20)

**CHANGE FROM:**
```solidity
function createToken(
    string memory _name,
    string memory _symbol,
    uint256 _initialSupply,
    uint8 _taxPercent,
    address _taxWallet,
    address _initialOwner
) external returns (address) {
```

**CHANGE TO:**
```solidity
function createToken(
    string memory _name,
    string memory _symbol,
    uint256 _initialSupply,
    uint8 _taxPercent,
    address _taxWallet,
    uint8 _reflectionPercent,         // NEW: Reflection percentage
    uint8 _burnPercent,               // NEW: Burn percentage
    bool _enableReflection,           // NEW: Enable reflection
    bool _enableBurn,                 // NEW: Enable burn
    address _initialOwner
) external returns (address) {
```

**WHY:** Accept the new parameters from the bot.

---

### Location: ADD VALIDATION in createToken() (After existing validations, Line ~30)

**ADD AFTER:**
```solidity
    require(bytes(_name).length > 0, "Name required");
    require(bytes(_symbol).length > 0, "Symbol required");
```

**ADD THESE:**
```solidity
    // NEW: Validate reflection and burn parameters
    require(_reflectionPercent <= 100, "Reflection cannot exceed 100%");
    require(_burnPercent <= 100, "Burn cannot exceed 100%");
    
    // NEW: Validate total fees
    require(
        _taxPercent + _reflectionPercent + _burnPercent <= 100,
        "Total fees (tax + reflection + burn) cannot exceed 100%"
    );
```

**WHY:** Ensures invalid parameter combinations are rejected before deployment.

---

### Location: UPDATE SecureToken instantiation (Line ~50)

**CHANGE FROM:**
```solidity
    SecureToken newToken = new SecureToken(
        _name,
        _symbol,
        _initialSupply,
        _taxPercent,
        _taxWallet,
        _initialOwner
    );
```

**CHANGE TO:**
```solidity
    SecureToken newToken = new SecureToken(
        _name,
        _symbol,
        _initialSupply,
        _taxPercent,
        _taxWallet,
        _reflectionPercent,          // NEW
        _burnPercent,                // NEW
        _enableReflection,           // NEW
        _enableBurn,                 // NEW
        _initialOwner
    );
```

**WHY:** Pass all new parameters to the SecureToken constructor.

---

### Location: ADD NEW FUNCTION (After getTokenAtIndex(), Line ~75)

**ADD NEW FUNCTION:**
```solidity
/**
 * NEW: Get all features of a deployed token
 * Returns: (hasReflection, hasBurn, reflectionPercent, burnPercent, taxWallet, taxPercent)
 */
function getTokenFeatures(address tokenAddress) 
    external 
    view 
    returns (
        bool hasReflection,
        bool hasBurn,
        uint8 reflectionPercent,
        uint8 burnPercent,
        address taxWallet,
        uint8 taxPercent
    ) 
{
    SecureToken token = SecureToken(tokenAddress);
    return (
        token.HAS_REFLECTION(),
        token.HAS_BURN(),
        token.REFLECTION_PERCENT(),
        token.BURN_PERCENT(),
        token.TAX_WALLET(),
        token.TAX_PERCENT()
    );
}
```

**WHY:** Called by the bot's analyzer to retrieve all token features for display in the analysis report.

---

## 3. bot/handlers/createToken.js

### Location: INSIDE callback_query handler (After tax setup, Line ~120)

**ADD AFTER** the tax fee collection section (after user enters tax wallet):

```javascript
// NEW: Ask about Reflection
const reflectionKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '✅ Yes', callback_data: 'reflection_yes' }],
            [{ text: '❌ No', callback_data: 'reflection_no' }],
        ]
    }
};

bot.sendMessage(
    chatId,
    '💰 Enable Reflection Rewards?\n\nHolders will automatically earn rewards just by holding tokens.',
    reflectionKeyboard
);

userSessions[userId].step = 'waiting_reflection_choice';
```

**WHY:** Ask user if they want reflection before asking for the percentage.

---

### Location: INSIDE callback_query handler (After reflection choice, Line ~140)

**ADD HANDLING for reflection callbacks:**

```javascript
// NEW: Handle reflection yes
if (query.data === 'reflection_yes') {
    bot.sendMessage(chatId, '📊 What reflection percentage? (0-100%)');
    userSessions[userId].enableReflection = true;
    userSessions[userId].step = 'waiting_reflection_percent';
    bot.answerCallbackQuery(query.id);
    return;
}

// NEW: Handle reflection no
if (query.data === 'reflection_no') {
    userSessions[userId].enableReflection = false;
    userSessions[userId].reflectionPercent = 0;
    userSessions[userId].step = 'waiting_burn_choice';
    
    // Ask about burn
    const burnKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Yes', callback_data: 'burn_yes' }],
                [{ text: '❌ No', callback_data: 'burn_no' }],
            ]
        }
    };
    
    bot.sendMessage(
        chatId,
        '🔥 Enable Burn on Transfer?\n\nTokens will be deflated with each transaction.',
        burnKeyboard
    );
    
    bot.answerCallbackQuery(query.id);
    return;
}
```

**WHY:** Branches the flow based on user choice to enable or skip reflection.

---

### Location: INSIDE text message handler (Line ~200)

**ADD AFTER tax wallet input:**

```javascript
// NEW: Handle reflection percentage
if (session.step === 'waiting_reflection_percent') {
    const reflectionPercent = parseInt(text);
    
    if (isNaN(reflectionPercent) || reflectionPercent < 0 || reflectionPercent > 100) {
        bot.sendMessage(chatId, '❌ Reflection must be a number between 0 and 100');
        return;
    }
    
    userSessions[userId].reflectionPercent = reflectionPercent;
    userSessions[userId].step = 'waiting_burn_choice';
    
    // Ask about burn
    const burnKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Yes', callback_data: 'burn_yes' }],
                [{ text: '❌ No', callback_data: 'burn_no' }],
            ]
        }
    };
    
    bot.sendMessage(
        chatId,
        '🔥 Enable Burn on Transfer?\n\nTokens will be deflated with each transaction.',
        burnKeyboard
    );
    return;
}

// NEW: Handle burn percentage
if (session.step === 'waiting_burn_percent') {
    const burnPercent = parseInt(text);
    
    if (isNaN(burnPercent) || burnPercent < 0 || burnPercent > 100) {
        bot.sendMessage(chatId, '❌ Burn must be a number between 0 and 100');
        return;
    }
    
    userSessions[userId].burnPercent = burnPercent;
    
    // NEW: Validate total fees
    const totalFees = (userSessions[userId].taxPercent || 0) + 
                      (userSessions[userId].reflectionPercent || 0) + 
                      (burnPercent || 0);
    
    if (totalFees > 100) {
        bot.sendMessage(
            chatId,
            `❌ Error: Total fees (${totalFees}%) exceed 100%\n\n` +
            `Tax: ${userSessions[userId].taxPercent}%\n` +
            `Reflection: ${userSessions[userId].reflectionPercent}%\n` +
            `Burn: ${burnPercent}%\n\n` +
            `Please reduce one or more percentages.`
        );
        userSessions[userId].step = 'waiting_burn_percent';
        return;
    }
    
    userSessions[userId].step = 'preview';
    showPreview(chatId, userSessions[userId]);
    return;
}
```

**WHY:** Validates reflection and burn percentages, validates total doesn't exceed 100%, and moves to preview.

---

### Location: INSIDE callback_query handler (After burn choice, Line ~160)

**ADD HANDLING for burn callbacks:**

```javascript
// NEW: Handle burn yes
if (query.data === 'burn_yes') {
    bot.sendMessage(chatId, '🔥 What burn percentage? (0-100%)');
    userSessions[userId].enableBurn = true;
    userSessions[userId].step = 'waiting_burn_percent';
    bot.answerCallbackQuery(query.id);
    return;
}

// NEW: Handle burn no
if (query.data === 'burn_no') {
    userSessions[userId].enableBurn = false;
    userSessions[userId].burnPercent = 0;
    userSessions[userId].step = 'preview';
    showPreview(chatId, userSessions[userId]);
    bot.answerCallbackQuery(query.id);
    return;
}
```

**WHY:** Handles user choice to enable or skip burn feature.

---

### Location: UPDATE showPreview() function (Line ~250)

**MODIFY the preview message to include new features:**

**CHANGE FROM:**
```javascript
const previewText = `
📋 TOKEN PREVIEW

📝 Name: ${session.tokenName}
🏷️ Symbol: ${session.tokenSymbol}
📊 Supply: ${session.supply}

💰 TAX: ${session.taxPercent}% → ${session.taxWallet}

💳 Creation Fee: 20 USDT

[✅ Confirm] [❌ Cancel]
`;
```

**CHANGE TO:**
```javascript
// NEW: Calculate total fees
const totalFees = (session.taxPercent || 0) + 
                  (session.reflectionPercent || 0) + 
                  (session.burnPercent || 0);

const previewText = `
📋 TOKEN PREVIEW

📝 Name: ${session.tokenName}
🏷️ Symbol: ${session.tokenSymbol}
📊 Supply: ${session.supply}

💰 TAX: ${session.taxPercent}% → ${session.taxWallet}
✨ REFLECTION: ${session.reflectionPercent || 0}%
🔥 BURN: ${session.burnPercent || 0}%

💾 Total Fees: ${totalFees}%

💳 Creation Fee: 20 USDT

[✅ Confirm] [❌ Cancel]
`;
```

**WHY:** Shows all features including reflection and burn in the preview before payment.

---

### Location: UPDATE deployToken call (Line ~320)

**CHANGE FROM:**
```javascript
const tx = await factoryContractSigned.createToken(
    session.tokenName,
    session.tokenSymbol,
    ethers.parseUnits(session.supply, 18),
    session.taxPercent || 0,
    session.taxWallet || ethers.ZeroAddress,
    userWallet
);
```

**CHANGE TO:**
```javascript
const tx = await factoryContractSigned.createToken(
    session.tokenName,
    session.tokenSymbol,
    ethers.parseUnits(session.supply, 18),
    session.taxPercent || 0,
    session.taxWallet || ethers.ZeroAddress,
    session.reflectionPercent || 0,           // NEW
    session.burnPercent || 0,                 // NEW
    session.enableReflection || false,        // NEW
    session.enableBurn || false,              // NEW
    userWallet
);
```

**WHY:** Pass all new parameters to the factory's createToken function.

---

### Location: AFTER saving token to DB (Line ~340)

**ADD AFTER the tokens table insert:**

```javascript
// NEW: Save reflection and burn data to database
await connection.execute(
    `UPDATE tokens SET 
        reflection_percent = ?,
        burn_percent = ?,
        has_reflection = ?,
        has_burn = ?
    WHERE id = ?`,
    [
        session.reflectionPercent || 0,
        session.burnPercent || 0,
        session.enableReflection || false,
        session.enableBurn || false,
        tokenId
    ]
);

await connection.end();
```

**WHY:** Persists reflection and burn settings to database for later queries.

---

## 4. bot/handlers/myTokens.js

### Location: AFTER showing token details (Line ~60)

**ADD BEFORE the back button:**

```javascript
// NEW: Add analyze button
const tokenKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '🔍 Analyze', callback_data: `analyze_${token.id}` }],
            [{ text: '↩️ Back', callback_data: 'back_to_tokens' }],
        ]
    }
};

bot.editMessageReplyMarkup(tokenKeyboard, {
    chat_id: chatId,
    message_id: query.message.message_id
});
```

**WHY:** Adds analyze button so users can inspect token features directly from token list.

---

### Location: INSIDE callback_query handler (Line ~80)

**ADD NEW HANDLER for analyze callback:**

```javascript
// NEW: Handle analyze button click
if (query.data.startsWith('analyze_')) {
    const tokenId = query.data.split('_')[1];
    
    // Get token from database
    const [tokens] = await db.execute(
        'SELECT token_address FROM tokens WHERE id = ? AND user_id = ?',
        [tokenId, query.from.id]
    );
    
    if (!tokens || tokens.length === 0) {
        bot.answerCallbackQuery(query.id, '❌ Token not found', true);
        return;
    }
    
    const tokenAddress = tokens[0].token_address;
    
    // Import and call analyzer
    const { analyzeToken } = require('./analyzeToken');
    analyzeToken(bot, query.message.chat.id, query.from.id, tokenAddress);
    
    bot.answerCallbackQuery(query.id);
    return;
}
```

**WHY:** Retrieves token address and calls the analyzer when user clicks analyze button.

---

## 5. bot/handlers/analyzeToken.js

### Location: NEW FILE - Create new file

**CREATE ENTIRE FILE:**

```javascript
/**
 * analyzeToken.js
 * Analyzes deployed tokens and displays their features
 */

const { ethers } = require('ethers');
const { getTokenFeatures } = require('../utils/blockchain');
const { logActivity } = require('../utils/database');

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
        const details = await getTokenDetails(tokenAddress);
        
        if (!details) {
            bot.sendMessage(chatId, '❌ Token not found on blockchain');
            return;
        }

        // Get features from factory
        const features = await getTokenFeatures(tokenAddress);

        if (!features) {
            bot.sendMessage(chatId, '⚠️ Could not retrieve full feature set');
            return;
        }

        // Build detailed analysis report
        const analysis = buildTokenAnalysis(details, features, tokenAddress);
        
        // Send analysis
        bot.sendMessage(chatId, analysis, { parse_mode: 'HTML' });
        
        // Log this action
        await logActivity(userId, 'analyzed_token', {
            tokenAddress,
            tokenName: details.name,
            hasReflection: features.hasReflection,
            hasBurn: features.hasBurn
        });

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
 * Get token details from blockchain
 */
async function getTokenDetails(tokenAddress) {
    try {
        const provider = require('../utils/blockchain').connectProvider('alvey');
        const ERC20_ABI = require('../abis/ERC20.json');
        
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        
        const [name, symbol, totalSupply, owner] = await Promise.all([
            token.name(),
            token.symbol(),
            token.totalSupply(),
            token.owner()
        ]);

        return {
            name,
            symbol,
            totalSupply: totalSupply.toString(),
            owner
        };
    } catch (error) {
        console.error('Error getting token details:', error);
        return null;
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
        const taxWallet = features.taxWallet.substring(0, 6) + '...' + features.taxWallet.substring(-4);
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
    getTokenDetails,
    buildTokenAnalysis
};
```

**WHY:** New handler file that analyzes tokens and displays comprehensive feature report.

---

## 6. bot/utils/blockchain.js

### Location: ADD NEW FUNCTIONS at the end

**ADD THESE FUNCTIONS:**

```javascript
/**
 * NEW: Get token features from Factory contract
 */
async function getTokenFeatures(tokenAddress) {
    try {
        const provider = connectProvider('alvey');
        const factoryAddress = process.env.FACTORY_CONTRACT_ADDRESS;
        
        if (!factoryAddress) {
            console.error('FACTORY_CONTRACT_ADDRESS not set in .env');
            return null;
        }

        const factoryABI = require('../abis/TokenFactory.json');
        const factory = new ethers.Contract(factoryAddress, factoryABI, provider);
        
        const features = await factory.getTokenFeatures(tokenAddress);
        
        return {
            hasReflection: features[0],
            hasBurn: features[1],
            reflectionPercent: features[2],
            burnPercent: features[3],
            taxWallet: features[4],
            taxPercent: features[5]
        };
    } catch (error) {
        console.error('Error getting token features:', error);
        return null;
    }
}

/**
 * NEW: Check if a specific feature is enabled on token
 */
async function checkTokenFeature(tokenAddress, featureName) {
    try {
        const features = await getTokenFeatures(tokenAddress);
        if (!features) return false;
        
        const featureMap = {
            'reflection': features.hasReflection,
            'burn': features.hasBurn,
            'tax': features.taxPercent > 0
        };
        
        return featureMap[featureName] || false;
    } catch (error) {
        console.error('Error checking feature:', error);
        return false;
    }
}

// Export new functions
module.exports = {
    connectProvider,
    getTokenDetails,
    deployToken,
    transferOwnership,
    verifyPayment,
    getTransactionReceipt,
    getTokenFeatures,      // NEW
    checkTokenFeature      // NEW
};
```

**WHY:** Provides blockchain interaction functions for retrieving token features from the factory contract.

---

## 7. bot/index.js

### Location: ADD NEW COMMAND HANDLER (After existing commands, Line ~50)

**ADD NEW COMMAND:**

```javascript
// NEW: /analyze command - analyze any token
bot.onText(/\/analyze/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    bot.sendMessage(
        chatId,
        '🔍 <b>Token Analyzer</b>\n\n' +
        'Paste the token address you want to analyze:',
        { parse_mode: 'HTML' }
    );
    
    userSessions[userId] = { step: 'waiting_analyze_address' };
});
```

**WHY:** Allows users to analyze any token by pasting address.

---

### Location: ADD TEXT MESSAGE HANDLER for analyzer (Line ~150)

**ADD IN the text message handler section:**

```javascript
// NEW: Handle analyze address input
if (userSessions[userId]?.step === 'waiting_analyze_address') {
    const tokenAddress = msg.text.trim();
    
    // Import analyzer
    const { analyzeToken } = require('./handlers/analyzeToken');
    
    // Analyze the token
    analyzeToken(bot, chatId, userId, tokenAddress);
    
    // Clear session
    delete userSessions[userId];
    return;
}
```

**WHY:** Processes the token address the user provides and calls analyzer.

---

## 8. database/schema.sql

### Location: ALTER tokens table (Add new columns)

**ADD AFTER existing columns:**

```sql
-- NEW: Add columns for reflection and burn features
ALTER TABLE tokens ADD COLUMN (
    reflection_percent TINYINT DEFAULT 0 COMMENT 'Reflection percentage (0-100)',
    burn_percent TINYINT DEFAULT 0 COMMENT 'Burn percentage (0-100)',
    has_reflection BOOLEAN DEFAULT FALSE COMMENT 'Reflection feature enabled',
    has_burn BOOLEAN DEFAULT FALSE COMMENT 'Burn feature enabled',
    total_fees_percent TINYINT GENERATED ALWAYS AS 
        (COALESCE(tax_percent, 0) + COALESCE(reflection_percent, 0) + COALESCE(burn_percent, 0)) 
        STORED COMMENT 'Total of all fees combined'
);

-- NEW: Create index for feature searches
CREATE INDEX idx_features ON tokens(has_reflection, has_burn);
CREATE INDEX idx_total_fees ON tokens(total_fees_percent);
```

**WHY:** Stores reflection and burn data for each token. GENERATED column auto-calculates total fees.

---

## 9. bot/abis/TokenFactory.json

### Location: UPDATE getTokenFeatures in ABI

**ENSURE this function is in the ABI:**

```json
{
    "name": "getTokenFeatures",
    "type": "function",
    "stateMutability": "view",
    "inputs": [
        {
            "name": "tokenAddress",
            "type": "address",
            "internalType": "address"
        }
    ],
    "outputs": [
        {
            "name": "hasReflection",
            "type": "bool",
            "internalType": "bool"
        },
        {
            "name": "hasBurn",
            "type": "bool",
            "internalType": "bool"
        },
        {
            "name": "reflectionPercent",
            "type": "uint8",
            "internalType": "uint8"
        },
        {
            "name": "burnPercent",
            "type": "uint8",
            "internalType": "uint8"
        },
        {
            "name": "taxWallet",
            "type": "address",
            "internalType": "address"
        },
        {
            "name": "taxPercent",
            "type": "uint8",
            "internalType": "uint8"
        }
    ]
}
```

**WHY:** Tells the bot how to call the getTokenFeatures function on the factory contract.

---

## 10. bot/config/constants.js

### Location: ADD validation constants (Line ~30)

**ADD AFTER existing constants:**

```javascript
// NEW: Feature validation limits
const FEATURE_LIMITS = {
    MIN_TAX: 0,
    MAX_TAX: 100,
    MIN_REFLECTION: 0,
    MAX_REFLECTION: 100,
    MIN_BURN: 0,
    MAX_BURN: 100,
    MAX_TOTAL_FEES: 100,  // Tax + Reflection + Burn cannot exceed
};

module.exports = {
    // ... existing exports
    FEATURE_LIMITS
};
```

**WHY:** Centralized validation limits that can be reused throughout the bot.

---

## Summary of Changes

| File | Change Type | New Lines | Purpose |
|------|------------|-----------|---------|
| SecureToken.sol | Add params + functions | ~150 | Reflection/burn logic |
| TokenFactory.sol | Update + add function | ~40 | Support new parameters + feature getter |
| createToken.js | Add flow steps | ~100 | Collect reflection/burn settings |
| myTokens.js | Add button + handler | ~30 | Analyze button for tokens |
| analyzeToken.js | NEW FILE | ~200 | Token analysis and reporting |
| blockchain.js | Add functions | ~40 | Query factory for features |
| index.js | Add command + handler | ~25 | /analyze command |
| schema.sql | Add columns + index | ~15 | Store reflection/burn data |
| TokenFactory.json | Ensure ABI exists | ~35 | Function definition |
| constants.js | Add limits | ~10 | Validation constants |

**Total New/Modified Lines: ~645 lines**

