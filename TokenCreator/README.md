# Token Creator Bot

A Telegram bot that allows users to create ERC-20 tokens on Alvey Chain securely. The bot manages payments in USDT (BSC), deploys contracts with configurable tax fees, and handles ownership transfers.

## Features

- 🤖 **Telegram Bot Interface**: Easy-to-use bot for token creation
- 🔒 **Secure Token Creation**: Immutable tax fees and wallet addresses
- 💳 **Payment Integration**: Automatic USDT payment verification on BSC
- 📊 **Token Management**: View and manage your created tokens
- 🔐 **Ownership Transfer**: Transfer token ownership securely
- 📝 **Activity Logging**: Complete audit trail of all actions

## Technology Stack

- **Backend**: Node.js with `node-telegram-bot-api`
- **Blockchain**: Ethers.js v6, Hardhat
- **Networks**: 
  - Alvey Chain (Chain ID: 3797) - Main network
  - BSC Testnet (Chain ID: 97) - Testing network
- **Database**: MySQL 8
- **Smart Contracts**: Solidity 0.8.28 with OpenZeppelin

## Prerequisites

- Node.js 18+ and npm
- MySQL 8.0+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Alvey Chain wallet with ALV for gas fees
- BSC wallet for receiving USDT payments

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd token-creator-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Telegram Bot Configuration
BOT_TOKEN=your_telegram_bot_token_here

# Blockchain Configuration
BOT_PRIVATE_KEY=your_bot_wallet_private_key_here
FACTORY_ADDRESS=0x0000000000000000000000000000000000000000

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=token_creator_bot

# Payment Configuration
PAYMENT_WALLET_BSC=0x0000000000000000000000000000000000000000
PAYMENT_WALLET_ALVEY=0x0000000000000000000000000000000000000000
PAYMENT_AMOUNT_USDT=20

# Token Addresses
USDT_BSC=0x55d398326f99059fF775485246999027B3197955
aUSDT_ALVEY=0x0000000000000000000000000000000000000000

# Network RPCs
ALVEY_RPC_URL=https://elves-core2.alvey.io/
BSC_RPC=https://bsc-dataseed1.binance.org
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545

# Factory Addresses (one per network)
FACTORY_ALVEY_ADDRESS=0x0000000000000000000000000000000000000000
FACTORY_BSC_TESTNET_ADDRESS=0x6725F303b657a9451d8BA641348b6761A6CC7a17
FACTORY_BSC_ADDRESS=0x0000000000000000000000000000000000000000
```

### 4. Setup database

```bash
npm run setup-db
```

This will create the MySQL database and all required tables.

### 5. Deploy smart contracts

#### Deploy to Alvey Chain

```bash
npm run deploy
```

This will deploy the TokenFactory contract to Alvey Chain and save the address to your `.env` file.

#### Deploy to BSC Testnet (for testing)

```bash
npx hardhat run scripts/deployBscTestnet.js --network bscTestnet
```

**Important**: 
- Make sure your `BOT_PRIVATE_KEY` wallet has ALV tokens for gas fees (Alvey Chain)
- For BSC Testnet, get testnet tBNB from: https://testnet.bnbchain.org/faucet-smart

### 6. Start the bot

```bash
npm start
```

## Usage

### Bot Commands

- `/start` - Start the bot and see main menu
- `/create_token` - Create a new ERC-20 token
- `/my_tokens` - View all your created tokens
- `/manage` - Manage your tokens
- `/help` - Get help and information

### Creating a Token

1. Send `/create_token` to the bot
2. Follow the prompts:
   - **Token Name**: Enter a name for your token (1-50 characters)
   - **Token Symbol**: Enter a symbol (1-10 uppercase letters/numbers)
   - **Initial Supply**: Enter the total supply (must be > 0)
   - **Tax Fee**: Choose Yes/No
     - If Yes: Enter tax percentage (0-100) and tax wallet address
   - **Preview**: Review your token details
   - **Confirm**: Confirm token creation
3. **Payment**: Send the payment wallet address (BSC)
4. Send exactly **20 USDT** to the payment wallet address from your BSC wallet
5. Wait for payment confirmation (automatic, checks every 5 seconds)
6. **Owner Wallet**: Send your Alvey Chain wallet address
7. Token will be deployed automatically!

### Viewing Your Tokens

- Use `/my_tokens` to see all tokens you've created
- Click on any token to view detailed information
- Use "Manage Token" to transfer ownership

### Transferring Ownership

1. View your tokens with `/my_tokens`
2. Click on a token to see details
3. Click "Manage Token" → "Transfer Ownership"
4. Send the new owner's Alvey Chain wallet address
5. Ownership will be transferred on-chain

## Project Structure

```
token-creator-bot/
├── contracts/
│   ├── SecureToken.sol          # ERC-20 Token with immutable tax
│   └── TokenFactory.sol         # Factory to deploy tokens
├── bot/
│   ├── index.js                 # Bot entry point
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

## Smart Contracts

### SecureToken.sol

ERC-20 token contract with the following features:

