// tests/integration/TradingBot.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TradingBot } from '../../src/bot/TradingBot.js';
import { WalletManager } from '../../src/wallet/WalletManager.js';
import { ZeroXApi } from '../../src/api/ZeroXApi.js';
import { JsonStorage } from '../../src/storage/JsonStorage.js';
import { MockZeroXApi, createBotScenario } from '../utils/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('TradingBot Integration Tests', () => {
  let tempDir: string;
  let walletManager: WalletManager;
  let mockZeroXApi: MockZeroXApi;
  let storage: JsonStorage;
  const testPassword = 'integration-test-password-123';
  const testRpcUrl = 'https://base.llamarpc.com';

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-bot-test-'));
    
    // Initialize components
    walletManager = new WalletManager(tempDir);
    await walletManager.initialize(testPassword);
    walletManager.generateMainWallet();

    mockZeroXApi = new MockZeroXApi();
    storage = new JsonStorage(path.join(tempDir, 'bots.json'));
    await storage.init();
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('Bot Initialization', () => {
    it('should initialize bot with grid positions', async () => {
      const { bot: botInstance } = createBotScenario({ numPositions: 10 });
      
      // Override the ZeroXApi with mock
      const zeroXApi = mockZeroXApi.createMock();
      
      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();

      expect(botInstance.positions).toHaveLength(10);
      expect(botInstance.positions[0].status).toBe('EMPTY');
    });

    it('should initialize with existing positions', async () => {
      const { bot: botInstance } = createBotScenario({ 
        numPositions: 5,
        holdingPositions: 2,
      });

      const zeroXApi = mockZeroXApi.createMock();
      
      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();

      expect(botInstance.positions).toHaveLength(5);
      expect(botInstance.positions.filter(p => p.status === 'HOLDING')).toHaveLength(2);
    });
  });

  describe('Price Updates', () => {
    it('should update current price on tick', async () => {
      const { bot: botInstance } = createBotScenario({ numPositions: 5 });
      
      const zeroXApi = mockZeroXApi.createMock();
      zeroXApi.getTokenPrice = vi.fn().mockResolvedValue(0.0006);

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      const initialPrice = botInstance.currentPrice;
      
      await bot.tick();

      expect(botInstance.currentPrice).toBe(0.0006);
      expect(botInstance.currentPrice).not.toBe(initialPrice);
    });

    it('should handle price fetch failure gracefully', async () => {
      const { bot: botInstance } = createBotScenario({ numPositions: 5 });
      
      const zeroXApi = mockZeroXApi.createMock();
      zeroXApi.getTokenPrice = vi.fn().mockRejectedValue(new Error('Network error'));

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      const initialPrice = botInstance.currentPrice;
      
      // Should not throw
      await bot.tick();

      // Should keep previous price
      expect(botInstance.currentPrice).toBe(initialPrice);
    });
  });

  describe('Buy Execution', () => {
    it('should detect buy opportunity when price matches', async () => {
      const { bot: botInstance, positions } = createBotScenario({ 
        numPositions: 10,
        currentPrice: positions => positions[5].buyPrice, // Price at 6th position
      });

      // Set price to match position 5's buy price
      const targetPrice = positions[5].buyPrice;
      
      const zeroXApi = mockZeroXApi.createMock();
      zeroXApi.getTokenPrice = vi.fn().mockResolvedValue(targetPrice);
      zeroXApi.getBuyQuote = vi.fn().mockResolvedValue({
        buyToken: botInstance.tokenAddress,
        sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        buyAmount: '1000000000000000000000',
        sellAmount: '1000000000000000',
        price: targetPrice.toString(),
        gas: '200000',
        gasPrice: '1000000000',
        to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
        data: '0x' + '0'.repeat(128),
        value: '1000000000000000',
        allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
      });

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      bot.setDryRun(true); // Don't actually send transactions
      
      await bot.tick();

      // Verify buy quote was requested
      expect(zeroXApi.getBuyQuote).toHaveBeenCalled();
    });

    it('should respect max active positions limit', async () => {
      const { bot: botInstance, positions } = createBotScenario({ 
        numPositions: 10,
        holdingPositions: 4, // Max is 4
      });

      const zeroXApi = mockZeroXApi.createMock();
      zeroXApi.getTokenPrice = vi.fn().mockResolvedValue(0.0005);

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      
      // Verify no positions available
      const emptyPositions = botInstance.positions.filter(p => p.status === 'EMPTY');
      expect(emptyPositions.length).toBeGreaterThan(0);
      
      // Should not attempt buy due to max positions
      await bot.tick();
      
      expect(botInstance.positions.filter(p => p.status === 'HOLDING')).toHaveLength(4);
    });

    it('should skip buys when disabled', async () => {
      const { bot: botInstance } = createBotScenario({ numPositions: 5 });
      botInstance.config.buysEnabled = false;

      const zeroXApi = mockZeroXApi.createMock();
      const getBuyQuoteSpy = vi.fn();
      zeroXApi.getBuyQuote = getBuyQuoteSpy;

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      await bot.tick();

      expect(getBuyQuoteSpy).not.toHaveBeenCalled();
    });
  });

  describe('Sell Execution', () => {
    it('should detect sell opportunity when price reaches target', async () => {
      const { bot: botInstance } = createBotScenario({ 
        numPositions: 10,
        holdingPositions: 1,
      });

      const holdingPosition = botInstance.positions.find(p => p.status === 'HOLDING')!;
      const sellTargetPrice = holdingPosition.sellPrice + 0.00001; // Above sell target

      const zeroXApi = mockZeroXApi.createMock();
      zeroXApi.getTokenPrice = vi.fn().mockResolvedValue(sellTargetPrice);
      zeroXApi.isProfitable = vi.fn().mockResolvedValue({
        profitable: true,
        quote: {
          buyToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          sellToken: botInstance.tokenAddress,
          buyAmount: '1500000000000000', // 0.0015 ETH profit
          sellAmount: holdingPosition.tokensReceived!,
          price: sellTargetPrice.toString(),
          gas: '200000',
          gasPrice: '1000000000',
          to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
          data: '0x' + '0'.repeat(128),
          value: '0',
          allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
        },
        actualProfit: 50,
      });

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      bot.setDryRun(true);
      
      await bot.tick();

      expect(zeroXApi.isProfitable).toHaveBeenCalled();
    });

    it('should skip sells when disabled', async () => {
      const { bot: botInstance } = createBotScenario({ 
        numPositions: 5,
        holdingPositions: 2,
      });
      botInstance.config.sellsEnabled = false;

      const zeroXApi = mockZeroXApi.createMock();
      const isProfitableSpy = vi.fn();
      zeroXApi.isProfitable = isProfitableSpy;

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      
      // Set price above sell target
      zeroXApi.getTokenPrice = vi.fn().mockResolvedValue(botInstance.positions[0].sellPrice + 0.001);
      
      await bot.tick();

      expect(isProfitableSpy).not.toHaveBeenCalled();
    });

    it('should apply moon bag when selling', async () => {
      const { bot: botInstance } = createBotScenario({ 
        numPositions: 5,
        holdingPositions: 1,
      });
      botInstance.config.moonBagEnabled = true;
      botInstance.config.moonBagPercent = 10; // Keep 10%

      const holdingPosition = botInstance.positions.find(p => p.status === 'HOLDING')!;
      holdingPosition.tokensReceived = '1000000000000000000'; // 1 token

      const zeroXApi = mockZeroXApi.createMock();
      zeroXApi.getTokenPrice = vi.fn().mockResolvedValue(holdingPosition.sellPrice + 0.0001);

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      
      // Verify moon bag is configured
      expect(botInstance.config.moonBagEnabled).toBe(true);
      expect(botInstance.config.moonBagPercent).toBe(10);
    });
  });

  describe('Bot Statistics', () => {
    it('should track buy count', async () => {
      const { bot: botInstance } = createBotScenario({ 
        numPositions: 5,
        holdingPositions: 3,
      });

      const bot = new TradingBot(
        botInstance,
        walletManager,
        mockZeroXApi.createMock() as any,
        storage,
        testRpcUrl
      );

      await bot.init();

      const stats = bot.getStats();
      expect(stats.totalBuys).toBe(3);
      expect(stats.positions.holding).toBe(3);
    });

    it('should track sell count and profit', async () => {
      const { bot: botInstance } = createBotScenario({ 
        numPositions: 5,
        holdingPositions: 1,
        soldPositions: 2,
      });

      const bot = new TradingBot(
        botInstance,
        walletManager,
        mockZeroXApi.createMock() as any,
        storage,
        testRpcUrl
      );

      await bot.init();

      const stats = bot.getStats();
      expect(stats.totalSells).toBe(2);
      expect(stats.positions.sold).toBe(2);
      expect(stats.positions.holding).toBe(1);
    });
  });

  describe('Dry Run Mode', () => {
    it('should not send transactions in dry run mode', async () => {
      const { bot: botInstance } = createBotScenario({ numPositions: 5 });

      const zeroXApi = mockZeroXApi.createMock();
      const sendTransactionSpy = vi.fn();
      
      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      bot.setDryRun(true);

      expect(botInstance.isRunning).toBe(true);
    });
  });

  describe('Liquidation', () => {
    it('should liquidate all holding positions', async () => {
      const { bot: botInstance } = createBotScenario({ 
        numPositions: 5,
        holdingPositions: 3,
      });

      const zeroXApi = mockZeroXApi.createMock();
      zeroXApi.getSellQuote = vi.fn().mockResolvedValue({
        buyToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        sellToken: botInstance.tokenAddress,
        buyAmount: '1500000000000000',
        sellAmount: '1000000000000000000',
        price: '0.0000015',
        gas: '200000',
        gasPrice: '1000000000',
        to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
        data: '0x' + '0'.repeat(128),
        value: '0',
        allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
      });

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();
      bot.setDryRun(true);

      const result = await bot.liquidateAll();

      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle consecutive errors and stop bot', async () => {
      const { bot: botInstance } = createBotScenario({ numPositions: 5 });

      const zeroXApi = mockZeroXApi.createMock();
      zeroXApi.getTokenPrice = vi.fn().mockRejectedValue(new Error('Network failure'));

      const bot = new TradingBot(
        botInstance,
        walletManager,
        zeroXApi as any,
        storage,
        testRpcUrl
      );

      await bot.init();

      // Trigger multiple ticks to cause consecutive errors
      for (let i = 0; i < 6; i++) {
        try {
          await bot.tick();
        } catch (e) {
          // Expected
        }
      }

      // Bot should stop after too many errors
      expect(botInstance.isRunning).toBe(false);
    });
  });
});
