/**
 * @fileoverview Grid calculation logic for the Base Grid Trading Bot
 * @module grid/GridCalculator
 * @version 1.4.0
 */

import { Position, GridConfig } from '../types/index.js';

/**
 * Calculates and manages grid trading positions
 * @class GridCalculator
 * @description Generates continuous price ranges for grid trading with no gaps
 */
export class GridCalculator {
  /**
   * Generate grid positions with continuous buy ranges
   * @static
   * @param {number} currentPrice - Current token price in ETH
   * @param {GridConfig} config - Grid configuration parameters
   * @returns {Position[]} Array of positions with continuous coverage
   * @description Each position covers [buyMin, buyMax] with no gaps between positions.
   * The grid spans from floorPrice to ceilingPrice divided into numPositions segments.
   * @example
   * const positions = GridCalculator.generateGrid(0.0001, {
   *   numPositions: 24,
   *   floorPrice: 0.00001,
   *   ceilingPrice: 0.0004,
   *   takeProfitPercent: 8
   * });
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
   * @static
   * @param {Position[]} positions - Array of grid positions
   * @param {number} currentPrice - Current token price
   * @param {number} [tolerance] - Optional price tolerance buffer
   * @returns {Position | null} Position to buy or null if no match
   * @description Returns the first EMPTY position where currentPrice is within
   * [buyMin, buyMax] range. Includes optional tolerance for floating point precision.
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
   * @static
   * @param {Position[]} positions - Array of grid positions
   * @param {number} currentPrice - Current token price
   * @returns {Position[]} Array of positions ready to sell
   * @description Returns all HOLDING positions where currentPrice >= sellPrice
   * or currentPrice <= stopLossPrice (if stop loss enabled).
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
   * @static
   * @param {Position[]} positions - Array of grid positions
   * @param {number} currentPrice - Current token price
   * @returns {Position | null} Next buy opportunity or null
   * @description Returns the EMPTY position with the lowest buyMin that is above currentPrice.
   * Used for monitoring to show distance to next buy opportunity.
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
   * @static
   * @param {Position[]} positions - Array of grid positions
   * @returns {Position | null} Position with lowest sell target or null
   * @description Returns the HOLDING position with the lowest sellPrice.
   * Used for monitoring to show the next expected sell.
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
   * @static
   * @param {Position[]} positions - Array of grid positions
   * @returns {number} Count of positions with HOLDING status
   * @description Returns the number of positions currently holding tokens.
   * Used to enforce maxActivePositions limit.
   */
  static countActivePositions(positions: Position[]): number {
    return positions.filter(p => p.status === 'HOLDING').length;
  }

  /**
   * Calculate position size for equal ETH distribution
   * @static
   * @param {string} totalEth - Total ETH amount in wei
   * @param {number} numPositions - Number of positions to distribute across
   * @returns {string} ETH amount per position in wei
   * @description Divides total ETH equally among positions for auto-calculation.
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
   * @static
   * @param {number} price - Price value to format
   * @returns {string} Formatted price string
   * @description Formats price based on magnitude:
   * - < 0.0001: Exponential notation (4 decimals)
   * - < 1: Fixed 6 decimals
   * - >= 1: Fixed 4 decimals
   */
  static formatPrice(price: number): string {
    if (price < 0.0001) return price.toExponential(4);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  }

  /**
   * Format price range for display
   * @static
   * @param {number} min - Minimum price
   * @param {number} max - Maximum price
   * @returns {string} Formatted range string (e.g., "0.0001 - 0.0002")
   */
  static formatPriceRange(min: number, max: number): string {
    return `${this.formatPrice(min)} - ${this.formatPrice(max)}`;
  }

  /**
   * Calculate grid statistics
   * @static
   * @param {Position[]} positions - Array of grid positions
   * @returns {Object} Grid statistics object
   * @returns {number} returns.total - Total positions
   * @returns {number} returns.holding - Count of HOLDING positions
   * @returns {number} returns.sold - Count of SOLD positions
   * @returns {number} returns.empty - Count of EMPTY positions
   * @returns {number} returns.avgProfit - Average profit percentage
   * @returns {string} returns.totalProfitEth - Total profit in ETH (wei string)
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
   * @static
   * @param {Position[]} positions - Array of grid positions
   * @returns {boolean} True if positions are continuous (no gaps)
   * @description Checks that position[i].buyMax equals position[i+1].buyMin
   * within a small tolerance for floating point precision.
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
   * @static
   * @param {Position[]} positions - Array of grid positions
   * @returns {{floor: number, ceiling: number} | null} Grid range or null if empty
   * @description Returns the floor (lowest buyMin) and ceiling (highest buyMax)
   * covered by the grid positions.
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
