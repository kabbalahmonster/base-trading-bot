# Features Documentation

Complete feature reference for the Base Grid Trading Bot v1.4.0

## Table of Contents

- [Core Trading Features](#core-trading-features)
- [Multi-Chain Support](#multi-chain-support)
- [Volume Bot Mode](#volume-bot-mode)
- [Grid System](#grid-system)
- [Wallet Management](#wallet-management)
- [Monitoring & Analytics](#monitoring--analytics)
- [Notifications](#notifications)
- [Security Features](#security-features)
- [Infrastructure](#infrastructure)

---

## Core Trading Features

### Continuous Range-Based Grid Trading

The bot implements a sophisticated grid trading strategy with continuous price coverage.

**How It Works:**
1. The bot divides the price range (floor to ceiling) into equal segments
2. Each position covers a buy range [buyMin, buyMax]
3. Ranges are continuous - no gaps between positions
4. Buy triggers when price enters a range
5. Sell triggers at take-profit target based on buyMax

**Configuration:**
```typescript
interface GridConfig {
  numPositions: number;        // Number of grid levels (default: 24)
  floorPrice: number;          // Lowest buy price
  ceilingPrice: number;        // Highest buy price
  takeProfitPercent: number;   // Profit target % (default: 8%)
  stopLossEnabled: boolean;    // Enable stop loss
  stopLossPercent: number;     // Stop loss % below buyMin
}
```

**Example Grid:**
```
Current Price: 0.0001 ETH
Floor: 0.00001 ETH (1/10 of current)
Ceiling: 0.0004 ETH (4x current)
Positions: 24

Position 0:  [0.00001000, 0.00002625] → Sell at 0.00002835 (+8%)
Position 1:  [0.00002625, 0.00004250] → Sell at 0.00004590 (+8%)
Position 2:  [0.00004250, 0.00005875] → Sell at 0.00006345 (+8%)
...
Position 23: [0.00038375, 0.00040000] → Sell at 0.00043200 (+8%)
```

### Buy Execution

**Triggers:**
- Price enters buy range [buyMin, buyMax]
- Position status is EMPTY
- Active positions < maxActivePositions
- Sufficient ETH balance
- Price oracle confidence ≥ 80%

**Buy Amount Options:**

1. **Fixed Amount:**
   ```typescript
   useFixedBuyAmount: true
   buyAmount: 0.001  // ETH per buy
   ```

2. **Auto-Calculated:**
   ```typescript
   useFixedBuyAmount: false
   // Distributes available ETH across remaining positions
   ```

### Sell Execution

**Triggers:**
- Price reaches or exceeds sellPrice
- Position status is HOLDING
- Sell would be profitable (after gas)

**Profit Calculation:**
```
Gross ETH Received = swap output
Gas Cost = gasUsed × gasPrice
Net ETH = Gross - Gas Cost
Profit = Net ETH - Original Cost
Profit % = (Profit / Original Cost) × 100
```

**Moon Bag:**
- Keep a percentage of tokens on each sell
- Default: 1% (configurable 0-50%)
- Creates long-term token accumulation

### Stop Loss (Optional)

**Configuration:**
```typescript
stopLossEnabled: true
stopLossPercent: 10  // Sell if price drops 10% below buyMin
```

**Trigger:**
- Price falls to stopLossPrice (= buyMin × (1 - stopLossPercent/100))
- Sells to prevent further losses

---

## Multi-Chain Support

### Supported Chains

| Chain | Chain ID | RPC Endpoints | Features |
|-------|----------|---------------|----------|
| Base | 8453 | 5 fallback | Full feature set |
| Ethereum | 1 | 4 fallback | Full feature set |

### Chain Selection

**Per-Bot Configuration:**
```typescript
interface BotInstance {
  chain: 'base' | 'ethereum';
  // ... other config
}
```

**During Bot Creation:**
```bash
? Select chain:
  ○ Base (Ethereum L2) - Lower fees, faster
  ○ Ethereum (Mainnet) - Higher liquidity
```

### Chain-Specific Features

**Base L2:**
- Lower gas fees (~$0.01-0.10 per trade)
- Faster block times (2 seconds)
- Growing DeFi ecosystem
- Recommended for most users

**Ethereum Mainnet:**
- Highest liquidity
- Most established price oracles
- Higher gas fees (~$5-50 per trade)
- Best for large volume trading

### Cross-Chain Considerations

**Wallet Management:**
- Same wallet address across chains (EOA)
- Separate balances per chain
- Track which chain each bot uses

**Token Addresses:**
- Different contract addresses per chain
- Verify token exists on selected chain
- Bot validates token before trading

**Price Oracles:**
- Chain-specific oracle feeds
- Different confidence calculations per chain
- Fallback to 0x API if oracles unavailable

---

## Volume Bot Mode

### Overview

Volume bot mode is designed for market making and volume generation rather than pure profit.

### Use Cases

1. **Token Launch Support**
   - Generate initial trading volume
   - Create market activity perception
   - Support exchange listing requirements

2. **Market Making**
   - Provide continuous buy/sell liquidity
   - Reduce price spread
   - Stabilize token price

3. **Exchange Requirements**
   - Meet minimum volume thresholds
   - Qualify for tier upgrades
   - Maintain trading pair status

### Volume Mode Mechanics

**Accumulation Phase:**
```
1. Buy tokens in N increments
2. Track accumulated amount
3. Wait for cycle completion
```

**Distribution Phase:**
```
1. Sell accumulated tokens
2. Can operate at break-even (0% profit)
3. Or minimal profit to cover gas
```

### Configuration

```typescript
interface VolumeConfig {
  volumeMode: true;
  volumeBuysPerCycle: 5;      // Buys before selling
  volumeAccumulatedTokens: string;  // Tracked automatically
  volumeCycleCount: number;    // Completed cycles (tracked)
  
  // For break-even volume generation:
  minProfitPercent: 0;         // No profit needed
  moonBagPercent: 0;           // Sell 100%
}
```

### Example Volume Bot Setup

```bash
? Enable volume bot mode? Yes
? Buys per cycle: 10
? Minimum profit %: 0
? Enable moon bag? No

✓ Volume bot configured:
  Mode: Volume generation
  Strategy: 10 buys → distribute all
  Target: Break-even (gas only)
```

### Volume vs Profit Mode Comparison

| Feature | Profit Mode | Volume Mode |
|---------|-------------|-------------|
| Primary Goal | Generate profit | Generate volume |
| Min Profit % | 2%+ | 0% (optional) |
| Moon Bag | 1-50% | 0% (usually) |
| Hold Time | Until profit target | Until cycle complete |
| Exit Strategy | Per-position profit | Batch distribution |

---

## Grid System

### GridCalculator API

```typescript
class GridCalculator {
  // Generate grid positions
  static generateGrid(currentPrice: number, config: GridConfig): Position[];
  
  // Find buy opportunity
  static findBuyPosition(positions: Position[], currentPrice: number): Position | null;
  
  // Find sell opportunities
  static findSellPositions(positions: Position[], currentPrice: number): Position[];
  
  // Validate grid integrity
  static validateContinuousCoverage(positions: Position[]): boolean;
}
```

### Position Structure

```typescript
interface Position {
  id: number;
  buyMin: number;           // Lower bound of buy range
  buyMax: number;           // Upper bound (also trigger price)
  buyPrice: number;         // Legacy = buyMax
  sellPrice: number;        // Target sell price
  stopLossPrice: number;    // Stop loss trigger price
  status: 'EMPTY' | 'HOLDING' | 'SOLD';
  
  // Populated on buy
  buyTxHash?: string;
  buyTimestamp?: number;
  tokensReceived?: string;  // wei
  ethCost?: string;         // wei spent
  
  // Populated on sell
  sellTxHash?: string;
  sellTimestamp?: number;
  ethReceived?: string;
  profitEth?: string;
  profitPercent?: number;
}
```

### Grid Reconfiguration

**Preserve Balances:**
```typescript
// When regenerating grid:
1. Identify positions with HOLDING status
2. Match them to new grid based on price proximity
3. Combine multiple positions if needed
4. Preserve tokens and cost basis
5. Update sell targets based on new config
```

**Example:**
```
Old Grid:
  Position 5: HOLDING, 1000 tokens @ 0.0001 ETH
  Position 6: HOLDING, 1500 tokens @ 0.00012 ETH

New Grid (regenerated):
  Position 4: [0.000095, 0.000110] ← Position 5 matched here
  Position 5: [0.000110, 0.000125] ← Position 6 matched here
```

---

## Wallet Management

### Wallet Types

**Main Wallets:**
- User-created with custom names
- Can be marked as PRIMARY (⭐)
- Used for funding and reclaiming
- Multiple allowed

**Bot Wallets:**
- Auto-generated per bot
- Derived from bot ID
- Can use main wallet instead
- Separate for isolation

### WalletManager API

```typescript
class WalletManager {
  // Initialize with master password
  initialize(password: string): Promise<void>;
  
  // Create wallets
  generateMainWallet(name?: string): WalletData;
  generateBotWallet(botId: string): WalletData;
  
  // Get wallets
  getPrimaryWallet(): WalletData | null;
  getAllWallets(): WalletDictionary;
  
  // Export (use with caution!)
  exportPrivateKey(walletId: string): string;
}
```

### Encryption

**Algorithm:**
```
Private Key
    ↓
PBKDF2-SHA256 (600,000 iterations) + Salt
    ↓
AES-256-GCM Encryption
    ↓
Store: salt:ciphertext:authTag
```

**Security Properties:**
- 600k PBKDF2 iterations slow brute-force attacks
- AES-256-GCM provides authenticated encryption
- Unique salt per wallet
- File permissions 600 (owner read/write only)

---

## Monitoring & Analytics

### Real-Time Dashboard

**All Bots Overview:**
- Fleet status summary
- Total positions, trades, profit
- Individual bot status board
- Chain indicators
- Error alerts

**Individual Bot Detail:**
- Wallet balances (live from chain)
- Current price and grid range
- Holding positions table
- Next buy opportunities
- Sell history
- Performance statistics

### P&L Tracking

**Realized P&L:**
- Profit from completed sells
- Based on actual trade prices
- Includes gas costs

**Unrealized P&L:**
- Current value of holdings
- Based on current market price
- Changes with price movements

**CSV Export:**
```csv
Date,Bot,Token,Action,Amount,Price,GasCost,Profit,TxHash,Chain
2026-02-17T14:32:15Z,Bot-1,COMPUTE,BUY,1000,0.0001,0.00001,0,0xabc,Base
2026-02-17T16:45:22Z,Bot-1,COMPUTE,SELL,990,0.00012,0.00001,0.000018,0xdef,Base
```

### Performance Metrics

| Metric | Description |
|--------|-------------|
| Total Buys | Number of completed buy transactions |
| Total Sells | Number of completed sell transactions |
| Win Rate | Percentage of profitable sells |
| Avg Profit % | Average profit per sell |
| Total ETH Profit | Cumulative profit in ETH |
| Gas Spent | Total gas costs |

---

## Notifications

### Telegram Integration

**Setup:**
```bash
1. Create bot via @BotFather
2. Get bot token
3. Get chat ID
4. Configure in bot menu
```

**Alert Levels:**
- `all` - Every event
- `trades-only` - Buys and sells only
- `errors-only` - Errors and warnings
- `none` - Disabled

**Notification Types:**

**Trade Executed:**
```
✅ Trade Executed - Bot-1 (COMPUTE)

Action: BUY
Position: #12
Amount: 1,000 COMPUTE
Cost: 0.001 ETH
Price: 0.000001 ETH/COMPUTE

TX: 0xabc...123
```

**Profit Alert:**
```
💰 Profit Taken - Bot-1 (COMPUTE)

Position: #12
Profit: +8.0%
Amount: 0.00018 ETH
Received: 0.00118 ETH

🎉 Another win!
```

**Error Alert:**
```
⚠️ Bot Error - Bot-1 (COMPUTE)

Error: Insufficient funds for gas
Consecutive errors: 3/5

Please check wallet balance.
```

**Daily Summary:**
```
📊 Daily Summary - 2026-02-17

Bots Running: 3
Total Trades: 12
Total Profit: +0.045 ETH

Top Performer: Bot-2 (+0.023 ETH)
```

---

## Security Features

### Encryption

**Wallet Encryption:**
- PBKDF2-SHA256 key derivation (600k iterations)
- AES-256-GCM authenticated encryption
- Per-wallet unique salt
- Memory zeroing after use

### Transaction Safety

**Before Every Trade:**
1. Price oracle validation (80% confidence)
2. Profitability check (including gas)
3. Balance verification
4. Token approval verification

**Error Handling:**
- Stop after 5 consecutive errors
- No infinite retry loops
- Receipt verification before state update

### Access Control

**File Permissions:**
```bash
# Wallets
chmod 600 data/wallets.json

# Bot data
chmod 600 data/bots.json
```

**Password Requirements:**
- Minimum 8 characters
- Cannot be empty
- Validated on every unlock

---

## Infrastructure

### RPC Management

**Fallback System:**
```typescript
// Tries RPCs in order until one works
const RPC_FALLBACKS = [
  'https://base.llamarpc.com',
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://base.drpc.org',
  'https://1rpc.io/base',
];
```

**Health Checks:**
- Test connection before use
- Auto-switch on failure
- Remember working RPC

### Daemon Mode

**Process Management:**
```typescript
class BotDaemon {
  start(): boolean;      // Spawn background process
  stop(): boolean;       // Graceful shutdown
  restart(): boolean;    // Stop then start
  isRunning(): boolean;  // Check status
  getLogs(): string;     // Recent log output
}
```

**Benefits:**
- Survives SSH disconnect
- Auto-restart on crash
- Background operation
- Log persistence

### Storage

**File Structure:**
```
data/
├── bots.json           # Bot configurations
├── wallets.json        # Encrypted wallet data
└── trades.json         # Trade history

exports/
└── pnl_*.csv          # P&L exports

logs/
├── app.log            # Application logs
└── error.log          # Error logs
```

**Backup Strategy:**
- JSON files are human-readable
- Easy to backup/restore
- Version control friendly

---

## Feature Comparison Matrix

| Feature | Base | Ethereum | Notes |
|---------|------|----------|-------|
| Grid Trading | ✅ | ✅ | Full support |
| Volume Mode | ✅ | ✅ | Full support |
| Price Oracles | ✅ | ✅ | Chain-specific feeds |
| Telegram Alerts | ✅ | ✅ | Universal |
| P&L Tracking | ✅ | ✅ | Cross-chain aggregate |
| Daemon Mode | ✅ | ✅ | Universal |
| Wallet Encryption | ✅ | ✅ | Universal |
| RPC Fallback | ✅ (5) | ✅ (4) | Different endpoints |

---

## Configuration Examples

### Conservative Profit Bot (Base)

```typescript
{
  chain: 'base',
  numPositions: 12,
  takeProfitPercent: 15,
  maxActivePositions: 2,
  useFixedBuyAmount: true,
  buyAmount: 0.005,
  moonBagEnabled: true,
  moonBagPercent: 5,
  stopLossEnabled: true,
  stopLossPercent: 10
}
```

### Aggressive Volume Bot (Base)

```typescript
{
  chain: 'base',
  numPositions: 48,
  takeProfitPercent: 3,
  maxActivePositions: 10,
  useFixedBuyAmount: true,
  buyAmount: 0.001,
  moonBagEnabled: false,
  minProfitPercent: 0,
  // Volume mode
  volumeBuysPerCycle: 20
}
```

### Ethereum Mainnet Bot

```typescript
{
  chain: 'ethereum',
  numPositions: 12,
  takeProfitPercent: 10,
  maxActivePositions: 3,
  useFixedBuyAmount: true,
  buyAmount: 0.05,  // Higher for ETH mainnet
  moonBagEnabled: true,
  moonBagPercent: 2
}
```

---

For API documentation, see [API_REFERENCE.md](./API_REFERENCE.md)

For troubleshooting, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
