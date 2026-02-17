// tests/analytics/PnLTracker.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PnLTracker } from '../../src/analytics/PnLTracker';
import { TradeHistory } from '../../src/analytics/TradeHistory';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

const TEST_DB_PATH = './test-pnl-history.json';

describe('PnLTracker', () => {
  let tradeHistory: TradeHistory;
  let pnLTracker: PnLTracker;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      await unlink(TEST_DB_PATH);
    }
    tradeHistory = new TradeHistory(TEST_DB_PATH);
    await tradeHistory.init();
    pnLTracker = new PnLTracker(tradeHistory);
    await pnLTracker.init();
  });

  afterEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      await unlink(TEST_DB_PATH);
    }
  });

  describe('recordBuy', () => {
    it('should record a buy trade', async () => {
      const trade = await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x1',
      });

      expect(trade.action).toBe('buy');
      expect(trade.amount).toBe('1000000000000000000');
    });
  });

  describe('recordSell', () => {
    it('should record a sell trade with profit', async () => {
      const trade = await pnLTracker.recordSell({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1100000000000000',
        price: 0.0011,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        profit: '90000000000000',
        profitPercent: 9,
        positionId: 1,
        txHash: '0x2',
      });

      expect(trade.action).toBe('sell');
      expect(trade.profit).toBe('90000000000000');
      expect(trade.profitPercent).toBe(9);
    });
  });

  describe('getDailyPnL', () => {
    it('should calculate daily P&L', async () => {
      // Record some trades
      await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x1',
      });

      await pnLTracker.recordSell({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1100000000000000',
        price: 0.0011,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        profit: '90000000000000',
        profitPercent: 9,
        positionId: 1,
        txHash: '0x2',
      });

      const dailyPnL = await pnLTracker.getDailyPnL();

      expect(dailyPnL.totalTrades).toBe(2);
      expect(dailyPnL.buyCount).toBe(1);
      expect(dailyPnL.sellCount).toBe(1);
      expect(dailyPnL.realizedProfitEth).toBeGreaterThan(0);
    });

    it('should return zero P&L for day with no trades', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const dailyPnL = await pnLTracker.getDailyPnL(yesterday);

      expect(dailyPnL.totalTrades).toBe(0);
      expect(dailyPnL.realizedProfitEth).toBe(0);
      expect(dailyPnL.netProfitEth).toBe(0);
    });
  });

  describe('getCumulativePnL', () => {
    it('should calculate cumulative P&L', async () => {
      // Add multiple profitable trades
      for (let i = 0; i < 3; i++) {
        await pnLTracker.recordBuy({
          botId: 'bot-1',
          botName: 'Test Bot',
          tokenAddress: '0x1234',
          tokenSymbol: 'TEST',
          amount: '1000000000000000000',
          amountEth: '1000000000000000',
          price: 0.001,
          gasCost: '10000000000000',
          gasUsed: '100000',
          gasPrice: '100000000000',
          positionId: i,
          txHash: `0xbuy${i}`,
        });

        await pnLTracker.recordSell({
          botId: 'bot-1',
          botName: 'Test Bot',
          tokenAddress: '0x1234',
          tokenSymbol: 'TEST',
          amount: '1000000000000000000',
          amountEth: '1100000000000000',
          price: 0.0011,
          gasCost: '10000000000000',
          gasUsed: '100000',
          gasPrice: '100000000000',
          profit: '90000000000000',
          profitPercent: 9,
          positionId: i,
          txHash: `0xsell${i}`,
        });
      }

      const cumulative = await pnLTracker.getCumulativePnL();

      expect(cumulative.totalTrades).toBe(6);
      expect(cumulative.totalBuys).toBe(3);
      expect(cumulative.totalSells).toBe(3);
      expect(cumulative.totalRealizedProfitEth).toBeGreaterThan(0);
      expect(cumulative.winRate).toBe(100); // All trades were profitable
    });

    it('should handle mixed profitable and losing trades', async () => {
      // Add profitable trade
      await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x1',
      });

      await pnLTracker.recordSell({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1100000000000000',
        price: 0.0011,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        profit: '90000000000000',
        profitPercent: 9,
        positionId: 1,
        txHash: '0x2',
      });

      // Add losing trade
      await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 2,
        txHash: '0x3',
      });

      await pnLTracker.recordSell({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '900000000000000', // Loss
        price: 0.0009,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        profit: '-110000000000000', // Negative profit
        profitPercent: -11,
        positionId: 2,
        txHash: '0x4',
      });

      const cumulative = await pnLTracker.getCumulativePnL();

      expect(cumulative.totalSells).toBe(2);
      expect(cumulative.winRate).toBe(50); // 1 out of 2 profitable
      expect(cumulative.totalRealizedProfitEth).toBeLessThan(0.0001); // Small net profit after loss
    });
  });

  describe('getBotPnL', () => {
    it('should return P&L for specific bot', async () => {
      // Add trades for bot-1
      await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Bot One',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x1',
      });

      await pnLTracker.recordSell({
        botId: 'bot-1',
        botName: 'Bot One',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1100000000000000',
        price: 0.0011,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        profit: '90000000000000',
        profitPercent: 9,
        positionId: 1,
        txHash: '0x2',
      });

      // Add trades for bot-2
      await pnLTracker.recordBuy({
        botId: 'bot-2',
        botName: 'Bot Two',
        tokenAddress: '0x5678',
        tokenSymbol: 'TEST2',
        amount: '2000000000000000000',
        amountEth: '2000000000000000',
        price: 0.001,
        gasCost: '20000000000000',
        gasUsed: '200000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x3',
      });

      const bot1PnL = await pnLTracker.getBotPnL('bot-1');

      expect(bot1PnL.botId).toBe('bot-1');
      expect(bot1PnL.botName).toBe('Bot One');
      expect(bot1PnL.tokenSymbol).toBe('TEST');
      expect(bot1PnL.buys).toBe(1);
      expect(bot1PnL.sells).toBe(1);
      expect(bot1PnL.realizedProfitEth).toBeGreaterThan(0);
    });
  });

  describe('getAllBotPnLSummaries', () => {
    it('should return summaries for all bots', async () => {
      await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Bot One',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x1',
      });

      await pnLTracker.recordBuy({
        botId: 'bot-2',
        botName: 'Bot Two',
        tokenAddress: '0x5678',
        tokenSymbol: 'TEST2',
        amount: '2000000000000000000',
        amountEth: '2000000000000000',
        price: 0.001,
        gasCost: '20000000000000',
        gasUsed: '200000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x2',
      });

      const summaries = await pnLTracker.getAllBotPnLSummaries();

      expect(summaries).toHaveLength(2);
      expect(summaries.map(s => s.botId).sort()).toEqual(['bot-1', 'bot-2']);
    });
  });

  describe('getWeeklyPnL', () => {
    it('should calculate weekly P&L', async () => {
      await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x1',
      });

      await pnLTracker.recordSell({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1100000000000000',
        price: 0.0011,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        profit: '90000000000000',
        profitPercent: 9,
        positionId: 1,
        txHash: '0x2',
      });

      const weeklyPnL = await pnLTracker.getWeeklyPnL();

      expect(weeklyPnL.period).toContain('Week');
      expect(weeklyPnL.totalTrades).toBe(2);
      expect(weeklyPnL.buyCount).toBe(1);
      expect(weeklyPnL.sellCount).toBe(1);
    });
  });

  describe('getMonthlyPnL', () => {
    it('should calculate monthly P&L', async () => {
      await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x1',
      });

      await pnLTracker.recordSell({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1100000000000000',
        price: 0.0011,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        profit: '90000000000000',
        profitPercent: 9,
        positionId: 1,
        txHash: '0x2',
      });

      const now = new Date();
      const monthlyPnL = await pnLTracker.getMonthlyPnL(now.getFullYear(), now.getMonth());

      expect(monthlyPnL.period).toMatch(/^\d{4}-\d{2}$/);
      expect(monthlyPnL.totalTrades).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle no trades gracefully', async () => {
      const dailyPnL = await pnLTracker.getDailyPnL();
      const cumulative = await pnLTracker.getCumulativePnL();

      expect(dailyPnL.totalTrades).toBe(0);
      expect(dailyPnL.netProfitEth).toBe(0);
      expect(cumulative.totalTrades).toBe(0);
      expect(cumulative.winRate).toBe(0);
    });

    it('should handle single trade', async () => {
      await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x1',
      });

      const dailyPnL = await pnLTracker.getDailyPnL();
      
      expect(dailyPnL.totalTrades).toBe(1);
      expect(dailyPnL.buyCount).toBe(1);
      expect(dailyPnL.sellCount).toBe(0);
    });

    it('should calculate profit percentage correctly', async () => {
      // Buy for 0.001 ETH
      await pnLTracker.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1000000000000000', // 0.001 ETH
        price: 0.001,
        gasCost: '0',
        gasUsed: '0',
        gasPrice: '0',
        positionId: 1,
        txHash: '0x1',
      });

      // Sell for 0.0011 ETH (10% profit before gas)
      await pnLTracker.recordSell({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1100000000000000', // 0.0011 ETH
        price: 0.0011,
        gasCost: '10000000000000', // 0.00001 ETH gas
        gasUsed: '100000',
        gasPrice: '100000000000',
        profit: '90000000000000', // 0.00009 ETH profit
        profitPercent: 9, // 9% after gas
        positionId: 1,
        txHash: '0x2',
      });

      const dailyPnL = await pnLTracker.getDailyPnL();
      
      expect(dailyPnL.realizedProfitEth).toBeCloseTo(0.00009, 8);
      expect(dailyPnL.netProfitEth).toBeCloseTo(0.00008, 8); // Profit minus gas
    });
  });
});
