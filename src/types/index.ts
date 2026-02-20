/**
 * @fileoverview Type definitions for the Base Grid Trading Bot
 * @module types
 * @version 1.4.0
 */

/**
 * Supported blockchain networks
 * @typedef {('base' | 'ethereum')} Chain
 * @description 'base' - Ethereum L2 with low fees, 'ethereum' - Mainnet with highest liquidity
 */
export type Chain = 'base' | 'ethereum';

/**
 * Telegram notification filtering levels
 * @typedef {('all' | 'trades-only' | 'errors-only' | 'none')} AlertLevel
 */
export type AlertLevel = 'all' | 'trades-only' | 'errors-only' | 'none';

/**
 * Configuration for Telegram notifications per bot
 * @interface NotificationConfig
 */
export interface NotificationConfig {
  /** Whether notifications are enabled */
  enabled: boolean;
  /** Level of alerts to receive */
  alertLevel: AlertLevel;
  /** If true, uses global notification settings instead of per-bot */
  useGlobal: boolean;
}

/**
 * Complete configuration for grid trading strategy
 * @interface GridConfig
 * @description Defines all parameters for grid trading including range, profit targets, and safety settings
 */
export interface GridConfig {
  // Grid settings
  /** Number of grid positions (default: 24) */
  numPositions: number;
  /** Lowest buy price in ETH (default: currentPrice / 10) */
  floorPrice: number;
  /** Highest buy price in ETH (default: currentPrice * 4) */
  ceilingPrice: number;
  /** Use market cap instead of price (default: false) */
  useMarketCap: boolean;

  // Trading settings
  /** Target profit percentage per position (default: 8%) */
  takeProfitPercent: number;
  /** Stop loss percentage below buyMin (default: 10%) */
  stopLossPercent: number;
  /** Enable stop loss protection (default: false) */
  stopLossEnabled: boolean;

  // Mode settings
  /** Enable buy operations (default: true) */
  buysEnabled: boolean;
  /** Enable sell operations (default: true) */
  sellsEnabled: boolean;

  // Moon bag settings
  /** Keep percentage of tokens on sell (default: true) */
  moonBagEnabled: boolean;
  /** Percentage to keep as moon bag (default: 1%, max: 50%) */
  moonBagPercent: number;

  // Safety settings
  /** Minimum profit after gas costs (default: 2%) */
  minProfitPercent: number;
  /** Maximum concurrent holding positions (default: 4) */
  maxActivePositions: number;

  // Buy amount settings
  /** ETH amount per buy - 0 for auto-calculate */
  buyAmount: number;
  /** Use fixed amount vs auto-distribute (default: false) */
  useFixedBuyAmount: boolean;

  // Price Oracle settings
  /** Enable Chainlink + Uniswap TWAP validation (default: false) */
  usePriceOracle?: boolean;
  /** Minimum price confidence 0-1 (default: 0.8 = 80%) */
  minPriceConfidence?: number;

  // Trailing Stop Loss settings
  /** Use trailing stop instead of fixed (default: false) */
  useTrailingStopLoss?: boolean;
  /** Percentage below peak to trail (default: 5%) */
  trailingStopPercent?: number;
  /** Min profit before trailing activates (default: 3%) */
  trailingStopActivation?: number;

  // Circuit Breaker settings (per-bot override)
  /** Enable circuit breaker (default: true) */
  useCircuitBreaker?: boolean;

  // Timing
  /** Milliseconds between heartbeats (default: 1000) */
  heartbeatMs: number;
  /** Number of heartbeats to skip (default: 0) */
  skipHeartbeats: number;

  // Volume mode settings
  /** Enable volume generation mode (default: false) */
  volumeMode?: boolean;
  /** Number of buys before distribution in volume mode (default: 3) */
  volumeBuysPerCycle?: number;
  /** ETH amount per buy in volume mode (default: 0.001) */
  volumeBuyAmount?: number;
}

/**
 * Represents a single grid position with buy/sell range and execution data
 * @interface Position
 * @description Each position covers a continuous buy range [buyMin, buyMax] with a target sell price
 */
export interface Position {
  /** Position index in the grid */
  id: number;
  // Range-based buy zone (covers entire chart continuously)
  /** Lower bound of buy range in ETH per token */
  buyMin: number;
  /** Upper bound of buy range in ETH per token */
  buyMax: number;
  // Legacy support (buyPrice = buyMax for backward compatibility)
  /** Kept for compatibility - equals buyMax */
  buyPrice: number;
  /** Target sell price = buyMax * (1 + takeProfitPercent/100) */
  sellPrice: number;
  /** Stop loss trigger = buyMin * (1 - stopLossPercent/100) */
  stopLossPrice: number;

  // State
  /** Current position status */
  status: 'EMPTY' | 'HOLDING' | 'SOLD';

  // Buy data (populated when bought)
  /** Transaction hash of buy execution */
  buyTxHash?: string;
  /** Unix timestamp when bought */
  buyTimestamp?: number;
  /** Raw token amount received in wei */
  tokensReceived?: string;
  /** ETH spent including gas in wei */
  ethCost?: string;

  // Sell data (populated when sold)
  /** Transaction hash of sell execution */
  sellTxHash?: string;
  /** Unix timestamp when sold */
  sellTimestamp?: number;
  /** ETH received from sale in wei */
  ethReceived?: string;
  /** Net profit in ETH in wei */
  profitEth?: string;
  /** Profit percentage relative to cost */
  profitPercent?: number;
}

