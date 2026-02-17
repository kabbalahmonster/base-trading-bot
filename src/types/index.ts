// src/types/index.ts

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
  
  // Timing
  heartbeatMs: number;         // Default: 1000ms
  skipHeartbeats: number;      // Default: 0 (run every heartbeat)
}

export interface Position {
  id: number;
  buyPrice: number;           // Target buy price (ETH per token)
  sellPrice: number;          // Target sell price (ETH per token)
  stopLossPrice: number;      // Stop loss price
  
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
}

export interface MainWallet {
  address: string;
  encryptedPrivateKey: string;
  createdAt: number;
}

export interface WalletDictionary {
  [botId: string]: WalletData;
}

export interface BotStorage {
  mainWallet?: MainWallet;
  walletDictionary: WalletDictionary;
  bots: BotInstance[];
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
