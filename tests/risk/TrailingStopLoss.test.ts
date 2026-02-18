import { describe, it, expect, beforeEach } from 'vitest';
import { TrailingStopLoss, TrailingStopConfig } from '../../src/risk/TrailingStopLoss.js';
import { Position } from '../../src/types/index.js';

describe('TrailingStopLoss', () => {
  let trailingStop: TrailingStopLoss;
  let baseConfig: TrailingStopConfig;

  beforeEach(() => {
    baseConfig = {
      enabled: true,
      trailingPercent: 5,
      activationPercent: 3,
      useDynamicStep: false,
    };
    trailingStop = new TrailingStopLoss(baseConfig);
  });

  describe('Configuration', () => {
    it('should have default configuration', () => {
      const defaultTrailingStop = new TrailingStopLoss();
      const config = defaultTrailingStop.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.trailingPercent).toBe(5);
      expect(config.activationPercent).toBe(3);
      expect(config.useDynamicStep).toBe(false);
    });

    it('should accept custom configuration', () => {
      const config = trailingStop.getConfig();
      expect(config.trailingPercent).toBe(5);
      expect(config.activationPercent).toBe(3);
    });

    it('should allow configuration updates', () => {
      trailingStop.updateConfig({ trailingPercent: 10 });
      const config = trailingStop.getConfig();
      expect(config.trailingPercent).toBe(10);
      expect(config.activationPercent).toBe(3); // Unchanged
    });
  });

  describe('Position Initialization', () => {
    it('should initialize position with correct state', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012);
      const state = trailingStop.initializePosition(position);

      expect(state.highestPrice).toBe(position.buyMax);
      expect(state.activated).toBe(false);
      expect(state.activatedAt).toBeNull();
      expect(state.currentStopPrice).toBeGreaterThan(0);
    });

    it('should use position stopLossPrice when available', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012, 0.0000009);
      const state = trailingStop.initializePosition(position);
      expect(state.currentStopPrice).toBe(0.0000009);
    });
  });

  describe('Trailing Stop Logic', () => {
    it('should not trigger before activation', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012);
      trailingStop.initializePosition(position);

      // Price increases slightly but not enough to activate
      const result = trailingStop.update(position, 0.00000121);

      expect(result.activated).toBe(false);
      expect(result.triggered).toBe(false);
    });

    it('should activate when profit threshold is met', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012);
      trailingStop.initializePosition(position);

      // Price increases by more than activationPercent
      const result = trailingStop.update(position, 0.00000125);

      expect(result.activated).toBe(true);
      expect(result.profitPercent).toBeGreaterThan(3);
    });

    it('should update stop price when new highs are reached', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012);
      trailingStop.initializePosition(position);

      // First activation
      trailingStop.update(position, 0.0000015); // 25% profit
      const state1 = trailingStop.getState(position.id)!;
      const initialStop = state1.currentStopPrice;

      // New high
      trailingStop.update(position, 0.0000020); // 66% profit
      const state2 = trailingStop.getState(position.id)!;

      expect(state2.currentStopPrice).toBeGreaterThan(initialStop);
      expect(state2.highestPrice).toBe(0.0000020);
    });

    it('should trigger when price falls below trailing stop', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012);
      trailingStop.initializePosition(position);

      // Activate and reach a high
      trailingStop.update(position, 0.0000020); // 66% profit
      
      // Price drops below trailing stop (5% below high)
      const triggerPrice = 0.0000020 * 0.94; // Below 5% trailing stop
      const result = trailingStop.update(position, triggerPrice);

      expect(result.activated).toBe(true);
      expect(result.triggered).toBe(true);
    });

    it('should not move stop price down', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012);
      trailingStop.initializePosition(position);

      // Activate and set initial stop
      trailingStop.update(position, 0.0000020);
      const state1 = trailingStop.getState(position.id)!;
      const stopAfterHigh = state1.currentStopPrice;

      // Price drops (but not enough to trigger)
      trailingStop.update(position, 0.0000019);
      const state2 = trailingStop.getState(position.id)!;

      expect(state2.currentStopPrice).toBe(stopAfterHigh);
    });
  });

  describe('Dynamic Step Levels', () => {
    it('should use dynamic trail percentages when enabled', () => {
      const dynamicConfig: TrailingStopConfig = {
        enabled: true,
        trailingPercent: 5,
        activationPercent: 3,
        useDynamicStep: true,
        stepLevels: [
          { profitPercent: 10, trailPercent: 3 },
          { profitPercent: 20, trailPercent: 5 },
        ],
      };
      const dynamicTrailingStop = new TrailingStopLoss(dynamicConfig);

      const position = createTestPosition(1, 0.000001, 0.0000012);
      dynamicTrailingStop.initializePosition(position);

      // At 15% profit, should use 3% trail (from stepLevels)
      const result = dynamicTrailingStop.update(position, 0.00000138);
      expect(result.activated).toBe(true);
      expect(result.newStopPrice).toBeCloseTo(0.00000138 * 0.97, 10);
    });
  });

  describe('State Management', () => {
    it('should remove position state when sold', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012);
      trailingStop.initializePosition(position);

      expect(trailingStop.getState(position.id)).toBeDefined();

      trailingStop.removePosition(position.id);

      expect(trailingStop.getState(position.id)).toBeUndefined();
    });

    it('should serialize and deserialize states', () => {
      const position1 = createTestPosition(1, 0.000001, 0.0000012);
      const position2 = createTestPosition(2, 0.000002, 0.0000024);

      trailingStop.initializePosition(position1);
      trailingStop.initializePosition(position2);

      const serialized = trailingStop.serialize();
      expect(Object.keys(serialized)).toHaveLength(2);

      const newTrailingStop = new TrailingStopLoss();
      newTrailingStop.deserialize(serialized);

      expect(newTrailingStop.getState(1)).toBeDefined();
      expect(newTrailingStop.getState(2)).toBeDefined();
    });

    it('should reset all states', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012);
      trailingStop.initializePosition(position);

      expect(trailingStop.getAllStates().size).toBe(1);

      trailingStop.reset();

      expect(trailingStop.getAllStates().size).toBe(0);
    });
  });

  describe('Summary', () => {
    it('should provide position summary', () => {
      const position = createTestPosition(1, 0.000001, 0.0000012);
      trailingStop.initializePosition(position);
      trailingStop.update(position, 0.0000020);

      const summary = trailingStop.getSummary(position.id);

      expect(summary).toBeDefined();
      expect(summary?.enabled).toBe(true);
      expect(summary?.activated).toBe(true);
      expect(summary?.highestPrice).toBe(0.0000020);
      expect(summary?.distancePercent).toBeCloseTo(5, 10); // Default trailing percent
    });

    it('should return null for unknown position', () => {
      const summary = trailingStop.getSummary(999);
      expect(summary).toBeNull();
    });
  });
});

function createTestPosition(
  id: number,
  buyMin: number,
  buyMax: number,
  stopLossPrice?: number
): Position {
  return {
    id,
    buyMin,
    buyMax,
    buyPrice: buyMax,
    sellPrice: buyMax * 1.08,
    stopLossPrice: stopLossPrice || buyMin * 0.9,
    status: 'HOLDING',
    buyTxHash: '0x123',
    buyTimestamp: Date.now(),
    tokensReceived: '1000000000000000000',
    ethCost: '1000000000000000',
  };
}
