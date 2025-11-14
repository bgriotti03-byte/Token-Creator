# Token Creator Bot - Complete Prompt for Cursor (English Version)

## GENERAL CONTEXT

I need you to generate a complete Telegram Bot project that allows users to create ERC-20 tokens on Alvey Chain securely. The bot manages payments in USDT (BSC) and aUSDT (Alvey), deploys contracts with configurable tax fees, and transfers ownership.

---

## TECHNICAL SPECIFICATIONS

### Technology Stack
- **Backend Bot**: Node.js with `node-telegram-bot-api`
- **Blockchain**: Ethers.js v6, Hardhat for smart contracts
- **Blockchain Target**: Alvey Chain (RPC: https://rpc.alveychain.com, Chain ID: 3797)
- **Database**: MySQL 8
- **Smart Contracts Language**: Solidity 0.8.28
- **Payment**: USDT on BSC (0x55d398326f99059fF775485246999027B3197955) and aUSDT on Alvey Chain

---

## FOLDER STRUCTURE

```
token-creator-bot/
├── contracts/
│   ├── SecureToken.sol          # ERC-20 Token with immutable tax
│   └── TokenFactory.sol         # Factory to deploy tokens
├── bot/
│   ├── index.js                 # Entry point
│   ├── handlers/
│   │   ├── createToken.js       # Token creation flow
│   │   ├── myTokens.js          # List user tokens
│   │   ├── manageToken.js       # Manage ownership
│   │   └── paymentVerification.js # Validate payments
│   ├── utils/
│   │   ├── blockchain.js        # Ethers.js interaction
│   │   ├── database.js          # MySQL connection pool
│   │   └── validators.js        # Input validation
│   └── config/
│       └── constants.js         # URLs, addresses, constants
├── scripts/
│   ├── deploy.js                # Deploy Factory
│   └── setupDB.js               # Create MySQL tables
├── database/
│   └── schema.sql               # Complete MySQL schema
├── .env.example
├── .gitignore
├── package.json
├── hardhat.config.js
└── README.md
```

---

## BOT REQUIREMENTS

### 1. Smart Contracts (Solidity)

**SecureToken.sol:**
- Inherit from ERC20 and Ownable (OpenZeppelin)
- Constructor with parameters: name, symbol, initialSupply, taxPercent (0-100), taxWallet, initialOwner
- Tax fee IMMUTABLE (cannot be changed)
- Tax wallet IMMUTABLE (cannot be changed)
- Override transfer() and transferFrom() to apply tax
- Block mint() - throw error "Minting is permanently disabled"
- Block burn() - throw error "Burning is not allowed"
- Transfer ownership allowed but cannot change any token parameters
- Event: TokensTransferred(from, to, amount, taxAmount)

**TokenFactory.sol:**
- Function createToken(name, symbol, initialSupply, taxPercent, taxWallet, initialOwner) that deploys SecureToken
- Maintain deployedTokens array and creatorTokens mapping
- Emit TokenDeployed event with all details
- Getter functions: getCreatorTokens(), getTotalTokens(), getTokenAtIndex()

### 2. Database (MySQL)

**Required tables:**
- `users` (id, telegram_id, username, first_name, last_name, created_at, last_active)
- `tokens` (id, user_id, token_name, token_symbol, initial_supply, tax_percent, tax_wallet, token_address, owner_wallet, factory_address, tx_hash, network, deployed_at)
- `payments` (id, user_id, token_id, payment_id, amount, currency, payer_wallet, tx_hash, status, created_at, confirmed_at, expires_at)
- `user_sessions` (id, telegram_id, session_data JSON, step, created_at, updated_at, expires_at)
- `activity_logs` (id, user_id, action, description, metadata JSON, created_at)

### 3. Token Creation Flow

```
/create_token
  ↓
Bot: "What is your token name?" → User: "MyToken"
  ↓
Bot: "Token symbol?" → User: "MYT"
  ↓
Bot: "Initial supply?" → User: "1000000"
  ↓
Bot: "Do you want a tax fee? (Yes/No)" → User: "Yes"
  ↓
[IF USER CHOOSES YES]
Bot: "Tax percentage? (0-100)" → User: "2"
  ↓
Bot: "Which wallet receives tax tokens?" → User: "0xABCD..."
  ↓
[PREVIEW]
Bot shows everything in formatted table
Buttons: [✅ Confirm] [❌ Cancel]
  ↓
[IF USER CONFIRMS]
Bot: "Which wallet will you send payment from?" → User: "0xUSER..."
  ↓
Bot generates UNIQUE payment_id (PAY_TIMESTAMP_RANDOMSTRING)
Bot saves in DB: status='pending', payer_wallet=0xUSER
  ↓
Bot shows instructions:
- Send exactly 20 USDT to: 0xBOT_WALLET_BSC
- From your wallet: 0xUSER...
- Wait 1-2 minutes
Buttons: [✅ Already sent] [⏳ Waiting...]
  ↓
[PAYMENT VERIFICATION - OPTION B]
Bot starts listener that every 5 seconds:
  1. Gets recent transactions to BOT_WALLET_BSC
  2. Filters by: from == payer_wallet
  3. Validates: is USDT, is 20 USDT, timestamp < 2 minutes
  4. Checks: tx_hash not in payments (no duplicates)
  5. If ALL ✅: status='confirmed'
  ↓
[AFTER PAYMENT CONFIRMED]
Bot: "Send your ALVEY CHAIN wallet to receive ownership"
User: "0xOWNER_ALVEY..."
  ↓
[DEPLOY]
Bot deploys SecureToken using its private wallet:
  - Call TokenFactory.createToken()
  - Parameters: name, symbol, supply, taxPercent, taxWallet, ownerWallet
  ↓
Bot saves in DB: tokens table with address and tx_hash
  ↓
[SUCCESS]
Bot displays:
Token created:
- Name: MyToken
- Address: 0xTOKEN...
- Owner: 0xOWNER_ALVEY...
- Supply: 1,000,000
- TX: 0xTX...
- Explorer Link: https://alveyscan.com/tx/...
```

### 4. Bot Handlers

**createToken.js:**
- Handle complete flow: name → symbol → supply → tax → preview → payment → deploy
- Save session in `user_sessions` with JSON of parameters
- Validate inputs (Ethereum addresses, positive numbers)
- Integrate with paymentVerification.js to confirm payment

**myTokens.js:**
- Command /my_tokens
- List all user tokens from DB
- Show: name, symbol, address, owner, creation date
- Buttons to view details of each token

**manageToken.js:**
- When selecting a token, show details
- Option: "Transfer ownership"
- Ask for new wallet address
- Execute transferOwnership() on contract
- Save new address in DB

**paymentVerification.js:**
- Function startPaymentListener(payer_wallet, payment_id, user_id, token_id)
- Loop every 5 seconds for 15 minutes
- Get recent TXs to BOT_WALLET_BSC
- Filter by payer_wallet, validate 20 USDT
- Update DB: status='confirmed', confirmed_at=NOW
- When confirmed: execute token deploy
- If not confirmed in 15 min: status='expired'

**utils/blockchain.js:**
- Functions:
  - connectProvider(network) → returns Ethers provider
  - getTokenDetails(tokenAddress) → name, symbol, totalSupply, owner
  - deployToken(factoryAddress, params) → tx hash, token address
  - transferOwnership(tokenAddress, newOwner) → tx hash
  - verifyPayment(txHash, amount, from, to) → boolean
  - getTransactionReceipt(txHash) → receipt details

**utils/database.js:**
- MySQL connection pool
- Functions:
  - getUser(telegramId) or create if not exists
  - saveToken(user_id, params) → token_id
  - getUserTokens(user_id)
  - getToken(token_id)
  - savePayment(user_id, payment_id, params)
  - getPayment(payment_id)
  - updatePaymentStatus(payment_id, status)
  - getUserSession(telegram_id)
  - saveUserSession(telegram_id, step, data)
  - deleteUserSession(telegram_id)
  - logActivity(user_id, action, metadata)

**utils/validators.js:**
- isValidEthereumAddress(address)
- isValidTokenName(name)
- isValidTokenSymbol(symbol)
- isValidSupply(supply)
- isValidTaxPercent(percent)
- sanitizeInput(input)

**config/constants.js:**
- NETWORKS: { alvey, bsc }
- ADDRESSES: {FACTORY_ADDRESS, PAYMENT_WALLET_BSC, PAYMENT_WALLET_ALVEY, USDT_BSC, aUSDT_ALVEY}
- RPC URLs, Chain IDs, Explorer URLs
- TIMEOUT values, fees

### 5. Hardhat Config

- Network: alvey (RPC, chainId, accounts)
- Network: bsc (RPC, chainId, accounts)
- Compiler: solidity 0.8.28
- Plugins: hardhat-toolbox, OpenZeppelin contracts

### 6. Scripts

**deploy.js:**
- Deploy TokenFactory on Alvey Chain
- Save address in .env
- Log address

**setupDB.js:**
- Read schema.sql
- Execute against MySQL
- Create all tables

### 7. Main Bot Commands

- `/start` → Main menu
- `/create_token` → Start creation flow
- `/my_tokens` → List user tokens
- `/manage` → Management options
- `/help` → Information and FAQs
- `/balance` → View user payment balance (optional)

### 8. Important Validations

- Do not allow 0x0000... addresses
- Do not allow supply of 0 or negative
- Do not allow tax > 100%
- Validate payer_wallet is valid
- 15-minute timeout waiting for payment
- Do not allow same user paying twice in <1 minute

### 9. Error Messages

- "❌ Invalid address"
- "❌ Supply must be > 0"
- "❌ Tax must be between 0 and 100"
- "❌ Payment not verified yet. Please wait..."
- "❌ Payment expired (15 minutes without confirmation)"
- "✅ Token created successfully"

### 10. Security

- NEVER log private key
- BOT_PRIVATE_KEY only in .env (never in repo)
- Verify all transactions on blockchain before processing
- Rate limit per user (max 1 token every 10 minutes)
- Sanitize all inputs

---

## FILES TO GENERATE (IN ORDER)

1. **package.json** - Dependencies
2. **.env.example** - Environment variables
3. **.gitignore** - Files to ignore
4. **hardhat.config.js** - Hardhat configuration
5. **contracts/SecureToken.sol** - ERC-20 Token
6. **contracts/TokenFactory.sol** - Factory
7. **database/schema.sql** - MySQL schema
8. **bot/config/constants.js** - Constants
9. **bot/utils/validators.js** - Validators
10. **bot/utils/database.js** - MySQL connection
11. **bot/utils/blockchain.js** - Blockchain interaction
12. **bot/handlers/paymentVerification.js** - Payment verification
13. **bot/handlers/manageToken.js** - Manage tokens
14. **bot/handlers/myTokens.js** - List tokens
15. **bot/handlers/createToken.js** - Create tokens
16. **bot/index.js** - Main bot
17. **scripts/setupDB.js** - DB setup
18. **scripts/deploy.js** - Contract deployment
19. **README.md** - Documentation

---

## GENERATION INSTRUCTIONS

1. Generate ALL files at once if possible
2. Ensure everything is in separate files with correct imports
3. Use modern arrow functions
4. Handle promises correctly (async/await)
5. Include try-catch in all critical functions
6. Large numbers (supply, tx amounts) must be strings
7. Ethereum addresses always validated with ethers.isAddress()
8. All bot messages in ENGLISH
9. All variable names, comments, and function names in ENGLISH
10. All console logs in ENGLISH

---

## IMPORTANT NOTES

- Bot should NOT custody user wallets
- Users ALWAYS control their private keys
- Bot only deploys using its own wallet
- Deployment is IMMUTABLE (except ownership)
- Users transfer ownership AFTER token creation
- Use Ethers.js v6 (not v5)
- MySQL must be running on localhost:3306 (configurable in .env)
- Alvey Chain RPC: https://rpc.alveychain.com
- BSC RPC: https://bsc-dataseed1.binance.org

---

## URLS AND REFERENCES

- Alvey Chain Explorer: https://alveyscan.com
- BSC Explorer: https://bscscan.com
- OpenZeppelin Contracts: https://docs.openzeppelin.com
- Ethers.js Docs: https://docs.ethers.org/v6/

