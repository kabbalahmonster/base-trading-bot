// src/analytics/BotLeaderboard.ts
// Performance leaderboard and advanced analytics for all bots

import { BotInstance } from '../types/index.js';
import { TradeRecord } from './PnLTracker.js';

export interface BotPerformance {
  botId: string;
  botName: string;
  tokenSymbol: string;
  
  // Basic stats
  totalTrades: number;
  totalBuys: number;
  totalSells: number;
  
  // P&L
  totalProfitEth: string;
  totalProfitUsd: number;
  avgProfitPerTrade: number;
  
  // Win rate
  winningTrades: number;
  losingTrades: number;
  winRate: number;  // Percentage
  
  // Hold time
  avgHoldTimeMs: number;
  shortestHoldMs: number;
  longestHoldMs: number;
  
  // Efficiency
  profitFactor: number;  // Gross profit / Gross loss
  expectancy: number;    // Average expected return per trade
  
  // Current state
  activePositions: number;
  currentPrice: number;
  isRunning: boolean;
  
  // Time-based
  createdAt: number;
  lastTradeAt: number | null;
  daysActive: number;
  
  // Rankings
  profitRank: number;
  winRateRank: number;
  efficiencyRank: number;
  overallRank: number;
}

export interface LeaderboardSummary {
  totalBots: number;
  activeBots: number;
  totalProfitEth: string;
  totalTrades: number;
  avgWinRate: number;
  bestPerformer: string;
  worstPerformer: string;
  period: 'daily' | 'weekly' | 'monthly' | 'all-time';
}

export class BotLeaderboard {
  private performances: Map<string, BotPerformance> = new Map();
  private trades: TradeRecord[] = [];

  /**
   * Load trade history and calculate performance
   */
  loadData(bots: BotInstance[], trades: TradeRecord[]): void {
    this.trades = trades;
    this.performances.clear();

    for (const bot of bots) {
      const performance = this.calculatePerformance(bot);
      this.performances.set(bot.id, performance);
    }

    // Calculate rankings
    this.calculateRankings();
  }

  /**
   * Calculate performance metrics for a single bot
   */
  private calculatePerformance(bot: BotInstance): BotPerformance {
    const botTrades = this.trades.filter(t => t.botId === bot.id);
    const sells = botTrades.filter(t => t.action === 'sell');
    const buys = botTrades.filter(t => t.action === 'buy');

    // Calculate win rate
    let winningTrades = 0;
    let losingTrades = 0;
    let grossProfit = BigInt(0);
    let grossLoss = BigInt(0);

    for (const sell of sells) {
      const profit = BigInt(sell.profit || '0');
      if (profit > 0) {
        winningTrades++;
        grossProfit += profit;
      } else if (profit < 0) {
        losingTrades++;
        grossLoss += (-profit);
      }
    }

    const totalTrades = sells.length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    // Calculate hold times
    const holdTimes: number[] = [];
    for (const sell of sells) {
      if (sell.positionId !== undefined) {
        const buy = buys.find(b => b.positionId === sell.positionId);
        if (buy) {
          const holdTime = sell.timestamp - buy.timestamp;
          holdTimes.push(holdTime);
        }
      }
    }

    const avgHoldTimeMs = holdTimes.length > 0 
      ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length 
      : 0;
    const shortestHoldMs = holdTimes.length > 0 ? Math.min(...holdTimes) : 0;
    const longestHoldMs = holdTimes.length > 0 ? Math.max(...holdTimes) : 0;

    // Calculate profit factor and expectancy
    const profitFactor = grossLoss > BigInt(0) 
      ? Number(grossProfit) / Number(grossLoss) 
      : grossProfit > BigInt(0) ? Infinity : 0;

    const avgProfitPerTrade = totalTrades > 0 
      ? Number(grossProfit - grossLoss) / totalTrades / 1e18 
      : 0;

    const expectancy = totalTrades > 0
      ? (winRate / 100) * avgProfitPerTrade - ((100 - winRate) / 100) * Math.abs(avgProfitPerTrade)
      : 0;

    // Days active
    const daysActive = (Date.now() - bot.createdAt) / (1000 * 60 * 60 * 24);

    // Active positions
    const activePositions = bot.positions.filter(p => p.status === 'HOLDING').length;

    return {
      botId: bot.id,
      botName: bot.name,
      tokenSymbol: bot.tokenSymbol,
      totalTrades,
      totalBuys: buys.length,
      totalSells: sells.length,
      totalProfitEth: bot.totalProfitEth,
      totalProfitUsd: bot.totalProfitUsd,
      avgProfitPerTrade,
      winningTrades,
      losingTrades,
      winRate,
      avgHoldTimeMs,
      shortestHoldMs,
      longestHoldMs,
      profitFactor,
      expectancy,
      activePositions,
      currentPrice: bot.currentPrice,
      isRunning: bot.isRunning,
      createdAt: bot.createdAt,
      lastTradeAt: bot.lastTradeAt ?? null,
      daysActive,
      profitRank: 0,
      winRateRank: 0,
      efficiencyRank: 0,
      overallRank: 0,
    };
  }

