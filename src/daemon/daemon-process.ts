#!/usr/bin/env node
// src/daemon/daemon-process.ts
// Background daemon process that runs bots persistently

import { WalletManager } from '../wallet/WalletManager.js';
import { ZeroXApi } from '../api/ZeroXApi.js';
import { JsonStorage } from '../storage/JsonStorage.js';
import { HeartbeatManager } from '../bot/HeartbeatManager.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { PnLTracker } from '../analytics/PnLTracker.js';
import { join } from 'path';
import { homedir } from 'os';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = join(homedir(), '.base-trading-bot');
const RPC_URL = process.env.BASE_RPC_URL || 'https://base.llamarpc.com';
const ZEROX_API_KEY = process.env.ZEROX_API_KEY || '';

console.log(`[${new Date().toISOString()}] Bot Daemon Starting...`);
console.log(`[${new Date().toISOString()}] Data directory: ${DATA_DIR}`);

// Initialize components
const storage = new JsonStorage(join(DATA_DIR, 'bots.json'));
const walletManager = new WalletManager();
const zeroXApi = new ZeroXApi(ZEROX_API_KEY);
const heartbeatManager = new HeartbeatManager(
  walletManager,
  zeroXApi,
  storage,
  RPC_URL
);

// Track if we're shutting down
let shuttingDown = false;

// Graceful shutdown
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  
  console.log(`[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`);
  
  // Stop all bots
  heartbeatManager.stop();
  
  // Give time for cleanup
  setTimeout(() => {
    console.log(`[${new Date().toISOString()}] Daemon stopped`);
    process.exit(0);
  }, 2000);
}

// Handle signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGHUP', () => {
  console.log(`[${new Date().toISOString()}] SIGHUP received, reloading...`);
  // Reload configuration if needed
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] Uncaught exception:`, error);
  // Don't exit - try to keep running
});

process.on('unhandledRejection', (reason) => {
  console.error(`[${new Date().toISOString()}] Unhandled rejection:`, reason);
  // Don't exit - try to keep running
});

// Main daemon loop
async function main() {
  try {
    // Initialize storage
    await storage.init();
    
    // Initialize notifications if configured
    const notificationService = NotificationService.getInstance();
    notificationService.initializeFromEnv();
    
    // Initialize wallet manager (requires password from environment or file)
    // In daemon mode, we need the password stored securely
    const walletPassword = process.env.WALLET_PASSWORD;
    if (walletPassword) {
      await walletManager.initialize(walletPassword);
      const walletDictionary = await storage.getWalletDictionary();
      const primaryWalletId = await storage.getPrimaryWalletId();
      walletManager.importData({ walletDictionary, primaryWalletId });
      console.log(`[${new Date().toISOString()}] Wallet manager initialized`);
    } else {
      console.warn(`[${new Date().toISOString()}] WARNING: WALLET_PASSWORD not set, some features may not work`);
    }
    
    // Initialize PnL tracker
    const pnLTracker = new PnLTracker(storage);
    await pnLTracker.init();
    console.log(`[${new Date().toISOString()}] PnL tracker initialized`);
    
    // Load and start bots
    await heartbeatManager.loadBots();
    heartbeatManager.start();
    
    const bots = await storage.getAllBots();
    const runningBots = bots.filter(b => b.enabled && b.isRunning).length;
    console.log(`[${new Date().toISOString()}] Loaded ${bots.length} bots, ${runningBots} running`);
    
    // Send startup notification if configured
    if (notificationService.isConfigured()) {
      await notificationService.sendMessage(
        `🤖 Bot Daemon Started\n${runningBots} bots running`
      );
    }
    
    // Keep process alive
    console.log(`[${new Date().toISOString()}] Daemon running (PID: ${process.pid})`);
    
    // Periodic status log
    setInterval(async () => {
      const status = heartbeatManager.getStatus();
      console.log(`[${new Date().toISOString()}] Heartbeat: ${status.isRunning ? 'running' : 'stopped'}, bots: ${status.totalBots}`);
    }, 60000); // Every minute
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Daemon initialization error:`, error);
    process.exit(1);
  }
}

main();
