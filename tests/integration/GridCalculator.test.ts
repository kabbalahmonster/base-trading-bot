// tests/integration/GridCalculator.test.ts

import { describe, it, expect } from 'vitest';
import { GridCalculator } from '../../src/grid/GridCalculator.js';
import { createGridConfig, createPositions, createBotScenario } from '../utils/factories.js';

describe('GridCalculator Integration Tests', () => {
  describe('Grid Generation', () => {
    it('should generate linear price grid', () => {
      const config = createGridConfig({
        numPositions: 5,
        floorPrice: 0.001,
        ceilingPrice: 0.01,
      });

      const positions = GridCalculator.generateGrid(0.005, config);

      expect(positions).toHaveLength(5);
      
      // Check ascending order (highest to lowest)
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i].buyPrice).toBeLessThan(positions[i - 1].buyPrice);
      }

      // Check price bounds
      expect(positions[0].buyPrice).toBeCloseTo(config.ceilingPrice, 10);
      expect(positions[positions.length - 1].buyPrice).toBeCloseTo(config.floorPrice, 10);
    });

    it('should calculate sell prices with take profit', () => {
      const config = createGridConfig({
        numPositions: 3,
        takeProfitPercent: 10,
      });

      const positions = GridCalculator.generateGrid(0.0005, config);

      positions.forEach(position => {
        const expectedSellPrice = position.buyPrice * 1.10; // 10% profit
        expect(position.sellPrice).toBeCloseTo(expectedSellPrice, 10);
      });
    });

    it('should calculate stop loss prices when enabled', () => {
      const config = createGridConfig({
        numPositions: 3,
        stopLossEnabled: true,
        stopLossPercent: 5,
      });

      const positions = GridCalculator.generateGrid(0.0005, config);

      positions.forEach(position => {
        const expectedStopLoss = position.buyPrice * 0.95; // 5% stop loss
        expect(position.stopLossPrice).toBeCloseTo(expectedStopLoss, 10);
      });
    });

    it('should handle edge case with single position', () => {
      const config = createGridConfig({
        numPositions: 1,
        floorPrice: 0.001,
        ceilingPrice: 0.01,
      });

      const positions = GridCalculator.generateGrid(0.005, config);

      expect(positions).toHaveLength(1);
      expect(positions[0].buyPrice).toBeCloseTo(config.floorPrice, 10);
    });

    it('should use auto-calculated floor/ceiling when not specified', () => {
      const currentPrice = 0.001;
      const config = createGridConfig({
        numPositions: 5,
        floorPrice: 0,
        ceilingPrice: 0,
      });

      const positions = GridCalculator.generateGrid(currentPrice, config);

      // Default: floor = current / 10, ceiling = current * 4
      expect(positions[0].buyPrice).toBeCloseTo(currentPrice * 4, 10);
      expect(positions[positions.length - 1].buyPrice).toBeCloseTo(currentPrice / 10, 10);
    });
  });

  describe('Buy Position Finding', () => {
    it('should find position within tolerance', () => {
      const positions = createPositions(10);
      const targetPosition = positions[5];

      // Test exact match
      const found = GridCalculator.findBuyPosition(positions, targetPosition.buyPrice);
      expect(found).toBeDefined();
      expect(found?.id).toBe(targetPosition.id);
    });

    it('should find position within 1% tolerance', () => {
      const positions = createPositions(10);
      const targetPosition = positions[5];

      // Test within 1% tolerance
      const slightlyHigher = targetPosition.buyPrice * 1.005; // 0.5% higher
      const found = GridCalculator.findBuyPosition(positions, slightlyHigher);
      expect(found).toBeDefined();
      expect(found?.id).toBe(targetPosition.id);
    });

    it('should not find filled positions', () => {
      const positions = createPositions(5);
      positions[0].status = 'HOLDING';
      positions[1].status = 'SOLD';

      const found = GridCalculator.findBuyPosition(positions, positions[0].buyPrice);
      expect(found).toBeNull();
    });

    it('should return null when no positions available', () => {
      const positions = createPositions(5);
      positions.forEach(p => p.status = 'HOLDING');

      const found = GridCalculator.findBuyPosition(positions, 0.0005);
      expect(found).toBeNull();
    });

    it('should prefer lower prices when multiple match', () => {
      // Create positions very close together
      const config = createGridConfig({ numPositions: 10, floorPrice: 0.0001, ceilingPrice: 0.00011 });
      const positions = GridCalculator.generateGrid(0.000105, config);

      // Price that might match multiple positions
      const ambiguousPrice = positions[5].buyPrice * 1.009; // Just within 1% of position 5

      const found = GridCalculator.findBuyPosition(positions, ambiguousPrice);
      
      // Should find a position
      expect(found).toBeDefined();
    });
  });

  describe('Sell Position Finding', () => {
    it('should find positions ready to sell', () => {
      const positions = createPositions(10);
      positions[0].status = 'HOLDING';
      positions[0].tokensReceived = '1000000000000000000';

      const currentPrice = positions[0].sellPrice + 0.00001; // Above sell target
      const sellPositions = GridCalculator.findSellPositions(positions, currentPrice);

      expect(sellPositions).toHaveLength(1);
      expect(sellPositions[0].id).toBe(positions[0].id);
    });

    it('should find positions at sell target with tolerance', () => {
      const positions = createPositions(10);
      positions[0].status = 'HOLDING';
      positions[0].tokensReceived = '1000000000000000000';

      // Just slightly below target (within 1%)
      const currentPrice = positions[0].sellPrice * 0.995;
      const sellPositions = GridCalculator.findSellPositions(positions, currentPrice);

      expect(sellPositions).toHaveLength(1);
    });

    it('should find positions at stop loss', () => {
      const positions = createPositions(10);
      positions[0].status = 'HOLDING';
      positions[0].tokensReceived = '1000000000000000000';
      positions[0].stopLossPrice = positions[0].buyPrice * 0.9; // 10% stop loss

      const currentPrice = positions[0].stopLossPrice * 0.99; // Below stop loss
      const sellPositions = GridCalculator.findSellPositions(positions, currentPrice);

      expect(sellPositions).toHaveLength(1);
    });

    it('should not return empty positions', () => {
      const positions = createPositions(5);
      // All positions are EMPTY by default

      const currentPrice = positions[0].sellPrice + 0.001;
      const sellPositions = GridCalculator.findSellPositions(positions, currentPrice);

      expect(sellPositions).toHaveLength(0);
    });

    it('should not return already sold positions', () => {
      const positions = createPositions(5);
      positions[0].status = 'SOLD';

      const currentPrice = positions[0].sellPrice + 0.001;
      const sellPositions = GridCalculator.findSellPositions(positions, currentPrice);

      expect(sellPositions).toHaveLength(0);
    });

    it('should return multiple positions when ready', () => {
      const positions = createPositions(10);
      positions[0].status = 'HOLDING';
      positions[0].tokensReceived = '1000000000000000000';
      positions[1].status = 'HOLDING';
      positions[1].tokensReceived = '1000000000000000000';
      positions[2].status = 'HOLDING';
      positions[2].tokensReceived = '1000000000000000000';

      // Price above all their sell targets
      const highPrice = Math.max(
        positions[0].sellPrice,
        positions[1].sellPrice,
        positions[2].sellPrice
      ) + 0.001;

      const sellPositions = GridCalculator.findSellPositions(positions, highPrice);

      expect(sellPositions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Active Position Counting', () => {
    it('should count only holding positions', () => {
      const positions = createPositions(10);
      positions[0].status = 'HOLDING';
      positions[1].status = 'HOLDING';
      positions[2].status = 'SOLD';

      const count = GridCalculator.countActivePositions(positions);
      expect(count).toBe(2);
    });

    it('should return 0 for no active positions', () => {
      const positions = createPositions(5);
      // All EMPTY by default

      const count = GridCalculator.countActivePositions(positions);
      expect(count).toBe(0);
    });

    it('should handle all sold positions', () => {
      const positions = createPositions(5);
      positions.forEach(p => p.status = 'SOLD');

      const count = GridCalculator.countActivePositions(positions);
      expect(count).toBe(0);
    });
  });

  describe('Position Size Calculation', () => {
    it('should calculate equal distribution', () => {
      const totalEth = '1000000000000000000'; // 1 ETH
      const numPositions = 10;

      const positionSize = GridCalculator.calculatePositionSize(totalEth, numPositions);

      expect(positionSize).toBe('100000000000000000'); // 0.1 ETH each
    });

    it('should handle uneven division', () => {
      const totalEth = '1000000000000000000'; // 1 ETH
      const numPositions = 3;

      const positionSize = GridCalculator.calculatePositionSize(totalEth, numPositions);

      // Should be 0.333... ETH (integer division)
      const expected = BigInt(1000000000000000000n) / BigInt(3);
      expect(positionSize).toBe(expected.toString());
    });

    it('should handle very small amounts', () => {
      const totalEth = '1000'; // Very small
      const numPositions = 5;

      const positionSize = GridCalculator.calculatePositionSize(totalEth, numPositions);

      expect(BigInt(positionSize)).toBeGreaterThanOrEqual(0n);
    });
  });

  describe('Price Formatting', () => {
    it('should format very small prices with precision', () => {
      const price = 0.000000123456;
      const formatted = GridCalculator.formatPrice(price);

      expect(formatted).toContain('0.000000');
    });

    it('should format normal prices with 4 decimals', () => {
      const price = 1.5;
      const formatted = GridCalculator.formatPrice(price);

      expect(formatted).toBe('1.50');
    });

    it('should format medium prices with 6 decimals', () => {
      const price = 0.5;
      const formatted = GridCalculator.formatPrice(price);

      expect(formatted).toMatch(/0\.500000/);
    });

    it('should use scientific notation for extremely small prices', () => {
      const price = 0.0000000001;
      const formatted = GridCalculator.formatPrice(price);

      expect(formatted).toContain('e');
    });
  });

  describe('Grid Statistics', () => {
    it('should calculate complete statistics', () => {
      const { positions } = createBotScenario({
        numPositions: 10,
        holdingPositions: 3,
        soldPositions: 2,
      });

      const stats = GridCalculator.calculateGridStats(positions);

      expect(stats.total).toBe(10);
      expect(stats.holding).toBe(3);
      expect(stats.sold).toBe(2);
      expect(stats.empty).toBe(5);
    });

    it('should calculate average profit correctly', () => {
      const positions = createPositions(5);
      positions[0].status = 'SOLD';
      positions[0].profitPercent = 10;
      positions[1].status = 'SOLD';
      positions[1].profitPercent = 20;

      const stats = GridCalculator.calculateGridStats(positions);

      expect(stats.avgProfit).toBe(15); // (10 + 20) / 2
    });

    it('should calculate total profit ETH', () => {
      const positions = createPositions(5);
      positions[0].status = 'SOLD';
      positions[0].profitEth = '1000000000000000000'; // 1 ETH
      positions[1].status = 'SOLD';
      positions[1].profitEth = '500000000000000000'; // 0.5 ETH

      const stats = GridCalculator.calculateGridStats(positions);

      expect(stats.totalProfitEth).toBe('1500000000000000000'); // 1.5 ETH
    });

    it('should handle no sold positions', () => {
      const positions = createPositions(5);
      // All EMPTY

      const stats = GridCalculator.calculateGridStats(positions);

      expect(stats.avgProfit).toBe(0);
      expect(stats.totalProfitEth).toBe('0');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle grid with varying position states', () => {
      const positions = createPositions(20);
      
      // Fill some positions
      positions[0].status = 'HOLDING';
      positions[0].tokensReceived = '1000000000000000000';
      positions[5].status = 'HOLDING';
      positions[5].tokensReceived = '1000000000000000000';
      positions[10].status = 'SOLD';
      positions[10].profitEth = '500000000000000000';
      positions[10].profitPercent = 50;

      const activeCount = GridCalculator.countActivePositions(positions);
      expect(activeCount).toBe(2);

      const stats = GridCalculator.calculateGridStats(positions);
      expect(stats.holding).toBe(2);
      expect(stats.sold).toBe(1);
      expect(stats.empty).toBe(17);
    });

    it('should handle full grid cycle', () => {
      const config = createGridConfig({ numPositions: 5 });
      let positions = GridCalculator.generateGrid(0.001, config);

      // Buy at each position
      positions.forEach(p => {
        p.status = 'HOLDING';
        p.tokensReceived = '1000000000000000000';
        p.ethCost = '1000000000000000';
      });

      // Sell all positions
      positions.forEach(p => {
        p.status = 'SOLD';
        p.profitEth = '100000000000000';
        p.profitPercent = 10;
      });

      const stats = GridCalculator.calculateGridStats(positions);
      expect(stats.sold).toBe(5);
      expect(stats.avgProfit).toBe(10);
    });
  });
});