- **Immutable Tax**: Tax percentage and wallet cannot be changed after deployment
- **No Minting**: Minting is permanently disabled
- **No Burning**: Burning is not allowed
- **Ownership Transfer**: Ownership can be transferred (but not tax parameters)
- **Tax on Transfers**: Automatic tax deduction on transfers

### TokenFactory.sol

Factory contract that deploys SecureToken instances:

- Deploys new tokens with specified parameters
- Tracks all deployed tokens
- Maps tokens to creators
- Emits events for all deployments

## Database Schema

The bot uses MySQL with the following tables:

- **users**: Telegram user information
- **tokens**: Created token details and addresses
- **payments**: Payment records and status
- **user_sessions**: Active user sessions for multi-step flows
- **activity_logs**: Audit log of all actions

## Security Features

- ✅ Rate limiting (1 token per 10 minutes per user)
- ✅ Input validation and sanitization
- ✅ Payment verification on-chain
- ✅ Immutable token parameters
- ✅ Private keys never logged or exposed
- ✅ Transaction verification before processing

## Payment Flow

1. User confirms token creation
2. Bot generates unique payment ID
3. User sends BSC wallet address
4. Bot provides payment instructions (20 USDT to payment wallet)
5. Bot checks for payment every 5 seconds for 15 minutes
6. Payment verified on-chain (USDT transfer event)
7. User provides Alvey Chain wallet address
8. Token deployed with user as owner

## Configuration

### Networks

- **Alvey Chain**: RPC: https://elves-core2.alvey.io/, Chain ID: 3797
- **BSC**: RPC: https://bsc-dataseed1.binance.org, Chain ID: 56

### Payment

- **Amount**: 20 USDT (configurable in `.env`)
- **Network**: BSC (Binance Smart Chain)
- **Timeout**: 15 minutes
- **Check Interval**: 5 seconds

## Troubleshooting

### Bot not responding

- Check that `BOT_TOKEN` is correct in `.env`
- Verify bot is running: `npm start`
- Check console for errors

### Payment not detected

- Ensure payment is exactly 20 USDT
- Verify payment is from the correct wallet
- Check that payment was sent to `PAYMENT_WALLET_BSC`
- Payment must be within 15 minutes

### Token deployment fails

- Verify `BOT_PRIVATE_KEY` has ALV for gas
- Check `FACTORY_ADDRESS` is correct
- Ensure Alvey Chain RPC is accessible
- Check transaction on [AlveyScan](https://alveyscan.com)

### Database connection errors

- Verify MySQL is running
- Check database credentials in `.env`
- Ensure database exists: `npm run setup-db`
- Check MySQL user has proper permissions

## Development

### Compile contracts

```bash
npm run compile
```

### Run tests

```bash
npx hardhat test
```

### Deploy to testnet

Update `hardhat.config.js` with testnet configuration and run:

```bash
npx hardhat run scripts/deploy.js --network <network-name>
```

## Important Notes

- ⚠️ **Never share your private keys**: Keep `BOT_PRIVATE_KEY` secure
- ⚠️ **Test first**: Test on testnet before mainnet deployment
- ⚠️ **Backup database**: Regularly backup your MySQL database
- ⚠️ **Monitor payments**: Keep track of payment wallet balance
- ⚠️ **Gas fees**: Ensure bot wallet has sufficient ALV for deployments

## Support

For issues, questions, or contributions, please open an issue on the repository.

## License

MIT License

## Multi-Chain Deployment

The bot now supports deploying tokens on multiple blockchain networks:

### Supported Networks

- **Alvey Chain** (Mainnet) - Chain ID: 3797
- **BSC Testnet** - Chain ID: 97 (for testing)

### Testing on BSC Testnet

1. Get testnet tBNB from faucet: https://testnet.bnbchain.org/faucet-smart
2. Deploy factory to BSC Testnet:
   ```bash
   npx hardhat run scripts/deployBscTestnet.js --network bscTestnet
   ```
3. Copy factory address to `.env`:
   ```bash
   FACTORY_BSC_TESTNET_ADDRESS=0x...
   ```
4. Create tokens on BSC Testnet to save on gas fees, then deploy to production networks once tested.

### Network Selection

When creating a token with `/create_token`, users will be prompted to select their preferred network first. The bot will:
- Use the correct factory contract for the selected network
- Deploy tokens on the chosen blockchain
- Display network-specific explorer links
- Store network information in the database

### Migration to BSC Mainnet (Future)

When ready for production on BSC Mainnet:

1. Add BSC Mainnet factory address to `.env`:
   ```bash
   FACTORY_BSC_ADDRESS=0x...
   ```
2. Deploy factory to BSC Mainnet (costs ~0.01 BNB)
3. Network selection will automatically include BSC Mainnet option

## References

- [Alvey Chain Explorer](https://alveyscan.com)
- [BSC Explorer](https://bscscan.com)
- [BSC Testnet Explorer](https://testnet.bscscan.com)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com)
- [Ethers.js Documentation](https://docs.ethers.org/v6/)
- [Telegram Bot API](https://core.telegram.org/bots/api)

