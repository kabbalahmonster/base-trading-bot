// src/types/index.ts

export type AlertLevel = 'all' | 'trades-only' | 'errors-only' | 'none';

export interface NotificationConfig {
  enabled: boolean;
  alertLevel: AlertLevel;
  // Per-bot override (if not set, uses global)
  useGlobal: boolean;
}

export interface GridConfig {
  // Grid settings
  numPositions: number;        // Default: 24
  floorPrice: number;          // In ETH (default: currentPrice / 10)
  ceilingPrice: number;        // In ETH (default: currentPrice * 4)
  useMarketCap: boolean;       // Default: false (use price)
  
  // Trading settings
  takeProfitPercent: number;   // Default: 8%
  stopLossPercent: number;     // Default: 10%
  stopLossEnabled: boolean;    // Default: false
  
  // Mode settings
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
  
  // Timing
  heartbeatMs: number;         // Default: 1000ms
  skipHeartbeats: number;      // Default: 0 (run every heartbeat)
}

export interface Position {
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

export interface BotInstance {
  id: string;
  name: string;
  tokenAddress: string;
  tokenSymbol: string;
  
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
  
  // Timing
  createdAt: number;
  lastUpdated: number;
}

export interface WalletData {
  address: string;
  encryptedPrivateKey: string;
  createdAt: number;
  name?: string;  // Optional name for identification
  type: 'main' | 'bot';
}

export interface WalletDictionary {
  [walletId: string]: WalletData;
}

export interface BotStorage {
  // Legacy: keeping for backward compatibility
  mainWallet?: WalletData;
  // New: all wallets in one dictionary
  walletDictionary: WalletDictionary;
  bots: BotInstance[];
  // Track which wallet is the "primary" main wallet
  primaryWalletId?: string;
}

export interface PriceData {
  priceEth: number;
  priceUsd: number;
  marketCap: number;
  timestamp: number;
}

export interface ZeroXQuote {
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

export interface TradeResult {
  success: boolean;
  txHash?: string;
  gasUsed?: bigint;
  gasCostEth?: string;
  error?: string;
}

export interface HeartbeatContext {
  currentBotIndex: number;
  totalBots: number;
  timestamp: number;
}