  /**
   * Calculate rankings across all bots
   */
  private calculateRankings(): void {
    const performances = Array.from(this.performances.values());

    if (performances.length === 0) return;

    // Sort by profit (descending)
    const byProfit = [...performances].sort((a, b) => 
      Number(BigInt(b.totalProfitEth) - BigInt(a.totalProfitEth))
    );

    // Sort by win rate (descending)
    const byWinRate = [...performances].sort((a, b) => b.winRate - a.winRate);

    // Sort by efficiency (profit factor * expectancy)
    const byEfficiency = [...performances].sort((a, b) => {
      const effA = a.profitFactor * Math.max(0, a.expectancy);
      const effB = b.profitFactor * Math.max(0, b.expectancy);
      return effB - effA;
    });

    // Assign rankings
    for (let i = 0; i < byProfit.length; i++) {
      const perf = this.performances.get(byProfit[i].botId);
      if (perf) perf.profitRank = i + 1;
    }

    for (let i = 0; i < byWinRate.length; i++) {
      const perf = this.performances.get(byWinRate[i].botId);
      if (perf) perf.winRateRank = i + 1;
    }

    for (let i = 0; i < byEfficiency.length; i++) {
      const perf = this.performances.get(byEfficiency[i].botId);
      if (perf) perf.efficiencyRank = i + 1;
    }

    // Calculate overall rank (average of other ranks)
    for (const perf of performances) {
      perf.overallRank = Math.round(
        (perf.profitRank + perf.winRateRank + perf.efficiencyRank) / 3
      );
    }
  }

  /**
   * Get performance for a specific bot
   */
  getBotPerformance(botId: string): BotPerformance | undefined {
    return this.performances.get(botId);
  }

  /**
   * Get all performances sorted by a metric
   */
  getAllPerformances(sortBy: 'profit' | 'winRate' | 'efficiency' | 'overall' = 'overall'): BotPerformance[] {
    const performances = Array.from(this.performances.values());

    switch (sortBy) {
      case 'profit':
        return performances.sort((a, b) => 
          Number(BigInt(b.totalProfitEth) - BigInt(a.totalProfitEth))
        );
      case 'winRate':
        return performances.sort((a, b) => b.winRate - a.winRate);
      case 'efficiency':
        return performances.sort((a, b) => {
          const effA = a.profitFactor * Math.max(0, a.expectancy);
          const effB = b.profitFactor * Math.max(0, b.expectancy);
          return effB - effA;
        });
      case 'overall':
      default:
        return performances.sort((a, b) => a.overallRank - b.overallRank);
    }
  }

  /**
   * Get top performers
   */
  getTopPerformers(count: number = 5, sortBy: 'profit' | 'winRate' | 'efficiency' | 'overall' = 'overall'): BotPerformance[] {
    return this.getAllPerformances(sortBy).slice(0, count);
  }

  /**
   * Get bottom performers
   */
  getBottomPerformers(count: number = 5, sortBy: 'profit' | 'winRate' | 'efficiency' | 'overall' = 'overall'): BotPerformance[] {
    return this.getAllPerformances(sortBy).slice(-count).reverse();
  }

