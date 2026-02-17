// tests/performance/gridCalculation.test.ts

import { describe, it, expect, bench } from 'vitest';
import { GridCalculator } from '../../src/grid/GridCalculator.js';
import { createGridConfig, createPositions } from '../utils/factories.js';

describe('Grid Calculation Performance', () => {
  describe('Grid Generation Speed', () => {
    bench('generate 10 positions', () => {
      const config = createGridConfig({ numPositions: 10 });
      GridCalculator.generateGrid(0.0005, config);
    });

    bench('generate 50 positions', () => {
      const config = createGridConfig({ numPositions: 50 });
      GridCalculator.generateGrid(0.0005, config);
    });

    bench('generate 100 positions', () => {
      const config = createGridConfig({ numPositions: 100 });
      GridCalculator.generateGrid(0.0005, config);
    });

    bench('generate 500 positions', () => {
      const config = createGridConfig({ numPositions: 500 });
      GridCalculator.generateGrid(0.0005, config);
    });

    it('should complete 100 position generation in under 10ms', () => {
      const config = createGridConfig({ numPositions: 100 });
      
      const start = performance.now();
      const positions = GridCalculator.generateGrid(0.0005, config);
      const end = performance.now();

      expect(positions).toHaveLength(100);
      expect(end - start).toBeLessThan(10);
    });
  });

  describe('Position Finding Speed', () => {
    bench('findBuyPosition in 100 positions', () => {
      const positions = createPositions(100);
      GridCalculator.findBuyPosition(positions, positions[50].buyPrice);
    });

    bench('findSellPositions in 100 positions', () => {
      const positions = createPositions(100);
      positions[0].status = 'HOLDING';
      positions[0].tokensReceived = '1000000000000000000';
      GridCalculator.findSellPositions(positions, positions[0].sellPrice + 0.001);
    });

    bench('countActivePositions in 100 positions', () => {
      const positions = createPositions(100);
      GridCalculator.countActivePositions(positions);
    });

    it('should find buy position in under 1ms for 1000 positions', () => {
      const positions = createPositions(1000);
      
      const start = performance.now();
      const result = GridCalculator.findBuyPosition(positions, positions[500].buyPrice);
      const end = performance.now();

      expect(result).toBeDefined();
      expect(end - start).toBeLessThan(1);
    });
  });

  describe('Statistics Calculation Speed', () => {
    bench('calculateGridStats for 100 positions', () => {
      const positions = createPositions(100);
      GridCalculator.calculateGridStats(positions);
    });

    bench('calculateGridStats for 500 positions', () => {
      const positions = createPositions(500);
      GridCalculator.calculateGridStats(positions);
    });

    it('should calculate stats for 1000 positions in under 5ms', () => {
      const positions = createPositions(1000);
      
      const start = performance.now();
      const stats = GridCalculator.calculateGridStats(positions);
      const end = performance.now();

      expect(stats.total).toBe(1000);
      expect(end - start).toBeLessThan(5);
    });
  });

  describe('Position Size Calculation', () => {
    bench('calculatePositionSize 1 ETH / 10 positions', () => {
      GridCalculator.calculatePositionSize('1000000000000000000', 10);
    });

    bench('calculatePositionSize 1 ETH / 100 positions', () => {
      GridCalculator.calculatePositionSize('1000000000000000000', 100);
    });

    bench('calculatePositionSize 10 ETH / 1000 positions', () => {
      GridCalculator.calculatePositionSize('10000000000000000000', 1000);
    });
  });

  describe('Grid Recalculation Scenarios', () => {
    it('should handle rapid price updates', () => {
      const config = createGridConfig({ numPositions: 50 });
      const prices = [0.0001, 0.0005, 0.001, 0.005, 0.01];
      
      const start = performance.now();
      
      for (const price of prices) {
        GridCalculator.generateGrid(price, config);
      }
      
      const end = performance.now();
      const avgTime = (end - start) / prices.length;

      expect(avgTime).toBeLessThan(5); // Average under 5ms per generation
    });

    bench('regenerate grid 100 times with different prices', () => {
      const config = createGridConfig({ numPositions: 20 });
      
      for (let i = 0; i < 100; i++) {
        const price = 0.0001 + (i * 0.00001);
        GridCalculator.generateGrid(price, config);
      }
    });
  });
});
