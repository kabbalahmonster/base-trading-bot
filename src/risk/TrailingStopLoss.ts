// src/risk/TrailingStopLoss.ts
// Dynamic stop loss that follows price up to lock in profits

import { Position } from '../types/index.js';

export interface TrailingStopConfig {
  enabled: boolean;
  trailingPercent: number;       // How far below peak to set stop (default: 5%)
  activationPercent: number;     // Minimum profit before trailing activates (default: 3%)
  useDynamicStep: boolean;       // Use stepped trailing based on profit levels
  stepLevels?: {                 // Optional: different trail distances at different profit levels
    profitPercent: number;
    trailPercent: number;
  }[];
}

export interface TrailingStopState {
  highestPrice: number;          // Highest price seen since buy
  currentStopPrice: number;      // Current stop loss price
  activated: boolean;            // Whether trailing stop is active
  activatedAt: number | null;    // When trailing was activated
  lastUpdateTime: number;
}

export class TrailingStopLoss {
  private config: TrailingStopConfig;
  private states: Map<number, TrailingStopState> = new Map(); // positionId -> state

  constructor(config?: Partial<TrailingStopConfig>) {
    this.config = {
      enabled: true,
      trailingPercent: 5,
      activationPercent: 3,
      useDynamicStep: false,
      stepLevels: [
        { profitPercent: 10, trailPercent: 3 },   // Tight trail at 10% profit
        { profitPercent: 20, trailPercent: 5 },   // Medium trail at 20% profit
        { profitPercent: 50, trailPercent: 10 },  // Loose trail at 50% profit
      ],
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): TrailingStopConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TrailingStopConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Initialize trailing stop for a position
   */
  initializePosition(position: Position): TrailingStopState {
    const initialStop = position.stopLossPrice || position.buyMin * 0.9;
    
    const state: TrailingStopState = {
      highestPrice: position.buyMax,
      currentStopPrice: initialStop,
      activated: false,
      activatedAt: null,
      lastUpdateTime: Date.now(),
    };

    this.states.set(position.id, state);
    return state;
  }

  /**
   * Update trailing stop based on current price
   * Returns true if stop loss should be triggered
   */
  update(position: Position, currentPrice: number): { 
    triggered: boolean; 
    newStopPrice: number;
    activated: boolean;
    profitPercent: number;
  } {
    // Get or create state
    let state = this.states.get(position.id);
    if (!state) {
      state = this.initializePosition(position);
    }

    // Calculate current profit percentage
    const buyPrice = position.buyMax;
    const profitPercent = ((currentPrice - buyPrice) / buyPrice) * 100;

    // Check if trailing should activate
    if (!state.activated && profitPercent >= this.config.activationPercent) {
      state.activated = true;
      state.activatedAt = Date.now();
    }

    // Update highest price seen
    if (currentPrice > state.highestPrice) {
      state.highestPrice = currentPrice;
      
      // Recalculate stop price if activated
      if (state.activated) {
        const trailPercent = this.getTrailPercent(profitPercent);
        const newStopPrice = state.highestPrice * (1 - trailPercent / 100);
        
        // Only move stop up, never down
        if (newStopPrice > state.currentStopPrice) {
          state.currentStopPrice = newStopPrice;
          state.lastUpdateTime = Date.now();
        }
      }
    }

    // Check if stop loss triggered
    const triggered = currentPrice <= state.currentStopPrice && state.activated;

    this.states.set(position.id, state);

    return {
      triggered,
      newStopPrice: state.currentStopPrice,
      activated: state.activated,
      profitPercent,
    };
  }

  /**
   * Get the appropriate trail percentage based on profit level
   */
  private getTrailPercent(profitPercent: number): number {
    if (!this.config.useDynamicStep || !this.config.stepLevels) {
      return this.config.trailingPercent;
    }

    // Sort levels by profit (descending)
    const sortedLevels = [...this.config.stepLevels].sort((a, b) => 
      b.profitPercent - a.profitPercent
    );

    // Find the applicable level
    for (const level of sortedLevels) {
      if (profitPercent >= level.profitPercent) {
        return level.trailPercent;
      }
    }

    return this.config.trailingPercent;
  }

  /**
   * Get current state for a position
   */
  getState(positionId: number): TrailingStopState | undefined {
    return this.states.get(positionId);
  }

  /**
   * Remove state for a position (when sold)
   */
  removePosition(positionId: number): void {
    this.states.delete(positionId);
  }

  /**
   * Get all active trailing stops
   */
  getAllStates(): Map<number, TrailingStopState> {
    return new Map(this.states);
  }

  /**
   * Serialize states for storage
   */
  serialize(): Record<number, TrailingStopState> {
    const obj: Record<number, TrailingStopState> = {};
    this.states.forEach((state, id) => {
      obj[id] = state;
    });
    return obj;
  }

  /**
   * Deserialize states from storage
   */
  deserialize(data: Record<number, TrailingStopState>): void {
    this.states.clear();
    for (const [id, state] of Object.entries(data)) {
      this.states.set(Number(id), state);
    }
  }

  /**
   * Calculate stop loss price for a new position
   */
  calculateInitialStop(position: Position, useTrailing: boolean): number {
    if (!useTrailing || !this.config.enabled) {
      // Use traditional stop loss
      return position.stopLossPrice || position.buyMin * 0.9;
    }

    // For trailing stop, start with the configured stop loss or a default
    return position.stopLossPrice || position.buyMin * 0.9;
  }

  /**
   * Get summary of trailing stop for display
   */
  getSummary(positionId: number): {
    enabled: boolean;
    activated: boolean;
    highestPrice: number;
    currentStop: number;
    distanceFromStop: number;
    distancePercent: number;
  } | null {
    const state = this.states.get(positionId);
    if (!state) return null;

    return {
      enabled: this.config.enabled,
      activated: state.activated,
      highestPrice: state.highestPrice,
      currentStop: state.currentStopPrice,
      distanceFromStop: state.highestPrice - state.currentStopPrice,
      distancePercent: ((state.highestPrice - state.currentStopPrice) / state.highestPrice) * 100,
    };
  }

  /**
   * Reset all states
   */
  reset(): void {
    this.states.clear();
  }
}
