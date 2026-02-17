// tests/performance/memoryUsage.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GridCalculator } from '../../src/grid/GridCalculator.js';
import { WalletManager } from '../../src/wallet/WalletManager.js';
import { createGridConfig, createPositions, createBotInstance } from '../utils/factories.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Memory Usage Tests', () => {
  
  function getMemoryUsage() {
    if (global.gc) {
      global.gc();
    }
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
    };
  }

  describe('Grid Memory Usage', () => {
    it('should use reasonable memory for 1000 positions', () => {
      const before = getMemoryUsage();
      
      const config = createGridConfig({ numPositions: 1000 });
      const positions = GridCalculator.generateGrid(0.0005, config);
      
      const after = getMemoryUsage();
      const memoryIncrease = after.heapUsed - before.heapUsed;

      expect(positions).toHaveLength(1000);
      expect(memoryIncrease).toBeLessThan(5); // Should use less than 5MB
    });

    it('should handle multiple grid generations efficiently', () => {
      const before = getMemoryUsage();
      
      // Generate many grids
      for (let i = 0; i < 100; i++) {
        const config = createGridConfig({ numPositions: 100 });
        GridCalculator.generateGrid(0.0001 + (i * 0.00001), config);
      }
      
      const after = getMemoryUsage();
      const memoryIncrease = after.heapUsed - before.heapUsed;

      expect(memoryIncrease).toBeLessThan(20); // Should use less than 20MB total
    });
  });

  describe('Wallet Memory Usage', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-mem-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should handle 100 wallets efficiently', async () => {
      const walletManager = new WalletManager(tempDir);
      await walletManager.initialize('test-password-123');
      
      const before = getMemoryUsage();
      
      // Generate 100 wallets
      walletManager.generateMainWallet();
      for (let i = 0; i < 99; i++) {
        walletManager.generateBotWallet(`bot-${i}`);
      }
      
      const after = getMemoryUsage();
      const memoryIncrease = after.heapUsed - before.heapUsed;

      expect(Object.keys(walletManager.getAllWallets()).length).toBe(100);
      expect(memoryIncrease).toBeLessThan(10); // Should use less than 10MB
    });

    it('should not leak memory on repeated wallet operations', async () => {
      const walletManager = new WalletManager(tempDir);
      await walletManager.initialize('test-password-123');
      
      // Warm up
      for (let i = 0; i < 10; i++) {
        walletManager.generateBotWallet(`warmup-${i}`);
      }

      const before = getMemoryUsage();
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        const walletId = `stress-${i}`;
        walletManager.generateBotWallet(walletId);
        walletManager.getBotAccount(walletId);
        
        if (i > 50) {
          // Remove old references
          delete (walletManager as any).walletDictionary[`stress-${i - 50}`];
        }
      }
      
      const after = getMemoryUsage();
      const memoryIncrease = after.heapUsed - before.heapUsed;

      expect(memoryIncrease).toBeLessThan(15); // Should not grow unboundedly
    });
  });

  describe('Bot Instance Memory Usage', () => {
    it('should handle many bot instances efficiently', () => {
      const before = getMemoryUsage();
      
      const bots = [];
      for (let i = 0; i < 100; i++) {
        bots.push(createBotInstance({
          numPositions: 20,
        }));
      }
      
      const after = getMemoryUsage();
      const memoryIncrease = after.heapUsed - before.heapUsed;

      expect(bots.length).toBe(100);
      expect(memoryIncrease).toBeLessThan(30); // Should use less than 30MB
    });

    it('should handle bots with large position histories', () => {
      const before = getMemoryUsage();
      
      // Create bot with many positions
      const positions = createPositions(100);
      for (let i = 0; i < 50; i++) {
        positions[i].status = 'SOLD';
        positions[i].buyTxHash = '0x' + 'a'.repeat(64);
        positions[i].sellTxHash = '0x' + 'b'.repeat(64);
        positions[i].tokensReceived = '1000000000000000000';
        positions[i].ethCost = '1000000000000000';
        positions[i].ethReceived = '1500000000000000';
        positions[i].profitEth = '500000000000000';
      }

      const bot = createBotInstance({ positions });
      
      const after = getMemoryUsage();
      const memoryIncrease = after.heapUsed - before.heapUsed;

      expect(bot.positions).toHaveLength(100);
      expect(memoryIncrease).toBeLessThan(5); // Should use less than 5MB
    });
  });

  describe('String Operations Memory', () => {
    it('should handle large quote data efficiently', () => {
      const before = getMemoryUsage();
      
      // Simulate many large quote responses
      const quotes = [];
      for (let i = 0; i < 1000; i++) {
        quotes.push({
          buyToken: '0x696381f39F17cAD67032f5f52A4924ce84e51BA3',
          sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          buyAmount: '1000000000000000000000000',
          sellAmount: '1000000000000000000',
          price: '0.000001',
          gas: '200000',
          gasPrice: '1000000000',
          to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
          data: '0x' + '0'.repeat(2000), // Large data field
          value: '1000000000000000',
        });
      }
      
      const after = getMemoryUsage();
      const memoryIncrease = after.heapUsed - before.heapUsed;

      expect(quotes.length).toBe(1000);
      expect(memoryIncrease).toBeLessThan(50); // Should use less than 50MB
    });
  });
});
