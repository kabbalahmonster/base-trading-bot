// src/bot/HeartbeatManager.ts

import { TradingBot } from './TradingBot';
import { BotInstance } from '../types';
import { WalletManager } from '../wallet/WalletManager';
import { ZeroXApi } from '../api/ZeroXApi';
import { JsonStorage } from '../storage/JsonStorage';

export class HeartbeatManager {
  private bots: Map<string, TradingBot> = new Map();
  private walletManager: WalletManager;
  private zeroXApi: ZeroXApi;
  private storage: JsonStorage;
  private rpcUrl: string;
  
  private isRunning: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private currentBotIndex: number = 0;
  private heartbeatMs: number = 1000;

  constructor(
    walletManager: WalletManager,
    zeroXApi: ZeroXApi,
    storage: JsonStorage,
    rpcUrl: string,
    heartbeatMs: number = 1000
  ) {
    this.walletManager = walletManager;
    this.zeroXApi = zeroXApi;
    this.storage = storage;
    this.rpcUrl = rpcUrl;
    this.heartbeatMs = heartbeatMs;
  }

  /**
   * Load all bots from storage and initialize them
   */
  async loadBots(): Promise<void> {
    const instances = await this.storage.getAllBots();
    
    for (const instance of instances) {
      if (instance.isRunning) {
        await this.addBot(instance);
      }
    }
  }

  /**
   * Add a bot to the manager
   */
  async addBot(instance: BotInstance): Promise<TradingBot> {
    const bot = new TradingBot(
      instance,
      this.walletManager,
      this.zeroXApi,
      this.storage,
      this.rpcUrl
    );

    await bot.init();
    this.bots.set(instance.id, bot);
    
    console.log(`✓ Bot ${instance.name} (${instance.id}) added`);
    return bot;
  }

  /**
   * Remove a bot from the manager
   */
  removeBot(botId: string): void {
    const bot = this.bots.get(botId);
    if (bot) {
      bot.stop();
      this.bots.delete(botId);
      console.log(`✓ Bot ${botId} removed`);
    }
  }

  /**
   * Start the heartbeat
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log(`✓ Heartbeat started (${this.heartbeatMs}ms interval)`);
    console.log(`  Managing ${this.bots.size} bot(s)`);

    this.heartbeatInterval = setInterval(() => {
      this.tick();
    }, this.heartbeatMs);
  }

  /**
   * Stop the heartbeat
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Stop all bots
    for (const bot of this.bots.values()) {
      bot.stop();
    }

    console.log('✓ Heartbeat stopped');
  }

  /**
   * Single heartbeat tick
   */
  private async tick(): Promise<void> {
    const botList = Array.from(this.bots.values());
    if (botList.length === 0) return;

    // Get next bot in sequence
    const bot = botList[this.currentBotIndex % botList.length];
    const instance = bot.getInstance();

    // Check if bot should be skipped
    const skipCount = instance.config.skipHeartbeats || 0;
    const shouldRun = (this.currentBotIndex % (skipCount + 1)) === 0;

    if (shouldRun) {
      try {
        await bot.tick();
      } catch (error: any) {
        console.error(`Bot ${instance.id} error:`, error.message);
      }
    }

    // Move to next bot
    this.currentBotIndex = (this.currentBotIndex + 1) % botList.length;
  }

  /**
   * Get status of all bots
   */
  getStatus(): {
    isRunning: boolean;
    heartbeatMs: number;
    totalBots: number;
    bots: { id: string; name: string; isRunning: boolean; lastHeartbeat: number }[];
  } {
    return {
      isRunning: this.isRunning,
      heartbeatMs: this.heartbeatMs,
      totalBots: this.bots.size,
      bots: Array.from(this.bots.values()).map(b => {
        const instance = b.getInstance();
        return {
          id: instance.id,
          name: instance.name,
          isRunning: instance.isRunning,
          lastHeartbeat: instance.lastHeartbeat,
        };
      }),
    };
  }

  /**
   * Get a specific bot
   */
  getBot(id: string): TradingBot | undefined {
    return this.bots.get(id);
  }

  /**
   * Get all bots
   */
  getAllBots(): TradingBot[] {
    return Array.from(this.bots.values());
  }
}
