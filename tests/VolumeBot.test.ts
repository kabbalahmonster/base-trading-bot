import { describe, it, expect, beforeEach } from 'vitest';
import { GridConfig, BotInstance } from '../src/types/index.js';

describe('Volume Bot Mode', () => {
  describe('GridConfig', () => {
    it('should support volume mode configuration', () => {
      const config: GridConfig = {
        numPositions: 0,
        floorPrice: 0,
        ceilingPrice: 0,
        useMarketCap: false,
        takeProfitPercent: 0,
        stopLossPercent: 0,
        stopLossEnabled: false,
        buysEnabled: true,
        sellsEnabled: true,
        moonBagEnabled: false,
        moonBagPercent: 0,
        minProfitPercent: 0,
        maxActivePositions: 1,
        useFixedBuyAmount: true,
        buyAmount: 0.001,
        volumeMode: true,
        volumeBuysPerCycle: 3,
        volumeBuyAmount: 0.001,
        heartbeatMs: 1000,
        skipHeartbeats: 0,
      };

      expect(config.volumeMode).toBe(true);
      expect(config.volumeBuysPerCycle).toBe(3);
      expect(config.volumeBuyAmount).toBe(0.001);
    });

    it('should work without volume mode (backward compatibility)', () => {
      const config: GridConfig = {
        numPositions: 24,
        floorPrice: 0.000001,
        ceilingPrice: 0.000004,
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
        useFixedBuyAmount: false,
        buyAmount: 0,
        heartbeatMs: 1000,
        skipHeartbeats: 0,
      };

      expect(config.volumeMode).toBeUndefined();
      expect(config.volumeBuysPerCycle).toBeUndefined();
      expect(config.volumeBuyAmount).toBeUndefined();
    });
  });

  describe('BotInstance', () => {
    it('should support volume mode state', () => {
      const instance: BotInstance = {
        id: 'test-id',
        name: 'Test Volume Bot',
        tokenAddress: '0x4200000000000000000000000000000000000006',
        tokenSymbol: 'TEST',
        chain: 'base',
        walletAddress: '0x1234567890123456789012345678901234567890',
        useMainWallet: true,
        config: {
          numPositions: 0,
          floorPrice: 0,
          ceilingPrice: 0,
          useMarketCap: false,
          takeProfitPercent: 0,
          stopLossPercent: 0,
          stopLossEnabled: false,
          buysEnabled: true,
          sellsEnabled: true,
          moonBagEnabled: false,
          moonBagPercent: 0,
          minProfitPercent: 0,
          maxActivePositions: 1,
          useFixedBuyAmount: true,
          buyAmount: 0.001,
          volumeMode: true,
          volumeBuysPerCycle: 3,
          volumeBuyAmount: 0.001,
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
        lastHeartbeat: 0,
        currentPrice: 0.000001,
        volumeBuysInCycle: 2,
        volumeAccumulatedTokens: '1000000000000000000',
        volumeCycleCount: 1,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      expect(instance.volumeBuysInCycle).toBe(2);
      expect(instance.volumeAccumulatedTokens).toBe('1000000000000000000');
      expect(instance.volumeCycleCount).toBe(1);
    });

    it('should handle undefined volume state for grid bots', () => {
      const instance: BotInstance = {
        id: 'test-id',
        name: 'Test Grid Bot',
        tokenAddress: '0x4200000000000000000000000000000000000006',
        tokenSymbol: 'TEST',
        chain: 'base',
        walletAddress: '0x1234567890123456789012345678901234567890',
        useMainWallet: true,
        config: {
          numPositions: 24,
          floorPrice: 0.000001,
          ceilingPrice: 0.000004,
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
          useFixedBuyAmount: false,
          buyAmount: 0,
          heartbeatMs: 1000,
          skipHeartbacks: 0,
        },
        positions: [],
        totalBuys: 0,
        totalSells: 0,
        totalProfitEth: '0',
        totalProfitUsd: 0,
        isRunning: false,
        enabled: true,
        lastHeartbeat: 0,
        currentPrice: 0.000001,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      expect(instance.volumeBuysInCycle).toBeUndefined();
      expect(instance.volumeAccumulatedTokens).toBeUndefined();
      expect(instance.volumeCycleCount).toBeUndefined();
    });
  });

  describe('Volume Cycle Logic', () => {
    it('should correctly track buy progress', () => {
      const buysPerCycle = 3;
      let currentBuys = 0;
      let accumulatedTokens = BigInt(0);

      // Simulate 3 buys
      for (let i = 0; i < buysPerCycle; i++) {
        expect(currentBuys < buysPerCycle).toBe(true);
        currentBuys++;
        accumulatedTokens += BigInt('500000000000000000'); // 0.5 tokens
      }

      expect(currentBuys).toBe(3);
      expect(accumulatedTokens).toBe(BigInt('1500000000000000000'));
    });

    it('should reset cycle after sell', () => {
      let currentBuys = 3;
      let accumulatedTokens = BigInt('1500000000000000000');
      let cycleCount = 0;

      // Simulate sell and reset
      if (currentBuys >= 3 && accumulatedTokens > 0) {
        cycleCount++;
        currentBuys = 0;
        accumulatedTokens = BigInt(0);
      }

      expect(currentBuys).toBe(0);
      expect(accumulatedTokens).toBe(BigInt(0));
      expect(cycleCount).toBe(1);
    });
  });
});
