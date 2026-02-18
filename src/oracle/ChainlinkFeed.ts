// src/oracle/ChainlinkFeed.ts
// Chainlink Price Feed integration for Base and Ethereum mainnet

import { parseAbi } from 'viem';
import { Chain } from '../types/index.js';

// Chainlink Price Feed ABI (minimal for price queries)
const AGGREGATOR_ABI = parseAbi([
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
  'function description() external view returns (string)',
  'function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

// Chainlink Price Feed addresses by chain
// Sources: 
// - Base: https://docs.chain.link/data-feeds/price-feeds/addresses?network=base
// - Ethereum: https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum
export const CHAINLINK_FEEDS: Record<Chain, Record<string, string>> = {
  base: {
    // USD-denominated feeds
    'ETH': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',  // ETH/USD
    'USDC': '0x7e860098F58bBFC8648Cf43189158e20C6394B7d', // USDC/USD
    'USDbC': '0x7e860098F58bBFC8648Cf43189158e20C6394B7d', // USDbC uses USDC feed
    'DAI': '0x591e79239a7d679378ec8c847e5038150364c78f',  // DAI/USD
    'WBTC': '0x64c911996D3c6aC71f9b455B1E8E7266BcbD848D', // WBTC/USD
    'LINK': '0xd9e6b1Eb6Dfa93aD4dD0E584E7bCefB0B8a6c96E', // LINK/USD
    'CBETH': '0x806b4Ac04501c29769051e42783cF04dCE41440b', // cbETH/USD
    'WSTETH': '0xc1F6C5B4E1F8f6E4b5E5c5E8B4E4b5E5c5E8B4E', // wstETH/USD (placeholder)
    // CAD feed
    'CAD': '0x0ffbdd5c6f249586f29e8da4b831952d63c3016d', // CAD/USD
  },
  ethereum: {
    // USD-denominated feeds
    'ETH': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',  // ETH/USD
    'USDC': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6', // USDC/USD
    'USDT': '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D', // USDT/USD
    'DAI': '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',  // DAI/USD
    'WBTC': '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c', // WBTC/USD
    'LINK': '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c', // LINK/USD
    'CBETH': '0xF017fcB346A1885194689bA23E2fC66aa33De0e5', // cbETH/USD
    'WSTETH': '0x0f59666ede21427e5b710cace9e6646b8f51b706', // wstETH/USD
    'UNI': '0x553303d460EE0afB37EdFf9bE42922D8FF63220e',  // UNI/USD
    'AAVE': '0x547a514d5e3769680Ce22B2361c10Ea13619e8a9', // AAVE/USD
    'MKR': '0xec1D1B3b0443256cc3860e24a46F108e699484Aa',  // MKR/USD
    // CAD feed
    'CAD': '0x78733FaAf7E4610861262671Dd69C592Df1b5d0e', // CAD/USD
  },
};

// Token address to symbol mapping for feed lookup (all lowercase for case-insensitive matching)
export const TOKEN_TO_FEED: Record<Chain, Record<string, string>> = {
  base: {
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
  },
  ethereum: {
    // ETH (wrapped)
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 'ETH', // WETH
    // USDC
    '0xA0b86a33E6441E6C7D3D4B4f6b8e8F5c4D3e2B1A': 'USDC',
    '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
    // WBTC
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': 'WBTC',
    // LINK
    '0x514910771AF9Ca656af840dff83E8264EcF986CA': 'LINK',
    // cbETH
    '0xbe9895146f7af43049ca1c1ae358b0541ea49704': 'CBETH',
    // wstETH
    '0x7f39c581f595b53c5cb19bd0b3f8d6a8e0b5e6c2': 'WSTETH',
    // UNI
    '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'UNI',
    // AAVE
    '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9': 'AAVE',
    // MKR
    '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2': 'MKR',
    // USDT
    '0xdAC17F958D2ee523a2206206994597C13D831ec7': 'USDT',
  },
};

export interface ChainlinkPriceData {
  price: number;           // Price in USD (or quote currency)
  decimals: number;        // Feed decimals
  timestamp: number;       // Unix timestamp of last update
  roundId: bigint;         // Round ID
  answeredInRound: bigint; // Round the answer was computed in
}

export interface ChainlinkConfig {
  chain?: Chain;             // Chain selection
  stalePriceThresholdMs?: number; // Default: 1 hour
  minConfidence?: number;         // Default: 0.8 (80%)
}

export class ChainlinkFeed {
  private publicClient: any;
  private config: Required<ChainlinkConfig>;
  private chain: Chain;

  constructor(publicClient: any, config: ChainlinkConfig = {}) {
    this.publicClient = publicClient;
    this.chain = config.chain ?? 'base';
    this.config = {
      chain: this.chain,
      stalePriceThresholdMs: config.stalePriceThresholdMs ?? 60 * 60 * 1000, // 1 hour
      minConfidence: config.minConfidence ?? 0.8,
    };
  }

  /**
   * Get the current chain
   */
  getChain(): Chain {
    return this.chain;
  }

  /**
   * Set the chain for feed lookups
   */
  setChain(chain: Chain): void {
    this.chain = chain;
    this.config.chain = chain;
  }

  /**
   * Check if a token has a Chainlink feed available
   */
  hasFeed(tokenAddress: string): boolean {
    const normalizedAddress = tokenAddress.toLowerCase();
    const symbol = TOKEN_TO_FEED[this.chain][normalizedAddress];
    return symbol !== undefined && CHAINLINK_FEEDS[this.chain][symbol] !== undefined;
  }

  /**
   * Get the Chainlink feed address for a token symbol
   */
  getFeedAddress(symbol: string): string | null {
    return CHAINLINK_FEEDS[this.chain][symbol.toUpperCase()] ?? null;
  }

  /**
   * Get the feed address for a token by its contract address
   */
  getFeedAddressForToken(tokenAddress: string): string | null {
    const normalizedAddress = tokenAddress.toLowerCase();
    const symbol = TOKEN_TO_FEED[this.chain][normalizedAddress];
    if (!symbol) return null;
    return CHAINLINK_FEEDS[this.chain][symbol] ?? null;
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
    if (symbol && CHAINLINK_FEEDS[this.chain][symbol]) {
      return this.getLatestPrice(CHAINLINK_FEEDS[this.chain][symbol]);
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
    const feedAddress = CHAINLINK_FEEDS[this.chain]['ETH'];
    if (!feedAddress) return null;
    
    const data = await this.getLatestPrice(feedAddress);
    return data?.price ?? null;
  }

  /**
   * Get USDC price in USD (should be ~1.0, useful for sanity checks)
   */
  async getUsdcPrice(): Promise<number | null> {
    const feedAddress = CHAINLINK_FEEDS[this.chain]['USDC'];
    if (!feedAddress) return null;
    
    const data = await this.getLatestPrice(feedAddress);
    return data?.price ?? null;
  }
}
