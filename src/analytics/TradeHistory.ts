// src/analytics/TradeHistory.ts

import { TradeRecord } from './PnLTracker.js';
import { JsonStorage } from '../storage/JsonStorage.js';

/**
 * Manages trade history storage and queries
 */
export class TradeHistory {
  private storage: JsonStorage;

  constructor(storage: JsonStorage) {
    this.storage = storage;
  }

  /**
   * Get all trades
   */
  async getAllTrades(): Promise<TradeRecord[]> {
    return await this.storage.getTradeHistory();
  }

  /**
   * Get trades by bot ID
   */
  async getTradesByBot(botId: string): Promise<TradeRecord[]> {
    const all = await this.getAllTrades();
    return all.filter(t => t.botId === botId);
  }

  /**
   * Get unique bot IDs from trade history
   */
  async getBotIds(): Promise<string[]> {
    const all = await this.getAllTrades();
    const ids = new Set(all.map(t => t.botId));
    return Array.from(ids);
  }

  /**
   * Get trades by date range
   */
  async getTradesByDateRange(start: Date, end: Date): Promise<TradeRecord[]> {
    const all = await this.getAllTrades();
    const startTime = start.getTime();
    const endTime = end.getTime();
    return all.filter(t => t.timestamp >= startTime && t.timestamp <= endTime);
  }

  /**
   * Get summary stats for a bot
   */
  async getBotStats(botId: string): Promise<{
    totalTrades: number;
    buys: number;
    sells: number;
    totalProfit: string;
  }> {
    const trades = await this.getTradesByBot(botId);
    const buys = trades.filter(t => t.action === 'buy');
    const sells = trades.filter(t => t.action === 'sell');
    const profit = sells.reduce((sum, t) => sum + BigInt(t.profit || '0'), BigInt(0));

    return {
      totalTrades: trades.length,
      buys: buys.length,
      sells: sells.length,
      totalProfit: profit.toString(),
    };
  }
}
