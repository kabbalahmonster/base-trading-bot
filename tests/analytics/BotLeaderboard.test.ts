import { describe, it, expect, beforeEach } from 'vitest';
import { BotLeaderboard, BotPerformance } from '../../src/analytics/BotLeaderboard.js';
import { BotInstance } from '../../src/types/index.js';
import { TradeRecord } from '../../src/analytics/PnLTracker.js';

describe('BotLeaderboard', () => {
  let leaderboard: BotLeaderboard;
  let mockBots: BotInstance[];
  let mockTrades: TradeRecord[];

  beforeEach(() => {
    leaderboard = new BotLeaderboard();
    mockBots = createMockBots();
    mockTrades = createMockTrades();
    leaderboard.loadData(mockBots, mockTrades);
  });

  describe('Data Loading', () => {
    it('should load bots and calculate performance', () => {
      const performance = leaderboard.getBotPerformance('bot1');
      expect(performance).toBeDefined();
      expect(performance?.botName).toBe('Alpha Bot');
    });

    it('should calculate total trades', () => {
      const perf = leaderboard.getBotPerformance('bot1');
      expect(perf?.totalTrades).toBe(2); // 2 sells
      expect(perf?.totalBuys).toBe(3);
      expect(perf?.totalSells).toBe(2);
    });

    it('should calculate profit correctly', () => {
      const perf = leaderboard.getBotPerformance('bot1');
      expect(perf?.totalProfitEth).toBe('5000000000000000'); // 0.005 ETH
    });
  });

  describe('Win Rate Calculation', () => {
    it('should calculate win rate correctly', () => {
      const perf = leaderboard.getBotPerformance('bot1');
      expect(perf?.winRate).toBe(100); // 2 winning trades out of 2
      expect(perf?.winningTrades).toBe(2);
      expect(perf?.losingTrades).toBe(0);
    });

    it('should handle zero trades', () => {
      leaderboard.loadData([mockBots[2]], []);
      const perf = leaderboard.getBotPerformance('bot3');
      expect(perf?.winRate).toBe(0);
      expect(perf?.totalTrades).toBe(0);
    });
  });

  describe('Hold Time Calculation', () => {
    it('should calculate average hold time', () => {
      const perf = leaderboard.getBotPerformance('bot1');
      expect(perf?.avgHoldTimeMs).toBeGreaterThan(0);
    });

    it('should track shortest and longest holds', () => {
      const perf = leaderboard.getBotPerformance('bot1');
      expect(perf?.shortestHoldMs).toBeLessThanOrEqual(perf?.longestHoldMs || 0);
    });
  });

  describe('Profit Factor and Expectancy', () => {
    it('should calculate profit factor', () => {
      const perf = leaderboard.getBotPerformance('bot1');
      expect(perf?.profitFactor).toBeGreaterThan(0);
    });

    it('should calculate expectancy', () => {
      const perf = leaderboard.getBotPerformance('bot1');
      expect(perf?.expectancy).toBeDefined();
    });

    it('should handle all losing trades', () => {
      const losingTrades: TradeRecord[] = [
        {
          id: '1',
          botId: 'bot3',
          botName: 'Gamma Bot',
          tokenSymbol: 'GAMMA',
          tokenAddress: '0x789',
          action: 'buy',
          amount: '1000',
          price: 0.001,
          ethValue: '1000000000000000',
          gasCost: '100000000000',
          timestamp: Date.now() - 7200000,
          txHash: '0xabc',
          positionId: 1,
        },
        {
          id: '2',
          botId: 'bot3',
          botName: 'Gamma Bot',
          tokenSymbol: 'GAMMA',
          tokenAddress: '0x789',
          action: 'sell',
          amount: '1000',
          price: 0.0009,
          ethValue: '900000000000000',
          gasCost: '100000000000',
          profit: '-200000000000000',
          profitPercent: -11,
          timestamp: Date.now() - 3600000,
          txHash: '0xdef',
          positionId: 1,
        },
      ];

      leaderboard.loadData([mockBots[2]], losingTrades);
      const perf = leaderboard.getBotPerformance('bot3');
      expect(perf?.winRate).toBe(0);
      expect(perf?.profitFactor).toBe(0);
    });
  });

  describe('Rankings', () => {
    it('should assign profit ranks', () => {
      const perf1 = leaderboard.getBotPerformance('bot1');
      const perf2 = leaderboard.getBotPerformance('bot2');
      
      expect(perf1?.profitRank).toBe(1); // bot1 has more profit
      expect(perf2?.profitRank).toBe(2);
    });

    it('should assign overall ranks', () => {
      const perf1 = leaderboard.getBotPerformance('bot1');
      expect(perf1?.overallRank).toBeGreaterThan(0);
    });
  });

  describe('Sorting', () => {
    it('should sort by profit', () => {
      const sorted = leaderboard.getAllPerformances('profit');
      expect(sorted[0].botId).toBe('bot1');
      expect(sorted[1].botId).toBe('bot2');
    });

    it('should sort by win rate', () => {
      const sorted = leaderboard.getAllPerformances('winRate');
      expect(sorted.length).toBeGreaterThan(0);
    });

    it('should sort by overall rank by default', () => {
      const sorted = leaderboard.getAllPerformances('overall');
      expect(sorted.length).toBe(3);
    });
  });

  describe('Top/Bottom Performers', () => {
    it('should get top performers', () => {
      const top = leaderboard.getTopPerformers(2, 'profit');
      expect(top).toHaveLength(2);
      expect(top[0].botId).toBe('bot1');
    });

    it('should get bottom performers', () => {
      const bottom = leaderboard.getBottomPerformers(2, 'profit');
      expect(bottom).toHaveLength(2);
      expect(bottom[0].botId).toBe('bot2'); // bot2 has less profit
    });
  });

  describe('Summary', () => {
    it('should provide fleet summary', () => {
      const summary = leaderboard.getSummary('all-time');
      
      expect(summary.totalBots).toBe(3);
      expect(summary.activeBots).toBe(2);
      expect(summary.totalTrades).toBe(3); // 2 + 1
      expect(summary.bestPerformer).toBe('Alpha Bot');
    });

    it('should calculate total profit', () => {
      const summary = leaderboard.getSummary();
      const totalProfit = BigInt(summary.totalProfitEth);
      expect(totalProfit).toBeGreaterThan(BigInt(0));
    });
  });

  describe('Utility Functions', () => {
    it('should format hold time in days', () => {
      const ms = 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000; // 3 days, 2 hours
      expect(BotLeaderboard.formatHoldTime(ms)).toBe('3d 2h');
    });

    it('should format hold time in hours', () => {
      const ms = 5 * 60 * 60 * 1000 + 30 * 60 * 1000; // 5 hours, 30 minutes
      expect(BotLeaderboard.formatHoldTime(ms)).toBe('5h 30m');
    });

    it('should format hold time in minutes', () => {
      const ms = 45 * 60 * 1000; // 45 minutes
      expect(BotLeaderboard.formatHoldTime(ms)).toBe('45m');
    });

    it('should return N/A for zero hold time', () => {
      expect(BotLeaderboard.formatHoldTime(0)).toBe('N/A');
    });

    it('should return correct rank medals', () => {
      expect(BotLeaderboard.getRankMedal(1)).toBe('🥇');
      expect(BotLeaderboard.getRankMedal(2)).toBe('🥈');
      expect(BotLeaderboard.getRankMedal(3)).toBe('🥉');
      expect(BotLeaderboard.getRankMedal(4)).toBe('4.');
    });
  });

  describe('Performance Trends', () => {
    it('should generate performance trends', () => {
      const trends = leaderboard.getPerformanceTrend('bot1', 7);
      expect(trends).toHaveLength(7);
      expect(trends[6].date).toBe(new Date().toISOString().split('T')[0]);
    });
  });

  describe('Leaderboard Table', () => {
    it('should generate ASCII table', () => {
      const table = leaderboard.generateLeaderboardTable('profit');
      expect(table).toContain('BOT PERFORMANCE LEADERBOARD');
      expect(table).toContain('Alpha Bot');
      expect(table).toContain('Beta Bot');
    });

    it('should handle empty leaderboard', () => {
      const emptyLeaderboard = new BotLeaderboard();
      emptyLeaderboard.loadData([], []);
      const table = emptyLeaderboard.generateLeaderboardTable();
      expect(table).toContain('No bots to display');
    });
  });
});

