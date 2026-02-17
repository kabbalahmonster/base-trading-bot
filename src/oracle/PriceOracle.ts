// src/oracle/PriceOracle.ts
// Main Price Oracle module combining Chainlink feeds and Uniswap V3 TWAP
// Provides reliable price data with confidence scoring and fallback mechanisms

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { ChainlinkFeed, ChainlinkPriceData } from './ChainlinkFeed.js';
import { UniswapV3TWAP, TWAPResult, DEFAULT_TWAP_SECONDS } from './UniswapV3TWAP.js';

export type Currency = 'USD' | 'CAD' | 'ETH';

export interface PriceOracleConfig {
  // RPC configuration
  rpcUrl?: string;

  // Price source preferences
  preferChainlink?: boolean;      // Default: true
  preferTWAP?: boolean;           // Default: false (Chainlink preferred)

  // Currency settings
  currency?: Currency;            // Default: 'USD'

  // Confidence thresholds
  minConfidence?: number;         // Default: 0.8 (80%)

  // TWAP configuration
  twapSeconds?: number;           // Default: 1800 (30 minutes)

  // Chainlink configuration
  chainlinkStaleThresholdMs?: number; // Default: 3600000 (1 hour)

  // Fallback behavior
  allowFallback?: boolean;        // Default: true
  requireBothSources?: boolean;   // Default: false
}

export interface PriceData {
  price: number;                  // Price in ETH per token (or USD if specified)
  source: 'chainlink' | 'uniswap-v3' | 'combined' | 'fallback';
  confidence: number;             // 0-1 confidence score
  timestamp: number;              // Unix timestamp
  
  // Source-specific data
  chainlinkData?: ChainlinkPriceData;
  twapData?: TWAPResult;
  
  // Additional metadata
  tokenAddress: string;
  quoteToken?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  confidence: number;
}

export class PriceOracle {
  private publicClient: any;
  private chainlink: ChainlinkFeed;
  private uniswap: UniswapV3TWAP;
  private config: Required<PriceOracleConfig>;

