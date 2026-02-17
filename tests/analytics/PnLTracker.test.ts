// tests/analytics/PnLTracker.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PnLTracker } from '../../src/analytics/PnLTracker.js';
import { TradeStorage } from '../../src/analytics/TradeStorage.js';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';

describe('PnLTracker', () => {
  let tradeStorage: TradeStorage;
  let pnLTracker: PnLTracker;
  let tempDir: string;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'pnl-test-'));
    const dbPath = join(tempDir, 'trades.json');
    
    tradeStorage = new TradeStorage(dbPath);
    await tradeStorage.init();
    pnLTracker = new PnLTracker(tradeStorage);
    await pnLTracker.init();
  });

  afterEach(async () => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe('recordBuy', () => {
    it('should record a buy trade', async () => {
      const bot = {
        id: 'bot-1',
        name: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      await pnLTracker.recordBuy(
        bot,
        1, // positionId
        '1000000000000000000', // amount
        0.001, // price
        '1000000000000000', // ethCost
        '10000000000000', // gasCost
        '0x1' // txHash
      );

      const trades = pnLTracker.getAllTrades();
      expect(trades.length).toBe(1);
      expect(trades[0].action).toBe('buy');
      expect(trades[0].amount).toBe('1000000000000000000');
    });
  });

  describe('recordSell', () => {
    it('should record a sell trade with profit', async () => {
      const bot = {
        id: 'bot-1',
        name: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      await pnLTracker.recordSell(
        bot,
        1, // positionId
        '1000000000000000000', // amount
        0.0011, // price
        '1100000000000000', // ethReceived
        '10000000000000', // gasCost
        '90000000000000', // profit
        9, // profitPercent
        '0x2' // txHash
      );

      const trades = pnLTracker.getAllTrades();
      expect(trades.length).toBe(1);
      expect(trades[0].action).toBe('sell');
      expect(trades[0].profit).toBe('90000000000000');
      expect(trades[0].profitPercent).toBe(9);
    });
  });

  describe('getDailyPnL', () => {
    it('should calculate daily P&L', async () => {
      const bot = {
        id: 'bot-1',
        name: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      // Record some trades
      await pnLTracker.recordBuy(
        bot,
        1,
        '1000000000000000000',
        0.001,
        '1000000000000000',
        '10000000000000',
        '0x1'
      );

      await pnLTracker.recordSell(
        bot,
        1,
        '1000000000000000000',
        0.0011,
        '1100000000000000',
        '10000000000000',
        '90000000000000',
        9,
        '0x2'
      );

      const dailyPnL = pnLTracker.getDailyPnL(new Date());

      expect(dailyPnL.length).toBe(1);
      expect(dailyPnL[0].buys).toBe(1);
      expect(dailyPnL[0].sells).toBe(1);
    });

    it('should return empty for day with no trades', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const dailyPnL = pnLTracker.getDailyPnL(yesterday);

      expect(dailyPnL).toEqual([]);
    });
  });

  describe('getCumulativePnL', () => {
    it('should calculate cumulative P&L', async () => {
      const bot = {
        id: 'bot-1',
        name: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      // Add multiple profitable trades
      for (let i = 0; i < 3; i++) {
        await pnLTracker.recordBuy(
          bot,
          i,
          '1000000000000000000',
          0.001,
          '1000000000000000',
          '10000000000000',
          `0xbuy${i}`
        );

        await pnLTracker.recordSell(
          bot,
          i,
          '1000000000000000000',
          0.0011,
          '1100000000000000',
          '10000000000000',
          '90000000000000',
          9,
          `0xsell${i}`
        );
      }

      const cumulative = pnLTracker.getCumulativePnL();

      expect(cumulative.totalTrades).toBe(6);
      expect(cumulative.totalBuys).toBe(3);
      expect(cumulative.totalSells).toBe(3);
    });

    it('should handle mixed profitable and losing trades', async () => {
      const bot = {
        id: 'bot-1',
        name: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      // Add profitable trade
      await pnLTracker.recordBuy(
        bot,
        1,
        '1000000000000000000',
        0.001,
        '1000000000000000',
        '10000000000000',
        '0x1'
      );

      await pnLTracker.recordSell(
        bot,
        1,
        '1000000000000000000',
        0.0011,
        '1100000000000000',
        '10000000000000',
        '90000000000000',
        9,
        '0x2'
      );

      // Add losing trade
      await pnLTracker.recordBuy(
        bot,
        2,
        '1000000000000000000',
        0.001,
        '1000000000000000',
        '10000000000000',
        '0x3'
      );

      await pnLTracker.recordSell(
        bot,
        2,
        '1000000000000000000',
        0.0009,
        '900000000000000', // Loss
        '10000000000000',
        '-110000000000000', // Negative profit
        -11,
        '0x4'
      );

      const cumulative = pnLTracker.getCumulativePnL();

      expect(cumulative.totalSells).toBe(2);
    });
  });

  describe('getTradesByBot', () => {
    it('should return trades for specific bot', async () => {
      const bot1 = {
        id: 'bot-1',
        name: 'Bot One',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      const bot2 = {
        id: 'bot-2',
        name: 'Bot Two',
        tokenAddress: '0x5678',
        tokenSymbol: 'TEST2',
      } as any;

      // Add trades for bot-1
      await pnLTracker.recordBuy(
        bot1,
        1,
        '1000000000000000000',
        0.001,
        '1000000000000000',
        '10000000000000',
        '0x1'
      );

      await pnLTracker.recordSell(
        bot1,
        1,
        '1000000000000000000',
        0.0011,
        '1100000000000000',
        '10000000000000',
        '90000000000000',
        9,
        '0x2'
      );

      // Add trades for bot-2
      await pnLTracker.recordBuy(
        bot2,
        1,
        '2000000000000000000',
        0.001,
        '2000000000000000',
        '20000000000000',
        '0x3'
      );

      const bot1Trades = pnLTracker.getTradesByBot('bot-1');

      expect(bot1Trades.length).toBe(2);
      expect(bot1Trades[0].botId).toBe('bot-1');
      expect(bot1Trades[0].botName).toBe('Bot One');
      expect(bot1Trades[0].tokenSymbol).toBe('TEST');
    });
  });

  describe('getAllTrades', () => {
    it('should return all trades', async () => {
      const bot = {
        id: 'bot-1',
        name: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      await pnLTracker.recordBuy(
        bot,
        1,
        '1000000000000000000',
        0.001,
        '1000000000000000',
        '10000000000000',
        '0x1'
      );

      await pnLTracker.recordBuy(
        bot,
        2,
        '2000000000000000000',
        0.001,
        '2000000000000000',
        '20000000000000',
        '0x2'
      );

      const summaries = pnLTracker.getAllTrades();

      expect(summaries.length).toBe(2);
    });
  });

  describe('getTradesByDateRange', () => {
    it('should calculate weekly P&L', async () => {
      const bot = {
        id: 'bot-1',
        name: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      await pnLTracker.recordBuy(
        bot,
        1,
        '1000000000000000000',
        0.001,
        '1000000000000000',
        '10000000000000',
        '0x1'
      );

      await pnLTracker.recordSell(
        bot,
        1,
        '1000000000000000000',
        0.0011,
        '1100000000000000',
        '10000000000000',
        '90000000000000',
        9,
        '0x2'
      );

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weeklyPnL = pnLTracker.getTradesByDateRange(weekAgo, now);

      expect(weeklyPnL.length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle no trades gracefully', async () => {
      const cumulative = pnLTracker.getCumulativePnL();

      expect(cumulative.totalTrades).toBe(0);
      expect(cumulative.totalProfitEth).toBe('0');
    });

    it('should handle single trade', async () => {
      const bot = {
        id: 'bot-1',
        name: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      await pnLTracker.recordBuy(
        bot,
        1,
        '1000000000000000000',
        0.001,
        '1000000000000000',
        '10000000000000',
        '0x1'
      );

      const dailyPnL = pnLTracker.getDailyPnL(new Date());

      expect(dailyPnL.length).toBe(1);
      expect(dailyPnL[0].buys).toBe(1);
      expect(dailyPnL[0].sells).toBe(0);
    });

    it('should calculate profit correctly', async () => {
      const bot = {
        id: 'bot-1',
        name: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
      } as any;

      // Buy for 0.001 ETH
      await pnLTracker.recordBuy(
        bot,
        1,
        '1000000000000000000',
        0.001,
        '1000000000000000', // 0.001 ETH
        '0',
        '0x1'
      );

      // Sell for 0.0011 ETH (10% profit before gas)
      await pnLTracker.recordSell(
        bot,
        1,
        '1000000000000000000',
        0.0011,
        '1100000000000000', // 0.0011 ETH
        '10000000000000', // 0.00001 ETH gas
        '90000000000000', // 0.00009 ETH profit
        9, // 9% after gas
        '0x2'
      );

      const trades = pnLTracker.getAllTrades();
      const sellTrade = trades.find(t => t.action === 'sell');

      expect(sellTrade?.profit).toBe('90000000000000');
    });
  });
});
