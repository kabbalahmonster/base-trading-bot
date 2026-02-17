// tests/utils/factories.ts

import { randomUUID } from 'crypto';
import {
  GridConfig,
  Position,
  BotInstance,
  WalletData,
  ZeroXQuote,
  TradeResult,
} from '../../src/types/index.js';
import { TEST_TOKENS, generateTestWallet } from './testWallets.js';
import { GridCalculator } from '../../src/grid/GridCalculator.js';

/**
 * Factory for creating test GridConfig objects
 */
export function createGridConfig(overrides: Partial<GridConfig> = {}): GridConfig {
  return {
    numPositions: 10,
    floorPrice: 0.0001,
    ceilingPrice: 0.001,
    useMarketCap: false,
    takeProfitPercent: 8,
    stopLossPercent: 10,
    stopLossEnabled: false,
    buysEnabled: true,
    sellsEnabled: true,
    moonBagEnabled: true,
    moonBagPercent: 1,
    minProfitPercent: 2,
    maxActivePositions: 4,
    buyAmount: 0,
    useFixedBuyAmount: false,
    heartbeatMs: 1000,
    skipHeartbeats: 0,
    ...overrides,
  };
}

/**
 * Factory for creating test Position objects
 * Uses the new Position interface with buyMin/buyMax
 */
export function createPosition(overrides: Partial<Position> = {}): Position {
  const buyMin = overrides.buyMin ?? 0.0004;
  const buyMax = overrides.buyMax ?? 0.0005;
  const takeProfitPercent = overrides.takeProfitPercent ?? 8;
  const stopLossPercent = overrides.stopLossPercent ?? 10;
  const stopLossEnabled = overrides.stopLossEnabled ?? false;
  
  return {
    id: 0,
    buyMin,
    buyMax,
    buyPrice: buyMax, // Legacy compatibility
    sellPrice: buyMax * (1 + takeProfitPercent / 100),
    stopLossPrice: stopLossEnabled ? buyMin * (1 - stopLossPercent / 100) : 0,
    status: 'EMPTY',
    ...overrides,
  };
}

/**
 * Factory for creating multiple test positions using the GridCalculator
 * This ensures positions are generated consistently with the actual implementation
 */
export function createPositions(count: number, config: Partial<GridConfig> = {}): Position[] {
  const gridConfig = createGridConfig({ ...config, numPositions: count });
  const currentPrice = (gridConfig.floorPrice + gridConfig.ceilingPrice) / 2;
  
  return GridCalculator.generateGrid(currentPrice, gridConfig);
}

/**
 * Factory for creating test BotInstance objects
 */
export function createBotInstance(overrides: Partial<BotInstance> = {}): BotInstance {
  const wallet = generateTestWallet();
  const config = createGridConfig(overrides.config);
  
  return {
    id: randomUUID(),
    name: 'Test Bot',
    tokenAddress: TEST_TOKENS.COMPUTE,
    tokenSymbol: 'COMPUTE',
    walletAddress: wallet.address,
    useMainWallet: true,
    config,
    positions: [],
    totalBuys: 0,
    totalSells: 0,
    totalProfitEth: '0',
    totalProfitUsd: 0,
    isRunning: false,
    enabled: true,
    lastHeartbeat: 0,
    currentPrice: 0.0005,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    ...overrides,
  };
}

/**
 * Factory for creating test WalletData objects
 */
export function createWalletData(type: 'main' | 'bot' = 'main', overrides: Partial<WalletData> = {}): WalletData {
  const wallet = generateTestWallet();
  
  return {
    address: wallet.address,
    encryptedPrivateKey: `mock_salt:mock_encrypted_${wallet.privateKey.slice(2, 20)}`,
    createdAt: Date.now(),
    name: type === 'main' ? 'Main Wallet' : `Bot Wallet`,
    type,
    ...overrides,
  };
}

/**
 * Factory for creating test ZeroXQuote objects
 */
export function createZeroXQuote(type: 'buy' | 'sell' = 'buy', overrides: Partial<ZeroXQuote> = {}): ZeroXQuote {
  const baseQuote: ZeroXQuote = {
    buyToken: type === 'buy' ? TEST_TOKENS.COMPUTE : '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    sellToken: type === 'buy' ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' : TEST_TOKENS.COMPUTE,
    buyAmount: type === 'buy' ? '1000000000000000000000' : '1500000000000000', // 1000 tokens or 0.0015 ETH
    sellAmount: type === 'buy' ? '1000000000000000' : '1000000000000000000000', // 0.001 ETH or 1000 tokens
    price: type === 'buy' ? '0.000001' : '0.0000015',
    gas: '200000',
    gasPrice: '1000000000',
    to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
    data: '0x' + '0'.repeat(128),
    value: type === 'buy' ? '1000000000000000' : '0',
    allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
    ...overrides,
  };

  return baseQuote;
}

/**
 * Factory for creating test TradeResult objects
 */
export function createTradeResult(success: boolean = true, overrides: Partial<TradeResult> = {}): TradeResult {
  if (success) {
    return {
      success: true,
      txHash: '0x' + 'a'.repeat(64),
      gasUsed: BigInt(21000),
      gasCostEth: '21000000000000',
      ...overrides,
    };
  }

  return {
    success: false,
    error: 'Transaction failed',
    ...overrides,
  };
}

/**
 * Factory for creating a complete bot scenario
 */
export function createBotScenario(options: {
  numPositions?: number;
  holdingPositions?: number;
  soldPositions?: number;
  buyPrice?: number;
  currentPrice?: number;
} = {}) {
  const {
    numPositions = 10,
    holdingPositions = 0,
    soldPositions = 0,
    buyPrice = 0.0005,
    currentPrice = 0.0006,
  } = options;

  const config = createGridConfig({ numPositions });
  
  // Use GridCalculator to generate positions with proper buyMin/buyMax
  const positions = GridCalculator.generateGrid(currentPrice, config);

  // Set up holding and sold positions as requested
  for (let i = 0; i < positions.length; i++) {
    if (i < holdingPositions) {
      positions[i].status = 'HOLDING';
      positions[i].buyTxHash = '0x' + 'b'.repeat(64);
      positions[i].buyTimestamp = Date.now() - 3600000;
      positions[i].tokensReceived = '1000000000000000000000';
      positions[i].ethCost = '1000000000000000';
    } else if (i < holdingPositions + soldPositions) {
      positions[i].status = 'SOLD';
      positions[i].buyTxHash = '0x' + 'b'.repeat(64);
      positions[i].buyTimestamp = Date.now() - 7200000;
      positions[i].tokensReceived = '1000000000000000000000';
      positions[i].ethCost = '1000000000000000';
      positions[i].sellTxHash = '0x' + 'c'.repeat(64);
      positions[i].sellTimestamp = Date.now();
      positions[i].ethReceived = '1500000000000000';
      positions[i].profitEth = '500000000000000';
      positions[i].profitPercent = 50;
    }
  }

  const bot = createBotInstance({
    config,
    positions,
    currentPrice,
    totalBuys: holdingPositions + soldPositions,
    totalSells: soldPositions,
  });

  return {
    bot,
    config,
    positions,
    currentPrice,
  };
}