function createMockBots(): BotInstance[] {
  return [
    {
      id: 'bot1',
      name: 'Alpha Bot',
      tokenAddress: '0x123',
      tokenSymbol: 'ALPHA',
      chain: 'base',
      walletAddress: '0xabc',
      useMainWallet: false,
      config: {
        numPositions: 10,
        floorPrice: 0.000001,
        ceilingPrice: 0.00001,
        useMarketCap: false,
        takeProfitPercent: 8,
        stopLossPercent: 10,
        stopLossEnabled: false,
        buysEnabled: true,
        sellsEnabled: true,
        moonBagEnabled: true,
        moonBagPercent: 1,
        minProfitPercent: 2,
        maxActivePositions: 4,
        buyAmount: 0.001,
        useFixedBuyAmount: true,
        usePriceOracle: true,
        minPriceConfidence: 0.8,
        heartbeatMs: 1000,
        skipHeartbeats: 0,
      },
      positions: [],
      totalBuys: 3,
      totalSells: 2,
      totalProfitEth: '5000000000000000', // 0.005 ETH
      totalProfitUsd: 10,
      isRunning: true,
      enabled: true,
      lastHeartbeat: Date.now(),
      currentPrice: 0.000005,
      createdAt: Date.now() - 86400000,
      lastUpdated: Date.now(),
    },
    {
      id: 'bot2',
      name: 'Beta Bot',
      tokenAddress: '0x456',
      tokenSymbol: 'BETA',
      chain: 'base',
      walletAddress: '0xdef',
      useMainWallet: false,
      config: {
        numPositions: 10,
        floorPrice: 0.000001,
        ceilingPrice: 0.00001,
        useMarketCap: false,
        takeProfitPercent: 8,
        stopLossPercent: 10,
        stopLossEnabled: false,
        buysEnabled: true,
        sellsEnabled: true,
        moonBagEnabled: true,
        moonBagPercent: 1,
        minProfitPercent: 2,
        maxActivePositions: 4,
        buyAmount: 0.001,
        useFixedBuyAmount: true,
        usePriceOracle: true,
        minPriceConfidence: 0.8,
        heartbeatMs: 1000,
        skipHeartbeats: 0,
      },
      positions: [],
      totalBuys: 2,
      totalSells: 1,
      totalProfitEth: '2000000000000000', // 0.002 ETH
      totalProfitUsd: 4,
      isRunning: true,
      enabled: true,
      lastHeartbeat: Date.now(),
      currentPrice: 0.000005,
      createdAt: Date.now() - 172800000,
      lastUpdated: Date.now(),
    },
    {
      id: 'bot3',
      name: 'Gamma Bot',
      tokenAddress: '0x789',
      tokenSymbol: 'GAMMA',
      chain: 'base',
      walletAddress: '0xghi',
      useMainWallet: false,
      config: {
        numPositions: 10,
        floorPrice: 0.000001,
        ceilingPrice: 0.00001,
        useMarketCap: false,
        takeProfitPercent: 8,
        stopLossPercent: 10,
        stopLossEnabled: false,
        buysEnabled: true,
        sellsEnabled: true,
        moonBagEnabled: true,
        moonBagPercent: 1,
        minProfitPercent: 2,
        maxActivePositions: 4,
        buyAmount: 0.001,
        useFixedBuyAmount: true,
        usePriceOracle: true,
        minPriceConfidence: 0.8,
        heartbeatMs: 1000,
        skipHeartbeats: 0,
      },
      positions: [],
      totalBuys: 0,
      totalSells: 0,
      totalProfitEth: '0',
      totalProfitUsd: 0,
      isRunning: false,
      enabled: true,
      lastHeartbeat: Date.now(),
      currentPrice: 0.000005,
      createdAt: Date.now() - 259200000,
      lastUpdated: Date.now(),
    },
  ];
}

