// src/analytics/PnLTracker.ts

import { BotInstance } from '../types/index.js';
import { JsonStorage } from '../storage/JsonStorage.js';

export interface TradeRecord {
  id: string;
  botId: string;
  botName: string;
  tokenSymbol: string;
  tokenAddress: string;
  action: 'buy' | 'sell';
  amount: string;          // Token amount in wei
  price: number;           // Price in ETH per token
  ethValue: string;        // ETH value in wei
  gasCost: string;         // Gas cost in wei
  profit?: string;         // Profit in wei (for sells)
  profitPercent?: number;  // Profit percentage (for sells)
  timestamp: number;
  txHash: string;
  positionId?: number;
}

export interface DailyPnL {
  date: string;            // YYYY-MM-DD
  botId: string;
  buys: number;
  sells: number;
  profitEth: string;       // Total profit in wei
  volumeEth: string;       // Total volume in wei
}

export interface CumulativePnL {
  totalTrades: number;
  totalBuys: number;
  totalSells: number;
  totalProfitEth: string;
  totalVolumeEth: string;
  startDate: string;
  endDate: string;
}

/**
 * Tracks profit and loss for trading bots
 */
export class PnLTracker {
  private storage: JsonStorage;
  private trades: TradeRecord[] = [];

  constructor(storage: JsonStorage) {
    this.storage = storage;
  }

  /**
   * Initialize and load trade history
   */
  async init(): Promise<void> {
    this.trades = await this.storage.getTradeHistory();
  }

  /**
   * Record a new trade
   */
  async recordTrade(record: TradeRecord): Promise<void> {
    this.trades.push(record);
    await this.storage.saveTrade(record);
  }

  /**
   * Record a buy trade
   */
  async recordBuy(
    bot: BotInstance,
    positionId: number,
    amount: string,
    price: number,
    ethCost: string,
    gasCost: string,
    txHash: string
  ): Promise<void> {
    await this.recordTrade({
      id: `${bot.id}-${Date.now()}`,
      botId: bot.id,
      botName: bot.name,
      tokenSymbol: bot.tokenSymbol,
      tokenAddress: bot.tokenAddress,
      action: 'buy',
      amount,
      price,
      ethValue: ethCost,
      gasCost,
      timestamp: Date.now(),
      txHash,
      positionId,
    });
  }

  /**
   * Record a sell trade
   */
  async recordSell(
    bot: BotInstance,
    positionId: number,
    amount: string,
    price: number,
    ethReceived: string,
    gasCost: string,
    profit: string,
    profitPercent: number,
    txHash: string
  ): Promise<void> {
    await this.recordTrade({
      id: `${bot.id}-${Date.now()}`,
      botId: bot.id,
      botName: bot.name,
      tokenSymbol: bot.tokenSymbol,
      tokenAddress: bot.tokenAddress,
      action: 'sell',
      amount,
      price,
      ethValue: ethReceived,
      gasCost,
      profit,
      profitPercent,
      timestamp: Date.now(),
      txHash,
      positionId,
    });
  }

  /**
   * Get trades for a specific bot
   */
  getTradesByBot(botId: string): TradeRecord[] {
    return this.trades.filter(t => t.botId === botId);
  }

  /**
   * Get trades within a date range
   */
  getTradesByDateRange(startDate: Date, endDate: Date): TradeRecord[] {
    const start = startDate.getTime();
    const end = endDate.getTime();
    return this.trades.filter(t => t.timestamp >= start && t.timestamp <= end);
  }

  /**
   * Get daily P&L summary
   */
  getDailyPnL(date: Date): DailyPnL[] {
    const dateStr = date.toISOString().split('T')[0];
    const dayStart = new Date(dateStr).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const dayTrades = this.trades.filter(
      t => t.timestamp >= dayStart && t.timestamp < dayEnd
    );

    const byBot = new Map<string, TradeRecord[]>();
    for (const trade of dayTrades) {
      const existing = byBot.get(trade.botId) || [];
      existing.push(trade);
      byBot.set(trade.botId, existing);
    }

    return Array.from(byBot.entries()).map(([botId, trades]) => {
      const botName = trades[0]?.botName || botId;
      const buys = trades.filter(t => t.action === 'buy');
      const sells = trades.filter(t => t.action === 'sell');
      const profit = sells.reduce((sum, t) => sum + BigInt(t.profit || '0'), BigInt(0));
      const volume = trades.reduce((sum, t) => sum + BigInt(t.ethValue), BigInt(0));

      return {
        date: dateStr,
        botId,
        buys: buys.length,
        sells: sells.length,
        profitEth: profit.toString(),
        volumeEth: volume.toString(),
      };
    });
  }

  /**
   * Get cumulative P&L across all time
   */
  getCumulativePnL(): CumulativePnL {
    const buys = this.trades.filter(t => t.action === 'buy');
    const sells = this.trades.filter(t => t.action === 'sell');
    const profit = sells.reduce((sum, t) => sum + BigInt(t.profit || '0'), BigInt(0));
    const volume = this.trades.reduce((sum, t) => sum + BigInt(t.ethValue), BigInt(0));

    const timestamps = this.trades.map(t => t.timestamp);

    return {
      totalTrades: this.trades.length,
      totalBuys: buys.length,
      totalSells: sells.length,
      totalProfitEth: profit.toString(),
      totalVolumeEth: volume.toString(),
      startDate: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : new Date().toISOString(),
      endDate: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Get all trade history
   */
  getAllTrades(): TradeRecord[] {
    return [...this.trades];
  }

  /**
   * Clear all trade history (use with caution)
   */
  async clearHistory(): Promise<void> {
    this.trades = [];
    await this.storage.clearTradeHistory();
  }
}
