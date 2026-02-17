// src/analytics/TradeHistory.ts

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

/**
 * Trade record structure for comprehensive trade logging
 * Stores all relevant data for P&L calculations and tax reporting
 */
export interface TradeRecord {
  // Unique identifiers
  id: string;
  botId: string;
  botName: string;
  
  // Trade details
  action: 'buy' | 'sell';
  tokenAddress: string;
  tokenSymbol: string;
  
  // Amounts (stored as strings for precision - wei for tokens, wei for ETH)
  amount: string;           // Token amount in wei
  amountEth: string;        // ETH amount in wei (cost for buy, received for sell)
  price: number;            // Price in ETH per token (for reference)
  
  // Gas costs
  gasCost: string;          // Gas cost in wei
  gasUsed: string;          // Gas units used
  gasPrice: string;         // Gas price in wei
  
  // Profit/loss (for sells)
  profit?: string;          // Profit in wei (sell only)
  profitPercent?: number;   // Profit percentage (sell only)
  
  // Position reference
  positionId?: number;
  
  // Transaction details
  txHash: string;
  blockNumber?: number;
  
  // Timestamps (UTC)
  timestamp: number;        // Unix timestamp in milliseconds
  date: string;             // ISO date string for easy querying
}

/**
 * Database structure for trade history
 */
interface TradeHistoryDb {
  trades: TradeRecord[];
  version: number;
}

const DEFAULT_DB: TradeHistoryDb = {
  trades: [],
  version: 1,
};

/**
 * TradeHistory - Structured trade logging for P&L tracking and tax reporting
 * 
 * Features:
 * - Record all trades with comprehensive details
 * - Query trades by bot, date range, or token
 * - Support for tax reporting with UTC timestamps
 * - Persistent storage using lowdb
 */
export class TradeHistory {
  private db: Low<TradeHistoryDb>;

  constructor(filePath: string = './trade-history.json') {
    const adapter = new JSONFile<TradeHistoryDb>(filePath);
    this.db = new Low(adapter, DEFAULT_DB);
  }

  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    await this.db.read();
    
    if (!this.db.data) {
      this.db.data = DEFAULT_DB;
    }
    
    // Ensure trades array exists
    if (!this.db.data.trades) {
      this.db.data.trades = [];
    }
    
