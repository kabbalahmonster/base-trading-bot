// src/grid/GridCalculator.ts

import { Position, GridConfig } from '../types';

export class GridCalculator {
  /**
   * Generate grid positions based on config and current price
   */
  static generateGrid(
    currentPrice: number,
    config: GridConfig
  ): Position[] {
    const positions: Position[] = [];
    
    // Determine floor and ceiling
    let floorPrice: number;
    let ceilingPrice: number;
    
    if (config.floorPrice && config.ceilingPrice) {
      // Use manually set values
      floorPrice = config.floorPrice;
      ceilingPrice = config.ceilingPrice;
    } else {
      // Auto-calculate based on current price
      floorPrice = currentPrice / 10;  // 1/10 of current
      ceilingPrice = currentPrice * 4;  // 4x current
    }

    // Generate linear grid
    const priceStep = (ceilingPrice - floorPrice) / (config.numPositions - 1);

    for (let i = 0; i < config.numPositions; i++) {
      const buyPrice = floorPrice + (priceStep * i);
      
      // Calculate sell price based on take profit %
      const sellPrice = buyPrice * (1 + config.takeProfitPercent / 100);
      
      // Calculate stop loss price if enabled
      const stopLossPrice = config.stopLossEnabled
        ? buyPrice * (1 - config.stopLossPercent / 100)
        : 0;

      positions.push({
        id: i,
        buyPrice,
        sellPrice,
        stopLossPrice,
        status: 'EMPTY',
      });
    }

    return positions;
  }

  /**
   * Find position that should buy at current price
   */
  static findBuyPosition(
    positions: Position[],
    currentPrice: number,
    tolerance: number = 0.01 // 1% tolerance
  ): Position | null {
    for (const position of positions) {
      if (position.status !== 'EMPTY') continue;

      // Check if price is within tolerance of buy price
      const lowerBound = position.buyPrice * (1 - tolerance);
      const upperBound = position.buyPrice * (1 + tolerance);

      if (currentPrice >= lowerBound && currentPrice <= upperBound) {
        return position;
      }
    }
    return null;
  }

  /**
   * Find positions that should sell at current price
   */
  static findSellPositions(
    positions: Position[],
    currentPrice: number,
    tolerance: number = 0.01
  ): Position[] {
    const sellPositions: Position[] = [];

    for (const position of positions) {
      if (position.status !== 'HOLDING') continue;

      // Check if price reached sell target
      if (currentPrice >= position.sellPrice * (1 - tolerance)) {
        sellPositions.push(position);
      }

      // Check stop loss if enabled
      if (position.stopLossPrice > 0 && currentPrice <= position.stopLossPrice * (1 + tolerance)) {
        sellPositions.push(position);
      }
    }

    return sellPositions;
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
}
