// src/oracle/UniswapV3TWAP.ts
// Uniswap V3 Time-Weighted Average Price (TWAP) implementation for Base mainnet

import { PublicClient, parseAbi } from 'viem';

// Uniswap V3 Pool ABI (minimal for TWAP)
const POOL_ABI = parseAbi([
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function observations(uint256 index) external view returns (uint32 blockTimestamp, int56 tickCumulative, uint160 secondsPerLiquidityCumulativeX128, bool initialized)',
  'function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)',
  'function liquidity() external view returns (uint128)',
  'function fee() external view returns (uint24)',
]);

const FACTORY_ABI = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
]);

// Uniswap V3 Factory on Base mainnet
const UNISWAP_V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';

// Common fee tiers
export const FEE_TIERS = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%

// Default TWAP window in seconds (30 minutes)
export const DEFAULT_TWAP_SECONDS = 30 * 60;

// WETH address on Base
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

export interface TWAPConfig {
  twapSeconds?: number;      // Default: 30 minutes
  maxObservationAge?: number; // Default: 2 hours (in seconds)
}

export interface TWAPResult {
  price: number;             // Price in terms of quote token
  sqrtPriceX96: bigint;      // Raw sqrt price
  tick: number;              // Current tick
  timestamp: number;         // Block timestamp
  secondsAgo: number;        // TWAP window used
  confidence: number;        // 0-1 confidence score
}

export interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  tick: number;
}

export class UniswapV3TWAP {
  private publicClient: PublicClient;
  private config: Required<TWAPConfig>;

  constructor(publicClient: PublicClient, config: TWAPConfig = {}) {
    this.publicClient = publicClient;
    this.config = {
      twapSeconds: config.twapSeconds ?? DEFAULT_TWAP_SECONDS,
      maxObservationAge: config.maxObservationAge ?? 2 * 60 * 60, // 2 hours
    };
  }

  /**
   * Find the best pool for a token pair (highest liquidity)
   */
  async findBestPool(tokenA: string, tokenB: string): Promise<string | null> {
    let bestPool: string | null = null;
    let bestLiquidity = BigInt(0);

    for (const fee of FEE_TIERS) {
      try {
        const poolAddress = await this.publicClient.readContract({
          address: UNISWAP_V3_FACTORY as `0x${string}`,
          abi: FACTORY_ABI,
          functionName: 'getPool',
          args: [tokenA as `0x${string}`, tokenB as `0x${string}`, fee],
        });

        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
          const liquidity = await this.publicClient.readContract({
            address: poolAddress as `0x${string}`,
            abi: POOL_ABI,
            functionName: 'liquidity',
          });

          if (liquidity > bestLiquidity) {
            bestLiquidity = liquidity;
            bestPool = poolAddress;
          }
        }
      } catch (error) {
        // Pool doesn't exist for this fee tier
        continue;
      }
    }

