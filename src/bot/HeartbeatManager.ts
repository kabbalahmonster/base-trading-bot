// src/bot/HeartbeatManager.ts

import chalk from 'chalk';
import { TradingBot } from './TradingBot.js';
import { BotInstance } from '../types/index.js';
import { WalletManager } from '../wallet/WalletManager.js';
import { ZeroXApi } from '../api/ZeroXApi.js';
import { JsonStorage } from '../storage/JsonStorage.js';
import { PnLTracker } from '../analytics/PnLTracker.js';

export class HeartbeatManager {
  private bots: Map<string, TradingBot> = new Map();
  private walletManager: WalletManager;
  private zeroXApi: ZeroXApi;
  private storage: JsonStorage;
  private rpcUrl: string;
  private pnLTracker: PnLTracker | null = null;
  
  private isRunning: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private currentBotIndex: number = 0;
  private heartbeatMs: number = 1000;

  constructor(
    walletManager: WalletManager,
    zeroXApi: ZeroXApi,
    storage: JsonStorage,
    rpcUrl: string,
    heartbeatMs: number = 1000,
    pnLTracker?: PnLTracker
  ) {
    this.walletManager = walletManager;
    this.zeroXApi = zeroXApi;
    this.storage = storage;
    this.rpcUrl = rpcUrl;
    this.heartbeatMs = heartbeatMs;
    this.pnLTracker = pnLTracker || null;
  }

  /**
   * Set the PnL tracker
   */
  setPnLTracker(pnLTracker: PnLTracker): void {
    this.pnLTracker = pnLTracker;
    // Update existing bots with the tracker
    for (const bot of this.bots.values()) {
      bot.setPnLTracker(pnLTracker);
    }
  }

  /**
   * Get the PnL tracker
   */
  getPnLTracker(): PnLTracker | null {
    return this.pnLTracker;
  }

  /**
   * Load all bots from storage and initialize them
   */
  async loadBots(): Promise<void> {
    const instances = await this.storage.getAllBots();
    const runningInstances = instances.filter(i => i.isRunning);
    
    if (runningInstances.length === 0) return;
    
    if (runningInstances.length > 1) {
      console.log(chalk.dim(`  Starting ${runningInstances.length} bots...`));
    }
    
    // Load bots in parallel for faster startup
    await Promise.all(runningInstances.map(instance => this.addBot(instance)));
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
      this.rpcUrl,
      true, // enablePriceOracle
      this.pnLTracker || undefined
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
   * Update heartbeat interval dynamically without restart
   */
  updateInterval(newIntervalMs: number): void {
    const wasRunning = this.isRunning;
    
    // Stop current interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Update interval
    this.heartbeatMs = newIntervalMs;
    
    // Restart if was running
    if (wasRunning) {
      this.heartbeatInterval = setInterval(() => {
        this.tick();
      }, this.heartbeatMs);
      console.log(`✓ Heartbeat interval updated to ${newIntervalMs}ms`);
    } else {
      console.log(`✓ Heartbeat interval set to ${newIntervalMs}ms (will apply on start)`);
    }
  }

  /**
   * Get current heartbeat interval
   */
  getInterval(): number {
    return this.heartbeatMs;
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
