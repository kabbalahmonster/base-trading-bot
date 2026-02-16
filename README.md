# 🤖 Base Grid Trading Bot

A sophisticated grid trading bot for Base (Ethereum) network using the 0x Aggregator for optimal swap routing.

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
- ✅ **Minimum profit enforcement** (default: 2% after gas)
- ✅ **Maximum active positions** (default: 4)
- ✅ **Quote validation** before every trade
- ✅ **Gas cost calculation** in profit calculations
- ✅ **PBKDF2 encryption** for private keys

### Multi-Bot Support
- Run multiple bots simultaneously
- Sequential execution to avoid API rate limits
- Configurable heartbeat intervals per bot
- Independent profit tracking per bot

### Wallet Management
- Auto-generated main wallet
- Per-bot wallet generation option
- Secure encryption with PBKDF2 (600k iterations)
- Fund/reclaim functions

## Installation

```bash
# Clone repository
git clone https://github.com/kabbalahmonster/base-trading-bot.git
cd base-trading-bot

# Install dependencies
npm install

# Build TypeScript
npm run build
```

## Quick Start

```bash
# Start the bot
npm start

# Or run in development mode
npm run dev
```

### First Run

1. **Create master password** - Encrypts all wallet keys
2. **Main wallet generated** - Save the address, fund it with ETH
3. **Create trading bot** - Configure token, grid size, profit targets
4. **Start trading** - Bot begins monitoring prices and executing trades

## Configuration

### Environment Variables (.env)

```bash
# Optional: 0x API key for higher rate limits
ZEROX_API_KEY=your_api_key_here

# Optional: Custom RPC endpoint
BASE_RPC_URL=https://base.llamarpc.com

# Optional: Log level
LOG_LEVEL=info
```

### Grid Configuration

During bot creation, you'll configure:

| Setting | Default | Description |
|---------|---------|-------------|
| `numPositions` | 24 | Number of grid levels |
| `floorPrice` | current/10 | Lowest buy price |
| `ceilingPrice` | current×4 | Highest buy price |
| `takeProfitPercent` | 8% | Profit target per position |
| `stopLossPercent` | 10% | Stop loss (if enabled) |
| `maxActivePositions` | 4 | Max simultaneous holds |
| `moonBagPercent` | 1% | Amount to keep on sell |
| `minProfitPercent` | 2% | Minimum profit after gas |

## How It Works

### Grid Generation

1. Calculate price range (floor to ceiling)
2. Create equal-spaced buy points
3. Calculate sell price (buy + take profit %)
4. Assign stop loss (if enabled)

### Trading Loop

Every heartbeat (default: 1 second):

1. **Update price** from market data
2. **Check buys**: If price at buy level and position empty → buy
3. **Check sells**: If price at sell level and position holding → sell (if profitable)
4. **Execute trades**: Submit via 0x Aggregator
5. **Update state**: Save position data to JSON

### Buy Execution

- Check max active positions not exceeded
- Get 0x quote for ETH→Token swap
- Submit transaction
- Store tokens received and cost basis

### Sell Execution

- Calculate moon bag amount (if enabled)
- Check profitability (price + gas)
- Get 0x quote for Token→ETH swap
- Approve token spending (if needed)
- Submit transaction
- Calculate and record profit

## CLI Commands

```
🤖 Base Grid Trading Bot

? What would you like to do?
  🆕 Create new bot
  ▶️  Start bot(s)
  ⏹️  Stop bot(s)
  📊 View status
  💰 Fund wallet
  🏧 Reclaim funds
  🗑️  Delete bot
  ❌ Exit
```

## Architecture

```
src/
├── types/           # TypeScript interfaces
├── wallet/          # Wallet management & encryption
├── api/             # 0x API integration
├── grid/            # Grid calculation logic
├── storage/         # JSON persistence
├── bot/             # Trading bot & heartbeat manager
└── index.ts         # CLI entry point
```

## Security

- **Private keys** encrypted with PBKDF2 (600k iterations)
- **Salt** randomly generated per wallet
- **AES-256** encryption for key storage
- **No keys in logs** or error messages
- **Memory safe** - keys cleared after use

## Gas Estimates

Per position lifecycle:
- Buy: ~180,000 gas
- Approve (first sell): ~50,000 gas
- Sell: ~180,000 gas
- **Total**: ~410,000 gas ≈ $0.10-0.30 USD

## Roadmap

### Phase 1 (Current)
- ✅ Core grid trading
- ✅ 0x Aggregator integration
- ✅ Multi-bot support
- ✅ CLI interface

### Phase 2 (Future)
- 🔄 Web dashboard
- 🔄 Telegram notifications
- 🔄 Advanced grid strategies (geometric)
- 🔄 DCA mode

### Phase 3 (Future)
- 🔄 Machine learning price prediction
- 🔄 Dynamic grid adjustment
- 🔄 Cross-chain support

## Troubleshooting

### "Insufficient ETH for gas"
- Fund main wallet with more ETH
- Reduce number of active positions
- Lower trade frequency

### "No route found" (0x API)
- Token may have low liquidity
- Try different token
- Check token contract address

### "Nonce too low"
- Wait a few seconds and retry
- RPC node may be lagging
- Check transaction status on BaseScan

## License

MIT License - See LICENSE file

## Disclaimer

⚠️ **Trading cryptocurrency involves risk. Only trade with funds you can afford to lose.**

- Past performance does not guarantee future results
- Smart contract risks exist
- Gas costs can erode profits
- Always test with small amounts first

## Support

For issues and feature requests, please open a GitHub issue.