  /**
   * Get leaderboard summary
   */
  getSummary(period: 'daily' | 'weekly' | 'monthly' | 'all-time' = 'all-time'): LeaderboardSummary {
    const performances = Array.from(this.performances.values());
    
    const activeBots = performances.filter(p => p.isRunning).length;
    const totalProfit = performances.reduce((sum, p) => sum + BigInt(p.totalProfitEth), BigInt(0));
    const totalTrades = performances.reduce((sum, p) => sum + p.totalTrades, 0);
    const avgWinRate = performances.length > 0 
      ? performances.reduce((sum, p) => sum + p.winRate, 0) / performances.length 
      : 0;

    const sorted = this.getAllPerformances('profit');
    const bestPerformer = sorted.length > 0 ? sorted[0].botName : 'N/A';
    const worstPerformer = sorted.length > 0 ? sorted[sorted.length - 1].botName : 'N/A';

    return {
      totalBots: performances.length,
      activeBots,
      totalProfitEth: totalProfit.toString(),
      totalTrades,
      avgWinRate,
      bestPerformer,
      worstPerformer,
      period,
    };
  }

  /**
   * Format hold time for display
   */
  static formatHoldTime(ms: number): string {
    if (ms === 0) return 'N/A';
    
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  /**
   * Get medal emoji for rank
   */
  static getRankMedal(rank: number): string {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `${rank}.`;
    }
  }

  /**
   * Generate ASCII leaderboard table
   */
  generateLeaderboardTable(sortBy: 'profit' | 'winRate' | 'efficiency' | 'overall' = 'overall'): string {
    const performances = this.getAllPerformances(sortBy);
    
    if (performances.length === 0) {
      return 'No bots to display on leaderboard.';
    }

    let output = '\n╔══════════════════════════════════════════════════════════════════════════╗\n';
    output +=    '║                    🏆 BOT PERFORMANCE LEADERBOARD 🏆                      ║\n';
    output +=    '╠══════════════════════════════════════════════════════════════════════════╣\n';
    output +=    `║  Sorted by: ${sortBy.toUpperCase().padEnd(62)}║\n`;
    output +=    '╠══════════════════════════════════════════════════════════════════════════╣\n';
    output +=    '║  Rank  Bot Name          Token     Profit Ξ    Win%    Trades  Hold     ║\n';
    output +=    '╠══════════════════════════════════════════════════════════════════════════╣\n';

    for (let i = 0; i < Math.min(10, performances.length); i++) {
      const p = performances[i];
      const medal = BotLeaderboard.getRankMedal(i + 1);
      const profit = (Number(BigInt(p.totalProfitEth)) / 1e18).toFixed(4);
      const holdTime = BotLeaderboard.formatHoldTime(p.avgHoldTimeMs);
      
      output += `║  ${medal.padEnd(4)}  ${p.botName.slice(0, 15).padEnd(15)}  ${p.tokenSymbol.slice(0, 8).padEnd(8)}  ${profit.padStart(10)}  ${p.winRate.toFixed(1).padStart(5)}%  ${p.totalTrades.toString().padStart(5)}  ${holdTime.padEnd(8)} ║\n`;
    }

    output +=    '╚══════════════════════════════════════════════════════════════════════════╝\n';
    
    // Summary
    const summary = this.getSummary();
    output += `\n📊 Summary: ${summary.activeBots}/${summary.totalBots} active | `;
    output += `Total Profit: ${(Number(BigInt(summary.totalProfitEth)) / 1e18).toFixed(4)} ETH | `;
    output += `Avg Win Rate: ${summary.avgWinRate.toFixed(1)}%\n`;

    return output;
  }

  /**
   * Get performance trends over time
   */
  getPerformanceTrend(botId: string, days: number = 7): { date: string; profit: number; trades: number }[] {
    const botTrades = this.trades.filter(t => t.botId === botId && t.action === 'sell');
    const trends: { date: string; profit: number; trades: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayStart = new Date(dateStr).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;

      const dayTrades = botTrades.filter(t => t.timestamp >= dayStart && t.timestamp < dayEnd);
      const profit = dayTrades.reduce((sum, t) => sum + Number(BigInt(t.profit || '0')), 0) / 1e18;

      trends.push({
        date: dateStr,
        profit,
        trades: dayTrades.length,
      });
    }

    return trends;
  }
}
