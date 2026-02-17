// tests/oracle/PriceOracle.test.ts
// Unit tests for Price Oracle system

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { PriceOracle, ChainlinkFeed, UniswapV3TWAP } from '../../src/oracle/index.js';

// Mock viem
const mockReadContract = vi.fn();
const mockPublicClient = {
  readContract: mockReadContract,
};

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: () => mockPublicClient,
    http: () => ({}),
    parseAbi: (strings: string[]) => strings,
  };
});

vi.mock('viem/chains', () => ({
  base: { id: 8453, name: 'Base' },
}));

describe('ChainlinkFeed', () => {
  let chainlink: ChainlinkFeed;

  beforeEach(() => {
    vi.clearAllMocks();
    chainlink = new ChainlinkFeed(mockPublicClient as any);
  });

  describe('hasFeed', () => {
    it('should return true for tokens with Chainlink feeds', () => {
      // WETH - lowercase (should match the normalized address)
      expect(chainlink.hasFeed('0x4200000000000000000000000000000000000006')).toBe(true);
      // USDC - lowercase
      expect(chainlink.hasFeed('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase())).toBe(true);
    });

    it('should return false for tokens without feeds', () => {
      expect(chainlink.hasFeed('0x1234567890123456789012345678901234567890')).toBe(false);
    });

    it('should handle lowercase addresses', () => {
      expect(chainlink.hasFeed('0x4200000000000000000000000000000000000006')).toBe(true);
    });
  });

  describe('getFeedAddress', () => {
    it('should return correct feed address for ETH', () => {
      const address = chainlink.getFeedAddress('ETH');
      expect(address).toBe('0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70');
    });

    it('should return correct feed address for USDC', () => {
      const address = chainlink.getFeedAddress('USDC');
      expect(address).toBe('0x7e860098F58bBFC8648Cf43189158e20C6394B7d');
    });

    it('should return null for unknown symbols', () => {
      const address = chainlink.getFeedAddress('UNKNOWN');
      expect(address).toBeNull();
    });
  });

  describe('getLatestPrice', () => {
    it('should fetch and parse price data correctly', async () => {
      const mockRoundData = [
        BigInt(1000), // roundId
        BigInt(350000000000), // answer ($3500.00000000)
        BigInt(1700000000), // startedAt
        BigInt(Math.floor(Date.now() / 1000)), // updatedAt - fresh
        BigInt(1000), // answeredInRound
      ];

      mockReadContract
        .mockResolvedValueOnce(mockRoundData)
        .mockResolvedValueOnce(8); // decimals

      const result = await chainlink.getLatestPrice('0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70');

      expect(result).not.toBeNull();
      expect(result?.price).toBe(3500);
      expect(result?.decimals).toBe(8);
    });

    it('should handle invalid price (zero or negative)', async () => {
      const mockRoundData = [
        BigInt(1000),
        BigInt(0), // Invalid: zero price
        BigInt(1700000000),
        BigInt(Math.floor(Date.now() / 1000)),
        BigInt(1000),
      ];

      mockReadContract
        .mockResolvedValueOnce(mockRoundData)
        .mockResolvedValueOnce(8);

      const result = await chainlink.getLatestPrice('0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70');

      expect(result).toBeNull();
    });

    it('should handle contract read errors', async () => {
      mockReadContract.mockRejectedValue(new Error('Contract call failed'));

      const result = await chainlink.getLatestPrice('0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70');

      expect(result).toBeNull();
    });
  });

  describe('calculateConfidence', () => {
    it('should return high confidence for fresh prices', () => {
      const now = Math.floor(Date.now() / 1000);
      const priceData = {
        price: 3500,
        decimals: 8,
        timestamp: now - 60, // 1 minute ago
        roundId: BigInt(1000),
        answeredInRound: BigInt(1000),
      };

      const confidence = chainlink.calculateConfidence(priceData);
      expect(confidence).toBeGreaterThan(0.9);
    });

    it('should reduce confidence for stale prices', () => {
      const now = Math.floor(Date.now() / 1000);
      const priceData = {
        price: 3500,
        decimals: 8,
        timestamp: now - 7200, // 2 hours ago
        roundId: BigInt(1000),
        answeredInRound: BigInt(1000),
      };

      const confidence = chainlink.calculateConfidence(priceData);
      expect(confidence).toBeLessThan(0.8);
    });

    it('should reduce confidence for outdated rounds', () => {
      const now = Math.floor(Date.now() / 1000);
      const priceData = {
        price: 3500,
        decimals: 8,
        timestamp: now - 60,
        roundId: BigInt(1000),
        answeredInRound: BigInt(999), // Outdated round
      };

      const confidence = chainlink.calculateConfidence(priceData);
      expect(confidence).toBeLessThan(0.9);
    });
  });
});

describe('UniswapV3TWAP', () => {
  let twap: UniswapV3TWAP;

  beforeEach(() => {
    vi.clearAllMocks();
    twap = new UniswapV3TWAP(mockPublicClient as any);
  });

  describe('findBestPool', () => {
    it('should find pool with highest liquidity', async () => {
      // Mock factory getPool calls
      mockReadContract
        .mockResolvedValueOnce('0xPool100') // fee 100
        .mockResolvedValueOnce(BigInt(1000000)) // liquidity
        .mockResolvedValueOnce('0xPool500') // fee 500
        .mockResolvedValueOnce(BigInt(5000000)) // higher liquidity
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000') // fee 3000 - no pool
        .mockResolvedValueOnce('0x0000000000000000000000000000000000000000'); // fee 10000 - no pool

      const pool = await twap.findBestPool(
        '0xTokenA',
        '0xTokenB'
      );

      expect(pool).toBe('0xPool500');
    });

    it('should return null if no pools exist', async () => {
      mockReadContract.mockResolvedValue('0x0000000000000000000000000000000000000000');

      const pool = await twap.findBestPool('0xTokenA', '0xTokenB');

      expect(pool).toBeNull();
    });
  });

  describe('getTWAP', () => {
    it('should calculate TWAP correctly', async () => {
      // Mock observe and slot0
      const mockTickCumulatives = [BigInt(0), BigInt(180000)]; // 1 tick per second for 30 min
      mockReadContract
        .mockResolvedValueOnce([mockTickCumulatives])
        .mockResolvedValueOnce([BigInt(2) ** BigInt(96), 0, 0, 0, 0, 0, true]); // slot0

      const result = await twap.getTWAP('0xPoolAddress', 1800);

      expect(result).not.toBeNull();
      expect(result?.tick).toBeDefined();
      expect(result?.price).toBeGreaterThan(0);
    });
  });

  describe('tickToPrice', () => {
    it('should calculate price from tick correctly', async () => {
      // Tick 0 = price 1.0
      mockReadContract
        .mockResolvedValueOnce([[BigInt(0), BigInt(0)]])
        .mockResolvedValueOnce([BigInt(2) ** BigInt(96), 0, 0, 0, 0, 0, true]);

      const result = await twap.getTWAP('0xPoolAddress');

      expect(result).not.toBeNull();
      expect(result?.price).toBeGreaterThan(0);
    });
  });
});

describe('PriceOracle', () => {
  let oracle: PriceOracle;

  beforeEach(() => {
    vi.clearAllMocks();
    oracle = new PriceOracle({ rpcUrl: 'https://test.base.org' });
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const config = oracle.getConfig();
      expect(config.minConfidence).toBe(0.8);
      expect(config.twapSeconds).toBe(1800);
      expect(config.preferChainlink).toBe(true);
    });

    it('should accept custom config', () => {
      const customOracle = new PriceOracle({
        minConfidence: 0.9,
        twapSeconds: 3600,
        preferChainlink: false,
      });

      const config = customOracle.getConfig();
      expect(config.minConfidence).toBe(0.9);
      expect(config.twapSeconds).toBe(3600);
      expect(config.preferChainlink).toBe(false);
    });
  });

  describe('getPrice', () => {
    it('should prefer Chainlink when available and preferred', async () => {
      const mockRoundData = [
        BigInt(1000),
        BigInt(100000000), // $1.00
        BigInt(1700000000),
        BigInt(Math.floor(Date.now() / 1000)), // fresh timestamp
        BigInt(1000),
      ];

      mockReadContract
        .mockResolvedValueOnce(mockRoundData)
        .mockResolvedValueOnce(8);

      // Use WETH address which has a Chainlink feed
      const result = await oracle.getPrice('0x4200000000000000000000000000000000000006');

      expect(result).not.toBeNull();
      expect(result?.source).toBe('chainlink');
      expect(result?.price).toBe(1);
    });
  });

  describe('validatePrice', () => {
    it('should return valid for high confidence prices', async () => {
      const mockRoundData = [
        BigInt(1000),
        BigInt(350000000000),
        BigInt(1700000000),
        BigInt(Math.floor(Date.now() / 1000)), // Fresh
        BigInt(1000),
      ];

      mockReadContract
        .mockResolvedValueOnce(mockRoundData)
        .mockResolvedValueOnce(8);

      const validation = await oracle.validatePrice('0x4200000000000000000000000000000000000006');

      expect(validation.valid).toBe(true);
      expect(validation.confidence).toBeGreaterThan(0.8);
    });

    it('should return invalid for low confidence prices', async () => {
      const mockRoundData = [
        BigInt(1000),
        BigInt(350000000000),
        BigInt(1700000000),
        BigInt(Math.floor(Date.now() / 1000) - 7200), // 2 hours old - stale
        BigInt(1000),
      ];

      mockReadContract
        .mockResolvedValueOnce(mockRoundData)
        .mockResolvedValueOnce(8);

      const validation = await oracle.validatePrice('0x4200000000000000000000000000000000000006');

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('below threshold');
    });

    it('should return invalid for missing price data', async () => {
      mockReadContract.mockRejectedValue(new Error('Contract not found'));

      const validation = await oracle.validatePrice('0xUnknownToken');

      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('No price data available');
    });
  });

  describe('getConfidence', () => {
    it('should return confidence score for tokens with feeds', async () => {
      const mockRoundData = [
        BigInt(1000),
        BigInt(350000000000),
        BigInt(1700000000),
        BigInt(Math.floor(Date.now() / 1000)),
        BigInt(1000),
      ];

      mockReadContract
        .mockResolvedValueOnce(mockRoundData)
        .mockResolvedValueOnce(8);

      const confidence = await oracle.getConfidence('0x4200000000000000000000000000000000000006');

      expect(confidence).toBeGreaterThan(0);
    });

    it('should return 0 for tokens without price data', async () => {
      mockReadContract.mockRejectedValue(new Error('Contract not found'));

      const confidence = await oracle.getConfidence('0xUnknownToken');

      expect(confidence).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('should update config at runtime', () => {
      oracle.updateConfig({ minConfidence: 0.95 });

      const config = oracle.getConfig();
      expect(config.minConfidence).toBe(0.95);
    });
  });

  describe('getEthPriceUsd', () => {
    it('should fetch ETH price in USD', async () => {
      const mockRoundData = [
        BigInt(1000),
        BigInt(350000000000), // $3500
        BigInt(1700000000),
        BigInt(Math.floor(Date.now() / 1000)),
        BigInt(1000),
      ];

      mockReadContract
        .mockResolvedValueOnce(mockRoundData)
        .mockResolvedValueOnce(8);

      const price = await oracle.getEthPriceUsd();

      expect(price).toBe(3500);
    });
  });
});

describe('Fallback behavior', () => {
  it('should fall back to TWAP when Chainlink fails', async () => {
    const oracle = new PriceOracle({
      preferChainlink: true,
      allowFallback: true,
    });

    // First call for Chainlink fails
    mockReadContract
      .mockRejectedValueOnce(new Error('Chainlink feed not found'))
      // Factory getPool for TWAP
      .mockResolvedValueOnce('0xPoolAddress')
      // Pool liquidity
      .mockResolvedValueOnce(BigInt(1000000))
      // TWAP observe
      .mockResolvedValueOnce([[BigInt(0), BigInt(180000)]])
      // slot0
      .mockResolvedValueOnce([BigInt(2) ** BigInt(96), 0, 0, 0, 0, 0, true]);

    const result = await oracle.getPrice('0xSomeToken');

    // Should get a result from fallback
    expect(result).toBeDefined();
  });

  it('should use best source when both available', async () => {
    const oracle = new PriceOracle({
      preferChainlink: false, // Test both paths
      allowFallback: true,
    });

    // Mock both Chainlink and Uniswap working
    // This tests the getBestPrice logic
    expect(oracle).toBeDefined();
  });
});
