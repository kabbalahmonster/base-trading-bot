// tests/analytics/TradeHistory.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TradeHistory, TradeRecord } from '../../src/analytics/TradeHistory';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

const TEST_DB_PATH = './test-trade-history.json';

describe('TradeHistory', () => {
  let tradeHistory: TradeHistory;

  beforeEach(async () => {
    // Clean up any existing test file
    if (existsSync(TEST_DB_PATH)) {
      await unlink(TEST_DB_PATH);
    }
    tradeHistory = new TradeHistory(TEST_DB_PATH);
    await tradeHistory.init();
  });

  afterEach(async () => {
    // Clean up test file
    if (existsSync(TEST_DB_PATH)) {
      await unlink(TEST_DB_PATH);
    }
  });

  describe('recordTrade', () => {
    it('should record a buy trade', async () => {
      const trade = await tradeHistory.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234567890123456789012345678901234567890',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000', // 1 token in wei
        amountEth: '1000000000000000', // 0.001 ETH in wei
        price: 0.001,
        gasCost: '10000000000000', // 0.00001 ETH
        gasUsed: '100000',
        gasPrice: '100000000000', // 100 gwei
        positionId: 1,
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      });

      expect(trade).toBeDefined();
      expect(trade.action).toBe('buy');
      expect(trade.botId).toBe('bot-1');
      expect(trade.tokenSymbol).toBe('TEST');
      expect(trade.timestamp).toBeDefined();
      expect(trade.date).toBeDefined();
      expect(trade.id).toBeDefined();
    });

    it('should record a sell trade with profit', async () => {
      const trade = await tradeHistory.recordSell({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234567890123456789012345678901234567890',
        tokenSymbol: 'TEST',
        amount: '1000000000000000000',
        amountEth: '1100000000000000', // 0.0011 ETH (profit)
        price: 0.0011,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        profit: '90000000000000', // 0.00009 ETH profit
        profitPercent: 9.0,
        positionId: 1,
        txHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      });

      expect(trade).toBeDefined();
      expect(trade.action).toBe('sell');
      expect(trade.profit).toBe('90000000000000');
      expect(trade.profitPercent).toBe(9.0);
    });
  });

  describe('getTradesByBot', () => {
    it('should return trades for specific bot', async () => {
      // Record trades for different bots
      await tradeHistory.recordBuy({
        botId: 'bot-1',
        botName: 'Bot One',
        tokenAddress: '0x1234',
        tokenSymbol: 'TKN1',
        amount: '1000',
        amountEth: '1000',
        price: 1,
        gasCost: '100',
        gasUsed: '100',
        gasPrice: '1',
        positionId: 1,
        txHash: '0x1',
      });

      await tradeHistory.recordBuy({
        botId: 'bot-2',
        botName: 'Bot Two',
        tokenAddress: '0x5678',
        tokenSymbol: 'TKN2',
        amount: '2000',
        amountEth: '2000',
        price: 1,
        gasCost: '200',
        gasUsed: '200',
        gasPrice: '1',
        positionId: 1,
        txHash: '0x2',
      });

      const bot1Trades = await tradeHistory.getTradesByBot('bot-1');
      expect(bot1Trades).toHaveLength(1);
      expect(bot1Trades[0].botId).toBe('bot-1');
      expect(bot1Trades[0].botName).toBe('Bot One');
    });

    it('should return empty array for unknown bot', async () => {
      const trades = await tradeHistory.getTradesByBot('non-existent');
      expect(trades).toEqual([]);
    });
  });

  describe('getTradesByDateRange', () => {
    it('should return trades within date range', async () => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      // Manually create trades with specific timestamps
      await tradeHistory.recordTrade({
        botId: 'bot-1',
        botName: 'Test Bot',
        action: 'buy',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000',
        amountEth: '1000',
        price: 1,
        gasCost: '100',
        gasUsed: '100',
        gasPrice: '1',
        positionId: 1,
        txHash: '0x1',
      });

      // Get trades from the last day
      const trades = await tradeHistory.getTradesByDateRange(now - oneDay, now + oneDay);
      expect(trades.length).toBeGreaterThan(0);
    });

    it('should return empty array for date range with no trades', async () => {
      const now = Date.now();
      const trades = await tradeHistory.getTradesByDateRange(now - 10000, now - 5000);
      expect(trades).toEqual([]);
    });
  });

  describe('getTradesByToken', () => {
    it('should return trades for specific token', async () => {
      await tradeHistory.recordBuy({
        botId: 'bot-1',
        botName: 'Bot One',
        tokenAddress: '0x1234567890123456789012345678901234567890',
        tokenSymbol: 'TOKEN1',
        amount: '1000',
        amountEth: '1000',
        price: 1,
        gasCost: '100',
        gasUsed: '100',
        gasPrice: '1',
        positionId: 1,
        txHash: '0x1',
      });

      await tradeHistory.recordBuy({
        botId: 'bot-1',
        botName: 'Bot One',
        tokenAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        tokenSymbol: 'TOKEN2',
        amount: '2000',
        amountEth: '2000',
        price: 2,
        gasCost: '200',
        gasUsed: '200',
        gasPrice: '1',
        positionId: 2,
        txHash: '0x2',
      });

      const token1Trades = await tradeHistory.getTradesByToken('0x1234567890123456789012345678901234567890');
      expect(token1Trades).toHaveLength(1);
      expect(token1Trades[0].tokenSymbol).toBe('TOKEN1');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      // Add multiple trades
      await tradeHistory.recordBuy({
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

      await tradeHistory.recordSell({
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

      await tradeHistory.recordBuy({
        botId: 'bot-2',
        botName: 'Bot Two',
        tokenAddress: '0x5678',
        tokenSymbol: 'TEST2',
        amount: '500000000000000000',
        amountEth: '500000000000000',
        price: 0.001,
        gasCost: '10000000000000',
        gasUsed: '100000',
        gasPrice: '100000000000',
        positionId: 1,
        txHash: '0x3',
      });

      const stats = await tradeHistory.getStats();

      expect(stats.totalTrades).toBe(3);
      expect(stats.totalBuys).toBe(2);
      expect(stats.totalSells).toBe(1);
      expect(stats.uniqueBots).toBe(2);
      expect(stats.totalProfitEth).toBe('90000000000000');
      expect(stats.dateRange).not.toBeNull();
    });

    it('should return zero stats for empty history', async () => {
      const stats = await tradeHistory.getStats();

      expect(stats.totalTrades).toBe(0);
      expect(stats.totalBuys).toBe(0);
      expect(stats.totalSells).toBe(0);
      expect(stats.uniqueBots).toBe(0);
      expect(stats.totalProfitEth).toBe('0');
      expect(stats.dateRange).toBeNull();
    });
  });

  describe('getRecentTrades', () => {
    it('should return recent trades sorted by timestamp', async () => {
      // Add trades with slight delays
      for (let i = 0; i < 5; i++) {
        await tradeHistory.recordBuy({
          botId: 'bot-1',
          botName: 'Test Bot',
          tokenAddress: '0x1234',
          tokenSymbol: 'TEST',
          amount: String(1000 * (i + 1)),
          amountEth: String(1000 * (i + 1)),
          price: 1,
          gasCost: '100',
          gasUsed: '100',
          gasPrice: '1',
          positionId: i,
          txHash: `0x${i}`,
        });
      }

      const recent = await tradeHistory.getRecentTrades(3);
      expect(recent).toHaveLength(3);
      // Should be sorted by timestamp descending (most recent first)
      expect(Number(recent[0].amount)).toBeGreaterThan(Number(recent[1].amount));
    });
  });

  describe('deleteTrade', () => {
    it('should delete a trade by ID', async () => {
      const trade = await tradeHistory.recordBuy({
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000',
        amountEth: '1000',
        price: 1,
        gasCost: '100',
        gasUsed: '100',
        gasPrice: '1',
        positionId: 1,
        txHash: '0x1',
      });

      const deleted = await tradeHistory.deleteTrade(trade.id);
      expect(deleted).toBe(true);

      const allTrades = await tradeHistory.getAllTrades();
      expect(allTrades).toHaveLength(0);
    });

    it('should return false for non-existent trade ID', async () => {
      const deleted = await tradeHistory.deleteTrade('non-existent-id');
      expect(deleted).toBe(false);
    });
  });
});
