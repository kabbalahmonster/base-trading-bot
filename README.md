# 🤖 Base Grid Trading Bot

A sophisticated grid trading bot for Base (Ethereum L2) using the 0x Aggregator for optimal swap routing. Now with multi-chain support and volume bot mode!

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Base](https://img.shields.io/badge/Base-L2-0052FF.svg)](https://base.org/)
[![Ethereum](https://img.shields.io/badge/Ethereum-L1-3C3C3D.svg)](https://ethereum.org/)
[![Security](https://img.shields.io/badge/Security-Audit%20B%2B-brightgreen.svg)](./SECURITY_AUDIT.md)

## ⚠️ Production Ready

**Current Status: v1.4.0 - Production Ready**

- ✅ Security audited (Grade B+)
- ✅ Continuous range-based grid (no gaps)
- ✅ Multi-chain support (Base + Ethereum)
- ✅ Volume bot mode for market making
- ✅ Real-time monitoring dashboard
- ✅ Price oracles (Chainlink + Uniswap V3 TWAP)
- ✅ P&L tracking with CSV export
- ✅ Telegram notifications
- ✅ Comprehensive test suite (80%+ coverage)
- ✅ Multi-wallet support with primary designation
- ✅ Bot reconfiguration with position preservation
- ✅ RPC fallback system with 5 endpoints
- ✅ Daemon mode for 24/7 operation

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
2. **Create main wallet(s)** - Can have unlimited wallets with primary designation
3. **Create trading bot** - Configure token, chain, and continuous grid
4. **Fund wallet** - Send ETH from main to bot wallet
5. **Start trading** - Bot monitors and trades automatically

### Quick Configuration

```bash
# Optional: Create .env file for advanced settings
cp .env.example .env

# Edit .env with your preferences
nano .env
```

---

## 🌐 Chain Selection

The bot supports trading on multiple blockchains. Choose your chain by copying the appropriate configuration file:

```bash
# Robinhood Chain (default, recommended for beginners)
# - Chain ID: 4663
# - Very low gas costs (~$0.001 per tx)
# - Best for testing and small positions
cp .env.robinhood .env

# Base Chain (recommended for production)
# - Chain ID: 8453
# - Low gas costs (~$0.01-0.10 per tx)
# - Good liquidity, active development
cp .env.base .env

# Ethereum Mainnet (for large positions)
# - Chain ID: 1
# - HIGH gas costs ($5-50+ per tx)
# - Highest liquidity, most established
cp .env.mainnet .env
```

### Using the Helper Script

You can also use the provided helper script to switch chains:

```bash
# Switch to Robinhood Chain
./scripts/switch-chain.sh robinhood

# Switch to Base Chain
./scripts/switch-chain.sh base

# Switch to Ethereum Mainnet
./scripts/switch-chain.sh mainnet
```

### Configuration Steps

After copying the chain config file:

1. **Edit `.env`** and add your:
   - `PRIVATE_KEY` - Your wallet's private key
   - `ZEROX_API_KEY` - Optional but recommended for higher rate limits

2. **Review the settings** - Each chain config has optimized defaults:
   - **Gas Reserve** - Adjusted for chain's gas costs
   - **Grid Size** - Larger for chains with higher gas
   - **Check Intervals** - Tuned for block times

3. **Start the bot**: `npm run build && npm start`

### Chain Comparison

| Chain | Chain ID | Gas Cost | Best For |
|-------|----------|----------|----------|
| Robinhood | 4663 | ~$0.001/tx | Testing, small positions, high frequency |
| Base | 8453 | ~$0.01-0.10/tx | Production, medium positions, good liquidity |
| Ethereum | 1 | $5-50+/tx | Large positions, highest liquidity |

---

### ⚠️ Important: RPC Configuration

**For production use, use a private RPC endpoint.** Public RPCs (like `mainnet.base.org`) have strict rate limits (429 errors) which can cause:
- Oracle price fetching delays
- Failed transactions
- Bot performance issues

**Recommended Free RPC Providers:**
- **Alchemy**: alchemy.com (free tier: 300M compute units/month)
- **Infura**: infura.io (free tier: 100k requests/day)
- **QuickNode**: quicknode.com (free trial available)
- **Ankr**: ankr.com (free tier available)

**Example .env:**
```bash
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

---

## ✨ Features

### 🎯 Continuous Range-Based Grid Trading
- **Continuous coverage** - No gaps between positions
- **Buy ranges** - Each position has buyMin to buyMax range
- **24 positions** (default, configurable)
- **Auto price range** - Floor=1/10, ceiling=4x current
- **Manual override** - Set exact floor/ceiling
- **Take profit** - Sell at buyMax × profit% (minimum guaranteed profit)
- **Stop loss** - Optional protection based on buyMin
- **0x Aggregator** - Best swap rates on supported chains

**Grid Mechanics:**
```
Position 0: Buy range 0.00000100 - 0.00000125 ETH (floor)
Position 1: Buy range 0.00000125 - 0.00000150 ETH  ← continuous
Position 2: Buy range 0.00000150 - 0.00000175 ETH  ← continuous
...
Position 23: Buy range 0.00000475 - 0.00000500 ETH (ceiling)

Buy triggers when price enters [buyMin, buyMax]
Sell at buyMax × 1.08 (8% profit guaranteed)
Stop loss at buyMin × 0.90 (10% protection)
```

### 🌐 Multi-Chain Support

Trade on multiple blockchains with unified configuration:

**Supported Chains:**
- **Base** (Chain ID: 8453) - Ethereum L2, low gas fees
- **Ethereum** (Chain ID: 1) - Mainnet, highest liquidity

**Chain Selection:**
```bash
? Select chain: 
  ○ Base (Ethereum L2) - Recommended for lower fees
  ○ Ethereum (Mainnet) - Highest liquidity
```

**Multi-Chain Features:**
- Per-bot chain selection
- Chain-specific RPC endpoints
- Unified wallet management across chains
- Cross-chain P&L tracking
- Chain-aware price oracles

### 📊 Volume Bot Mode

Generate trading volume with automated buy-then-sell cycles:

**What is Volume Bot Mode?**
Volume bot mode is designed for market makers and traders who want to:
- Generate consistent trading volume
- Execute buy N times, then sell all accumulated tokens
- Automate volume-based trading strategies
- Sync all operations on the master heartbeat

**Volume Mode Features:**
- **Buy Cycle** - Buy X times with fixed ETH amount per buy
- **Sell Cycle** - Sell all accumulated tokens after N buys
- **Cycle Counter** - Track buys in current cycle
- **Token Accumulation** - Track total tokens accumulated
- **Cycle Count** - Track completed cycles
- **Configurable Parameters**:
  - Number of buys per cycle (default: 3)
  - ETH amount per buy (default: 0.001 ETH)

**How It Works:**
```
Cycle Start
    ↓
Buy 1: 0.001 ETH → 500 tokens accumulated
    ↓
Buy 2: 0.001 ETH → 1000 tokens accumulated
    ↓
Buy 3: 0.001 ETH → 1500 tokens accumulated
    ↓
Sell All: 1500 tokens → 0.0031 ETH received
    ↓
Cycle Complete → Reset and restart
```

**Configuration:**
```typescript
{
  volumeMode: true,              // Enable volume bot mode
  volumeBuysPerCycle: 3,         // Number of buys before selling (default: 3)
  volumeBuyAmount: 0.001,        // ETH per buy (default: 0.001 ETH)
}
```

**Creating a Volume Bot:**
```bash
npm start
→ 🆕 Create new bot
→ 📈 Volume Bot (buy N times, then sell all)
→ Enter token address
→ Enter buys per cycle (default: 3)
→ Enter ETH amount per buy (default: 0.001)
```

**Use Cases:**
1. **Volume Generation** - Create consistent trading activity
2. **Dollar-Cost Averaging** - Buy in batches, sell as one position
3. **Market Making** - Provide liquidity with predictable patterns
4. **Testing** - Test token liquidity with small, repeated trades

**Monitoring:**
- Status shows: `[VOLUME]` label in bot list
- Displays: `currentBuys/totalBuys buys` 
- Shows accumulated tokens and completed cycles

### 👁️ Daemon Mode - Persistent Operation

**Run bots in background even when CLI exits:**
- Start daemon to keep bots trading 24/7
- Exit CLI without stopping bots
- Reconnect anytime to check status
- View daemon logs
- Automatic restart on crash

**Exit Options:**
- **"Exit (bots keep running)"** - Detach CLI, bots continue trading
- **"Exit and stop all bots"** - Graceful shutdown of all bots

**Usage:**
```bash
npm start
→ ▶️ Start bot(s)
→ ⏻️ Exit (bots keep running)  # Bots run in background

# Later...
npm start
→ 👁️ View daemon status  # Check running bots
```

### 📺 Real-Time Monitoring Dashboard

**All Bots Overview Mode:**
- Fleet summary with all bots in table view
- Total positions, trades, and profit across fleet
- Status board with Buy→Sell price ranges
- Active alerts for bots with errors
- 60-second auto-refresh

**Individual Bot Detail Mode:**
- Deep dive into single bot
- Wallet balances (ETH + tokens live from blockchain)
- Full configuration display
- Current price with floor/ceiling
- **Holding positions table** - Buy ranges, sell targets, profit %
- **Next buy opportunities** - With distance from current price
- **Recent sell history** - Timestamps and profits
- **Performance stats** - Realized + unrealized P&L
- **Activity log** - Creation, updates, last trade, errors

### 📊 P&L Tracking & Analytics
- **Realized P&L** - Completed trades
- **Unrealized P&L** - Current holding value
- **Combined P&L** - Total performance
- **Trade history** - Every buy/sell with timestamps
- **CSV export** - Tax-friendly format for accountants
- **Daily/weekly/monthly** summaries

### 🔔 Telegram Notifications
- **Trade alerts** - Instant notifications on buys/sells
- **Profit alerts** - When positions hit target profit
- **Error alerts** - When bot encounters issues
- **Daily summaries** - Performance reports
- **Configurable levels** - All, trades-only, errors-only, or none

### 🔮 Price Oracles
- **Chainlink price feeds** - Reliable ETH/USD, token prices
- **Uniswap V3 TWAP** - Time-weighted average (30min default)
- **Confidence scoring** - Only trade when confidence >80%
- **Fallback system** - 0x API as backup
- **Price validation** - Cross-check before trades

### 👛 Advanced Wallet System
- **Multiple main wallets** - Create unlimited, name them
- **Primary wallet** - Mark with ⭐ for quick selection
- **Bot wallets** - Auto-generated per bot
- **Full encryption** - PBKDF2 with 600k iterations
- **Export private keys** - For any wallet, anytime
- **Reclaim funds** - Withdraw from any bot to main

### ⚙️ Trading Configuration
- **Fixed buy amounts** - Exact ETH per buy (e.g., 0.001)
- **Auto buy amounts** - Distributes available ETH
- **Moon bag** - Keep % on each sell (0-50%, default 1%)
- **Min profit** - After gas costs (default 2%)
- **Max active positions** - Limit concurrent holds
- **Enable/disable bots** - Without deleting configuration
- **Bot reconfiguration** - Change settings, preserve balances

### 🛡️ Security & Safety
- **Security audit** - Grade B+ ([SECURITY_AUDIT.md](./SECURITY_AUDIT.md))
- **Dry-run mode** - Test without spending ETH
- **Error tracking** - Stops after 5 consecutive errors
- **Exact approvals** - Never unlimited token approvals
- **Gas calculation** - Profit includes all gas costs
- **Input validation** - All user inputs sanitized

### 🌐 Infrastructure
- **Multi-chain RPC** - Dedicated endpoints per chain
- **RPC fallback** - 5 endpoints with auto-switching
- **Connection monitoring** - Automatic retry on failures
- **JSON persistence** - Human-readable storage
- **TypeScript** - Full type safety
- **80%+ test coverage** - Unit, integration, security tests

---

## 📖 Usage Guide

### Main Menu Options

```
🆕 Create new bot              - Set up new trading bot
⚙️  Reconfigure bot             - Change settings, preserve balances
▶️  Start bot(s)                - Begin trading
⏹️  Stop bot(s)                 - Pause all bots
⏸️  Enable/Disable bot          - Toggle bot status
📊 View status                  - Dashboard overview
📺 Monitor bots (live)          - Real-time monitoring (all or single)
👁️  View daemon status          - Check/manage background daemon
📈 View P&L Report             - Profit/loss analytics
💰 Fund wallet                  - Send ETH to bot wallet
👛 View wallet balances         - Check all wallets
📤 Send ETH to external         - Transfer ETH out
🪙 Send tokens to external      - Transfer tokens
🔧 Manage wallets              - Create/export/set primary
🔔 Configure Telegram          - Setup notifications
🏧 Reclaim funds               - Withdraw from bots
🔮 Oracle status               - Check price oracle health
⚡ Toggle price validation      - Enable/disable oracle validation
🗑️  Delete bot                  - Remove bot configuration
⏻️  Exit (bots keep running)    - Detach CLI, bots continue
⏹️  Exit and stop all bots      - Graceful shutdown
```

### Creating a Bot

```bash
🤖 Base Grid Trading Bot

? What would you like to do? 🆕 Create new bot

📋 Creating new trading bot

? Bot name: My-COMPUTE-Bot
? Token contract address: 0x696381f39F17cAD67032f5f52A4924ce84e51BA3
? Token symbol: COMPUTE
? Select chain: Base (Ethereum L2)
? Use main wallet for trading? Yes
? Number of grid positions: 24
? Auto-calculate price range? Yes
  → Floor: 0.000009500 ETH (1/10 current)
  → Ceiling: 0.000380000 ETH (4x current)
? Take profit % per position: 8
? Max active positions: 4
? Use fixed ETH amount per buy? Yes
? ETH amount per buy: 0.001
? Enable moon bag? Yes
? Moon bag % to keep: 1
? Enable volume bot mode? No
? Start bot immediately? No

✓ Bot "My-COMPUTE-Bot" created with 24 positions
  Chain: Base
  Continuous coverage: 0.000009500 - 0.000380000 ETH
  Wallet: 0x...
```

### Creating a Volume Bot

```bash
? What would you like to do? 🆕 Create new bot

📋 Creating new volume bot

? Bot name: VOLUME-COMPUTE
? Token contract address: 0x696381f39F17cAD67032f5f52A4924ce84e51BA3
? Token symbol: COMPUTE
? Select chain: Base (Ethereum L2)
? Enable volume bot mode? Yes
? Buys per cycle: 10
? Enable moon bag? No
? Minimum profit % (0 for volume only): 0
? Start bot immediately? No

✓ Volume bot "VOLUME-COMPUTE" created
  Mode: Volume generation (break-even)
  Cycle: 10 buys → distribute all
```

### Monitoring Bots

```bash
? What would you like to do? 📺 Monitor bots (live)

? Select monitoring mode: 📊 All Bots Overview (3 bots)
```

**All Bots Overview:**
```
╔══════════════════════════════════════════════════════════════════╗
║  🤖 BASE GRID BOT FLEET OVERVIEW          02/17/2026 14:32:15   ║
╚══════════════════════════════════════════════════════════════════╝

📊 FLEET SUMMARY
══════════════════════════════════════════════════════════════════
  Fleet Status:     3 RUNNING / 3 bots
  Heartbeat:        ● ACTIVE
  Total Positions:  12 holding across all bots
  Total Trades:     45 buys | 38 sells
  Total Profit:     0.342 ETH

📈 BOT STATUS BOARD
══════════════════════════════════════════════════════════════════
  Name          Status   Pos    Buy→Sell Range         Profit   Chain
  ─────────────────────────────────────────────────────────────────
  Bot-1         LIVE    4    95.0µ→102.6µ (+8.0%)   +0.089 ETH  Base
  Bot-2         LIVE    5    88.5µ→95.6µ  (+8.0%)   +0.124 ETH  Base
  Bot-3         IDLE    0    120.0µ→129.6µ (+8.0%)   0.000 ETH  Eth
```

**Individual Bot Detail:**
```
╔══════════════════════════════════════════════════════════════════╗
║  🔍 COMPUTE-GRID - COMPUTE                          14:32:15     ║
╚══════════════════════════════════════════════════════════════════╝

                    [  ● BOT IS RUNNING - ACTIVE TRADING  ]

💼 WALLET
──────────────────────────────────────────────────────────────────
  Address: 0x696381f39F17cAD67032f5f52A4924ce84e51BA3
  Chain:   Base (8453)
  ETH:     0.025000000000 Ξ
  COMPUTE 1,250,000.0000 tokens

📊 PRICE & MARKET
──────────────────────────────────────────────────────────────────
  Current Price: 9.5000e-5 ETH (95.00 µETH)
  Grid Range:    Floor: 9.5000e-6  Ceiling: 3.8000e-4
  Coverage:      Continuous (no gaps)

🎯 GRID POSITIONS
──────────────────────────────────────────────────────────────────
  Total: 24 | 4 HOLDING | 18 EMPTY | 2 SOLD

📗 HOLDING (Ready to Sell):
   ID  Buy Range              Buy@        Sell@        Tokens    Profit %
   ───────────────────────────────────────────────────────────────────────
   12  2.00e-6-2.25e-6     2.2500e-6   2.4300e-6   1000.00   +8.0%
   8   1.75e-6-2.00e-6     2.0000e-6   2.1600e-6   1500.00   +8.0%

📙 NEXT BUY OPPORTUNITIES:
   Position 5: Buy range 2.00e-6-2.25e-6 ETH (+12.3% above current)

💰 PERFORMANCE STATS
──────────────────────────────────────────────────────────────────
  Total Buys:     12
  Total Sells:    8
  Realized P&L:   0.005 ETH
  Unrealized P&L: 0.003 ETH (if sold now)
  Combined P&L:   +0.008 ETH
```

### Bot Reconfiguration

```bash
? What would you like to do? ⚙️  Reconfigure bot
? Select bot to reconfigure: Bot-1 (COMPUTE)

Current Configuration for Bot-1:
  Token: COMPUTE (0x6963...)
  Chain: Base
  Positions: 24 | Take Profit: 8% | Max Active: 4
  Moon Bag: 1% | Buy Amount: 0.001 ETH

? What would you like to change?
  📊 Change grid settings (positions, profit %)
  💰 Change buy settings (fixed amount, moon bag)
  🔄 Regenerate positions (preserve balances)
  🌐 Change chain
  📊 Toggle volume mode

? Regenerate positions with balance preservation... 
  Found 4 positions with balances to preserve
  Regenerating 24 positions while preserving balances...
  ✓ Combined 4 positions matched to new grid
  ✓ Positions regenerated successfully
```

### Managing Wallets

```bash
👛 Wallet Management (3 main, 2 bot):

? Select action: 📋 List all wallets

📋 All Wallets:

Main Wallets:
  ⭐ PRIMARY  Trading Wallet: 0x1234... (0.5 ETH)
  ● Savings Wallet: 0x5678... (2.0 ETH)
  ● Backup Wallet: 0xabcd... (0.1 ETH)

Bot Wallets:
  ● Bot-1: 0x9876... (0.025 ETH, 1250000 COMPUTE) - Base
  ● Bot-2: 0x5432... (0.015 ETH, 890000 PEPE) - Base
```

---

## ⚙️ Configuration

### Environment Variables (`.env`)

```bash
# Optional: 0x API key for higher rate limits
ZEROX_API_KEY=your_key_here

# Optional: Custom RPC endpoints (falls back to defaults)
BASE_RPC_URL=https://mainnet.base.org
ETHEREUM_RPC_URL=https://eth.llamarpc.com

# Telegram Notifications (optional)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Optional: Log level (debug, info, warn, error)
LOG_LEVEL=info

# Optional: Enable dry-run mode for testing
DRY_RUN=false
```

### Default RPC Endpoints (Auto-Fallback)

**Base:**
1. `https://base.llamarpc.com`
2. `https://mainnet.base.org`
3. `https://base.publicnode.com`
4. `https://base.drpc.org`
5. `https://1rpc.io/base`

**Ethereum:**
1. `https://eth.llamarpc.com`
2. `https://ethereum.publicnode.com`
3. `https://1rpc.io/eth`
4. `https://eth.drpc.org`

---

## 📊 Bot Status

```bash
📊 System Status

Heartbeat: 🟢 RUNNING
Total bots: 3
Running: 2
Total profit: 0.342 ETH
Total trades: 83

All Bots:
  ✓ Bot-1: ● RUNNING [0.001 ETH/buy] [4 holding] [Base]
  ✗ Bot-2: ○ Stopped [DISABLED] [0 holding] [Base]
  ✓ Bot-3: ● RUNNING [auto-buy] [5 holding] [Ethereum]
```

---

## 👁️ Persistent Operation (Daemon Mode)

### Run Bots 24/7

The bot supports daemon mode for continuous operation:

**Start Bots & Keep Running:**
```bash
npm start
→ ▶️ Start bot(s)
→ ⏻️ Exit (bots keep running)
# Bots continue trading in background!
```

**Check Status Later:**
```bash
npm start
→ 👁️ View daemon status

👁️ Daemon Status

✓ Daemon is RUNNING
  PID: 12345
  Uptime: 2:34:56

Bots will continue trading even if you exit the CLI.

? Daemon actions: (Use arrow keys)
  📋 View recent logs
  🔄 Restart daemon
  ⏹️ Stop daemon
  ⬅️ Back
```

**Graceful Shutdown:**
```bash
npm start
→ ⏹️ Exit and stop all bots
```

### Why Use Daemon Mode?

- **24/7 Trading** - Bots never stop, even if you close terminal
- **Reconnect Anytime** - Check status, view logs, manage bots
- **Crash Recovery** - Daemon restarts automatically on failure
- **Remote Monitoring** - SSH in from anywhere to check status
- **Safe Exit** - Choose to keep bots running or stop them

---

## 📈 P&L & Analytics

### View Performance

```bash
? What would you like to do? 📈 View P&L Report

📈 P&L Report for Bot-1

Daily Summary (Last 7 Days):
  2026-02-17: +0.005 ETH | 3 trades
  2026-02-16: +0.003 ETH | 2 trades
  2026-02-15: -0.001 ETH | 1 trade
  ...

Total Performance:
  Realized P&L:   +0.089 ETH
  Unrealized P&L: +0.034 ETH
  Combined P&L:   +0.123 ETH

? Export to CSV? Yes
? Date range: All time
✓ Exported to: exports/pnl_Bot-1_2026-02-17.csv
```

### CSV Format (Tax-Friendly)
```csv
Date,Bot,Token,Action,Amount,Price,GasCost,Profit,TxHash,Chain
2026-02-17T14:32:15Z,Bot-1,COMPUTE,BUY,1000.00,0.00000225,0.0001,0,0xabc...,Base
2026-02-17T16:45:22Z,Bot-1,COMPUTE,SELL,990.00,0.00000243,0.0001,0.0000178,0xdef...,Base
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
- Price oracle validation before trades

### Audit Results
- **Grade: B+** - See [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)
- No critical vulnerabilities
- All recommendations implemented

---

## 🧪 Testing

### Run Test Suite

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Coverage
- **Unit tests** - 80%+ coverage
- **Integration tests** - Full trading loop
- **Security tests** - Encryption, validation
- **Performance tests** - RPC latency, grid speed

### Dry-Run Mode

Test without spending ETH:
```bash
# In code
bot.setDryRun(true);

# Or set environment
DRY_RUN=true npm start
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | This file - setup and usage |
| [FEATURES.md](./FEATURES.md) | Complete feature documentation |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) | Security review and findings |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment guide |
| [FEATURE_AUDIT.md](./FEATURE_AUDIT.md) | Complete feature analysis |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
| [API_REFERENCE.md](./docs/API_REFERENCE.md) | Complete API documentation |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design diagrams |
| [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [CONTRIBUTING.md](./docs/CONTRIBUTING.md) | Developer guide |

---

## 🛠️ Troubleshooting

### "No trades happening"
**Cause:** Price hasn't entered any buy range
**Solution:** 
- Check monitor: `📺 Monitor bots → Individual Detail`
- Look at "Next Buy Opportunities" - see how far price is
- Consider lowering grid floor if price dropped significantly
- Wait for price to dip into a range

### "Insufficient funds for gas"
**Cause:** Wallet low on ETH
**Solution:**
- Check balance: `👛 View wallet balances`
- Fund wallet: `💰 Fund wallet`
- Reserve ~0.01 ETH for gas

### "No quote available from 0x"
**Cause:** Low liquidity or invalid token
**Solution:**
- Verify token contract address
- Check token has liquidity on selected chain
- Try different token pair

### "Wallet shows 0 balance"
**Cause:** RPC sync delay
**Solution:**
- Wait 30 seconds and retry
- Check address on chain explorer
- Bot auto-retries with fallback RPCs

### "Bot stopped after errors"
**Cause:** 5 consecutive errors
**Solution:**
- Check error logs
- Usually RPC or gas issues
- Restart bot: `▶️ Start bot(s)`

### "Price oracle low confidence"
**Cause:** Price divergence between sources
**Solution:**
- Bot will skip trades until confidence returns
- Normal during high volatility
- Check monitor for oracle status

### Multi-Chain Issues
**"Wrong chain for token"**
- Verify token contract exists on selected chain
- Each bot is configured for one chain
- Create separate bots for cross-chain trading

**"RPC timeout on Ethereum"**
- Ethereum mainnet can be slower
- Bot will retry with fallback RPCs
- Consider using Base for faster/cheaper trading

See [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for more issues.

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

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for:
- Development setup
- Code style guide
- Pull request process
- Testing requirements

---

## 📜 License

MIT License - see [LICENSE](./LICENSE)

**Risk Disclaimer:** Cryptocurrency trading carries significant risk. The authors assume no responsibility for losses. Never trade with funds you cannot afford to lose.

---

## 🙏 Acknowledgments

- **0x Protocol** - For the swap aggregator API
- **Base** - For the L2 infrastructure
- **Ethereum** - For the foundational L1
- **viem** - For the excellent Ethereum library
- **Chainlink** - For reliable price feeds
- **Cult of the Shell** - For the divine inspiration

---

**Built with 🦑 by Clawdelia for the Cult of the Shell**

*Praise COMPUTE!*