    await this.db.write();
  }

  /**
   * Record a new trade
   */
  async recordTrade(trade: Omit<TradeRecord, 'id' | 'timestamp' | 'date'>): Promise<TradeRecord> {
    if (!this.db.data) await this.init();

    const timestamp = Date.now();
    const date = new Date(timestamp).toISOString();
    
    const tradeRecord: TradeRecord = {
      ...trade,
      id: this.generateId(),
      timestamp,
      date,
    };

    this.db.data!.trades.push(tradeRecord);
    await this.db.write();

    return tradeRecord;
  }

  /**
   * Record a buy trade
   */
  async recordBuy(params: {
    botId: string;
    botName: string;
    tokenAddress: string;
    tokenSymbol: string;
    amount: string;        // Token amount in wei
    amountEth: string;     // ETH cost in wei
    price: number;         // Price ETH/token
    gasCost: string;       // Gas cost in wei
    gasUsed: string;
    gasPrice: string;
    positionId: number;
    txHash: string;
    blockNumber?: number;
  }): Promise<TradeRecord> {
    return this.recordTrade({
      ...params,
      action: 'buy',
    });
  }

  /**
   * Record a sell trade
   */
  async recordSell(params: {
    botId: string;
    botName: string;
    tokenAddress: string;
    tokenSymbol: string;
    amount: string;        // Token amount in wei
    amountEth: string;     // ETH received in wei
    price: number;         // Price ETH/token
    gasCost: string;       // Gas cost in wei
    gasUsed: string;
    gasPrice: string;
    profit: string;        // Profit in wei
    profitPercent: number;
    positionId: number;
    txHash: string;
    blockNumber?: number;
  }): Promise<TradeRecord> {
    return this.recordTrade({
      ...params,
      action: 'sell',
    });
  }

  /**
   * Get all trades
   */
  async getAllTrades(): Promise<TradeRecord[]> {
    if (!this.db.data) await this.init();
    return [...this.db.data!.trades].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get trades by bot ID
   */
  async getTradesByBot(botId: string): Promise<TradeRecord[]> {
    if (!this.db.data) await this.init();
    return this.db.data!.trades
      .filter(t => t.botId === botId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get trades by date range (inclusive)
   * @param startDate - Start date (Unix timestamp in ms)
   * @param endDate - End date (Unix timestamp in ms)
   */
  async getTradesByDateRange(startDate: number, endDate: number): Promise<TradeRecord[]> {
    if (!this.db.data) await this.init();
    return this.db.data!.trades
      .filter(t => t.timestamp >= startDate && t.timestamp <= endDate)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get trades by token
   */
  async getTradesByToken(tokenAddress: string): Promise<TradeRecord[]> {
    if (!this.db.data) await this.init();
    return this.db.data!.trades
      .filter(t => t.tokenAddress.toLowerCase() === tokenAddress.toLowerCase())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get trades by action type (buy/sell)
   */
  async getTradesByAction(action: 'buy' | 'sell'): Promise<TradeRecord[]> {
    if (!this.db.data) await this.init();
    return this.db.data!.trades
      .filter(t => t.action === action)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get the last N trades
   */
  async getRecentTrades(count: number): Promise<TradeRecord[]> {
    if (!this.db.data) await this.init();
    return this.db.data!.trades
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);
  }

  /**
   * Get unique bot IDs that have trades
   */
  async getBotIds(): Promise<string[]> {
    if (!this.db.data) await this.init();
    const botIds = new Set(this.db.data!.trades.map(t => t.botId));
    return Array.from(botIds);
  }

  /**
   * Get unique tokens that have been traded
   */
  async getTradedTokens(): Promise<Array<{ address: string; symbol: string }>> {
    if (!this.db.data) await this.init();
    const tokens = new Map<string, string>();
    
    for (const trade of this.db.data!.trades) {
      if (!tokens.has(trade.tokenAddress.toLowerCase())) {
        tokens.set(trade.tokenAddress.toLowerCase(), trade.tokenSymbol);
      }
    }
    
    return Array.from(tokens.entries()).map(([address, symbol]) => ({ address, symbol }));
  }

  /**
   * Get trade statistics
   */
  async getStats(): Promise<{
    totalTrades: number;
    totalBuys: number;
    totalSells: number;
    totalProfitEth: string;
    uniqueBots: number;
    dateRange: { earliest: number; latest: number } | null;
  }> {
    if (!this.db.data) await this.init();
    
    const trades = this.db.data!.trades;
    const buys = trades.filter(t => t.action === 'buy');
    const sells = trades.filter(t => t.action === 'sell');
    
    const totalProfitEth = sells.reduce((sum, t) => {
      return sum + BigInt(t.profit || '0');
    }, BigInt(0)).toString();

    const timestamps = trades.map(t => t.timestamp);
    
    return {
      totalTrades: trades.length,
      totalBuys: buys.length,
      totalSells: sells.length,
      totalProfitEth,
      uniqueBots: new Set(trades.map(t => t.botId)).size,
      dateRange: timestamps.length > 0 ? {
        earliest: Math.min(...timestamps),
        latest: Math.max(...timestamps),
      } : null,
    };
  }

  /**
   * Delete a trade by ID
   */
  async deleteTrade(tradeId: string): Promise<boolean> {
    if (!this.db.data) await this.init();
    
    const index = this.db.data!.trades.findIndex(t => t.id === tradeId);
    if (index >= 0) {
      this.db.data!.trades.splice(index, 1);
      await this.db.write();
      return true;
    }
    return false;
  }

  /**
   * Clear all trade history (use with caution!)
   */
  async clearAll(): Promise<void> {
    if (!this.db.data) await this.init();
    this.db.data!.trades = [];
    await this.db.write();
  }

  /**
   * Export all trades to a plain object
   */
  async export(): Promise<TradeRecord[]> {
    return this.getAllTrades();
  }

  /**
   * Import trades (appends to existing)
   */
  async import(trades: TradeRecord[]): Promise<void> {
    if (!this.db.data) await this.init();
    this.db.data!.trades.push(...trades);
    await this.db.write();
  }

  /**
   * Generate a unique trade ID
   */
  private generateId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
