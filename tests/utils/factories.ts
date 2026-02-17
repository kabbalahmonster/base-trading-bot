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
 */
export function createPosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 0,
    buyPrice: 0.0005,
    sellPrice: 0.00054,
    stopLossPrice: 0,
    status: 'EMPTY',
    ...overrides,
  };
}

/**
 * Factory for creating multiple test positions
 */
export function createPositions(count: number, config: Partial<GridConfig> = {}): Position[] {
  const gridConfig = createGridConfig(config);
  const positions: Position[] = [];
  const priceStep = (gridConfig.ceilingPrice - gridConfig.floorPrice) / (count - 1);

  for (let i = 0; i < count; i++) {
    const buyPrice = gridConfig.floorPrice + (priceStep * i);
    positions.push(createPosition({
      id: i,
      buyPrice,
      sellPrice: buyPrice * (1 + gridConfig.takeProfitPercent / 100),
      stopLossPrice: gridConfig.stopLossEnabled ? buyPrice * (1 - gridConfig.stopLossPercent / 100) : 0,
    }));
  }

  return positions;
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
  const positions: Position[] = [];

  const priceStep = (config.ceilingPrice - config.floorPrice) / (numPositions - 1);

  for (let i = 0; i < numPositions; i++) {
    const positionBuyPrice = config.floorPrice + (priceStep * i);
    let status: Position['status'] = 'EMPTY';

    if (i < holdingPositions) {
      status = 'HOLDING';
    } else if (i < holdingPositions + soldPositions) {
      status = 'SOLD';
    }

    positions.push(createPosition({
      id: i,
      buyPrice: positionBuyPrice,
      sellPrice: positionBuyPrice * (1 + config.takeProfitPercent / 100),
      status,
      ...(status !== 'EMPTY' && {
        buyTxHash: '0x' + 'b'.repeat(64),
        buyTimestamp: Date.now() - 3600000,
        tokensReceived: '1000000000000000000000',
        ethCost: '1000000000000000',
      }),
      ...(status === 'SOLD' && {
        sellTxHash: '0x' + 'c'.repeat(64),
        sellTimestamp: Date.now(),
        ethReceived: '1500000000000000',
        profitEth: '500000000000000',
        profitPercent: 50,
      }),
    }));
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
