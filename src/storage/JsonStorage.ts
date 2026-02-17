// src/storage/JsonStorage.ts

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { BotStorage, BotInstance, MainWallet, WalletDictionary } from '../types/index.js';

const DEFAULT_DATA: BotStorage = {
  walletDictionary: {},
  bots: [],
};

export class JsonStorage {
  private db: Low<BotStorage>;

  constructor(filePath: string = './bots.json') {
    const adapter = new JSONFile<BotStorage>(filePath);
    this.db = new Low(adapter, DEFAULT_DATA);
  }

  async init(): Promise<void> {
    await this.db.read();
    
    // Ensure default structure
    if (!this.db.data) {
      this.db.data = DEFAULT_DATA;
    }
    if (!this.db.data.walletDictionary) {
      this.db.data.walletDictionary = {};
    }
    if (!this.db.data.bots) {
      this.db.data.bots = [];
    }
    
    await this.db.write();
  }

  // Main Wallet
  async getMainWallet(): Promise<MainWallet | undefined> {
    return this.db.data?.mainWallet;
  }

  async setMainWallet(wallet: MainWallet): Promise<void> {
    if (!this.db.data) await this.init();
    this.db.data!.mainWallet = wallet;
    await this.db.write();
  }

  // Bot Dictionary
  async getWalletDictionary(): Promise<WalletDictionary> {
    return this.db.data?.walletDictionary || {};
  }

  async setWalletDictionary(dictionary: WalletDictionary): Promise<void> {
    if (!this.db.data) await this.init();
    this.db.data!.walletDictionary = dictionary;
    await this.db.write();
  }

  async addBotWallet(botId: string, wallet: { address: string; encryptedPrivateKey: string; createdAt: number }): Promise<void> {
    if (!this.db.data) await this.init();
    this.db.data!.walletDictionary[botId] = wallet;
    await this.db.write();
  }

  // Bots
  async getAllBots(): Promise<BotInstance[]> {
    return this.db.data?.bots || [];
  }

  async getBot(id: string): Promise<BotInstance | undefined> {
    return this.db.data?.bots.find(b => b.id === id);
  }

  async saveBot(bot: BotInstance): Promise<void> {
    if (!this.db.data) await this.init();
    
    const index = this.db.data!.bots.findIndex(b => b.id === bot.id);
    if (index >= 0) {
      this.db.data!.bots[index] = bot;
    } else {
      this.db.data!.bots.push(bot);
    }
    
    await this.db.write();
  }

  async deleteBot(id: string): Promise<void> {
    if (!this.db.data) await this.init();
    this.db.data!.bots = this.db.data!.bots.filter(b => b.id !== id);
    await this.db.write();
  }

  async updateBotField(
    id: string,
    field: keyof BotInstance,
    value: any
  ): Promise<void> {
    const bot = await this.getBot(id);
    if (bot) {
      (bot as any)[field] = value;
      bot.lastUpdated = Date.now();
      await this.saveBot(bot);
    }
  }

  async updateBotPositions(id: string, positions: BotInstance['positions']): Promise<void> {
    const bot = await this.getBot(id);
    if (bot) {
      bot.positions = positions;
      bot.lastUpdated = Date.now();
      await this.saveBot(bot);
    }
  }

  async updateBotStats(
    id: string,
    stats: Partial<Pick<BotInstance, 'totalBuys' | 'totalSells' | 'totalProfitEth' | 'totalProfitUsd'>>
  ): Promise<void> {
    const bot = await this.getBot(id);
    if (bot) {
      Object.assign(bot, stats);
      bot.lastUpdated = Date.now();
      await this.saveBot(bot);
    }
  }

  // Export/Import
  async export(): Promise<BotStorage> {
    return {
      mainWallet: this.db.data?.mainWallet,
      walletDictionary: this.db.data?.walletDictionary || {},
      bots: this.db.data?.bots || [],
    };
  }

  async import(data: BotStorage): Promise<void> {
    this.db.data = {
      ...DEFAULT_DATA,
      ...data,
    };
    await this.db.write();
  }

  // Stats
  async getGlobalStats(): Promise<{
    totalBots: number;
    runningBots: number;
    totalProfitEth: string;
    totalTrades: number;
  }> {
    const bots = await this.getAllBots();
    
    return {
      totalBots: bots.length,
      runningBots: bots.filter(b => b.isRunning).length,
      totalProfitEth: bots.reduce((sum, b) => sum + BigInt(b.totalProfitEth || '0'), BigInt(0)).toString(),
      totalTrades: bots.reduce((sum, b) => sum + b.totalBuys + b.totalSells, 0),
    };
  }
}
