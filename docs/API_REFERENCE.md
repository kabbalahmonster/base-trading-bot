# API Reference

Complete API documentation for the Base Grid Trading Bot v1.4.0

## Table of Contents

- [Types](#types)
- [WalletManager](#walletmanager)
- [TradingBot](#tradingbot)
- [GridCalculator](#gridcalculator)
- [ZeroXApi](#zeroxapi)
- [JsonStorage](#jsonstorage)
- [HeartbeatManager](#heartbeatmanager)
- [PriceOracle](#priceoracle)
- [PnLTracker](#pnltracker)
- [TelegramNotifier](#telegramnotifier)
- [BotDaemon](#botdaemon)
- [NotificationService](#notificationservice)

---

## Types

### Chain

```typescript
type Chain = 'base' | 'ethereum';
```

Supported blockchain networks.

### AlertLevel

```typescript
type AlertLevel = 'all' | 'trades-only' | 'errors-only' | 'none';
```

Telegram notification filtering levels.

### GridConfig

```typescript
interface GridConfig {
  // Grid settings
  numPositions: number;        // Default: 24
  floorPrice: number;          // In ETH (default: currentPrice / 10)
  ceilingPrice: number;        // In ETH (default: currentPrice * 4)
  useMarketCap: boolean;       // Default: false (use price)
  
  // Trading settings
  takeProfitPercent: number;   // Default: 8%
  stopLossPercent: number;     // Default: 10%
  stopLossEnabled: boolean;    // Default: false
  buysEnabled: boolean;        // Default: true
  sellsEnabled: boolean;       // Default: true
  
  // Moon bag settings
  moonBagEnabled: boolean;     // Default: true
  moonBagPercent: number;      // Default: 1%
  
  // Safety settings
  minProfitPercent: number;    // Default: 2% (after gas)
  maxActivePositions: number;  // Default: 4
  
  // Buy amount settings
  buyAmount: number;           // ETH amount per buy (0 = auto-calculate)
  useFixedBuyAmount: boolean;  // Default: false (auto-calculate based on balance)
  
  // Price Oracle settings
  usePriceOracle?: boolean;    // Default: true
  minPriceConfidence?: number; // Default: 0.8 (80% minimum confidence)
  
  // Timing
  heartbeatMs: number;         // Default: 1000ms
  skipHeartbeats: number;      // Default: 0 (run every heartbeat)
}
```

Complete configuration for grid trading strategy.

### Position

```typescript
interface Position {
  id: number;
  // Range-based buy zone (covers entire chart continuously)
  buyMin: number;             // Lower bound of buy range (ETH per token)
  buyMax: number;             // Upper bound of buy range (ETH per token)
  // Legacy support (buyPrice = buyMax for backward compatibility)
  buyPrice: number;           // Kept for compatibility = buyMax
  sellPrice: number;          // Target sell price = buyMax * (1 + profit%)
  stopLossPrice: number;      // Stop loss = buyMin * (1 - stopLoss%)

  // State
  status: 'EMPTY' | 'HOLDING' | 'SOLD';
  
  // Buy data (populated when bought)
  buyTxHash?: string;
  buyTimestamp?: number;
  tokensReceived?: string;    // Raw token amount (wei)
  ethCost?: string;          // ETH spent (wei)
  
  // Sell data (populated when sold)
  sellTxHash?: string;
  sellTimestamp?: number;
  ethReceived?: string;      // ETH received (wei)
  profitEth?: string;        // Profit in ETH (wei)
  profitPercent?: number;    // Profit percentage
}
```

Represents a single grid position with buy/sell data.

### BotInstance

```typescript
interface BotInstance {
  id: string;
  name: string;
  tokenAddress: string;
  tokenSymbol: string;
  
  // Chain selection
  chain: Chain;               // 'base' | 'ethereum'
  
  // Wallet
  walletAddress: string;
  useMainWallet: boolean;     // If true, uses main wallet
  
  // Grid
  config: GridConfig;
  positions: Position[];
  
  // Stats
  totalBuys: number;
  totalSells: number;
  totalProfitEth: string;
  totalProfitUsd: number;
  
  // Notifications
  notifications?: NotificationConfig;
  
  // State
  isRunning: boolean;
  enabled: boolean;          // Default: true (can be disabled without deleting)
  lastHeartbeat: number;
  currentPrice: number;
  consecutiveErrors?: number; // Track consecutive errors for auto-stop
  lastTradeAt?: number;      // Timestamp of last trade

  // Volume Bot Mode State
  volumeBuysInCycle?: number;  // Current buy count in volume cycle
  volumeAccumulatedTokens?: string; // Total tokens accumulated in current cycle
  volumeCycleCount?: number;   // Number of completed volume cycles

  // Timing
  createdAt: number;
  lastUpdated: number;
}
```

Complete bot instance with state, stats, and configuration.

### WalletData

```typescript
interface WalletData {
  address: string;
  encryptedPrivateKey: string;
  createdAt: number;
  name?: string;  // Optional name for identification
  type: 'main' | 'bot';
}
```

Wallet information with encrypted private key.

### PriceData

```typescript
interface PriceData {
  priceEth: number;
  priceUsd: number;
  marketCap: number;
  timestamp: number;
}
```

Price information from oracle sources.

### ZeroXQuote

```typescript
interface ZeroXQuote {
  buyToken: string;
  sellToken: string;
  buyAmount: string;
  sellAmount: string;
  price: string;
  gas: string;
  gasPrice: string;
  to: string;
  data: string;
  value: string;
  allowanceTarget?: string;
}
```

Swap quote from 0x API.

### TradeResult

```typescript
interface TradeResult {
  success: boolean;
  txHash?: string;
  gasUsed?: bigint;
  gasCostEth?: string;
  error?: string;
}
```

Result of a buy or sell execution.

---

## WalletManager

Manages wallet creation, encryption, and key operations.

### Constructor

```typescript
constructor()
```

### Methods

#### `initialize(password: string): Promise<void>`

Initializes the wallet manager with the master password.

**Parameters:**
- `password` - Master password for encryption/decryption (min 8 characters)

**Throws:**
- `Error` if password is empty or less than 8 characters

**Example:**
```typescript
const walletManager = new WalletManager();
await walletManager.initialize('mySecurePassword123');
```

---

#### `isInitialized(): boolean`

Check if the wallet manager has been initialized.

**Returns:** `boolean` - True if initialized with password

---

#### `generateMainWallet(name?: string): WalletData`

Creates a new main wallet with optional custom name.

**Parameters:**
- `name` (optional) - Display name for the wallet

**Returns:** `WalletData` - The created wallet

**Example:**
```typescript
const wallet = walletManager.generateMainWallet('Trading Wallet');
console.log(wallet.address); // 0x...
console.log(wallet.name);    // Trading Wallet
```

---

#### `generateBotWallet(botId: string): WalletData`

Generates a new bot-specific wallet.

**Parameters:**
- `botId` - Unique identifier for the bot

**Returns:** `WalletData` - The generated bot wallet

---

#### `getPrimaryWallet(): WalletData | null`

Gets the primary/main wallet (marked with ⭐).

**Returns:** `WalletData | null` - Primary wallet or null if none set

---

#### `setPrimaryWallet(walletId: string): void`

Sets a wallet as the primary wallet.

**Parameters:**
- `walletId` - Wallet identifier to set as primary

**Throws:**
- `Error` if wallet not found

---

#### `getMainAccount(): Account`

Gets the primary main wallet as a viem account.

**Returns:** `Account` - Account ready for transactions

**Throws:**
- `Error` if wallet manager not initialized
- `Error` if no main wallet exists

---

#### `getAccount(walletId: string): Account`

Gets any wallet as a viem account by ID.

**Parameters:**
- `walletId` - The wallet's unique ID

**Returns:** `Account` - Account ready for transactions

---

#### `getAccountForAddress(address: string): Account`

Gets account for a wallet by Ethereum address.

**Parameters:**
- `address` - Ethereum address (0x...)

**Returns:** `Account` - Matching account

**Throws:**
- `Error` if no wallet found for address

---

#### `getWalletClient(walletId: string, rpcUrl: string): WalletClient`

Gets a viem wallet client for any wallet.

**Parameters:**
- `walletId` - Wallet identifier
- `rpcUrl` - RPC endpoint URL

**Returns:** `WalletClient` - Configured wallet client with public actions

---

#### `getMainWalletClient(rpcUrl: string): WalletClient`

Gets wallet client for primary wallet.

**Parameters:**
- `rpcUrl` - RPC endpoint URL

**Returns:** `WalletClient` - Configured wallet client

---

#### `exportPrivateKey(walletId: string): string`

Exports the private key for a wallet.

**Parameters:**
- `walletId` - Wallet identifier

**Returns:** `string` - Private key (0x...)

**⚠️ Security Warning:** Handle with extreme care! Never log or share.

---

#### `getAllWallets(): WalletDictionary`

Gets all wallets (main and bot).

**Returns:** `WalletDictionary` - Dictionary of all wallets

---

#### `getMainWallets(): Record<string, WalletData>`

Gets only main wallets.

**Returns:** `Record<string, WalletData>` - Dictionary of main wallets

---

#### `getBotWallets(): Record<string, WalletData>`

Gets only bot wallets.

**Returns:** `Record<string, WalletData>` - Dictionary of bot wallets

---

#### `exportData(): { walletDictionary: WalletDictionary; primaryWalletId: string | null }`

Exports wallet data for storage.

**Returns:** Wallet data object for persistence

---

#### `importData(data: { walletDictionary?: WalletDictionary; primaryWalletId?: string | null }): void`

Imports wallet data from storage.

**Parameters:**
- `data` - Wallet data to import

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

**Parameters:**
- `instance` - Bot configuration and state
- `walletManager` - Wallet management instance
- `zeroXApi` - 0x API client
- `storage` - Storage instance
- `rpcUrl` - RPC endpoint
- `enablePriceOracle` - Enable price validation (default: true)
- `pnLTracker` - Optional P&L tracker

---

### Methods

#### `init(): Promise<void>`

Initializes the bot with RPC clients and price oracle.

**Example:**
```typescript
const bot = new TradingBot(instance, walletManager, zeroXApi, storage, rpcUrl);
await bot.init();
```

---

#### `tick(): Promise<void>`

Executes one trading cycle (checks prices, executes trades).

**Called automatically when bot is running via HeartbeatManager.**

---

#### `start(): void`

Starts the trading bot. Sets isRunning flag.

---

#### `stop(): void`

Stops the trading bot gracefully. Clears isRunning flag.

---

#### `setDryRun(enabled: boolean): void`

Enables/disables dry-run mode (no actual transactions).

**Parameters:**
- `enabled` - true to enable dry-run

---

#### `setPnLTracker(pnLTracker: PnLTracker): void`

Sets the P&L tracker after construction.

**Parameters:**
- `pnLTracker` - PnL tracker instance

---

#### `getPnLTracker(): PnLTracker | null`

Gets the current P&L tracker.

**Returns:** `PnLTracker | null` - Tracker instance or null

---

#### `liquidateAll(): Promise<{ success: number; failed: number; totalProfit: string }>`

Emergency liquidate all holding positions.

**Returns:** Object with success count, failed count, and total profit

---

#### `getStats(): object`

Returns current bot statistics.

**Returns:**
```typescript
{
  name: string;
  positions: { empty: number; holding: number; sold: number };
  totalBuys: number;
  totalSells: number;
  totalProfitEth: string;
  currentPrice: number;
  isRunning: boolean;
}
```

---

#### `getInstance(): BotInstance`

Returns the bot instance data.

**Returns:** `BotInstance` - Current instance

---

## GridCalculator

Generates and manages grid positions.

### Static Methods

#### `generateGrid(currentPrice: number, config: GridConfig): Position[]`

Generates grid positions with continuous buy ranges.

**Parameters:**
- `currentPrice` - Current token price in ETH
- `config` - Grid configuration

**Returns:** `Position[]` - Array of positions (default 24)

**Grid Layout:**
- Position 0: buyMin=floor, buyMax=floor+step
- Position 1: buyMin=position0.buyMax, buyMax=position0.buyMax+step
- ...continuous coverage...
- Position N-1: buyMin=position[N-2].buyMax, buyMax=ceiling

**Example:**
```typescript
const positions = GridCalculator.generateGrid(0.000095, {
  numPositions: 24,
  floorPrice: 0.0000095,
  ceilingPrice: 0.00038,
  takeProfitPercent: 8,
  stopLossEnabled: false,
  stopLossPercent: 10
});
```

---

#### `findBuyPosition(positions: Position[], currentPrice: number, tolerance?: number): Position | null`

Finds a position that should buy at current price.

**Logic:**
- Returns position where `buyMin <= currentPrice <= buyMax`
- Position must have status 'EMPTY'
- Returns null if no matching position

**Parameters:**
- `positions` - Array of grid positions
- `currentPrice` - Current token price
- `tolerance` - Optional price tolerance buffer

**Returns:** `Position | null` - Buy opportunity or null

---

#### `findSellPositions(positions: Position[], currentPrice: number): Position[]`

Finds all positions that should sell at current price.

**Logic:**
- Returns positions where `currentPrice >= sellPrice`
- Position must have status 'HOLDING'
- Includes stop-loss triggers if enabled

**Parameters:**
- `positions` - Array of grid positions
- `currentPrice` - Current token price

**Returns:** `Position[]` - Array of sell opportunities

---

#### `findNextBuyOpportunity(positions: Position[], currentPrice: number): Position | null`

Finds the next buy opportunity above current price.

**Parameters:**
- `positions` - Array of grid positions
- `currentPrice` - Current token price

**Returns:** `Position | null` - Next empty position above price

---

#### `findNextSellOpportunity(positions: Position[]): Position | null`

Finds the next sell opportunity (lowest sell price among holding).

**Parameters:**
- `positions` - Array of grid positions

**Returns:** `Position | null` - Position with lowest sell price

---

#### `countActivePositions(positions: Position[]): number`

Counts holding positions.

**Parameters:**
- `positions` - Array of grid positions

**Returns:** `number` - Count of HOLDING positions

---

#### `validateContinuousCoverage(positions: Position[]): boolean`

Validates that grid has no gaps between positions.

**Parameters:**
- `positions` - Array of grid positions

**Returns:** `boolean` - True if continuous coverage

---

#### `formatPrice(price: number): string`

Formats price for display.

**Parameters:**
- `price` - Price value

**Returns:** `string` - Formatted price string

---

#### `calculateGridStats(positions: Position[]): object`

Calculates grid statistics.

**Parameters:**
- `positions` - Array of grid positions

**Returns:**
```typescript
{
  total: number;
  holding: number;
  sold: number;
  empty: number;
  avgProfit: number;
  totalProfitEth: string;
}
```

---

## ZeroXApi

Client for the 0x Protocol swap API with multi-chain support.

### Constructor

```typescript
constructor(apiKey?: string, chain?: Chain)
```

**Parameters:**
- `apiKey` - Optional 0x API key for higher rate limits
- `chain` - Chain to use ('base' | 'ethereum', default: 'base')

---

### Methods

#### `setChain(chain: Chain): void`

Updates the chain for API calls.

**Parameters:**
- `chain` - New chain ('base' | 'ethereum')

---

#### `getChainId(): number`

Gets the current chain ID.

**Returns:** `number` - Chain ID (8453 for Base, 1 for Ethereum)

---

#### `getBuyQuote(tokenAddress: string, ethAmount: string, takerAddress: string, slippageBps?: number): Promise<ZeroXQuote | null>`

Gets quote for buying tokens with ETH.

**Parameters:**
- `tokenAddress` - Token contract address
- `ethAmount` - ETH amount in wei
- `takerAddress` - Address executing swap
- `slippageBps` - Slippage in basis points (default: 100 = 1%)

**Returns:** `ZeroXQuote | null` - Quote or null if unavailable

---

#### `getSellQuote(tokenAddress: string, tokenAmount: string, takerAddress: string, slippageBps?: number): Promise<ZeroXQuote | null>`

Gets quote for selling tokens for ETH.

**Parameters:**
- `tokenAddress` - Token contract address
- `tokenAmount` - Token amount in wei
- `takerAddress` - Address executing swap
- `slippageBps` - Slippage in basis points (default: 100 = 1%)

**Returns:** `ZeroXQuote | null` - Quote or null if unavailable

---

#### `isProfitable(tokenAddress: string, tokenAmount: string, ethCostBasis: string, minProfitPercent: number, takerAddress: string): Promise<object>`

Checks if selling would be profitable.

**Parameters:**
- `tokenAddress` - Token contract address
- `tokenAmount` - Amount to sell (wei)
- `ethCostBasis` - Original ETH cost (wei)
- `minProfitPercent` - Minimum profit percentage required
- `takerAddress` - Address executing swap

**Returns:**
```typescript
{
  profitable: boolean;
  quote: ZeroXQuote | null;
  actualProfit: number;  // Actual profit percentage
}
```

---

#### `getTokenPrice(tokenAddress: string, takerAddress: string): Promise<number | null>`

Gets current token price in ETH per token.

**Parameters:**
- `tokenAddress` - Token contract address
- `takerAddress` - Taker address

**Returns:** `number | null` - Price in ETH or null

---

## JsonStorage

JSON file-based storage for bots and wallets.

### Constructor

```typescript
constructor(dataDir?: string)
```

**Parameters:**
- `dataDir` - Directory for storage files (default: './data')

---

### Methods

#### `init(): Promise<void>`

Initializes storage, creates directories if needed.

---

#### `saveBot(bot: BotInstance): Promise<void>`

Saves a bot instance to storage.

**Parameters:**
- `bot` - Bot instance to save

---

#### `getBot(id: string): Promise<BotInstance | null>`

Retrieves a bot by ID.

**Parameters:**
- `id` - Bot identifier

**Returns:** `BotInstance | null` - Bot or null if not found

---

#### `getAllBots(): Promise<BotInstance[]>`

Gets all stored bots.

**Returns:** `BotInstance[]` - Array of all bots

---

#### `deleteBot(id: string): Promise<void>`

Deletes a bot from storage.

**Parameters:**
- `id` - Bot identifier to delete

---

#### `saveWalletDictionary(dictionary: WalletDictionary): Promise<void>`

Saves the wallet dictionary.

**Parameters:**
- `dictionary` - Wallet dictionary to save

---

#### `getWalletDictionary(): Promise<WalletDictionary>`

Gets all wallets.

**Returns:** `WalletDictionary` - Dictionary of all wallets

---

#### `getPrimaryWalletId(): Promise<string | null>`

Gets the primary wallet ID.

**Returns:** `string | null` - Primary wallet ID or null

---

#### `getGlobalStats(): Promise<object>`

Gets global statistics across all bots.

**Returns:**
```typescript
{
  totalBots: number;
  runningBots: number;
  totalTrades: number;
  totalProfit: string;
}
```

---

## HeartbeatManager

Manages multiple bots with sequential execution.

### Constructor

```typescript
constructor(
  walletManager: WalletManager,
  zeroXApi: ZeroXApi,
  storage: JsonStorage,
  rpcUrl: string,
  heartbeatMs?: number,
  pnLTracker?: PnLTracker
)
```

---

### Methods

#### `start(): void`

Starts the heartbeat loop.

---

#### `stop(): void`

Stops the heartbeat loop.

---

#### `addBot(bot: BotInstance): Promise<void>`

Adds a bot to the heartbeat rotation.

**Parameters:**
- `bot` - Bot instance to add

---

#### `removeBot(botId: string): void`

Removes a bot from rotation.

**Parameters:**
- `botId` - Bot ID to remove

---

#### `loadBots(): Promise<void>`

Loads all enabled bots from storage.

---

#### `getStatus(): object`

Returns heartbeat status.

**Returns:**
```typescript
{
  isRunning: boolean;
  currentBotIndex: number;
  totalBots: number;
  timestamp: number;
}
```

---

## PriceOracle

Multi-source price validation using Chainlink and Uniswap V3.

### Constructor

```typescript
constructor(config: OracleConfig)
```

**Config:**
```typescript
interface OracleConfig {
  rpcUrl: string;
  minConfidence: number;    // 0-1 (default 0.8)
  allowFallback: boolean;   // Allow 0x fallback
  preferChainlink: boolean; // Prefer Chainlink over TWAP
  twapSeconds: number;      // TWAP window (default 1800)
}
```

---

### Methods

#### `getPrice(tokenAddress: string): Promise<PriceData>`

Gets validated price from multiple sources.

**Parameters:**
- `tokenAddress` - Token contract address

**Returns:** `PriceData` - Price with confidence

---

#### `validatePrice(tokenAddress: string, minConfidence?: number): Promise<ValidationResult>`

Validates price meets confidence threshold.

**Parameters:**
- `tokenAddress` - Token contract address
- `minConfidence` - Minimum confidence (0-1)

**Returns:**
```typescript
{
  valid: boolean;
  confidence: number;
  reason?: string;
}
```

---

#### `healthCheck(): Promise<HealthStatus>`

Checks oracle health and returns ETH price.

**Returns:**
```typescript
{
  healthy: boolean;
  ethPrice?: number;
  sources: string[];
}
```

---

## PnLTracker

Tracks profit and loss for tax reporting.

### Constructor

```typescript
constructor(storage: JsonStorage)
```

---

### Methods

#### `init(): Promise<void>`

Initializes the tracker.

---

#### `recordBuy(bot: BotInstance, positionId: number, amount: string, price: number, ethValue: string, gasCost: string, txHash: string): Promise<void>`

Records a buy transaction.

---

#### `recordSell(bot: BotInstance, positionId: number, amount: string, price: number, ethValue: string, gasCost: string, profit: string, profitPercent: number, txHash: string): Promise<void>`

Records a sell transaction.

---

#### `getDailyPnL(date: string): Promise<PnLSummary>`

Gets P&L for a specific date.

**Parameters:**
- `date` - Date string (YYYY-MM-DD)

**Returns:** `PnLSummary` - Daily P&L data

---

#### `getCumulativePnL(): Promise<PnLCumulative>`

Gets cumulative P&L across all time.

**Returns:** `PnLCumulative` - Cumulative P&L data

---

#### `exportToCSV(filters?: ExportFilters): Promise<string>`

Exports trades to CSV format.

**Parameters:**
- `filters` - Optional date range filters

**Returns:** `string` - Path to CSV file

---

## TelegramNotifier

Sends notifications via Telegram Bot API.

### Static Methods

#### `getInstance(): TelegramNotifier`

Gets singleton instance.

**Returns:** `TelegramNotifier` - Singleton instance

---

#### `configure(config: TelegramConfig): void`

Configures the notifier.

**Config:**
```typescript
interface TelegramConfig {
  botToken: string;
  chatId: string;
  alertLevel: AlertLevel;
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

## BotDaemon

Manages persistent background operation.

### Constructor

```typescript
constructor()
```

---

### Methods

#### `isRunning(): boolean`

Checks if daemon is running.

**Returns:** `boolean` - True if daemon process exists

---

#### `getStatus(): DaemonStatus`

Gets daemon status.

**Returns:**
```typescript
{
  running: boolean;
  pid?: number;
  uptime?: string;
}
```

---

#### `start(): boolean`

Starts the daemon process.

**Returns:** `boolean` - True if started successfully

---

#### `stop(): boolean`

Stops the daemon process.

**Returns:** `boolean` - True if stopped successfully

---

#### `restart(): boolean`

Restarts the daemon.

**Returns:** `boolean` - True if restart initiated

---

#### `getLogs(lines?: number): string`

Gets recent daemon logs.

**Parameters:**
- `lines` - Number of lines to return (default: 50)

**Returns:** `string` - Log output

---

## NotificationService

Unified notification service singleton.

### Static Methods

#### `getInstance(): NotificationService`

Gets singleton instance.

**Returns:** `NotificationService` - Singleton instance

---

#### `initializeFromEnv(): void`

Initializes from environment variables.

Reads:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ALERT_LEVEL`

---

#### `isConfigured(): boolean`

Checks if notifications are configured.

**Returns:** `boolean` - True if configured

---

#### `notifyTradeExecuted(bot: BotInstance, amount: string, cost: string, positionId: number): Promise<void>`

Notifies about trade execution.

---

#### `notifyProfit(bot: BotInstance, profitPercent: number, profitEth: string, receivedEth: string, positionId: number): Promise<void>`

Notifies about profit taken.

---

#### `notifyError(bot: BotInstance, error: string): Promise<void>`

Notifies about error.

---

#### `notifyBotStopped(bot: BotInstance, errorCount: number, reason: string): Promise<void>`

Notifies when bot stops due to errors.

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
class StorageError extends Error {}
```

---

## Examples

### Complete Multi-Chain Setup

```typescript
import { WalletManager } from './wallet/WalletManager.js';
import { TradingBot } from './bot/TradingBot.js';
import { ZeroXApi } from './api/ZeroXApi.js';
import { JsonStorage } from './storage/JsonStorage.js';
import { GridCalculator } from './grid/GridCalculator.js';
import { BotInstance, Chain } from './types/index.js';

// Initialize
const storage = new JsonStorage();
const walletManager = new WalletManager();
await walletManager.initialize('masterPassword');

// Create wallet
const mainWallet = walletManager.generateMainWallet('Main Trading');

// Setup 0x API for Base
const zeroXApi = new ZeroXApi(process.env.ZEROX_API_KEY, 'base');

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
  buyAmount: 0.001,
  heartbeatMs: 1000
};

// Generate positions
const positions = GridCalculator.generateGrid(0.000095, config);

// Create bot instance for Base
const botInstance: BotInstance = {
  id: 'bot-' + Date.now(),
  name: 'COMPUTE-Grid-Base',
  tokenAddress: '0x696381f39F17cAD67032f5f52A4924ce84e51BA3',
  tokenSymbol: 'COMPUTE',
  chain: 'base' as Chain,
  walletAddress: mainWallet.address,
  useMainWallet: true,
  config,
  positions,
  totalBuys: 0,
  totalSells: 0,
  totalProfitEth: '0',
  totalProfitUsd: 0,
  isRunning: false,
  enabled: true,
  lastHeartbeat: 0,
  currentPrice: 0.000095,
  createdAt: Date.now(),
  lastUpdated: Date.now()
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

### Volume Mode Setup

```typescript
// Volume bot configuration
const volumeConfig = {
  ...baseConfig,
  minProfitPercent: 0,      // Break-even for volume
  moonBagPercent: 0,        // Sell 100%
  buysEnabled: true,
  sellsEnabled: true
};

const volumeBotInstance: BotInstance = {
  ...baseInstance,
  name: 'VOLUME-COMPUTE',
  config: volumeConfig,
  // Volume mode state
  volumeBuysInCycle: 0,
  volumeAccumulatedTokens: '0',
  volumeCycleCount: 0
};
```

---

**For more examples, see the [tests/](../tests/) directory.**

**For feature documentation, see [FEATURES.md](./FEATURES.md)**