function createMockTrades(): TradeRecord[] {
  const now = Date.now();
  return [
    // Bot 1 trades
    {
      id: '1',
      botId: 'bot1',
      botName: 'Alpha Bot',
      tokenSymbol: 'ALPHA',
      tokenAddress: '0x123',
      action: 'buy',
      amount: '1000',
      price: 0.001,
      ethValue: '1000000000000000',
      gasCost: '100000000000',
      timestamp: now - 7200000,
      txHash: '0xabc1',
      positionId: 1,
    },
    {
      id: '2',
      botId: 'bot1',
      botName: 'Alpha Bot',
      tokenSymbol: 'ALPHA',
      tokenAddress: '0x123',
      action: 'sell',
      amount: '990',
      price: 0.0011,
      ethValue: '1089000000000000',
      gasCost: '100000000000',
      profit: '89000000000000',
      profitPercent: 8.9,
      timestamp: now - 3600000,
      txHash: '0xdef1',
      positionId: 1,
    },
    {
      id: '3',
      botId: 'bot1',
      botName: 'Alpha Bot',
      tokenSymbol: 'ALPHA',
      tokenAddress: '0x123',
      action: 'buy',
      amount: '2000',
      price: 0.0012,
      ethValue: '2400000000000000',
      gasCost: '100000000000',
      timestamp: now - 7200000,
      txHash: '0xabc2',
      positionId: 2,
    },
    {
      id: '4',
      botId: 'bot1',
      botName: 'Alpha Bot',
      tokenSymbol: 'ALPHA',
      tokenAddress: '0x123',
      action: 'sell',
      amount: '1980',
      price: 0.0013,
      ethValue: '2574000000000000',
      gasCost: '100000000000',
      profit: '174000000000000',
      profitPercent: 7.25,
      timestamp: now - 1800000,
      txHash: '0xdef2',
      positionId: 2,
    },
    {
      id: '5',
      botId: 'bot1',
      botName: 'Alpha Bot',
      tokenSymbol: 'ALPHA',
      tokenAddress: '0x123',
      action: 'buy',
      amount: '1500',
      price: 0.0015,
      ethValue: '2250000000000000',
      gasCost: '100000000000',
      timestamp: now - 1000000,
      txHash: '0xabc3',
      positionId: 3,
    },
    // Bot 2 trades
    {
      id: '6',
      botId: 'bot2',
      botName: 'Beta Bot',
      tokenSymbol: 'BETA',
      tokenAddress: '0x456',
      action: 'buy',
      amount: '500',
      price: 0.002,
      ethValue: '1000000000000000',
      gasCost: '100000000000',
      timestamp: now - 5400000,
      txHash: '0xabc4',
      positionId: 1,
    },
    {
      id: '7',
      botId: 'bot2',
      botName: 'Beta Bot',
      tokenSymbol: 'BETA',
      tokenAddress: '0x456',
      action: 'sell',
      amount: '495',
      price: 0.0022,
      ethValue: '1089000000000000',
      gasCost: '100000000000',
      profit: '89000000000000',
      profitPercent: 8.9,
      timestamp: now - 2700000,
      txHash: '0xdef4',
      positionId: 1,
    },
    {
      id: '8',
      botId: 'bot2',
      botName: 'Beta Bot',
      tokenSymbol: 'BETA',
      tokenAddress: '0x456',
      action: 'buy',
      amount: '800',
      price: 0.0025,
      ethValue: '2000000000000000',
      gasCost: '100000000000',
      timestamp: now - 1500000,
      txHash: '0xabc5',
      positionId: 2,
    },
  ];
}
