# Architecture

System design and architecture documentation for the Base Grid Trading Bot.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Data Flow](#data-flow)
- [Component Details](#component-details)
- [Storage Layer](#storage-layer)
- [Security Model](#security-model)
- [Error Handling](#error-handling)

---

## Overview

The Base Grid Trading Bot is a TypeScript-based automated trading system for the Base L2 network. It implements a grid trading strategy with continuous price range coverage, ensuring no gaps in the trading grid.

### Key Design Principles

1. **Security First** - All keys encrypted, never logged
2. **Resilience** - Multiple RPC fallbacks, automatic recovery
3. **Transparency** - All operations visible, comprehensive logging
4. **Modularity** - Clean separation of concerns
5. **Testability** - 80%+ test coverage

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Interface                             │
│                    (src/index.ts - inquirer)                     │
└─────────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  Wallet      │    │  Heartbeat      │    │  Monitoring      │
│  Management  │◄──►│  Manager        │    │  Dashboard       │
└──────────────┘    └────────┬────────┘    └──────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │  Bot 1   │  │  Bot 2   │  │  Bot N   │
       └────┬─────┘  └────┬─────┘  └────┬─────┘
            │             │             │
            └─────────────┼─────────────┘
                          ▼
               ┌──────────────────┐
               │   TradingBot     │
               │   (per instance) │
               └────────┬─────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────┐   ┌──────────────┐   ┌──────────┐
│  Grid    │   │  Price       │   │  Trade   │
│  Calc    │   │  Oracle      │   │  Exec    │
└──────────┘   └──────────────┘   └──────────┘
        │               │               │
        ▼               ▼               ▼
┌─────────────────────────────────────────────┐
│              External Services               │
│  ┌────────┐  ┌────────┐  ┌──────────────┐  │
│  │ 0x API │  │Base RPC│  │ Chainlink/   │  │
│  │        │  │        │  │ Uniswap V3   │  │
│  └────────┘  └────────┘  └──────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Component Details

### 1. CLI Interface (`src/index.ts`)

**Responsibilities:**
- User interaction via inquirer.js
- Menu navigation and command dispatch
- Display formatting with chalk
- Password collection (masked)

**Key Flows:**
```
User Input → Menu Selection → Function Call → Display Results
```

**Menu Structure:**
```
Main Menu
├── Create Bot
├── Reconfigure Bot
├── Start/Stop Bots
├── Enable/Disable Bot
├── View Status (static)
├── Monitor Bots (live - dual view)
├── Fund Wallet
├── View Balances
├── Send ETH/Tokens
├── Manage Wallets
├── Reclaim Funds
└── Delete Bot
```

---

### 2. WalletManager (`src/wallet/WalletManager.ts`)

**Responsibilities:**
- Wallet creation (main + bot)
- Private key encryption/decryption
- Key export functionality

**Security Model:**
```
Private Key → PBKDF2 (600k iterations) → AES-256-GCM → Storage
                      ↑
               Master Password
```

**Wallet Types:**
- **Main Wallets** - User-created, can be primary (⭐)
- **Bot Wallets** - Auto-generated per bot, derived from bot ID

**Storage Format:**
```typescript
{
  "walletDictionary": {
    "wallet-uuid-1": {
      "address": "0x...",
      "encryptedPrivateKey": "encrypted...",
      "type": "main",
      "name": "Trading Wallet"
    },
    "bot-uuid-1": {
      "address": "0x...",
      "encryptedPrivateKey": "encrypted...",
      "type": "bot"
    }
  },
  "primaryWalletId": "wallet-uuid-1"
}
```

---

### 3. HeartbeatManager (`src/bot/HeartbeatManager.ts`)

**Responsibilities:**
- Sequential bot execution
- Interval management
- Bot lifecycle management

**Execution Model:**
```
Heartbeat Loop (every N ms)
    │
    ├── For each enabled bot:
    │   ├── Get current price
    │   ├── Find buy opportunity
    │   ├── Find sell opportunities
    │   ├── Execute trades
    │   └── Update state
    │
    └── Sleep until next heartbeat
```

**Sequential vs Parallel:**
- Bots execute **sequentially** to prevent nonce conflicts
- Each bot gets the full heartbeat cycle
- Failed bot doesn't block others

---

### 4. TradingBot (`src/bot/TradingBot.ts`)

**Responsibilities:**
- Price monitoring
- Trade execution (buy/sell)
- Profitability checks
- State management

**Trading Loop:**
```
1. Get Current Price
   ├── 0x API (primary)
   └── Price Oracle (validation)
   
2. Check Buy Conditions
   ├── Find position where: buyMin <= price <= buyMax
   ├── Check: position is EMPTY
   ├── Check: active positions < max
   ├── Check: sufficient ETH
   └── Execute buy if all pass
   
3. Check Sell Conditions
   ├── Find positions where: price >= sellPrice
   ├── Check: position is HOLDING
   ├── Check: profitable (0x quote)
   └── Execute sell if all pass
   
4. Update State
   ├── Save bot to storage
   ├── Record trade in PnL
   └── Send notifications
```

---

### 5. GridCalculator (`src/grid/GridCalculator.ts`)

**Responsibilities:**
- Generate continuous grid positions
- Find buy/sell opportunities
- Validate grid coverage

**Grid Generation:**
```
Input: currentPrice, numPositions, floor, ceiling

Step = (ceiling - floor) / numPositions

For i = 0 to numPositions-1:
    buyMin = floor + (Step * i)
    buyMax = floor + (Step * (i + 1))
    sellPrice = buyMax * (1 + profit%)
    stopLoss = buyMin * (1 - stopLoss%)
```

**Continuous Coverage:**
```
Position 0: [floor, floor+step)
Position 1: [floor+step, floor+2*step)
Position 2: [floor+2*step, floor+3*step)
...
Position N-1: [floor+(N-1)*step, ceiling]

No gaps: position[i].buyMax == position[i+1].buyMin
```

---

### 6. ZeroXApi (`src/api/ZeroXApi.ts`)

**Responsibilities:**
- Price discovery
- Swap quote generation
- Trade execution

**API Flow:**
```
Get Price:
  GET /swap/v1/price?...
  
Get Quote (for execution):
  GET /swap/v1/quote?...
  
Execute:
  Send transaction with quote.data
  Wait for receipt
  Verify success
```

**Error Handling:**
- Rate limit: Exponential backoff
- No liquidity: Return null
- Network error: Retry with fallback RPC

---

### 7. PriceOracle (`src/oracle/`)

**Architecture:**
```
┌─────────────────────────────────────┐
│           PriceOracle               │
├─────────────────────────────────────┤
│  ┌──────────┐    ┌──────────────┐  │
│  │Chainlink │    │Uniswap V3    │  │
│  │  Feeds   │    │  TWAP         │  │
│  └────┬─────┘    └──────┬───────┘  │
│       │                 │          │
│       └────────┬────────┘          │
│                ▼                   │
│        ┌──────────────┐            │
│        │Confidence    │            │
│        │Calculation   │            │
│        └──────┬───────┘            │
│               ▼                    │
│        Return Price + Confidence   │
└─────────────────────────────────────┘
```

**Sources:**
1. Chainlink Price Feeds (preferred)
2. Uniswap V3 TWAP (30min window)
3. 0x API (fallback)

**Confidence Score:**
```
If all sources agree within 1%: confidence = 1.0
If 2 sources agree: confidence = 0.8
If only 1 source: confidence = 0.5
If divergence > 5%: confidence = 0.0 (don't trade)
```

---

### 8. PnLTracker (`src/analytics/`)

**Responsibilities:**
- Track all trades
- Calculate realized/unrealized P&L
- Generate reports
- Export to CSV

**Data Model:**
```
Trade Record:
├── botId
├── botName
├── tokenSymbol
├── action (buy/sell)
├── amount (tokens)
├── price (ETH per token)
├── ethValue (ETH spent/received)
├── gasCost (ETH)
├── profit (ETH, for sells)
├── profitPercent
├── timestamp
└── txHash
```

**Calculations:**
```
Realized P&L = Sum of all completed sell profits
Unrealized P&L = (Current Price - Buy Price) * Holdings
Combined P&L = Realized + Unrealized
```

---

### 9. TelegramNotifier (`src/notifications/`)

**Responsibilities:**
- Send trade notifications
- Alert on errors
- Daily summaries

**Event Types:**
```
TRADE_EXECUTED: "✅ Bot-1 bought 1000 COMPUTE at 0.0001 ETH"
PROFIT: "💰 Bot-1 sold for +8% profit (0.001 ETH)"
ERROR: "⚠️ Bot-1 error: insufficient funds"
SUMMARY: "📊 Daily: +0.05 ETH profit, 12 trades"
```

---

## Data Flow

### New Bot Creation

```
1. User Input
   └── CLI collects: name, token, config
   
2. Grid Generation
   └── GridCalculator.generateGrid()
   └── Creates positions with ranges
   
3. Wallet Setup
   └── Generate bot wallet (or use main)
   └── Store encrypted key
   
4. Persistence
   └── Save to storage/bots.json
   
5. Activation
   └── User starts bot
   └── HeartbeatManager.addBot()
```

### Trading Execution

```
1. Heartbeat Triggered
   └── HeartbeatManager.runHeartbeat()
   
2. Price Check
   └── ZeroXApi.getPrice()
   └── PriceOracle.validate()
   
3. Opportunity Detection
   └── GridCalculator.findBuyPosition()
   └── GridCalculator.findSellPositions()
   
4. Trade Execution
   └── TradingBot.executeBuy() / executeSell()
   └── ZeroXApi.getQuote()
   └── Submit transaction
   
5. State Update
   └── Update position status
   └── Record in PnLTracker
   └── Send Telegram notification
   └── Save to storage
```

### Fund Reclaim

```
1. User Request
   └── Select bot to reclaim
   
2. Balance Check
   └── Get ETH + token balances
   
3. Token Approval
   └── Approve 0x to spend tokens
   
4. Swap to ETH
   └── 0x quote for token→ETH
   └── Execute swap
   
5. Transfer
   └── Send all ETH to main wallet
   
6. Verification
   └── Check balances are near zero
   └── Archive bot wallet file
```

---

## Storage Layer

### File Structure
```
data/
├── bots.json              # Bot configurations and positions
├── wallets.json           # Encrypted wallet keys
└── pnl/
    ├── trades.json        # Trade history
    └── exports/           # CSV exports
```

### bots.json
```typescript
{
  "bots": [
    {
      "id": "bot-uuid",
      "name": "Bot-Name",
      "tokenAddress": "0x...",
      "tokenSymbol": "TOKEN",
      "walletAddress": "0x...",
      "config": { /* GridConfig */ },
      "positions": [ /* Position[] */ ],
      "totalBuys": 12,
      "totalSells": 8,
      "totalProfitEth": "5000000000000000",
      "isRunning": true,
      "enabled": true,
      "currentPrice": 0.000095
    }
  ]
}
```

### wallets.json
```typescript
{
  "walletDictionary": {
    "wallet-uuid": {
      "address": "0x...",
      "encryptedPrivateKey": "base64...",
      "type": "main",
      "name": "Trading",
      "createdAt": 1708272000000
    }
  },
  "primaryWalletId": "wallet-uuid"
}
```

---

## Security Model

### Encryption Flow
```
Private Key (hex)
       │
       ▼
Master Password ──► PBKDF2-SHA256 ──► Encryption Key
                          │
                          ▼
Private Key ──► AES-256-GCM ──► Ciphertext + Auth Tag
                                          │
                                          ▼
                                    Store to File
```

### Security Properties
- **600,000 PBKDF2 iterations** - Slow brute-force
- **AES-256-GCM** - Authenticated encryption
- **File permissions 600** - Only owner can read
- **No key logging** - Keys never in logs
- **Memory zeroing** - Keys cleared after use

### Transaction Security
- **Exact approvals** - Approve exact swap amount
- **Profit checks** - Never sell at loss
- **Gas calculation** - Include all costs
- **Receipt verification** - Confirm on-chain

---

## Error Handling

### Error Hierarchy
```
Error
├── WalletError
│   └── InvalidPasswordError
├── BotError
│   ├── InitializationError
│   └── TradingError
├── ApiError
│   ├── RateLimitError
│   ├── NoLiquidityError
│   └── NetworkError
├── ValidationError
│   └── InsufficientFundsError
└── StorageError
```

### Recovery Strategies

| Error | Strategy | Retry |
|-------|----------|-------|
| RPC Failure | Switch to fallback | Immediate |
| Rate Limit | Exponential backoff | 1s, 2s, 4s... |
| No Quote | Skip cycle | Next heartbeat |
| Gas Estimation | Add 20% buffer | Once |
| Transaction Fail | Log and continue | No |
| 5 Consecutive | Stop bot | Manual restart |

---

## Testing Architecture

### Test Structure
```
tests/
├── unit/
│   ├── WalletManager.test.ts
│   ├── GridCalculator.test.ts
│   └── ZeroXApi.test.ts
├── integration/
│   ├── TradingBot.test.ts
│   └── FullTradingLoop.test.ts
├── security/
│   ├── Encryption.test.ts
│   └── InputValidation.test.ts
├── performance/
│   ├── RpcLatency.test.ts
│   └── GridSpeed.test.ts
└── utils/
    ├── MockRpc.ts
    └── TestData.ts
```

### Coverage Targets
- **Unit tests**: 80%+ coverage
- **Integration tests**: All major flows
- **Security tests**: Encryption, validation
- **Performance tests**: <100ms per operation

---

## Deployment Architecture

### Development
```
Local Machine
├── TypeScript source
├── .env (local config)
└── data/ (local storage)
```

### Production
```
VPS/Server
├── Compiled JS
├── .env (production secrets)
├── data/ (persistent volume)
├── systemd service
└── monitoring/alerting
```

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

---

## Performance Considerations

### Optimization Strategies

1. **RPC Caching**
   - Cache price for 5 seconds
   - Avoid redundant calls

2. **Sequential Execution**
   - Prevents nonce conflicts
   - Reduces gas competition

3. **Lazy Loading**
   - Initialize oracles on demand
   - Load PnL data only when needed

4. **Batch Operations**
   - Read storage once per heartbeat
   - Write after all operations

### Benchmarks

| Operation | Target | Actual |
|-----------|--------|--------|
| Grid Generation | <10ms | ~5ms |
| Price Check | <500ms | ~200ms |
| Trade Execution | <30s | ~15s |
| Wallet Decrypt | <100ms | ~50ms |

---

## Future Considerations

### Potential Enhancements

1. **Multi-DEX Support**
   - Uniswap V3 direct integration
   - Aerodrome fallback

2. **Advanced Strategies**
   - Trailing stop losses
   - Dynamic grid adjustment
   - Market making mode

3. **Infrastructure**
   - Redis for caching
   - PostgreSQL for analytics
   - WebSocket price feeds

4. **UI**
   - Web dashboard
   - Mobile app
   - TradingView integration

---

**For implementation details, see [API_REFERENCE.md](./API_REFERENCE.md)**