    return bestPool;
  }

  /**
   * Get pool info
   */
  async getPoolInfo(poolAddress: string): Promise<PoolInfo | null> {
    try {
      const [slot0, liquidity, fee] = await Promise.all([
        this.publicClient.readContract({
          address: poolAddress as `0x${string}`,
          abi: POOL_ABI,
          functionName: 'slot0',
        }),
        this.publicClient.readContract({
          address: poolAddress as `0x${string}`,
          abi: POOL_ABI,
          functionName: 'liquidity',
        }),
        this.publicClient.readContract({
          address: poolAddress as `0x${string}`,
          abi: POOL_ABI,
          functionName: 'fee',
        }),
      ]);

      const [sqrtPriceX96, tick] = slot0;

      return {
        address: poolAddress,
        token0: '', // Would need token() calls
        token1: '',
        fee: Number(fee),
        liquidity,
        sqrtPriceX96,
        tick: Number(tick),
      };
    } catch (error: any) {
      console.error(`Error fetching pool info:`, error.message);
      return null;
    }
  }

  /**
   * Calculate price from sqrtPriceX96
   * Price = (sqrtPriceX96 / 2^96)^2
   */
  private sqrtPriceX96ToPrice(sqrtPriceX96: bigint, token0Decimals: number = 18, token1Decimals: number = 18): number {
    // sqrtPriceX96 = sqrt(price) * 2^96
    // price = (sqrtPriceX96 / 2^96)^2
    const Q96 = BigInt(2) ** BigInt(96);
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    const price = sqrtPrice * sqrtPrice;
    
    // Adjust for decimal difference
    const decimalAdjustment = Math.pow(10, token1Decimals - token0Decimals);
    return price * decimalAdjustment;
  }

  /**
   * Calculate price from tick
   * Price = 1.0001^tick
   */
  private tickToPrice(tick: number, token0Decimals: number = 18, token1Decimals: number = 18): number {
    const price = Math.pow(1.0001, tick);
    const decimalAdjustment = Math.pow(10, token1Decimals - token0Decimals);
    return price * decimalAdjustment;
  }

  /**
   * Get TWAP for a pool using the observe() function
   * This is the most accurate method for calculating TWAP
   */
  async getTWAP(
    poolAddress: string,
    secondsAgo: number = this.config.twapSeconds,
    token0Decimals: number = 18,
    token1Decimals: number = 18
  ): Promise<TWAPResult | null> {
    try {
      // Get tick cumulatives for [secondsAgo, 0] (now)
      const secondsAgos = [secondsAgo, 0];
      
      const [tickCumulatives] = await this.publicClient.readContract({
        address: poolAddress as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'observe',
        args: [secondsAgos],
      });

      // Calculate average tick over the period
      // TWAP tick = (tickCumulative[1] - tickCumulative[0]) / secondsAgo
      const tickCumulativeDelta = Number(tickCumulatives[1] - tickCumulatives[0]);
      const averageTick = Math.round(tickCumulativeDelta / secondsAgo);

      // Get current slot0 for additional context
      const slot0 = await this.publicClient.readContract({
        address: poolAddress as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'slot0',
      });

      const [sqrtPriceX96, currentTick] = slot0;

      // Calculate TWAP price from average tick
      const twapPrice = this.tickToPrice(averageTick, token0Decimals, token1Decimals);

      // Calculate confidence based on how close TWAP is to current price
      const currentPrice = this.sqrtPriceX96ToPrice(sqrtPriceX96, token0Decimals, token1Decimals);
      const priceDiff = Math.abs(currentPrice - twapPrice) / currentPrice;
      
      // Higher deviation = lower confidence
      let confidence = 1.0;
      if (priceDiff > 0.1) confidence = 0.5;      // >10% deviation
      else if (priceDiff > 0.05) confidence = 0.7; // >5% deviation
      else if (priceDiff > 0.02) confidence = 0.9; // >2% deviation

      // Reduce confidence if the observation window is short
      if (secondsAgo < 300) { // Less than 5 minutes
        confidence *= 0.8;
      }

      return {
        price: twapPrice,
        sqrtPriceX96,
        tick: averageTick,
        timestamp: Math.floor(Date.now() / 1000),
        secondsAgo,
        confidence: Math.max(0, Math.min(1, confidence)),
      };
    } catch (error: any) {
      console.error(`Error calculating TWAP for pool ${poolAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get TWAP for a token pair (finds best pool automatically)
   */
  async getTWAPForPair(
    tokenA: string,
    tokenB: string,
    secondsAgo?: number,
    tokenADecimals: number = 18,
    tokenBDecimals: number = 18
  ): Promise<TWAPResult | null> {
    const poolAddress = await this.findBestPool(tokenA, tokenB);
    if (!poolAddress) {
      console.warn(`No pool found for pair ${tokenA}/${tokenB}`);
      return null;
    }

    return this.getTWAP(poolAddress, secondsAgo, tokenADecimals, tokenBDecimals);
  }

  /**
   * Get token price in ETH using TWAP
   */
  async getTokenPriceInETH(
    tokenAddress: string,
    secondsAgo?: number,
    tokenDecimals: number = 18
  ): Promise<TWAPResult | null> {
    return this.getTWAPForPair(
      tokenAddress,
      WETH_ADDRESS,
      secondsAgo,
      tokenDecimals,
      18 // WETH decimals
    );
  }

  /**
   * Get token price in terms of quote token
   * Automatically finds the best pool
   */
  async getPrice(
    tokenAddress: string,
    quoteTokenAddress: string = WETH_ADDRESS,
    secondsAgo?: number,
    tokenDecimals: number = 18,
    quoteDecimals: number = 18
  ): Promise<TWAPResult | null> {
    return this.getTWAPForPair(
      tokenAddress,
      quoteTokenAddress,
      secondsAgo,
      tokenDecimals,
      quoteDecimals
    );
  }

  /**
   * Get spot price (current, not TWAP) for comparison
   */
  async getSpotPrice(
    poolAddress: string,
    token0Decimals: number = 18,
    token1Decimals: number = 18
  ): Promise<{ price: number; sqrtPriceX96: bigint; tick: number; timestamp: number } | null> {
    try {
      const slot0 = await this.publicClient.readContract({
        address: poolAddress as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'slot0',
      });

      const [sqrtPriceX96, tick] = slot0;
      const price = this.sqrtPriceX96ToPrice(sqrtPriceX96, token0Decimals, token1Decimals);

      return {
        price,
        sqrtPriceX96,
        tick: Number(tick),
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (error: any) {
      console.error(`Error fetching spot price:`, error.message);
      return null;
    }
  }

  /**
   * Check if pool has sufficient observations for TWAP
   */
  async hasSufficientObservations(poolAddress: string, minObservations: number = 2): Promise<boolean> {
    try {
      const slot0 = await this.publicClient.readContract({
        address: poolAddress as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'slot0',
      });

      const observationCardinality = slot0[4]; // observationCardinalityNext
      return Number(observationCardinality) >= minObservations;
    } catch (error: any) {
      console.error(`Error checking observations:`, error.message);
      return false;
    }
  }

  /**
   * Get the observation at a specific index
   */
  async getObservation(poolAddress: string, index: number): Promise<{ blockTimestamp: number; tickCumulative: bigint; initialized: boolean } | null> {
    try {
      const obs = await this.publicClient.readContract({
        address: poolAddress as `0x${string}`,
        abi: POOL_ABI,
        functionName: 'observations',
        args: [BigInt(index)],
      });

      return {
        blockTimestamp: Number(obs[0]),
        tickCumulative: obs[1],
        initialized: obs[3],
      };
    } catch (error: any) {
      console.error(`Error fetching observation:`, error.message);
      return null;
    }
  }
}
