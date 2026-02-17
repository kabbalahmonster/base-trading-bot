// src/oracle/ChainlinkFeed.ts
// Chainlink Price Feed integration for Base mainnet

import { PublicClient, parseAbi } from 'viem';

// Chainlink Price Feed ABI (minimal for price queries)
const AGGREGATOR_ABI = parseAbi([
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
  'function description() external view returns (string)',
  'function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

// Chainlink Feed Registry ABI (for looking up feeds dynamically)
const FEED_REGISTRY_ABI = parseAbi([
  'function getFeed(address base, address quote) external view returns (address aggregator)',
  'function latestRoundData(address base, address quote) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
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
};

// Token address to symbol mapping for feed lookup
export const TOKEN_TO_FEED: Record<string, string> = {
  // ETH (wrapped)
  '0x4200000000000000000000000000000000000006': 'ETH', // WETH
  // USDC
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'USDC',
  // USDbC
  '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA': 'USDbC',
  // DAI
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': 'DAI',
  // WBTC
  '0x1ceA84203673764244E05693e42E6Ace62bD6d33': 'WBTC',
  // LINK
  '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e326': 'LINK',
  // cbETH
  '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22': 'CBETH',
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
  private publicClient: PublicClient;
  private config: Required<ChainlinkConfig>;

  constructor(publicClient: PublicClient, config: ChainlinkConfig = {}) {
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
   * Get the latest price from a Chainlink feed
   */
  async getLatestPrice(feedAddress: string): Promise<ChainlinkPriceData | null> {
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

      const [roundId, answer, startedAt, updatedAt, answeredInRound] = roundData;

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
      console.error(`Error fetching Chainlink price from ${feedAddress}:`, error.message);
      return null;
    }
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

      const [, answer, , updatedAt, answeredInRound] = roundData;

      if (answer <= 0) {
        return null;
      }

      const price = Number(answer) / Math.pow(10, decimals);

      return {
        price,
        decimals,
        timestamp: Number(updatedAt),
        roundId,
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
