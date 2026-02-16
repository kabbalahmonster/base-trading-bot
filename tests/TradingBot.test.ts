// tests/TradingBot.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { TradingBot } from '../src/bot/TradingBot';
import { WalletManager } from '../src/wallet/WalletManager';
import { ZeroXApi } from '../src/api/ZeroXApi';
import { JsonStorage } from '../src/storage/JsonStorage';
import { BotInstance, GridConfig } from '../src/types';
import { randomUUID } from 'crypto';

describe('TradingBot', () => {
  let walletManager: WalletManager;
  let zeroXApi: ZeroXApi;
  let storage: JsonStorage;
  let botInstance: BotInstance;

  beforeEach(async () => {
    walletManager = new WalletManager();
    await walletManager.initialize('test-password-123');
    
    zeroXApi = new ZeroXApi();
    storage = new JsonStorage('./test-bots.json');
    await storage.init();

    const mainWallet = walletManager.generateMainWallet();

    const config: GridConfig = {
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
      heartbeatMs: 1000,
      skipHeartbeats: 0,
    };

    botInstance = {
      id: randomUUID(),
      name: 'Test Bot',
      tokenAddress: '0x696381f39F17cAD67032f5f52A4924ce84e51BA3', // COMPUTE
      tokenSymbol: 'COMPUTE',
      walletAddress: mainWallet.address,
      useMainWallet: true,
      config,
      positions: [],
      totalBuys: 0,
      totalSells: 0,
      totalProfitEth: '0',
      totalProfitUsd: 0,
      isRunning: false,
      lastHeartbeat: 0,
      currentPrice: 0.0005,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
  });

  it('should create a TradingBot instance', () => {
    const bot = new TradingBot(
      botInstance,
      walletManager,
      zeroXApi,
      storage,
      'https://base.llamarpc.com'
    );

    expect(bot).toBeDefined();
    expect(bot.getInstance()).toBe(botInstance);
  });

  it('should have correct initial state', () => {
    expect(botInstance.positions).toHaveLength(0);
    expect(botInstance.totalBuys).toBe(0);
    expect(botInstance.totalSells).toBe(0);
    expect(botInstance.isRunning).toBe(false);
  });
});

// Run with: npm test
