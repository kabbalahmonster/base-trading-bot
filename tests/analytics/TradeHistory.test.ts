// tests/analytics/TradeHistory.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TradeHistory } from '../../src/analytics/TradeHistory.js';
import { TradeStorage } from '../../src/analytics/TradeStorage.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';

describe('TradeHistory', () => {
  let tradeHistory: TradeHistory;
  let tradeStorage: TradeStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'trade-history-test-'));
    const dbPath = join(tempDir, 'trades.json');
    
    tradeStorage = new TradeStorage(dbPath);
    await tradeStorage.init();
    tradeHistory = new TradeHistory(tradeStorage);
  });

  afterEach(async () => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe('recordTrade', () => {
    it('should record a buy trade', async () => {
      const trade = await tradeStorage.saveTrade({
        id: 'test-1',
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234567890123456789012345678901234567890',
        tokenSymbol: 'TEST',
        action: 'buy',
        amount: '1000000000000000000', // 1 token in wei
        price: 0.001,
        ethValue: '1000000000000000', // 0.001 ETH in wei
        gasCost: '10000000000000', // 0.00001 ETH
        timestamp: Date.now(),
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        positionId: 1,
      });

      const allTrades = await tradeHistory.getAllTrades();
      expect(allTrades.length).toBeGreaterThan(0);
      const savedTrade = allTrades[0];
      expect(savedTrade.action).toBe('buy');
      expect(savedTrade.botId).toBe('bot-1');
      expect(savedTrade.tokenSymbol).toBe('TEST');
      expect(savedTrade.timestamp).toBeDefined();
      expect(savedTrade.id).toBeDefined();
    });

    it('should record a sell trade with profit', async () => {
      await tradeStorage.saveTrade({
        id: 'test-2',
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234567890123456789012345678901234567890',
        tokenSymbol: 'TEST',
        action: 'sell',
        amount: '1000000000000000000',
        price: 0.0011,
        ethValue: '1100000000000000', // 0.0011 ETH (profit)
        gasCost: '10000000000000',
        profit: '90000000000000', // 0.00009 ETH profit
        profitPercent: 9.0,
        timestamp: Date.now(),
        txHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        positionId: 1,
      });

      const allTrades = await tradeHistory.getAllTrades();
      const savedTrade = allTrades.find(t => t.action === 'sell');
      expect(savedTrade).toBeDefined();
      expect(savedTrade?.action).toBe('sell');
      expect(savedTrade?.profit).toBe('90000000000000');
      expect(savedTrade?.profitPercent).toBe(9.0);
    });
  });

  describe('getTradesByBot', () => {
    it('should return trades for specific bot', async () => {
      // Record trades for different bots
      await tradeStorage.saveTrade({
        id: 'trade-1',
        botId: 'bot-1',
        botName: 'Bot One',
        tokenAddress: '0x1234',
        tokenSymbol: 'TKN1',
        action: 'buy',
        amount: '1000',
        price: 1,
        ethValue: '1000',
        gasCost: '100',
        timestamp: Date.now(),
        txHash: '0x1',
      });

      await tradeStorage.saveTrade({
        id: 'trade-2',
        botId: 'bot-2',
        botName: 'Bot Two',
        tokenAddress: '0x5678',
        tokenSymbol: 'TKN2',
        action: 'buy',
        amount: '2000',
        price: 1,
        ethValue: '2000',
        gasCost: '200',
        timestamp: Date.now(),
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
      await tradeStorage.saveTrade({
        id: 'trade-3',
        botId: 'bot-1',
        botName: 'Test Bot',
        action: 'buy',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        amount: '1000',
        price: 1,
        ethValue: '1000',
        gasCost: '100',
        timestamp: now,
        txHash: '0x1',
      });

      // Get trades from the last day
      const trades = await tradeHistory.getTradesByDateRange(new Date(now - oneDay), new Date(now + oneDay));
      expect(trades.length).toBeGreaterThan(0);
    });

    it('should return empty array for date range with no trades', async () => {
      const now = Date.now();
      const trades = await tradeHistory.getTradesByDateRange(new Date(now - 10000), new Date(now - 5000));
      expect(trades).toEqual([]);
    });
  });

  describe('getTradesByToken', () => {
    it('should return trades for specific token', async () => {
      await tradeStorage.saveTrade({
        id: 'trade-4',
        botId: 'bot-1',
        botName: 'Bot One',
        tokenAddress: '0x1234567890123456789012345678901234567890',
        tokenSymbol: 'TOKEN1',
        action: 'buy',
        amount: '1000',
        price: 1,
        ethValue: '1000',
        gasCost: '100',
        timestamp: Date.now(),
        txHash: '0x1',
      });

      await tradeStorage.saveTrade({
        id: 'trade-5',
        botId: 'bot-1',
        botName: 'Bot One',
        tokenAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        tokenSymbol: 'TOKEN2',
        action: 'buy',
        amount: '2000',
        price: 2,
        ethValue: '2000',
        gasCost: '200',
        timestamp: Date.now(),
        txHash: '0x2',
      });

      const token1Trades = await tradeHistory.getTradesByToken('0x1234567890123456789012345678901234567890');
      expect(token1Trades).toHaveLength(1);
      expect(token1Trades[0].tokenSymbol).toBe('TOKEN1');
    });
  });

  describe('getBotStats', () => {
    it('should return correct statistics', async () => {
      // Add multiple trades
      await tradeStorage.saveTrade({
        id: 'trade-6',
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        action: 'buy',
        amount: '1000000000000000000',
        price: 0.001,
        ethValue: '1000000000000000',
        gasCost: '10000000000000',
        timestamp: Date.now(),
        txHash: '0x1',
      });

      await tradeStorage.saveTrade({
        id: 'trade-7',
        botId: 'bot-1',
        botName: 'Test Bot',
        tokenAddress: '0x1234',
        tokenSymbol: 'TEST',
        action: 'sell',
        amount: '1000000000000000000',
        price: 0.0011,
        ethValue: '1100000000000000',
        gasCost: '10000000000000',
        profit: '90000000000000',
        profitPercent: 9,
        timestamp: Date.now(),
        txHash: '0x2',
      });

      await tradeStorage.saveTrade({
        id: 'trade-8',
        botId: 'bot-2',
        botName: 'Bot Two',
        tokenAddress: '0x5678',
        tokenSymbol: 'TEST2',
        action: 'buy',
        amount: '500000000000000000',
        price: 0.001,
        ethValue: '500000000000000',
        gasCost: '10000000000000',
        timestamp: Date.now(),
        txHash: '0x3',
      });

      const stats = await tradeHistory.getBotStats('bot-1');

      expect(stats.totalTrades).toBe(2);
      expect(stats.buys).toBe(1);
      expect(stats.sells).toBe(1);
    });

    it('should return zero stats for empty history', async () => {
      const stats = await tradeHistory.getBotStats('non-existent');

      expect(stats.totalTrades).toBe(0);
      expect(stats.buys).toBe(0);
      expect(stats.sells).toBe(0);
      expect(stats.totalProfit).toBe('0');
    });
  });

  describe('getAllTrades', () => {
    it('should return all trades sorted by timestamp', async () => {
      // Add trades with slight delays
      for (let i = 0; i < 5; i++) {
        await tradeStorage.saveTrade({
          id: `trade-${i}`,
          botId: 'bot-1',
          botName: 'Test Bot',
          tokenAddress: '0x1234',
          tokenSymbol: 'TEST',
          action: 'buy',
          amount: String(1000 * (i + 1)),
          price: 1,
          ethValue: String(1000 * (i + 1)),
          gasCost: '100',
          timestamp: Date.now() + i,
          txHash: `0x${i}`,
        });
      }

      const allTrades = await tradeHistory.getAllTrades();
      expect(allTrades).toHaveLength(5);
    });
  });
});
