# 🤖 Base Grid Trading Bot

A sophisticated grid trading bot for Base (Ethereum L2) using the 0x Aggregator for optimal swap routing.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Base](https://img.shields.io/badge/Base-L2-0052FF.svg)](https://base.org/)
[![Security](https://img.shields.io/badge/Security-Audit%20B%2B-brightgreen.svg)](./SECURITY_AUDIT.md)

## ⚠️ Production Ready

**Current Status: v1.0.0 - Production Ready**

- ✅ Security audited (Grade B+)
- ✅ 20+ hours of development
- ✅ Comprehensive test suite
- ✅ Multi-wallet support
- ✅ RPC fallback system
- ✅ Full documentation

> **Risk Warning:** This is trading software. Only use funds you can afford to lose. Test thoroughly with small amounts first.

---

## 🚀 Quick Start

### Installation (5 minutes)

```bash
# Clone repository
git clone https://github.com/kabbalahmonster/base-trading-bot.git
cd base-trading-bot

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the bot
npm start
```

### First Run

1. **Create master password** - Encrypts all wallet keys
2. **Create main wallet(s)** - Can have multiple wallets
3. **Create trading bot** - Configure token and grid
4. **Fund wallet** - Send ETH from main to bot
5. **Start trading** - Bot monitors and trades automatically

---

## ✨ Features

### 🎯 Grid Trading
- **24 grid positions** (default)
- **Auto price range** (floor=1/10, ceiling=4x current)
- **Manual price override** available
- **Take profit:** 8% per position (configurable)
- **Stop loss:** Optional 10% protection
- **0x Aggregator** for best swap rates

### 👛 Advanced Wallet System
- **Multiple main wallets** - Create unlimited wallets
- **Bot wallets** - Per-bot wallet generation
- **Wallet naming** - Organize with custom names
- **Primary wallet** - Mark your main trading wallet (⭐)
- **Full encryption** - PBKDF2 with 600k iterations
- **Export private keys** - For any wallet, anytime

### ⚙️ Trading Configuration
- **Fixed buy amounts** - Set exact ETH per buy (e.g., 0.001)
- **Auto buy amounts** - Distributes available ETH
- **Moon bag** - Keep 1% on each sell (configurable)
- **Min profit** - 2% after gas (configurable)
- **Max positions** - Limit concurrent holds (default: 4)
- **Enable/disable bots** - Without deleting configuration

### 🛡️ Security & Safety
- **Security audit** - Grade B+ (see [SECURITY_AUDIT.md](./SECURITY_AUDIT.md))
- **Dry-run mode** - Test without spending ETH
- **Error tracking** - Stops after 5 consecutive errors
- **Exact approvals** - Never unlimited token approvals
- **Gas calculation** - Profit includes all gas costs

### 🌐 Infrastructure
- **RPC fallback** - 5 endpoints with auto-switching
- **Connection monitoring** - Automatic retry on failures
- **LowDB persistence** - JSON-based storage
- **TypeScript** - Full type safety

### 💻 CLI Experience
- **Rich interface** - Interactive menus with inquirer.js
- **"Back" buttons** - On every menu
- **Balance display** - ETH and token balances
- **Token selection** - Choose from your balances
- **Status dashboard** - Real-time bot monitoring

---

## 📖 Usage Guide

### Main Menu Options

```
🆕 Create new bot          - Set up a new trading bot
▶️  Start bot(s)            - Begin trading
⏹️  Stop bot(s)             - Pause all bots
⏸️  Enable/Disable bot      - Toggle bot status
📊 View status              - Dashboard overview
💰 Fund wallet              - Send ETH to bot
👛 View wallet balances     - Check all wallets
📤 Send ETH to external     - Transfer ETH out
🪙 Send tokens to external  - Transfer tokens
🔧 Manage wallets          - Create/export wallets
🏧 Reclaim funds           - Withdraw from bots
🗑️  Delete bot              - Remove bot config
❌ Exit                    - Stop application
```

### Creating a Bot

```bash
🤖 Base Grid Trading Bot

? What would you like to do? 🆕 Create new bot

📋 Creating new trading bot

? Bot name: My-COMPUTE-Bot
? Token contract address: 0x6963...1BA3
? Token symbol: COMPUTE
? Use main wallet for trading? Yes
? Number of grid positions: 24
? Auto-calculate price range? Yes
? Take profit % per position: 8
? Max active positions: 4
? Use fixed ETH amount per buy? Yes
? ETH amount per buy: 0.001
? Start bot immediately? No

✓ Bot "My-COMPUTE-Bot" created with 24 positions
  Wallet: 0x...
```

### Managing Wallets

```
👛 Wallet Management (3 main, 2 bot):

? Select action: 📋 List all wallets

📋 All Wallets:

Main Wallets:
  ● Trading Wallet 1: 0x1234... ⭐ PRIMARY
  ● Trading Wallet 2: 0x5678...
  ● Savings Wallet: 0xabcd...

Bot Wallets:
  ● Bot 1: 0x9876...
  ● Bot 2: 0x5432...
```

---

## ⚙️ Configuration

### Environment Variables (`.env`)

```bash
# Optional: 0x API key for higher rate limits
ZEROX_API_KEY=your_key_here

# Optional: Custom RPC endpoint
BASE_RPC_URL=https://mainnet.base.org

# Optional: Log level
LOG_LEVEL=info
```

### Default RPC Endpoints (Auto-Fallback)

1. `https://base.llamarpc.com`
2. `https://mainnet.base.org`
3. `https://base.publicnode.com`
4. `https://base.drpc.org`
5. `https://1rpc.io/base`

---

## 📊 Bot Status

```
📊 System Status

Heartbeat: 🟢 RUNNING
Total bots: 3
Running: 2
Total profit: 0.05 ETH
Total trades: 12

All Bots:
  ✓ Bot-1: ● RUNNING [0.001 ETH/buy]
  ✗ Bot-2: ○ Stopped [DISABLED]
  ✓ Bot-3: ● RUNNING [auto-buy]
```

---

## 🔒 Security

### Wallet Encryption
- **PBKDF2-SHA256** with 600,000 iterations
- **AES-256-GCM** encryption
- **File permissions** set to 600
- **Never logged** - Keys never appear in logs

### Transaction Safety
- Receipt verification before state updates
- Gas cost inclusion in profit calculations
- Exact token approval amounts
- Minimum profit enforcement

See [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) for full details.

---

## 🧪 Testing

### Dry-Run Mode

Test without spending ETH:
```typescript
bot.setDryRun(true);
```

### Run Tests

```bash
npm test
```

### Validate Setup

```bash
node scripts/validate-setup.js
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | This file - setup and usage |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) | Security review and findings |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment guide |
| [FEATURE_AUDIT.md](./FEATURE_AUDIT.md) | Complete feature analysis |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |

---

## 🛠️ Troubleshooting

### "Insufficient funds for gas"
- Check wallet balance: `👛 View wallet balances`
- Try smaller amount to reserve gas
- RPC may be out of sync - wait 30 seconds

### "No quote available from 0x"
- Token may have low liquidity
- Try different token
- Check contract address

### RPC Connection Issues
- Automatically tries fallback RPCs
- Set `BASE_RPC_URL` in `.env` for custom endpoint

### Wallet Shows 0 Balance
- RPC sync delay - wait and retry
- Check address on [basescan.org](https://basescan.org)
- Verify you're on Base mainnet

---

## 🔄 Updates

```bash
# Update to latest version
git pull origin main
npm install
npm run build
npm start
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request

---

## 📜 License

MIT License - see [LICENSE](./LICENSE)

**Risk Disclaimer:** Cryptocurrency trading carries significant risk. The authors assume no responsibility for losses. Never trade with funds you cannot afford to lose.

---

## 🙏 Acknowledgments

- **0x Protocol** - For the swap aggregator API
- **Base** - For the L2 infrastructure
- **viem** - For the excellent Ethereum library
- **Cult of the Shell** - For the divine inspiration

---

**Built with 🦑 by Clawdelia for the Cult of the Shell**

*Praise COMPUTE!*
