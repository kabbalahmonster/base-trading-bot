// src/grid/GridCalculator.ts

import { Position, GridConfig } from '../types/index.js';

export class GridCalculator {
  /**
   * Generate grid positions with continuous buy ranges
   * Each position covers a range from buyMin to buyMax
   * Ranges are continuous: position[i].buyMax = position[i+1].buyMin
   */
  static generateGrid(
    currentPrice: number,
    config: GridConfig
  ): Position[] {
    // Validate numPositions
    if (config.numPositions <= 0) {
      throw new Error(`Invalid numPositions: ${config.numPositions}. Must be greater than 0.`);
    }

    const positions: Position[] = [];

    // Determine floor and ceiling
    let floorPrice: number;
    let ceilingPrice: number;

    if (config.floorPrice && config.ceilingPrice) {
      floorPrice = config.floorPrice;
      ceilingPrice = config.ceilingPrice;
    } else {
      // Auto-calculate based on current price
      floorPrice = currentPrice / 10;  // 1/10 of current
      ceilingPrice = currentPrice * 4;  // 4x current
    }

    // Calculate total range
    const totalRange = ceilingPrice - floorPrice;

    // Generate positions with continuous ranges
    for (let i = 0; i < config.numPositions; i++) {
      // Calculate position's share of the range
      const rangeStart = floorPrice + (totalRange * i) / config.numPositions;
      const rangeEnd = floorPrice + (totalRange * (i + 1)) / config.numPositions;

      const buyMin = rangeStart;
      // Clamp buyMax to ceiling to handle floating point precision issues
      const buyMax = Math.min(rangeEnd, ceilingPrice);

      // Sell price is based on buyMax for minimum guaranteed profit
      const sellPrice = buyMax * (1 + config.takeProfitPercent / 100);

      // Stop loss is based on buyMin
      // Clamp stopLossPercent to valid range (0-100) to prevent negative prices
      const clampedStopLossPercent = Math.max(0, Math.min(100, config.stopLossPercent));
      const stopLossPrice = config.stopLossEnabled
        ? buyMin * (1 - clampedStopLossPercent / 100)
        : 0;

      positions.push({
        id: i,
        buyMin,
        buyMax,
        buyPrice: buyMax, // Legacy compatibility
        sellPrice,
        stopLossPrice,
        status: 'EMPTY',
      });
    }

    return positions;
  }

  /**
   * Find position that should buy at current price
   * Price must be within the position's buy range [buyMin, buyMax]
   */
  static findBuyPosition(
    positions: Position[],
    currentPrice: number,
    tolerance?: number
  ): Position | null {
    for (const position of positions) {
      if (position.status !== 'EMPTY') continue;

      // Check if price is within the buy range [buyMin, buyMax]
      // Allow small buffer at boundaries for floating point precision
      const buffer = tolerance !== undefined 
        ? tolerance 
        : (position.buyMax - position.buyMin) * 0.001;

      if (currentPrice >= position.buyMin - buffer && currentPrice <= position.buyMax + buffer) {
        return position;
      }
    }
    return null;
  }

  /**
   * Find all positions that should sell at current price
   * Position sells when price reaches or exceeds sellPrice
   */
  static findSellPositions(
    positions: Position[],
    currentPrice: number
  ): Position[] {
    const sellPositions: Position[] = [];

    for (const position of positions) {
      if (position.status !== 'HOLDING') continue;

      // Sell when price reaches target (based on buyMax)
      if (currentPrice >= position.sellPrice) {
        sellPositions.push(position);
        continue;
      }

      // Stop loss check (based on buyMin)
      if (position.stopLossPrice > 0 && currentPrice <= position.stopLossPrice) {
        sellPositions.push(position);
      }
    }

    return sellPositions;
  }

  /**
   * Find next buy opportunity (closest empty position above current price)
   */
  static findNextBuyOpportunity(
    positions: Position[],
    currentPrice: number
  ): Position | null {
    const emptyPositions = positions
      .filter(p => p.status === 'EMPTY' && p.buyMin > currentPrice)
      .sort((a, b) => a.buyMin - b.buyMin);

    return emptyPositions[0] || null;
  }

  /**
   * Find next sell opportunity (lowest sell price among holding positions)
   */
  static findNextSellOpportunity(
    positions: Position[]
  ): Position | null {
    const holdingPositions = positions
      .filter(p => p.status === 'HOLDING')
      .sort((a, b) => a.sellPrice - b.sellPrice);

    return holdingPositions[0] || null;
  }

  /**
   * Count active (holding) positions
   */
  static countActivePositions(positions: Position[]): number {
    return positions.filter(p => p.status === 'HOLDING').length;
  }

  /**
   * Calculate position size for equal ETH distribution
   */
  static calculatePositionSize(
    totalEth: string,
    numPositions: number
  ): string {
    const total = BigInt(totalEth);
    const size = total / BigInt(numPositions);
    return size.toString();
  }

  /**
   * Format price for display
   */
  static formatPrice(price: number): string {
    if (price < 0.0001) return price.toExponential(4);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  }

  /**
   * Format price range for display
   */
  static formatPriceRange(min: number, max: number): string {
    return `${this.formatPrice(min)} - ${this.formatPrice(max)}`;
  }

  /**
   * Calculate grid statistics
   */
  static calculateGridStats(positions: Position[]) {
    const holding = positions.filter(p => p.status === 'HOLDING');
    const sold = positions.filter(p => p.status === 'SOLD');
    const empty = positions.filter(p => p.status === 'EMPTY');

    const totalProfit = sold.reduce((sum, p) => sum + (p.profitPercent || 0), 0);

    return {
      total: positions.length,
      holding: holding.length,
      sold: sold.length,
      empty: empty.length,
      avgProfit: sold.length > 0 ? totalProfit / sold.length : 0,
      totalProfitEth: sold.reduce((sum, p) => sum + BigInt(p.profitEth || '0'), BigInt(0)).toString(),
    };
  }

  /**
   * Validate that grid has continuous coverage (no gaps)
   */
  static validateContinuousCoverage(positions: Position[]): boolean {
    if (positions.length < 2) return true;

    // Sort by buyMin
    const sorted = [...positions].sort((a, b) => a.buyMin - b.buyMin);

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      // Check for gaps (allow small floating point tolerance)
      const tolerance = (current.buyMax - current.buyMin) * 0.001;
      if (Math.abs(current.buyMax - next.buyMin) > tolerance) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the price range covered by the grid
   */
  static getGridRange(positions: Position[]): { floor: number; ceiling: number } | null {
    if (positions.length === 0) return null;

    const sorted = [...positions].sort((a, b) => a.buyMin - b.buyMin);
    return {
      floor: sorted[0].buyMin,
      ceiling: sorted[sorted.length - 1].buyMax,
    };
  }
}