/**
 * Complete bot instance with state, configuration, and statistics
 * @interface BotInstance
 * @description Represents a single trading bot with all its configuration, state, and performance data
 */
export interface BotInstance {
  /** Unique identifier for the bot */
  id: string;
  /** Display name for the bot */
  name: string;
  /** Token contract address (0x...) */
  tokenAddress: string;
  /** Token symbol (e.g., 'COMPUTE') */
  tokenSymbol: string;

  // Chain selection
  /** Blockchain to trade on ('base' | 'ethereum') */
  chain: Chain;

  // Wallet
  /** Ethereum address for trading */
  walletAddress: string;
  /** If true, uses main wallet instead of bot-specific wallet */
  useMainWallet: boolean;

  // Grid
  /** Trading configuration */
  config: GridConfig;
  /** Array of grid positions */
  positions: Position[];

  // Stats
  /** Total number of buy executions */
  totalBuys: number;
  /** Total number of sell executions */
  totalSells: number;
  /** Cumulative profit in ETH (wei string) */
  totalProfitEth: string;
  /** Cumulative profit in USD */
  totalProfitUsd: number;

  // Notifications
  /** Per-bot notification settings */
  notifications?: NotificationConfig;

  // State
  /** Whether bot is currently running */
  isRunning: boolean;
  /** Whether bot is enabled (can be disabled without deleting) */
  enabled: boolean;
  /** Unix timestamp of last heartbeat */
  lastHeartbeat: number;
  /** Last known token price */
  currentPrice: number;
  /** Consecutive error count for auto-stop */
  consecutiveErrors?: number;
  /** Unix timestamp of last trade */
  lastTradeAt?: number;

  // Volume Bot Mode State
  /** Current buy count in volume cycle */
  volumeBuysInCycle?: number;
  /** Total tokens accumulated in current cycle (wei string) */
  volumeAccumulatedTokens?: string;
  /** Number of completed volume cycles */
  volumeCycleCount?: number;

  // Timing
  /** Unix timestamp when bot was created */
  createdAt: number;
  /** Unix timestamp of last update */
  lastUpdated: number;
}

/**
 * Wallet information with encrypted private key
 * @interface WalletData
 * @description Stores wallet address and encrypted private key with metadata
 */
export interface WalletData {
  /** Ethereum address (0x...) */
  address: string;
  /** PBKDF2 + AES-256-GCM encrypted private key */
  encryptedPrivateKey: string;
  /** Unix timestamp when created */
  createdAt: number;
  /** Optional display name for the wallet */
  name?: string;
  /** Wallet type: 'main' (user) or 'bot' (auto-generated) */
  type: 'main' | 'bot';
}

/**
 * Dictionary of wallets indexed by wallet ID
 * @interface WalletDictionary
 */
export interface WalletDictionary {
  [walletId: string]: WalletData;
}

/**
 * Root storage structure for all bot data
 * @interface BotStorage
 */
export interface BotStorage {
  /** @deprecated Legacy field for backward compatibility */
  mainWallet?: WalletData;
  /** Dictionary of all wallets */
  walletDictionary: WalletDictionary;
  /** Array of all bot instances */
  bots: BotInstance[];
  /** ID of the primary/main wallet */
  primaryWalletId?: string;
  /** Circuit breaker state */
  circuitBreaker?: any;
  /** Trailing stop loss states per bot */
  trailingStopStates?: Record<string, any>;
  /** General configuration settings */
  config?: Record<string, any>;
}

/**
 * Price information from oracle sources
 * @interface PriceData
 */
export interface PriceData {
  /** Token price in ETH */
  priceEth: number;
  /** Token price in USD */
  priceUsd: number;
  /** Market capitalization */
  marketCap: number;
  /** Unix timestamp when price was fetched */
  timestamp: number;
}

/**
 * Swap quote from 0x API
 * @interface ZeroXQuote
 * @description Contains all data needed to execute a swap through 0x Protocol
 */
export interface ZeroXQuote {
  /** Token address to buy */
  buyToken: string;
  /** Token address to sell */
  sellToken: string;
  /** Amount to buy in wei */
  buyAmount: string;
  /** Amount to sell in wei */
  sellAmount: string;
  /** Price ratio */
  price: string;
  /** Estimated gas units */
  gas: string;
  /** Gas price in wei */
  gasPrice: string;
  /** Contract address to call */
  to: string;
  /** Transaction calldata */
  data: string;
  /** ETH value to send */
  value: string;
  /** Address to approve for spending */
  allowanceTarget?: string;
}

/**
 * Result of a buy or sell execution
 * @interface TradeResult
 */
export interface TradeResult {
  /** Whether the trade was successful */
  success: boolean;
  /** Transaction hash if successful */
  txHash?: string;
  /** Gas used for the transaction */
  gasUsed?: bigint;
  /** Gas cost in ETH (wei string) */
  gasCostEth?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Context information for heartbeat execution
 * @interface HeartbeatContext
 */
export interface HeartbeatContext {
  /** Index of current bot being processed */
  currentBotIndex: number;
  /** Total number of bots in rotation */
  totalBots: number;
  /** Unix timestamp of heartbeat */
  timestamp: number;
}