  constructor(config: PriceOracleConfig = {}) {
    this.config = {
      rpcUrl: config.rpcUrl ?? 'https://mainnet.base.org',
      preferChainlink: config.preferChainlink ?? true,
      preferTWAP: config.preferTWAP ?? false,
      currency: config.currency ?? 'USD',
      minConfidence: config.minConfidence ?? 0.8,
      twapSeconds: config.twapSeconds ?? DEFAULT_TWAP_SECONDS,
      chainlinkStaleThresholdMs: config.chainlinkStaleThresholdMs ?? 60 * 60 * 1000,
      allowFallback: config.allowFallback ?? true,
      requireBothSources: config.requireBothSources ?? false,
    };

    // Initialize public client
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(this.config.rpcUrl),
    });

    // Initialize price feed modules
    this.chainlink = new ChainlinkFeed(this.publicClient, {
      stalePriceThresholdMs: this.config.chainlinkStaleThresholdMs,
      minConfidence: this.config.minConfidence,
    });

    this.uniswap = new UniswapV3TWAP(this.publicClient, {
      twapSeconds: this.config.twapSeconds,
    });
  }

  /**
   * Get the current price for a token
   * Tries Chainlink first (if available), then falls back to Uniswap V3 TWAP
   */
  async getPrice(tokenAddress: string): Promise<PriceData | null> {
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Try Chainlink first if preferred
    if (this.config.preferChainlink) {
      const chainlinkData = await this.getChainlinkPrice(normalizedAddress);
      if (chainlinkData && chainlinkData.confidence >= this.config.minConfidence) {
        return chainlinkData;
      }
    }

    // Try Uniswap V3 TWAP
    const twapData = await this.getTWAP(normalizedAddress);
    if (twapData && twapData.confidence >= this.config.minConfidence) {
      return twapData;
    }

    // If we have both sources but neither met confidence threshold,
    // try to combine them or use the best one
    if (this.config.allowFallback) {
      return await this.getBestPrice(normalizedAddress);
    }

    return null;
  }

  /**
   * Get price from Chainlink feed
   */
  async getChainlinkPrice(tokenAddress: string): Promise<PriceData | null> {
    try {
      const priceData = await this.chainlink.getPriceForToken(tokenAddress);
      
      if (!priceData) {
        return null;
      }

      const confidence = this.chainlink.calculateConfidence(priceData);

      return {
        price: priceData.price,
        source: 'chainlink',
        confidence,
        timestamp: priceData.timestamp,
        chainlinkData: priceData,
        tokenAddress,
      };
    } catch (error: any) {
      console.error(`Error getting Chainlink price for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get TWAP price from Uniswap V3
   */
  async getTWAP(tokenAddress: string, minutes?: number): Promise<PriceData | null> {
    try {
      const secondsAgo = minutes ? minutes * 60 : this.config.twapSeconds;
      
      const twapResult = await this.uniswap.getTokenPriceInETH(
        tokenAddress,
        secondsAgo
      );

      if (!twapResult) {
        return null;
      }

      return {
        price: twapResult.price,
        source: 'uniswap-v3',
        confidence: twapResult.confidence,
        timestamp: twapResult.timestamp,
        twapData: twapResult,
        tokenAddress,
      };
    } catch (error: any) {
      console.error(`Error getting TWAP for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get the best available price by combining multiple sources
   */
  private async getBestPrice(tokenAddress: string): Promise<PriceData | null> {
    const results: PriceData[] = [];

    // Get Chainlink price
    const chainlinkData = await this.getChainlinkPrice(tokenAddress);
    if (chainlinkData) results.push(chainlinkData);

    // Get TWAP price
    const twapData = await this.getTWAP(tokenAddress);
    if (twapData) results.push(twapData);

    if (results.length === 0) {
      return null;
    }

    if (results.length === 1) {
      return results[0];
    }

    // We have multiple sources - check if they agree
    const chainlink = results.find(r => r.source === 'chainlink');
    const uniswap = results.find(r => r.source === 'uniswap-v3');

    if (chainlink && uniswap) {
      const priceDiff = Math.abs(chainlink.price - uniswap.price) / chainlink.price;
      
      // If prices are within 5%, average them and increase confidence
      if (priceDiff < 0.05) {
        const avgPrice = (chainlink.price + uniswap.price) / 2;
        const avgConfidence = Math.min(1, (chainlink.confidence + uniswap.confidence) / 2 + 0.1);
        
        return {
          price: avgPrice,
          source: 'combined',
          confidence: avgConfidence,
          timestamp: Math.max(chainlink.timestamp, uniswap.timestamp),
          chainlinkData: chainlink.chainlinkData,
          twapData: uniswap.twapData,
          tokenAddress,
        };
      }

      // Prices diverge significantly - use the one with higher confidence
      // but mark confidence as lower due to disagreement
      const bestSource = chainlink.confidence > uniswap.confidence ? chainlink : uniswap;
      return {
        ...bestSource,
        confidence: Math.max(0.3, bestSource.confidence - 0.2), // Penalty for disagreement
      };
    }

    // Return the best single source
    return results.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }

  /**
   * Get confidence score for a token price
   * Combines multiple factors to determine reliability
   */
  async getConfidence(tokenAddress: string): Promise<number> {
    const priceData = await this.getPrice(tokenAddress);
    return priceData?.confidence ?? 0;
  }

  /**
   * Validate if a price is suitable for trading
   * Checks confidence threshold and price sanity
   */
  async validatePrice(tokenAddress: string, minConfidence?: number): Promise<ValidationResult> {
    const threshold = minConfidence ?? this.config.minConfidence;
    
    const priceData = await this.getPrice(tokenAddress);
    
    if (!priceData) {
      return {
        valid: false,
        reason: 'No price data available',
        confidence: 0,
      };
    }

    if (priceData.confidence < threshold) {
      return {
        valid: false,
        reason: `Confidence ${(priceData.confidence * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(0)}%`,
        confidence: priceData.confidence,
      };
    }

    // Additional sanity checks
    if (priceData.price <= 0) {
      return {
        valid: false,
        reason: 'Invalid price (zero or negative)',
        confidence: priceData.confidence,
      };
    }

    if (!isFinite(priceData.price)) {
      return {
        valid: false,
        reason: 'Invalid price (non-finite)',
        confidence: priceData.confidence,
      };
    }

    return {
      valid: true,
      confidence: priceData.confidence,
    };
  }

  /**
   * Check if a token has Chainlink feed support
   */
  hasChainlinkFeed(tokenAddress: string): boolean {
    return this.chainlink.hasFeed(tokenAddress);
  }

  /**
   * Get ETH price in USD (useful for conversions)
   */
  async getEthPriceUsd(): Promise<number | null> {
    const ethPrice = await this.chainlink.getEthPrice();
    return ethPrice;
  }

  /**
   * Get CAD/USD conversion rate
   */
  async getCadUsdRate(): Promise<number | null> {
    try {
      const cadData = await this.chainlink.getPrice('0x0000000000000000000000000000000000000000', 'CAD');
      if (cadData && cadData.price > 0) {
        return cadData.price; // CAD/USD rate
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get price in configured currency (USD or CAD)
   */
  async getPriceInCurrency(tokenAddress: string, currency?: Currency): Promise<PriceData | null> {
    const targetCurrency = currency ?? this.config.currency ?? 'USD';
    const tokenPriceEth = await this.getPrice(tokenAddress);
    if (!tokenPriceEth) return null;

    if (targetCurrency === 'ETH') {
      return { ...tokenPriceEth, quoteToken: 'ETH' };
    }

    const ethPriceUsd = await this.getEthPriceUsd();
    if (!ethPriceUsd) return null;

    let priceInCurrency = tokenPriceEth.price * ethPriceUsd;

    if (targetCurrency === 'CAD') {
      const cadUsdRate = await this.getCadUsdRate();
      if (cadUsdRate) {
        priceInCurrency = priceInCurrency * cadUsdRate;
      }
    }

    return {
      ...tokenPriceEth,
      price: priceInCurrency,
      quoteToken: targetCurrency,
    };
  }

  /**
   * Convert token price to USD
   */
  async getPriceInUsd(tokenAddress: string): Promise<PriceData | null> {
    return this.getPriceInCurrency(tokenAddress, 'USD');
  }

  /**
   * Convert token price to CAD
   */
  async getPriceInCad(tokenAddress: string): Promise<PriceData | null> {
    return this.getPriceInCurrency(tokenAddress, 'CAD');
  }

  /**
   * Get raw price sources for debugging/comparison
   */
  async getAllPriceSources(tokenAddress: string): Promise<{
    chainlink: PriceData | null;
    uniswap: PriceData | null;
    best: PriceData | null;
  }> {
    const [chainlink, uniswap] = await Promise.all([
      this.getChainlinkPrice(tokenAddress),
      this.getTWAP(tokenAddress),
    ]);

    // Determine best
    let best: PriceData | null = null;
    if (chainlink && uniswap) {
      best = chainlink.confidence > uniswap.confidence ? chainlink : uniswap;
    } else {
      best = chainlink ?? uniswap ?? null;
    }

    return { chainlink, uniswap, best };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<PriceOracleConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Re-initialize modules if needed
    if (newConfig.chainlinkStaleThresholdMs || newConfig.minConfidence) {
      this.chainlink = new ChainlinkFeed(this.publicClient, {
        stalePriceThresholdMs: this.config.chainlinkStaleThresholdMs,
        minConfidence: this.config.minConfidence,
      });
    }

    if (newConfig.twapSeconds) {
      this.uniswap = new UniswapV3TWAP(this.publicClient, {
        twapSeconds: this.config.twapSeconds,
      });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PriceOracleConfig {
    return { ...this.config };
  }

  /**
   * Health check - verify oracle is functioning
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    chainlinkWorking: boolean;
    uniswapWorking: boolean;
    ethPrice: number | null;
  }> {
    try {
      // Check Chainlink ETH price
      const ethPrice = await this.chainlink.getEthPrice();
      
      // Check Uniswap with USDC/WETH pair (more reliable than WETH/WETH)
      // Use a common token that has good liquidity
      const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
      let twapResult = null;
      try {
        twapResult = await this.uniswap.getTokenPriceInETH(USDC_ADDRESS, 60);
      } catch {
        // TWAP might fail, that's ok for health check
      }

      return {
        healthy: ethPrice !== null && ethPrice > 0,
        chainlinkWorking: ethPrice !== null,
        uniswapWorking: twapResult !== null,
        ethPrice,
      };
    } catch (error: any) {
      return {
        healthy: false,
        chainlinkWorking: false,
        uniswapWorking: false,
        ethPrice: null,
      };
    }
  }
}

// Export singleton instance for convenience
let defaultOracle: PriceOracle | null = null;

export function getDefaultOracle(config?: PriceOracleConfig): PriceOracle {
  if (!defaultOracle) {
    defaultOracle = new PriceOracle(config);
  }
  return defaultOracle;
}

export function resetDefaultOracle(): void {
  defaultOracle = null;
}
