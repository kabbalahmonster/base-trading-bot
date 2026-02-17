// tests/GridCalculator.test.ts

import { describe, it, expect } from 'vitest';
import { GridCalculator } from '../src/grid/GridCalculator';
import { GridConfig, Position } from '../src/types';

describe('GridCalculator', () => {
  const baseConfig: GridConfig = {
    numPositions: 10,
    floorPrice: 0.0001,
    ceilingPrice: 0.001,
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
    heartbeatMs: 1000,
    skipHeartbeats: 0,
  };

  describe('generateGrid', () => {
    it('should generate correct number of positions', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      expect(positions).toHaveLength(10);
    });

    it('should calculate prices in ascending order', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i].buyPrice).toBeGreaterThan(positions[i - 1].buyPrice);
      }
    });

    it('should set first price at or below ceiling', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      expect(positions[0].buyPrice).toBeLessThanOrEqual(baseConfig.ceilingPrice);
    });

    it('should set last price at or above floor', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      const lastPosition = positions[positions.length - 1];
      expect(lastPosition.buyPrice).toBeGreaterThanOrEqual(baseConfig.floorPrice);
    });

    it('should calculate sell price with take profit', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      const position = positions[0];
      
      const expectedSellPrice = position.buyPrice * (1 + baseConfig.takeProfitPercent / 100);
      expect(position.sellPrice).toBeCloseTo(expectedSellPrice, 10);
    });

    it('should set all positions to EMPTY status initially', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      
      positions.forEach(position => {
        expect(position.status).toBe('EMPTY');
      });
    });

    it('should handle edge case with single position', () => {
      const config = { ...baseConfig, numPositions: 1 };
      const positions = GridCalculator.generateGrid(0.0005, config);
      
      expect(positions).toHaveLength(1);
      expect(positions[0].buyPrice).toBeLessThanOrEqual(config.ceilingPrice);
      expect(positions[0].buyPrice).toBeGreaterThanOrEqual(config.floorPrice);
    });
  });

  describe('findBuyPosition', () => {
    it('should find position when price is at buy level', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      const targetPosition = positions[5];
      
      const found = GridCalculator.findBuyPosition(positions, targetPosition.buyPrice);
      
      expect(found).toBeDefined();
      expect(found?.id).toBe(targetPosition.id);
    });

    it('should return null when no positions available', () => {
      const positions: Position[] = [];
      const found = GridCalculator.findBuyPosition(positions, 0.0005);
      
      expect(found).toBeNull();
    });

    it('should return null when all positions are holding', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      positions.forEach(p => p.status = 'HOLDING');
      
      const found = GridCalculator.findBuyPosition(positions, 0.0005);
      
      expect(found).toBeNull();
    });

    it('should prefer lower prices when multiple match', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      const lowPrice = positions[positions.length - 1].buyPrice;
      
      const found = GridCalculator.findBuyPosition(positions, lowPrice);
      
      expect(found).toBeDefined();
      expect(found?.buyPrice).toBe(lowPrice);
    });
  });

  describe('findSellPositions', () => {
    it('should find positions ready to sell', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      positions[0].status = 'HOLDING';
      positions[0].tokensReceived = '1000000000000000000';
      
      const currentPrice = positions[0].sellPrice + 0.0001;
      const sellPositions = GridCalculator.findSellPositions(positions, currentPrice);
      
      expect(sellPositions).toHaveLength(1);
      expect(sellPositions[0].id).toBe(positions[0].id);
    });

    it('should not return positions below sell price', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      positions[0].status = 'HOLDING';
      positions[0].tokensReceived = '1000000000000000000';
      
      const currentPrice = positions[0].sellPrice - 0.0001;
      const sellPositions = GridCalculator.findSellPositions(positions, currentPrice);
      
      expect(sellPositions).toHaveLength(0);
    });

    it('should return multiple positions when ready', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      positions[0].status = 'HOLDING';
      positions[0].tokensReceived = '1000000000000000000';
      positions[1].status = 'HOLDING';
      positions[1].tokensReceived = '1000000000000000000';
      
      const highPrice = Math.max(positions[0].sellPrice, positions[1].sellPrice) + 0.001;
      const sellPositions = GridCalculator.findSellPositions(positions, highPrice);
      
      expect(sellPositions.length).toBeGreaterThanOrEqual(2);
    });

    it('should not return empty positions', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      positions[0].status = 'EMPTY';
      
      const currentPrice = positions[0].sellPrice + 0.0001;
      const sellPositions = GridCalculator.findSellPositions(positions, currentPrice);
      
      expect(sellPositions).toHaveLength(0);
    });
  });

  describe('countActivePositions', () => {
    it('should count only HOLDING positions', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      positions[0].status = 'HOLDING';
      positions[1].status = 'HOLDING';
      
      const count = GridCalculator.countActivePositions(positions);
      
      expect(count).toBe(2);
    });

    it('should return 0 when no active positions', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      
      const count = GridCalculator.countActivePositions(positions);
      
      expect(count).toBe(0);
    });

    it('should not count SOLD positions', () => {
      const positions = GridCalculator.generateGrid(0.0005, baseConfig);
      positions[0].status = 'SOLD';
      
      const count = GridCalculator.countActivePositions(positions);
      
      expect(count).toBe(0);
    });
  });

  describe('formatPrice', () => {
    it('should format small prices with high precision', () => {
      const formatted = GridCalculator.formatPrice(0.000001234);
      expect(formatted).toBe('1.2340e-6');
    });

    it('should format larger prices with fewer decimals', () => {
      const formatted = GridCalculator.formatPrice(1.5);
      expect(formatted).toBe('1.5000');
    });

    it('should handle very small prices', () => {
      const formatted = GridCalculator.formatPrice(0.000000001);
      expect(formatted).toBe('1.0000e-9');
    });
  });
});
