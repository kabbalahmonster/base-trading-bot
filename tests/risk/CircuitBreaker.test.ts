import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../src/risk/CircuitBreaker.js';
import { JsonStorage } from '../../src/storage/JsonStorage.js';
import { BotInstance } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CircuitBreaker', () => {
  let storage: JsonStorage;
  let circuitBreaker: CircuitBreaker;
  let tempFile: string;

  beforeEach(async () => {
    tempFile = join(tmpdir(), `test-circuit-breaker-${Date.now()}.json`);
    storage = new JsonStorage(tempFile);
    await storage.init();
    circuitBreaker = new CircuitBreaker(storage);
    await circuitBreaker.init();
  });

  afterEach(async () => {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore
    }
  });

  describe('Configuration', () => {
    it('should have default configuration', () => {
      const config = circuitBreaker.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxDailyLossPercent).toBe(10);
      expect(config.maxTotalLossPercent).toBe(20);
      expect(config.cooldownMinutes).toBe(60);
      expect(config.autoResetAtMidnight).toBe(true);
    });

    it('should allow configuration updates', () => {
      circuitBreaker.updateConfig({
        maxDailyLossPercent: 15,
        cooldownMinutes: 30,
      });

      const config = circuitBreaker.getConfig();
      expect(config.maxDailyLossPercent).toBe(15);
      expect(config.cooldownMinutes).toBe(30);
      expect(config.enabled).toBe(true); // Unchanged
    });
  });

  describe('State Management', () => {
    it('should start with untriggered state', () => {
      const state = circuitBreaker.getState();
      expect(state.triggered).toBe(false);
      expect(state.triggeredAt).toBeNull();
      expect(state.reason).toBeNull();
    });

    it('should not be triggered initially', () => {
      expect(circuitBreaker.isTriggered()).toBe(false);
    });

    it('should allow manual reset', async () => {
      await circuitBreaker.forceTrigger('Test trigger');
      expect(circuitBreaker.isTriggered()).toBe(true);

      await circuitBreaker.reset();
      expect(circuitBreaker.isTriggered()).toBe(false);
    });
  });

  describe('Loss Calculation', () => {
    it('should calculate zero loss when no bots', async () => {
      const result = await circuitBreaker.check([]);
      expect(result.triggered).toBe(false);
      expect(result.dailyLossPercent).toBe(0);
      expect(result.totalLossPercent).toBe(0);
    });

    it('should not trigger when losses are within limits', async () => {
      const bots: BotInstance[] = [
        createTestBot('bot1', '0.05'), // 0.05 ETH profit
      ];

      const result = await circuitBreaker.check(bots);
      expect(result.triggered).toBe(false);
    });

    it('should trigger when daily loss exceeds limit', async () => {
      // Set a very low loss limit
      circuitBreaker.updateConfig({ maxDailyLossPercent: 5 });

      const bots: BotInstance[] = [
        createTestBot('bot1', '-0.15'), // -0.15 ETH (loss)
      ];

      // Manually set daily start value to create a loss scenario
      const state = circuitBreaker.getState();
      state.dailyStartValue = '1.0';

      const result = await circuitBreaker.check(bots);
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('Daily loss limit reached');
    });
  });

  describe('Cooldown', () => {
    it('should respect cooldown period', async () => {
      circuitBreaker.updateConfig({ cooldownMinutes: 0.01 }); // Very short for testing

      await circuitBreaker.forceTrigger('Test');
      expect(circuitBreaker.isTriggered()).toBe(true);

      // Wait for cooldown to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should auto-reset after cooldown
      expect(circuitBreaker.isTriggered()).toBe(false);
    });
  });

  describe('Status Report', () => {
    it('should provide status summary', () => {
      const status = circuitBreaker.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.triggered).toBe(false);
      expect(status.cooldownRemaining).toBeNull();
      expect(status.config).toBeDefined();
    });

    it('should show cooldown remaining when triggered', async () => {
      await circuitBreaker.forceTrigger('Test');
      const status = circuitBreaker.getStatus();
      expect(status.triggered).toBe(true);
      expect(status.cooldownRemaining).toBeGreaterThan(0);
    });
  });
});

function createTestBot(id: string, profitEth: string): BotInstance {
  return {
    id,
    name: `Test Bot ${id}`,
    tokenAddress: '0x1234567890123456789012345678901234567890',
    tokenSymbol: 'TEST',
    chain: 'base',
    walletAddress: '0x1234567890123456789012345678901234567890',
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
    totalProfitEth: profitEth,
    totalProfitUsd: 0,
    isRunning: false,
    enabled: true,
    lastHeartbeat: Date.now(),
    currentPrice: 0.000005,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };
}
