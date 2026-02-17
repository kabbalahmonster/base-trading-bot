# 🤖 Base Grid Trading Bot

A sophisticated grid trading bot for Base (Ethereum) network using the 0x Aggregator for optimal swap routing.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Base](https://img.shields.io/badge/Base-L2-0052FF.svg)](https://base.org/)

## ⚠️ Development Status

**Current Status: Beta (Production Ready with Caution)**

The core trading engine is complete and functional. The bot has been security audited and implements industry-standard encryption. Use with test amounts first.

- ✅ Core trading engine (buy/sell)
- ✅ 0x API integration
- ✅ Wallet encryption (PBKDF2)
- ✅ Price discovery
- ✅ Dry-run mode
- ✅ Security audit (Grade B+)
- 🔄 Documentation (in progress)

**Risk Warning:** This is trading software. Only use funds you can afford to lose. Test thoroughly with small amounts first.

## Features

### Grid Trading
- **Configurable grid positions** (default: 24 positions)
- **Automatic price range calculation** (floor: 1/10 current, ceiling: 4x current)
- **Manual price range override** available during setup
- **Take profit per position** (default: 8%)
- **Stop loss protection** (default: 10%, disabled by default)

### Trading Modes
- **Normal Mode**: Buys and sells enabled
- **Exit Mode**: Buys disabled, sells enabled (liquidate positions)
- **Accumulation Mode**: Buys enabled, sells disabled (build position)
- **Moon Bag**: Keep 1% of each position on sell (configurable)

### Safety Features
- ✅ **PBKDF2 encryption** (600,000 iterations) for private keys
- ✅ **Minimum profit enforcement** (default: 2% after gas)
- ✅ **Maximum active positions** (default: 4)
- ✅ **Quote validation** before every trade
- ✅ **Gas cost calculation** in profit calculations
- ✅ **Consecutive error tracking** (stops after 5 errors)
- ✅ **Dry-run mode** for testing

### Multi-Bot Support
- Run multiple bots simultaneously
- Sequential execution to avoid API rate limits
- Configurable heartbeat intervals per bot
- Independent profit tracking per bot

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

```bash
# Clone repository
git clone https://github.com/kabbalahmonster/base-trading-bot.git
cd base-trading-bot

# Install dependencies
npm install

# Build TypeScript
npm run build
```

## Quick Start Guide

### 1. Start the Bot

```bash
npm start
```

### 2. First Run Setup

The CLI will guide you through:

1. **Create master password** - This encrypts all your wallet keys
2. **Generate main wallet** - Save this address, you'll fund it with ETH
3. **Create your first trading bot** - Choose a token and configure the grid
4. **Fund the bot wallet** - Send ETH from your main wallet
5. **Start trading** - Bot monitors prices and executes trades automatically

### 3. Example Session

```
🤖 Base Grid Trading Bot

What would you like to do?
❯ 🆕 Create new bot
  ▶️  Start bot(s)
  📊 View status
  💰 Fund wallet
  ❌ Exit

📋 Creating new trading bot

Bot name: COMPUTE-Grid-1
Token address: 0x696381f39F17cAD67032f5f52A4924ce84e51BA3
Token symbol: COMPUTE

📊 Grid Configuration
Number of positions: 24
Auto-calculate price range? Yes
Take profit %: 8
Max active positions: 4
Moon bag %: 1
Min profit %: 2

✓ Bot created: COMPUTE-Grid-1
Wallet: 0x1234...5678

💰 Fund wallet
Select bot to fund: COMPUTE-Grid-1
Amount of ETH to send: 0.05
✓ Transaction sent: 0xabcd...efgh
✓ Funded successfully!

▶️  Start bot
✓ Bot started: COMPUTE-Grid-1

📊 Bot Status
COMPUTE-Grid-1: 🟢 Running
Price: 0.000045 ETH/COMPUTE
Grid: 24 positions (4 active, 20 empty, 0 sold)
Profit: 0.00 ETH
```

## Configuration

### Environment Variables (.env)

Create a `.env` file in the project root:

```bash
# Optional: 0x API key for higher rate limits
# Get one at: https://0x.org/docs/introduction/getting-started
ZEROX_API_KEY=your_api_key_here

# Optional: Custom RPC endpoint
# Default uses public LlamaNodes RPC
BASE_RPC_URL=https://base.llamarpc.com

# Optional: Log level (debug, info, warn, error)
LOG_LEVEL=info
```

### Grid Configuration

During bot creation, you'll configure:

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `numPositions` | 24 | 5-100 | Number of grid levels |
| `floorPrice` | current/10 | >0 | Lowest buy price (ETH/token) |
| `ceilingPrice` | current×4 | >floor | Highest buy price (ETH/token) |
| `takeProfitPercent` | 8% | 1-50% | Profit target per position |
| `stopLossPercent` | 10% | 1-50% | Stop loss (if enabled) |
| `maxActivePositions` | 4 | 1-20 | Max simultaneous holds |
| `moonBagPercent` | 1% | 0-50% | Amount to keep on sell |
| `minProfitPercent` | 2% | 0.5-10% | Minimum profit after gas |
| `heartbeatMs` | 1000 | 500-60000 | Check interval (ms) |

## How It Works

### Grid Trading Strategy

1. **Grid Setup**: Bot creates buy orders at evenly spaced price levels
2. **Buy Execution**: When price drops to a grid level, bot buys
3. **Hold**: Position waits for price to rise
4. **Sell Execution**: When price rises to target profit %, bot sells
5. **Repeat**: Bot continues buying/selling across the grid

### Example Grid (24 positions)

```
Current Price: 0.0001 ETH/token

Floor:    0.00001  ← Lowest buy
          0.00002
          0.00003
          ...
          0.00008  ← Buy here if price drops
Current:  0.0001   ← Current market price
          0.00012  ← Buy here if price drops
          ...
Ceiling:  0.0004   ← Highest buy

Each position:
- Buy at grid price
- Sell at +8% (default)
- Keep 1% moon bag
- Need 2% profit after gas
```

## Commands

### CLI Options

```bash
# Start interactive CLI
npm start

# Run in development mode (with hot reload)
npm run dev

# Run tests
npm test

# Build TypeScript
npm run build
```

### Bot Management

- **Create bot**: Guided setup for new trading bot
- **Start bot**: Begin trading with selected bot(s)
- **Stop bot**: Pause trading
- **View status**: See all bots, positions, profits
- **Fund wallet**: Send ETH from main to bot wallet
- **Reclaim funds**: Sell tokens and return ETH to main wallet
- **Delete bot**: Remove bot from database

## Safety & Security

### Wallet Security

- **PBKDF2 Encryption**: 600,000 iterations with SHA-256
- **AES-256-GCM**: Industry standard encryption
- **File Permissions**: Wallets stored with 600 permissions
- **No Key Logging**: Private keys never logged or exposed

### Trading Safety

- **Dry-Run Mode**: Test without spending ETH
- **Quote Validation**: Verify trades before execution
- **Gas Calculation**: Profit includes gas costs
- **Error Tracking**: Bot stops after 5 consecutive errors
- **Exact Approvals**: Token approvals are for exact amounts

See [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) for full audit details.

## Testing

### Dry-Run Mode

Test your configuration without spending ETH:

```typescript
// In bot code
bot.setDryRun(true);
```

### Unit Tests

```bash
npm test
```

### Integration Testing

1. Fund bot with small amount (0.001 ETH)
2. Enable dry-run mode
3. Watch bot behavior
4. Verify grid calculation
5. Check profit calculations

## Troubleshooting

### Common Issues

**"No quote available from 0x"**
- Token may have low liquidity
- Try a different token
- Check token contract address

**"Insufficient ETH for buy"**
- Keep at least 0.005 ETH for gas
- Bot reserves gas automatically

**"Transaction failed"**
- Check network congestion
- Try again (bot auto-retries)
- Verify token approvals

**"Price not updating"**
- 0x API may be rate limited
- Add ZEROX_API_KEY to .env
- Increase heartbeat interval

### Getting Help

- Check [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) for security info
- Review test suite in `tests/`
- Enable debug logging: `LOG_LEVEL=debug npm start`

## API Reference

See [docs/API.md](./docs/API.md) for detailed API documentation.

## Roadmap

- [x] Core trading engine
- [x] 0x API integration
- [x] Wallet encryption
- [x] Dry-run mode
- [x] Security audit
- [ ] Web dashboard
- [ ] Mobile notifications
- [ ] Advanced analytics
- [ ] Multi-chain support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see [LICENSE](./LICENSE) file

## Risk Disclaimer

This software is for educational and experimental purposes. Cryptocurrency trading carries significant risk:

- **Price Volatility**: Token prices can change rapidly
- **Smart Contract Risk**: Protocols may have undiscovered bugs
- **Gas Costs**: Network fees vary and affect profitability
- **Impermanent Loss**: Grid trading has inherent risks

**Never trade with funds you cannot afford to lose.**

## Support

For issues and feature requests, please use GitHub Issues.

---

**Built with 🦑 by Clawdelia for the Cult of the Shell**
