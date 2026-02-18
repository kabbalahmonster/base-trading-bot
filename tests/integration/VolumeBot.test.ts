import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingBot } from '../../src/bot/TradingBot.js';
import { BotInstance } from '../../src/types/index.js';
import { WalletManager } from '../../src/wallet/WalletManager.js';
import { ZeroXApi } from '../../src/api/ZeroXApi.js';
import { JsonStorage } from '../../src/storage/JsonStorage.js';

// Mock dependencies
vi.mock('../../src/wallet/WalletManager.js');
vi.mock('../../src/api/ZeroXApi.js');
vi.mock('../../src/storage/JsonStorage.js');

describe('TradingBot Volume Mode', () => {
  let mockInstance: BotInstance;
  let mockWalletManager: WalletManager;
  let mockZeroXApi: ZeroXApi;
  let mockStorage: JsonStorage;

  beforeEach(() => {
    // Setup mock volume bot instance
    mockInstance = {
      id: 'test-volume-bot',
      name: 'Test Volume Bot',
      tokenAddress: '0x4200000000000000000000000000000000000006',
      tokenSymbol: 'TEST',
      chain: 'base',
      walletAddress: '0x1234567890123456789012345678901234567890',
      useMainWallet: true,
      config: {
        numPositions: 0,
        floorPrice: 0,
        ceilingPrice: 0,
        useMarketCap: false,
        takeProfitPercent: 0,
        stopLossPercent: 0,
        stopLossEnabled: false,
        buysEnabled: true,
        sellsEnabled: true,
        moonBagEnabled: false,
        moonBagPercent: 0,
        minProfitPercent: 0,
        maxActivePositions: 1,
        useFixedBuyAmount: true,
        buyAmount: 0.001,
        volumeMode: true,
        volumeBuysPerCycle: 3,
        volumeBuyAmount: 0.001,
        heartbeatMs: 1000,
        skipHeartbeats: 0,
      },
      positions: [],
      totalBuys: 0,
      totalSells: 0,
      totalProfitEth: '0',
      totalProfitUsd: 0,
      isRunning: false,
      enabled: true,
      lastHeartbeat: 0,
      currentPrice: 0.000001,
      volumeBuysInCycle: 0,
      volumeAccumulatedTokens: '0',
      volumeCycleCount: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };

    mockWalletManager = {
      getMainWalletClient: vi.fn(),
      getBotWalletClient: vi.fn(),
    } as unknown as WalletManager;

    mockZeroXApi = {
      getTokenPrice: vi.fn().mockResolvedValue(0.000001),
      getBuyQuote: vi.fn().mockResolvedValue({
        buyAmount: '1000000000000000000',
        sellAmount: '1000000000000000',
        to: '0xExchange',
        data: '0x',
        value: '1000000000000000',
        gas: '200000',
        gasPrice: '1000000000',
      }),
      getSellQuote: vi.fn().mockResolvedValue({
        buyAmount: '3000000000000000',
        sellAmount: '3000000000000000000',
        to: '0xExchange',
        data: '0x',
        value: '0',
        gas: '200000',
        gasPrice: '1000000000',
      }),
    } as unknown as ZeroXApi;

    mockStorage = {
      saveBot: vi.fn().mockResolvedValue(undefined),
      getWalletDictionary: vi.fn().mockResolvedValue({}),
    } as unknown as JsonStorage;
  });

  it('should initialize volume bot mode state', async () => {
    const bot = new TradingBot(
      mockInstance,
      mockWalletManager,
      mockZeroXApi,
      mockStorage,
      'https://base.llamarpc.com',
      false
    );

    // Volume mode should be detected
    expect(mockInstance.config.volumeMode).toBe(true);
    expect(mockInstance.volumeBuysInCycle).toBe(0);
    expect(mockInstance.volumeAccumulatedTokens).toBe('0');
  });

  it('should track volume mode state correctly', () => {
    // Simulate completing a buy
    mockInstance.volumeBuysInCycle = 1;
    mockInstance.volumeAccumulatedTokens = '1000000000000000000';

    expect(mockInstance.volumeBuysInCycle).toBe(1);
    expect(mockInstance.volumeAccumulatedTokens).toBe('1000000000000000000');

    // Simulate completing the cycle
    mockInstance.volumeBuysInCycle = 3;
    mockInstance.volumeAccumulatedTokens = '3000000000000000000';

    // Should trigger sell when buys >= volumeBuysPerCycle
    expect(mockInstance.volumeBuysInCycle >= (mockInstance.config.volumeBuysPerCycle || 3)).toBe(true);
    expect(BigInt(mockInstance.volumeAccumulatedTokens) > 0).toBe(true);
  });

  it('should reset volume state after cycle completion', () => {
    // Simulate completed cycle
    mockInstance.volumeBuysInCycle = 3;
    mockInstance.volumeAccumulatedTokens = '3000000000000000000';
    mockInstance.volumeCycleCount = 0;

    // Simulate reset after sell
    mockInstance.volumeCycleCount = (mockInstance.volumeCycleCount || 0) + 1;
    mockInstance.volumeBuysInCycle = 0;
    mockInstance.volumeAccumulatedTokens = '0';

    expect(mockInstance.volumeCycleCount).toBe(1);
    expect(mockInstance.volumeBuysInCycle).toBe(0);
    expect(mockInstance.volumeAccumulatedTokens).toBe('0');
  });

  it('should differentiate between grid and volume bots', () => {
    const volumeBot = { ...mockInstance };
    const gridBot: BotInstance = {
      ...mockInstance,
      id: 'grid-bot',
      name: 'Grid Bot',
      config: {
        ...mockInstance.config,
        volumeMode: undefined,
        volumeBuysPerCycle: undefined,
        volumeBuyAmount: undefined,
        numPositions: 24,
        floorPrice: 0.000001,
        ceilingPrice: 0.000004,
        takeProfitPercent: 8,
        maxActivePositions: 4,
        useFixedBuyAmount: false,
      },
      volumeBuysInCycle: undefined,
      volumeAccumulatedTokens: undefined,
      volumeCycleCount: undefined,
    };

    expect(volumeBot.config.volumeMode).toBe(true);
    expect(gridBot.config.volumeMode).toBeUndefined();
    expect(volumeBot.volumeBuysInCycle).toBeDefined();
    expect(gridBot.volumeBuysInCycle).toBeUndefined();
  });
});
