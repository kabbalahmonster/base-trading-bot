# API Reference

Complete API documentation for the Base Grid Trading Bot.

## Table of Contents

- [WalletManager](#walletmanager)
- [TradingBot](#tradingbot)
- [GridCalculator](#gridcalculator)
- [ZeroXApi](#zeroxapi)
- [JsonStorage](#jsonstorage)
- [HeartbeatManager](#heartbeatmanager)
- [PriceOracle](#priceoracle)
- [PnLTracker](#pnltracker)
- [TelegramNotifier](#telegramnotifier)

---

## WalletManager

Manages wallet creation, encryption, and key operations.

### Constructor

```typescript
constructor(password?: string)
```

### Methods

#### `initialize(password: string): Promise<void>`
Initializes the wallet manager with the master password.

**Parameters:**
- `password` - Master password for encryption/decryption

**Throws:**
- `Error` if password is empty or invalid

**Example:**
```typescript
const walletManager = new WalletManager();
await walletManager.initialize('mySecurePassword123');
```

---

#### `createMainWallet(name?: string): WalletData`
Creates a new main wallet.

**Parameters:**
- `name` (optional) - Display name for the wallet

**Returns:** `WalletData` - The created wallet

**Example:**
```typescript
const wallet = walletManager.createMainWallet('Trading Wallet');
console.log(wallet.address); // 0x...
```

---

#### `generateBotWallet(botId: string): WalletData`
Generates a new bot-specific wallet.

**Parameters:**
- `botId` - Unique identifier for the bot

**Returns:** `WalletData` - The generated bot wallet

---

#### `getMainAccount(): PrivateKeyAccount`
Gets the primary main wallet as a viem account.

**Returns:** `PrivateKeyAccount` - Account ready for transactions

**Throws:**
- `Error` if wallet manager not initialized
- `Error` if no main wallet exists

---

#### `getBotAccount(botId: string): PrivateKeyAccount | null`
Gets a bot wallet as a viem account.

**Parameters:**
- `botId` - The bot's unique ID

**Returns:** `PrivateKeyAccount | null` - Account or null if not found

---

#### `exportPrivateKey(walletId: string): string`
Exports the private key for a wallet.

**Parameters:**
- `walletId` - Wallet identifier

**Returns:** `string` - Private key (0x...)

**⚠️ Security Warning:** Handle with extreme care!

---

#### `importData(data: WalletStorageData): void`
Imports wallet data from storage.

**Parameters:**
- `data` - Wallet dictionary and main wallet info

---

## TradingBot

Core trading engine that executes grid strategies.

### Constructor

```typescript
constructor(
  instance: BotInstance,
  walletManager: WalletManager,
  zeroXApi: ZeroXApi,
  storage: JsonStorage,
  rpcUrl: string,
  enablePriceOracle?: boolean,
  pnLTracker?: PnLTracker
)
```

### Methods

#### `init(): Promise<void>`
Initializes the bot with RPC clients and price oracle.

**Example:**
```typescript
const bot = new TradingBot(instance, walletManager, zeroXApi, storage, rpcUrl);
await bot.init();
```

---

#### `start(): void`
Starts the trading bot.

---

#### `stop(): void`
Stops the trading bot gracefully.

---

#### `runHeartbeat(): Promise<void>`
Executes one heartbeat cycle (checks prices, executes trades).

**Called automatically when bot is running.**

---

#### `setDryRun(enabled: boolean): void`
Enables/disables dry-run mode (no actual transactions).

**Parameters:**
- `enabled` - true to enable dry-run

---

#### `setPriceOracleEnabled(enabled: boolean): void`
Enables/disables price oracle validation.

---

#### `getStatus(): BotStatus`
Returns current bot status.

**Returns:**
```typescript
{
  isRunning: boolean;
  instanceId: string;
  currentPrice: number;
  holdingPositions: number;
  lastError?: string;
}
```

---

## GridCalculator

Generates and manages grid positions.

### Static Methods

#### `generateGrid(currentPrice: number, config: GridConfig): Position[]`
Generates grid positions with continuous buy ranges.

**Parameters:**
- `currentPrice` - Current token price in ETH
- `config` - Grid configuration

**Returns:** `Position[]` - Array of 24 positions (default)

**Grid Layout:**
- Position 0: buyMin=floor, buyMax=floor+step
- Position 1: buyMin=position0.buyMax, buyMax=position0.buyMax+step
- ...continuous coverage...
- Position 23: buyMin=position22.buyMax, buyMax=ceiling

**Example:**
```typescript
const positions = GridCalculator.generateGrid(0.000095, {
  numPositions: 24,
  floorPrice: 0.0000095,
  ceilingPrice: 0.00038,
  takeProfitPercent: 8,
  stopLossEnabled: true,
  stopLossPercent: 10
});
```

---

#### `findBuyPosition(positions: Position[], currentPrice: number): Position | null`
Finds a position that should buy at current price.

**Logic:**
- Returns position where `buyMin <= currentPrice <= buyMax`
- Position must have status 'EMPTY'
- Returns null if no matching position

---

#### `findSellPositions(positions: Position[], currentPrice: number): Position[]`
Finds all positions that should sell at current price.

**Logic:**
- Returns positions where `currentPrice >= sellPrice`
- Position must have status 'HOLDING'
- Includes stop-loss triggers if enabled

---

#### `findNextBuyOpportunity(positions: Position[], currentPrice: number): Position | null`
Finds the next buy opportunity above current price.

---

#### `findNextSellOpportunity(positions: Position[]): Position | null`
Finds the next sell opportunity (lowest sell price among holding).

---

#### `validateContinuousCoverage(positions: Position[]): boolean`
Validates that grid has no gaps between positions.

---

## ZeroXApi

Client for the 0x Protocol swap API.

### Constructor

```typescript
constructor(apiKey?: string)
```

### Methods

#### `getPrice(tokenAddress: string, sellToken?: string): Promise<number>`
Gets the current price of a token in ETH.

**Parameters:**
- `tokenAddress` - Token contract address
- `sellToken` (optional) - Defaults to WETH

**Returns:** `number` - Price in ETH

---

#### `getQuote(params: QuoteParams): Promise<ZeroXQuote>`
Gets a swap quote from 0x.

**Parameters:**
```typescript
{
  sellToken: string;      // Token to sell
  buyToken: string;       // Token to buy
  sellAmount: string;     // Amount in wei
  takerAddress: string;   // Address executing swap
}
```

**Returns:** `ZeroXQuote`

---

#### `isProfitable(tokenAddress: string, sellAmount: string, costBasis: string, minProfitPercent: number, walletAddress: string): Promise<ProfitabilityResult>`
Checks if selling would be profitable.

**Returns:**
```typescript
{
  profitable: boolean;
  actualProfit: number;   // Percentage
  quote?: ZeroXQuote;
}
```

---

## JsonStorage

JSON file-based storage for bots and wallets.

### Constructor

```typescript
constructor(dataDir?: string)
```

### Methods

#### `saveBot(bot: BotInstance): Promise<void>`
Saves a bot instance to storage.

---

#### `getBot(id: string): Promise<BotInstance | null>`
Retrieves a bot by ID.

---

#### `getAllBots(): Promise<BotInstance[]>`
Gets all stored bots.

---

#### `deleteBot(id: string): Promise<void>`
Deletes a bot from storage.

---

#### `saveWalletDictionary(dictionary: WalletDictionary): Promise<void>`
Saves the wallet dictionary.

---

#### `getWalletDictionary(): Promise<WalletDictionary>`
Gets all wallets.

---

## HeartbeatManager

Manages multiple bots with sequential execution.

### Constructor

```typescript
constructor(
  storage: JsonStorage,
  walletManager: WalletManager,
  zeroXApi: ZeroXApi,
  rpcUrl: string
)
```

### Methods

#### `start(): void`
Starts the heartbeat loop.

---

#### `stop(): void`
Stops the heartbeat loop.

---

#### `addBot(bot: BotInstance): void`
Adds a bot to the heartbeat rotation.

---

#### `removeBot(botId: string): void`
Removes a bot from rotation.

---

#### `loadBots(): Promise<void>`
Loads all enabled bots from storage.

---

#### `getStatus(): HeartbeatStatus`
Returns heartbeat status.

---

## PriceOracle

Multi-source price validation using Chainlink and Uniswap V3.

### Constructor

```typescript
constructor(config: OracleConfig)
```

**Config:**
```typescript
{
  rpcUrl: string;
  minConfidence: number;    // 0-1 (default 0.8)
  allowFallback: boolean;   // Allow 0x fallback
  preferChainlink: boolean; // Prefer Chainlink over TWAP
  twapSeconds: number;      // TWAP window (default 1800)
}
```

### Methods

#### `getPrice(tokenAddress: string): Promise<PriceData>`
Gets validated price from multiple sources.

**Returns:**
```typescript
{
  priceEth: number;
  priceUsd: number;
  confidence: number;  // 0-1
  sources: string[];   // ['chainlink', 'uniswap-v3-twap']
}
```

---

#### `healthCheck(): Promise<HealthStatus>`
Checks oracle health and returns ETH price.

---

## PnLTracker

Tracks profit and loss for tax reporting.

### Methods

#### `recordTrade(trade: TradeRecord): Promise<void>`
Records a completed trade.

**TradeRecord:**
```typescript
{
  botId: string;
  botName: string;
  tokenSymbol: string;
  action: 'buy' | 'sell';
  amount: string;
  price: number;
  ethValue: string;
  gasCost: string;
  profit?: string;
  profitPercent?: number;
  timestamp: number;
  txHash: string;
}
```

---

#### `getDailyPnL(date: string): Promise<PnLSummary>`
Gets P&L for a specific date.

---

#### `getCumulativePnL(): Promise<PnLCumulative>`
Gets cumulative P&L across all time.

---

#### `exportToCSV(filters?: ExportFilters): Promise<string>`
Exports trades to CSV format.

**Returns:** Path to CSV file

---

## TelegramNotifier

Sends notifications via Telegram Bot API.

### Static Methods

#### `getInstance(): TelegramNotifier`
Gets singleton instance.

---

#### `configure(config: TelegramConfig): void`
Configures the notifier.

**Config:**
```typescript
{
  botToken: string;
  chatId: string;
  alertLevel: 'all' | 'trades-only' | 'errors-only' | 'none';
}
```

---

#### `notifyTradeExecuted(bot: BotInstance, amount: string, cost: string, positionId: number): Promise<void>`
Sends trade execution notification.

---

#### `notifyProfit(bot: BotInstance, profitPercent: number, profitEth: string, receivedEth: string, positionId: number): Promise<void>`
Sends profit notification.

---

#### `notifyError(bot: BotInstance, error: string): Promise<void>`
Sends error notification.

---

## Types

### Position

```typescript
interface Position {
  id: number;
  buyMin: number;           // Lower bound of buy range
  buyMax: number;           // Upper bound of buy range
  buyPrice: number;         // Legacy = buyMax
  sellPrice: number;        // Target sell price
  stopLossPrice: number;    // Stop loss trigger
  status: 'EMPTY' | 'HOLDING' | 'SOLD';
  
  // Buy data
  buyTxHash?: string;
  buyTimestamp?: number;
  tokensReceived?: string;  // Wei
  ethCost?: string;         // Wei
  
  // Sell data
  sellTxHash?: string;
  sellTimestamp?: number;
  ethReceived?: string;
  profitEth?: string;
  profitPercent?: number;
}
```

### GridConfig

```typescript
interface GridConfig {
  numPositions: number;        // Default: 24
  floorPrice: number;          // Grid floor
  ceilingPrice: number;        // Grid ceiling
  takeProfitPercent: number;   // Default: 8%
  stopLossPercent: number;     // Default: 10%
  stopLossEnabled: boolean;    // Default: false
  moonBagEnabled: boolean;     // Default: true
  moonBagPercent: number;      // Default: 1%
  minProfitPercent: number;    // Default: 2%
  maxActivePositions: number;  // Default: 4
  buyAmount: number;           // ETH per buy
  useFixedBuyAmount: boolean;  // Default: false
}
```

### BotInstance

```typescript
interface BotInstance {
  id: string;
  name: string;
  tokenAddress: string;
  tokenSymbol: string;
  walletAddress: string;
  useMainWallet: boolean;
  config: GridConfig;
  positions: Position[];
  
  // Stats
  totalBuys: number;
  totalSells: number;
  totalProfitEth: string;
  
  // State
  isRunning: boolean;
  enabled: boolean;
  currentPrice: number;
  
  // Timing
  createdAt: number;
  lastUpdated: number;
  lastTradeAt?: number;
  consecutiveErrors: number;
}
```

---

## Error Handling

All methods throw typed errors:

```typescript
class WalletError extends Error {}
class BotError extends Error {}
class ApiError extends Error {
  statusCode?: number;
}
class ValidationError extends Error {}
```

---

## Examples

### Complete Trading Setup

```typescript
import { WalletManager } from './wallet/WalletManager.js';
import { TradingBot } from './bot/TradingBot.js';
import { ZeroXApi } from './api/ZeroXApi.js';
import { JsonStorage } from './storage/JsonStorage.js';
import { GridCalculator } from './grid/GridCalculator.js';

// Initialize
const storage = new JsonStorage();
const walletManager = new WalletManager();
await walletManager.initialize('masterPassword');

// Create wallet
const mainWallet = walletManager.createMainWallet('Main Trading');

// Setup 0x API
const zeroXApi = new ZeroXApi(process.env.ZEROX_API_KEY);

// Create bot configuration
const config = {
  numPositions: 24,
  floorPrice: 0.00001,
  ceilingPrice: 0.0004,
  takeProfitPercent: 8,
  stopLossEnabled: false,
  moonBagEnabled: true,
  moonBagPercent: 1,
  maxActivePositions: 4,
  useFixedBuyAmount: true,
  buyAmount: 0.001
};

// Generate positions
const positions = GridCalculator.generateGrid(0.000095, config);

// Create bot instance
const botInstance = {
  id: 'bot-' + Date.now(),
  name: 'COMPUTE-Grid',
  tokenAddress: '0x696381f39F17cAD67032f5f52A4924ce84e51BA3',
  tokenSymbol: 'COMPUTE',
  walletAddress: mainWallet.address,
  useMainWallet: true,
  config,
  positions,
  totalBuys: 0,
  totalSells: 0,
  totalProfitEth: '0',
  isRunning: false,
  enabled: true,
  currentPrice: 0.000095,
  createdAt: Date.now(),
  lastUpdated: Date.now(),
  consecutiveErrors: 0
};

// Save and start
await storage.saveBot(botInstance);

const bot = new TradingBot(
  botInstance,
  walletManager,
  zeroXApi,
  storage,
  'https://mainnet.base.org'
);

await bot.init();
bot.start();
```

---

**For more examples, see the [tests/](../tests/) directory.**
