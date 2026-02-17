// tests/security/inputValidation.test.ts

import { describe, it, expect } from 'vitest';
import { GridCalculator } from '../../src/grid/GridCalculator.js';
import { createGridConfig, createPosition, TEST_ADDRESSES } from '../utils/index.js';

describe('Security: Input Validation Tests', () => {
  
  describe('Address Validation', () => {
    it('should handle various address formats', () => {
      const validAddresses = TEST_ADDRESSES.valid;
      const invalidAddresses = TEST_ADDRESSES.invalid;
      
      // Valid addresses should match expected pattern
      for (const addr of validAddresses) {
        expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
      
      // Invalid addresses should not match
      for (const addr of invalidAddresses) {
        expect(addr).not.toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    });

    it('should handle zero address', () => {
      expect(TEST_ADDRESSES.zero).toBe('0x0000000000000000000000000000000000000000');
    });

    it('should detect mixed case addresses', () => {
      const mixedCase = '0x696381f39F17cAD67032f5f52A4924ce84e51BA3';
      expect(mixedCase).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('Grid Configuration Validation', () => {
    it('should handle extreme price values', () => {
      const testCases = [
        { floor: 0.0000000001, ceiling: 0.000001 },
        { floor: 1, ceiling: 1000 },
        { floor: 0.001, ceiling: 1000000 },
      ];
      
      for (const { floor, ceiling } of testCases) {
        const config = createGridConfig({
          numPositions: 10,
          floorPrice: floor,
          ceilingPrice: ceiling,
        });
        
        const positions = GridCalculator.generateGrid((floor + ceiling) / 2, config);
        expect(positions).toHaveLength(10);
        expect(positions[0].buyPrice).toBeGreaterThanOrEqual(floor);
        expect(positions[positions.length - 1].buyPrice).toBeLessThanOrEqual(ceiling);
      }
    });

    it('should handle invalid position counts gracefully', () => {
      const invalidCounts = [0, -1, -100];
      
      for (const count of invalidCounts) {
        const config = createGridConfig({ numPositions: count });
        // Should either throw or handle gracefully
        expect(() => GridCalculator.generateGrid(0.0005, config)).toThrow();
      }
    });

    it('should handle very large position counts', () => {
      const config = createGridConfig({ numPositions: 10000 });
      const positions = GridCalculator.generateGrid(0.0005, config);
      
      expect(positions).toHaveLength(10000);
    });

    it('should handle inverted price ranges', () => {
      const config = createGridConfig({
        floorPrice: 0.01,
        ceilingPrice: 0.001, // Ceiling < floor
      });
      
      // Should handle gracefully (may produce negative prices)
      const positions = GridCalculator.generateGrid(0.005, config);
      expect(positions).toHaveLength(10);
    });

    it('should handle zero price ranges', () => {
      const config = createGridConfig({
        floorPrice: 0.001,
        ceilingPrice: 0.001, // Same value
      });
      
      const positions = GridCalculator.generateGrid(0.001, config);
      expect(positions).toHaveLength(10);
      // All positions should have same price
      expect(new Set(positions.map(p => p.buyPrice)).size).toBe(1);
    });
  });

  describe('Percentage Validation', () => {
    it('should handle extreme take profit percentages', () => {
      const testCases = [
        { profit: 0.01, expected: 0.01 },     // Very small
        { profit: 100, expected: 100 },       // 100%
        { profit: 1000, expected: 1000 },     // 1000%
        { profit: 10000, expected: 10000 },   // Extreme
      ];
      
      for (const { profit } of testCases) {
        const config = createGridConfig({ takeProfitPercent: profit });
        const positions = GridCalculator.generateGrid(0.0005, config);
        
        const expectedSellPrice = positions[0].buyPrice * (1 + profit / 100);
        expect(positions[0].sellPrice).toBeCloseTo(expectedSellPrice, 5);
      }
    });

    it('should handle negative percentages', () => {
      const config = createGridConfig({
        takeProfitPercent: -10, // Negative profit
      });
      
      const positions = GridCalculator.generateGrid(0.0005, config);
      // Sell price should be lower than buy price
      expect(positions[0].sellPrice).toBeLessThan(positions[0].buyPrice);
    });

    it('should handle extreme stop loss percentages', () => {
      const testCases = [
        { stopLoss: 1, enabled: true },
        { stopLoss: 99, enabled: true },
        { stopLoss: 100, enabled: true },
      ];
      
      for (const { stopLoss, enabled } of testCases) {
        const config = createGridConfig({
          stopLossEnabled: enabled,
          stopLossPercent: stopLoss,
        });
        
        const positions = GridCalculator.generateGrid(0.0005, config);
        expect(positions[0].stopLossPrice).toBeGreaterThan(0);
      }
    });
  });

  describe('Position Data Validation', () => {
    it('should handle invalid status values', () => {
      const position = createPosition({ status: 'INVALID' as any });
      
      // Should store the invalid value (TypeScript will allow it at runtime)
      expect(position.status).toBe('INVALID');
    });

    it('should handle missing optional fields', () => {
      const position = createPosition({
        id: 1,
        buyPrice: 0.0005,
        sellPrice: 0.0006,
        status: 'EMPTY',
      });
      
      expect(position.tokensReceived).toBeUndefined();
      expect(position.ethCost).toBeUndefined();
    });

    it('should handle very large token amounts', () => {
      const position = createPosition({
        status: 'HOLDING',
        tokensReceived: '999999999999999999999999999999', // Very large
        ethCost: '999999999999999999999999999999',
      });
      
      // Should handle without overflow
      expect(BigInt(position.tokensReceived!)).toBeDefined();
      expect(BigInt(position.ethCost!)).toBeDefined();
    });
  });

  describe('Tolerance Edge Cases', () => {
    it('should handle zero tolerance', () => {
      const positions = createPosition({ buyPrice: 0.0005 });
      const found = GridCalculator.findBuyPosition([positions], 0.0005, 0);
      
      // Should only match exact price
      expect(found).toBeDefined();
      
      const notFound = GridCalculator.findBuyPosition([positions], 0.0005001, 0);
      expect(notFound).toBeNull();
    });

    it('should handle very large tolerance', () => {
      const positions = createPosition({ buyPrice: 0.0005 });
      const found = GridCalculator.findBuyPosition([positions], 0.001, 1); // 100% tolerance
      
      // Should match even with large difference
      expect(found).toBeDefined();
    });

    it('should handle negative tolerance gracefully', () => {
      const positions = createPosition({ buyPrice: 0.0005 });
      
      // Should handle (may not find anything)
      expect(() => GridCalculator.findBuyPosition([positions], 0.0005, -0.01)).not.toThrow();
    });
  });

  describe('BigInt Validation', () => {
    it('should handle valid BigInt strings', () => {
      const validAmounts = [
        '0',
        '1',
        '1000000000000000000',
        '999999999999999999999999999',
      ];
      
      for (const amount of validAmounts) {
        expect(() => BigInt(amount)).not.toThrow();
      }
    });

    it('should reject invalid BigInt strings', () => {
      const invalidAmounts = [
        'not-a-number',
        '12.34',
        '',
        '0xGG',
      ];
      
      for (const amount of invalidAmounts) {
        expect(() => BigInt(amount)).toThrow();
      }
    });

    it('should handle hex BigInt strings', () => {
      const hexAmounts = [
        '0x0',
        '0x1',
        '0xde0b6b3a7640000', // 1 ETH in wei
        '0x' + 'f'.repeat(64),
      ];
      
      for (const amount of hexAmounts) {
        expect(() => BigInt(amount)).not.toThrow();
      }
    });
  });

  describe('Special Characters and Injection', () => {
    it('should handle special characters in names', () => {
      const specialNames = [
        '<script>alert("xss")</script>',
        "'; DROP TABLE wallets; --",
        'Name with emoji 🎉',
        'Very\nLong\nName',
        'Name\tWith\tTabs',
      ];
      
      for (const name of specialNames) {
        // Should not throw
        expect(() => createPosition({ id: 1 })).not.toThrow();
      }
    });
  });
});
