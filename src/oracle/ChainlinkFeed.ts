// src/oracle/ChainlinkFeed.ts
// Chainlink Price Feed integration for Base mainnet

import { parseAbi } from 'viem';

// Chainlink Price Feed ABI (minimal for price queries)
const AGGREGATOR_ABI = parseAbi([
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
  'function description() external view returns (string)',
  'function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

// Base mainnet Chainlink Price Feed addresses
// Source: https://docs.chain.link/data-feeds/price-feeds/addresses?network=base
export const CHAINLINK_FEEDS: Record<string, string> = {
  // USD-denominated feeds
  'ETH': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',  // ETH/USD
  'USDC': '0x7e860098F58bBFC8648Cf43189158e20C6394B7d', // USDC/USD
  'USDbC': '0x7e860098F58bBFC8648Cf43189158e20C6394B7d', // USDbC uses USDC feed
  'DAI': '0x591e79239a7d679378ec8c847e5038150364c78f',  // DAI/USD
  'WBTC': '0x64c911996D3c6aC71f9b455B1E8E7266BcbD848D', // WBTC/USD
  'LINK': '0xd9e6b1Eb6Dfa93aD4dD0E584E7bCefB0B8a6c96E', // LINK/USD
  'CBETH': '0x806b4Ac04501c29769051e42783cF04dCE41440b', // cbETH/USD
  'WSTETH': '0xc1F6C5B4E1F8f6E4b5E5c5E8B4E4b5E5c5E8B4E', // wstETH/USD (placeholder - verify on mainnet)
  // CAD feed
  'CAD': '0x0ffbdd5c6f249586f29e8da4b831952d63c3016d', // CAD/USD
};

// Token address to symbol mapping for feed lookup (all lowercase for case-insensitive matching)
export const TOKEN_TO_FEED: Record<string, string> = {
  // ETH (wrapped)
  '0x4200000000000000000000000000000000000006': 'ETH', // WETH
  // USDC
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  // USDbC
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': 'USDbC',
  // DAI
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',
  // WBTC
  '0x1cea84203673764244e05693e42e6ace62bd6d33': 'WBTC',
  // LINK
  '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e326': 'LINK',
  // cbETH
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': 'CBETH',
};

export interface ChainlinkPriceData {
  price: number;           // Price in USD (or quote currency)
  decimals: number;        // Feed decimals
  timestamp: number;       // Unix timestamp of last update
  roundId: bigint;         // Round ID
  answeredInRound: bigint; // Round the answer was computed in
}

export interface ChainlinkConfig {
  stalePriceThresholdMs?: number; // Default: 1 hour
  minConfidence?: number;         // Default: 0.8 (80%)
}

export class ChainlinkFeed {
  private publicClient: any;
  private config: Required<ChainlinkConfig>;

  constructor(publicClient: any, config: ChainlinkConfig = {}) {
    this.publicClient = publicClient;
    this.config = {
      stalePriceThresholdMs: config.stalePriceThresholdMs ?? 60 * 60 * 1000, // 1 hour
      minConfidence: config.minConfidence ?? 0.8,
    };
  }

  /**
   * Check if a token has a Chainlink feed available
   */
  hasFeed(tokenAddress: string): boolean {
    const normalizedAddress = tokenAddress.toLowerCase();
    const symbol = TOKEN_TO_FEED[normalizedAddress];
    return symbol !== undefined && CHAINLINK_FEEDS[symbol] !== undefined;
  }

  /**
   * Get the Chainlink feed address for a token symbol
   */
  getFeedAddress(symbol: string): string | null {
    return CHAINLINK_FEEDS[symbol.toUpperCase()] ?? null;
  }

  /**
   * Get the feed address for a token by its contract address
   */
  getFeedAddressForToken(tokenAddress: string): string | null {
    const normalizedAddress = tokenAddress.toLowerCase();
    const symbol = TOKEN_TO_FEED[normalizedAddress];
    if (!symbol) return null;
    return CHAINLINK_FEEDS[symbol] ?? null;
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the latest price from a Chainlink feed with retry logic
   */
  async getLatestPrice(feedAddress: string, retries: number = 3): Promise<ChainlinkPriceData | null> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const [roundData, decimals] = await Promise.all([
          this.publicClient.readContract({
            address: feedAddress as `0x${string}`,
            abi: AGGREGATOR_ABI,
            functionName: 'latestRoundData',
          }),
          this.publicClient.readContract({
            address: feedAddress as `0x${string}`,
            abi: AGGREGATOR_ABI,
            functionName: 'decimals',
          }),
        ]);

        const [roundId, answer, , updatedAt, answeredInRound] = roundData;

        // Check for invalid data
        if (answer <= 0) {
          console.warn(`Invalid price from Chainlink feed ${feedAddress}: ${answer}`);
          return null;
        }

        // Check if price is stale
        const now = Math.floor(Date.now() / 1000);
        const stalenessSeconds = now - Number(updatedAt);
        if (stalenessSeconds * 1000 > this.config.stalePriceThresholdMs) {
          console.warn(`Stale price from Chainlink feed ${feedAddress}: ${stalenessSeconds}s old`);
          // Still return the data but it may be flagged as low confidence
        }

        // Calculate actual price
        const price = Number(answer) / Math.pow(10, decimals);

        return {
          price,
          decimals,
          timestamp: Number(updatedAt),
          roundId,
          answeredInRound,
        };
      } catch (error: any) {
        // Check for rate limiting (429 error)
        const isRateLimit = error?.message?.includes('429') || 
                           error?.message?.includes('rate limit') ||
                           error?.code === -32016;
        
        if (isRateLimit && attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.warn(`Rate limited, retrying in ${delay}ms... (attempt ${attempt + 1}/${retries})`);
          await this.sleep(delay);
          continue;
        }
        
        console.error(`Error fetching Chainlink price from ${feedAddress}:`, error.message);
        return null;
      }
    }
    return null;
  }

  /**
   * Get price for a token by its address
   */
  async getPriceForToken(tokenAddress: string): Promise<ChainlinkPriceData | null> {
    const feedAddress = this.getFeedAddressForToken(tokenAddress);
    if (!feedAddress) {
      return null;
    }
    return this.getLatestPrice(feedAddress);
  }

  /**
   * Get price by symbol (e.g., 'ETH', 'CAD')
   */
  async getPrice(tokenAddress: string, symbol?: string): Promise<ChainlinkPriceData | null> {
    // If symbol provided, use it directly
    if (symbol && CHAINLINK_FEEDS[symbol]) {
      return this.getLatestPrice(CHAINLINK_FEEDS[symbol]);
    }
    // Otherwise look up by address
    return this.getPriceForToken(tokenAddress);
  }

  /**
   * Calculate price confidence based on staleness and round consistency
   */
  calculateConfidence(priceData: ChainlinkPriceData): number {
    const now = Date.now();
    const stalenessMs = now - priceData.timestamp * 1000;
    
    // Base confidence
    let confidence = 1.0;

    // Reduce confidence for stale prices
    const stalenessRatio = stalenessMs / this.config.stalePriceThresholdMs;
    if (stalenessRatio > 1) {
      confidence *= Math.max(0.5, 1 / stalenessRatio);
    } else if (stalenessRatio > 0.5) {
      confidence *= 0.9;
    }

    // Reduce confidence if round is outdated
    if (priceData.answeredInRound < priceData.roundId) {
      confidence *= 0.8;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get historical price data for a specific round
   */
  async getHistoricalPrice(feedAddress: string, roundId: bigint): Promise<ChainlinkPriceData | null> {
    try {
      const [roundData, decimals] = await Promise.all([
        this.publicClient.readContract({
          address: feedAddress as `0x${string}`,
          abi: AGGREGATOR_ABI,
          functionName: 'getRoundData',
          args: [roundId],
        }),
        this.publicClient.readContract({
          address: feedAddress as `0x${string}`,
          abi: AGGREGATOR_ABI,
          functionName: 'decimals',
        }),
      ]);

      const [retrievedRoundId, answer, , updatedAt, answeredInRound] = roundData;

      if (answer <= 0) {
        return null;
      }

      const price = Number(answer) / Math.pow(10, decimals);

      return {
        price,
        decimals,
        timestamp: Number(updatedAt),
        roundId: retrievedRoundId,
        answeredInRound,
      };
    } catch (error: any) {
      console.error(`Error fetching historical price:`, error.message);
      return null;
    }
  }

  /**
   * Get ETH price in USD (convenience method)
   */
  async getEthPrice(): Promise<number | null> {
    const feedAddress = CHAINLINK_FEEDS['ETH'];
    if (!feedAddress) return null;
    
    const data = await this.getLatestPrice(feedAddress);
    return data?.price ?? null;
  }

  /**
   * Get USDC price in USD (should be ~1.0, useful for sanity checks)
   */
  async getUsdcPrice(): Promise<number | null> {
    const feedAddress = CHAINLINK_FEEDS['USDC'];
    if (!feedAddress) return null;
    
    const data = await this.getLatestPrice(feedAddress);
    return data?.price ?? null;
  }
}
