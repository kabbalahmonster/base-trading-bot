#!/usr/bin/env node
// src/index.ts - Main CLI entry point

import chalk from 'chalk';
import inquirer from 'inquirer';
import { WalletManager } from './wallet/WalletManager.js';
import { ZeroXApi } from './api/ZeroXApi.js';
import { JsonStorage } from './storage/JsonStorage.js';
import { HeartbeatManager } from './bot/HeartbeatManager.js';
import { GridCalculator } from './grid/GridCalculator.js';
import { BotInstance, GridConfig, Position, Chain } from './types/index.js';
import { NotificationService } from './notifications/NotificationService.js';
import { TelegramBot } from './notifications/TelegramBot.js';
import { PriceOracle } from './oracle/index.js';
import { formatEther, createPublicClient } from 'viem';
import { randomUUID } from 'crypto';
import { PnLTracker, CsvExporter } from './analytics/index.js';
import { BotDaemon } from './daemon/BotDaemon.js';
import { runScreener } from './tools/grid-screener.js';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.BASE_RPC_URL || 'https://base.llamarpc.com';
const ETH_RPC_URL = process.env.ETH_RPC_URL || 'https://eth.llamarpc.com';
const ZEROX_API_KEY = process.env.ZEROX_API_KEY;

// Fallback RPC endpoints for resilience
const RPC_FALLBACKS: Record<Chain, string[]> = {
  base: [
    'https://base.llamarpc.com',
    'https://mainnet.base.org',
    'https://base.publicnode.com',
    'https://base.drpc.org',
    'https://1rpc.io/base',
  ],
  ethereum: [
    'https://eth.llamarpc.com',
    'https://eth.drpc.org',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com',
    'https://1rpc.io/eth',
  ],
};

// Track working RPC per chain
const currentRpcUrls: Record<Chain, string> = {
  base: RPC_URL,
  ethereum: ETH_RPC_URL,
};

/**
 * Get default RPC URL for a chain
 */
function getDefaultRpc(chain: Chain): string {
  return chain === 'base' ? RPC_URL : ETH_RPC_URL;
}

// Cache for working RPC to avoid repeated testing
let workingRpcCache: Record<Chain, string | null> = {
  base: null,
  ethereum: null,
};
let lastRpcCheck: Record<Chain, number> = {
  base: 0,
  ethereum: 0,
};
const RPC_CACHE_TTL = 60000; // 1 minute cache

/**
 * Get a working RPC URL with fallback support for a specific chain
 * Uses timeout to prevent hanging on slow/unresponsive RPCs
 * Caches results to speed up repeated calls
 */
async function getWorkingRpc(chain: Chain = 'base', forceCheck: boolean = false): Promise<string> {
  const now = Date.now();
  const cached = workingRpcCache[chain];
  const cacheAge = now - lastRpcCheck[chain];
  
  // Use cached RPC if fresh and not forcing a check
  if (!forceCheck && cached && cacheAge < RPC_CACHE_TTL) {
    return cached;
  }
  
  const defaultRpc = getDefaultRpc(chain);
  const fallbacks = RPC_FALLBACKS[chain];
  
  // First try the current/preferred RPC
  const rpcsToTry = [currentRpcUrls[chain], ...fallbacks.filter(r => r !== currentRpcUrls[chain])];
  
  for (let i = 0; i < rpcsToTry.length; i++) {
    const rpc = rpcsToTry[i];
    try {
      const { createPublicClient, http } = await import('viem');
      const chainConfig = chain === 'base' 
        ? (await import('viem/chains')).base 
        : (await import('viem/chains')).mainnet;
      
      const client = createPublicClient({
        chain: chainConfig,
        transport: http(rpc, { timeout: 3000 }), // 3 second timeout (was 5)
      });
      
      // Test connection with a simple block number request (with timeout)
      const blockNumberPromise = client.getBlockNumber();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3000)
      );
      await Promise.race([blockNumberPromise, timeoutPromise]);
      
      // Success! Update current RPC and cache
      currentRpcUrls[chain] = rpc;
      workingRpcCache[chain] = rpc;
      lastRpcCheck[chain] = now;
      
      if (i > 0 && forceCheck) {
        console.log(chalk.green(`✓ Switched to working RPC: ${rpc}`));
      }
      
      return rpc;
    } catch (error: any) {
      // Only log if not a timeout (timeouts are expected with public RPCs)
      if (!error.message?.includes('Timeout') && forceCheck) {
        console.log(chalk.dim(`  RPC unavailable: ${rpc.slice(0, 30)}...`));
      }
      continue;
    }
  }
  
  // All RPCs failed, return default and let it fail later with proper error
  if (forceCheck) {
    console.log(chalk.red(`✗ All ${chain} RPC endpoints failed. Using default.`));
  }
  return defaultRpc;
}

console.log(chalk.cyan.bold('\n🤖 Multi-Chain Grid Trading Bot\n'));
console.log(chalk.dim('Supports: Base and Ethereum Mainnet\n'));

async function main() {
  console.log(chalk.dim('  Loading storage...'));
  const storage = new JsonStorage('./bots.json');
  await storage.init();

  console.log(chalk.dim('  Initializing wallet manager...'));
  const walletManager = new WalletManager();
  
  console.log(chalk.dim('  Connecting to 0x API...'));
  const zeroXApi = new ZeroXApi(ZEROX_API_KEY);

  // Initialize PnL Tracker with storage (JsonStorage now includes trade history)
  const pnLTracker = new PnLTracker(storage);
  await pnLTracker.init();

  // Check if wallets exist and prompt for password early
  const walletDictionary = await storage.getWalletDictionary();
  const hasWallets = Object.keys(walletDictionary).length > 0;
  
  if (hasWallets) {
    console.log(chalk.cyan('\n🔐 Wallets detected. Please unlock to continue.\n'));
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Enter master password:',
        mask: '*',
      },
    ]);

    try {
      console.log(chalk.dim('  Unlocking wallet...'));
      await walletManager.initialize(password);
      const primaryWalletId = await storage.getPrimaryWalletId();
      walletManager.importData({ walletDictionary, primaryWalletId });
      console.log(chalk.green('✓ Wallet unlocked\n'));
    } catch (error: any) {
      console.log(chalk.red(`\n✗ Invalid password: ${error.message}`));
      console.log(chalk.yellow('Continuing in read-only mode. Some features will be unavailable.\n'));
    }
  }

  // Initialize Notification Service from environment
  console.log(chalk.dim('  Initializing services...'));
  const notificationService = NotificationService.getInstance();
  notificationService.initializeFromEnv();
  if (notificationService.isConfigured()) {
    console.log(chalk.green('✓ Telegram notifications configured'));
  }

  // Helper to ensure wallet is initialized
  async function ensureWalletInitialized(): Promise<boolean> {
    const walletDictionary = await storage.getWalletDictionary();
    const hasWallets = Object.keys(walletDictionary).length > 0;

    if (!hasWallets) {
      console.log(chalk.yellow('\nNo wallets found. Create a wallet first.\n'));
      return false;
    }

    // Check if wallet manager is already initialized
    try {
      walletManager.getMainAccount();
      return true;
    } catch {
      // Need to initialize
      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter master password:',
          mask: '*',
        },
      ]);

      try {
        await walletManager.initialize(password);
        const primaryWalletId = await storage.getPrimaryWalletId();
        walletManager.importData({ walletDictionary, primaryWalletId });
        return true;
      } catch (error: any) {
        console.log(chalk.red(`\n✗ Invalid password: ${error.message}\n`));
        return false;
      }
    }
  }

  const heartbeatManager = new HeartbeatManager(
    walletManager,
    zeroXApi,
    storage,
    RPC_URL,
    1000, // heartbeatMs
    pnLTracker
  );

  // Load existing bots
  console.log(chalk.dim('  Loading bots...'));
  await heartbeatManager.loadBots();

  // Check if any bots were loaded and are running - auto-start heartbeat
  const loadedBots = await storage.getAllBots();
  const runningBots = loadedBots.filter(b => b.isRunning);
  if (runningBots.length > 0) {
    console.log(chalk.dim(`  ${runningBots.length} bot(s) already running, reconnecting...`));
    heartbeatManager.start();
  }

  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🆕 Create new bot', value: 'create' },
          { name: '⚙️  Reconfigure bot', value: 'reconfigure' },
          { name: '▶️  Start bot(s)', value: 'start' },
          { name: '⏹️  Stop bot(s)', value: 'stop' },
          { name: '⏸️  Enable/Disable bot', value: 'toggle' },
          { name: '📊 View status', value: 'status' },
          { name: '📺 Monitor bots (live)', value: 'monitor' },
          { name: '👁️  View daemon status', value: 'daemon_status' },
          { name: '📈 View P&L Report', value: 'pnl_report' },
          { name: '💰 Fund wallet', value: 'fund' },
          { name: '👛 View wallet balances', value: 'view_balances' },
          { name: '📤 Send ETH to external', value: 'send_external' },
          { name: '🪙 Send tokens to external', value: 'send_tokens' },
          { name: '🔧 Manage wallets', value: 'manage_wallets' },
          { name: '🔔 Configure Telegram', value: 'configure_telegram' },
          { name: '🏧 Reclaim funds', value: 'reclaim' },
          { name: '🔮 Oracle status', value: 'oracle_status' },
          { name: '⚡ Toggle price validation', value: 'toggle_price_validation' },
          { name: '📊 Diagnostic', value: 'diagnostic' },
          { name: '⚙️  System settings', value: 'system_settings' },
          { name: '🧮 View grid positions', value: 'view_grid' },
          { name: '🎯 Token screener', value: 'screener' },
          { name: '🗑️  Delete bot', value: 'delete' },
          { name: '⏻️  Exit (bots keep running)', value: 'exit_keep' },
          { name: '⏹️  Exit and stop all bots', value: 'exit_stop' },
        ],
      },
    ]);

    if (action === 'exit_keep') {
      console.log(chalk.cyan('\n👋 Exiting CLI. Bots continue running in background.\n'));
      console.log(chalk.dim('To stop bots later, restart and select "Exit and stop all bots"\n'));
      // Don't stop heartbeat manager - let bots keep running
      // Use process.exit to immediately exit without running cleanup code
      process.exit(0);
    }
    
    if (action === 'exit_stop') {
      console.log(chalk.yellow('\n⏹ Stopping all bots...\n'));
      heartbeatManager.stop();
      console.log(chalk.green('✓ All bots stopped\n'));
      break;
    }

    try {
      switch (action) {
        case 'create':
          await createBot(storage, walletManager);
          break;
        case 'start':
          await startBot(heartbeatManager, storage, ensureWalletInitialized);
          break;
        case 'stop':
          await stopBot(heartbeatManager, storage);
          break;
        case 'toggle':
          await toggleBotStatus(storage, heartbeatManager);
          break;
        case 'reconfigure':
          await reconfigureBot(storage);
          break;
        case 'status':
          await showStatus(heartbeatManager, storage);
          break;
        case 'monitor':
          await monitorBots(storage, heartbeatManager);
          break;
        case 'daemon_status':
          await showDaemonStatus();
          break;
        case 'pnl_report':
          await showPnlReport(pnLTracker, storage);
          break;
        case 'fund':
          await fundWallet(walletManager, storage);
          break;
        case 'view_balances':
          await viewWalletBalances(storage, walletManager);
          break;
        case 'send_external':
          await sendToExternalWallet(walletManager, storage);
          break;
        case 'send_tokens':
          await sendTokensToExternal(walletManager, storage);
          break;
        case 'manage_wallets':
          await manageWallets(walletManager, storage);
          break;
        case 'configure_telegram':
          await configureTelegram();
          break;
        case 'reclaim':
          await reclaimFunds(walletManager, storage);
          break;
        case 'oracle_status':
          await showOracleStatus();
          break;
        case 'toggle_price_validation':
          await togglePriceValidation(storage, heartbeatManager);
          break;
        case 'diagnostic':
          await runDiagnostic(storage, heartbeatManager);
          break;
        case 'system_settings':
          await systemSettings(storage, heartbeatManager);
          break;
        case 'view_grid':
          await viewGridPositions(storage);
          break;
        case 'screener':
          await runTokenScreener();
          break;
        case 'delete':
          await deleteBot(heartbeatManager, storage, walletManager);
          break;
      }
    } catch (error: any) {
      console.log(chalk.red(`\n✗ Error: ${error.message}\n`));
    }
  }

  // Cleanup
  heartbeatManager.stop();
  console.log(chalk.cyan('\n👋 Goodbye!\n'));
}

async function createBot(storage: JsonStorage, walletManager: WalletManager) {
  console.log(chalk.cyan('\n📋 Creating new trading bot\n'));

  // Initialize wallet manager if needed
  let mainWallet = await storage.getMainWallet();
  if (!mainWallet) {
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Create master password (min 8 chars):',
        mask: '*',
        validate: (input) => input.length >= 8 || 'Password must be at least 8 characters',
      },
    ]);

    await walletManager.initialize(password);
    mainWallet = walletManager.generateMainWallet();
    await storage.setMainWallet(mainWallet);

    console.log(chalk.green(`\n✓ Main wallet created: ${mainWallet.address}`));
    console.log(chalk.yellow('⚠️  Save this address - you need to fund it with ETH'));
  } else {
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Enter master password:',
        mask: '*',
      },
    ]);
    await walletManager.initialize(password);
    const walletDictionary = await storage.getWalletDictionary();
    const primaryWalletId = await storage.getPrimaryWalletId();
    walletManager.importData({ walletDictionary, primaryWalletId });
  }

  // Bot type selection
  const { botType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botType',
      message: 'Select bot type:',
      choices: [
        { name: '📊 Grid Trading Bot (standard)', value: 'grid' },
        { name: '📈 Volume Bot (buy N times, then sell all)', value: 'volume' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botType === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const isVolumeBot = botType === 'volume';

  // Bot configuration
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Bot name:',
      default: isVolumeBot ? `VolumeBot-${Date.now()}` : `Bot-${Date.now()}`,
    },
    {
      type: 'input',
      name: 'tokenAddress',
      message: 'Token contract address:',
      validate: (input) => input.startsWith('0x') && input.length === 42 || 'Invalid address',
    },
    {
      type: 'input',
      name: 'tokenSymbol',
      message: 'Token symbol:',
      default: 'TOKEN',
    },
    {
      type: 'confirm',
      name: 'useMainWallet',
      message: 'Use main wallet for trading?',
      default: true,
    },
    {
      type: 'number',
      name: 'numPositions',
      message: 'Number of grid positions:',
      default: 24,
      when: () => !isVolumeBot,
    },
    {
      type: 'confirm',
      name: 'autoPriceRange',
      message: 'Auto-calculate price range (floor=1/10 current, ceiling=4x)?',
      default: true,
      when: () => !isVolumeBot,
    },
    {
      type: 'number',
      name: 'takeProfitPercent',
      message: 'Take profit % per position:',
      default: 8,
      when: () => !isVolumeBot,
    },
    {
      type: 'number',
      name: 'maxActivePositions',
      message: 'Max active positions:',
      default: 4,
      when: () => !isVolumeBot,
    },
    // Volume Bot specific settings
    {
      type: 'number',
      name: 'volumeBuysPerCycle',
      message: 'Number of buys per cycle:',
      default: 3,
      when: () => isVolumeBot,
      validate: (input) => input > 0 || 'Must be at least 1',
    },
    {
      type: 'input',
      name: 'volumeBuyAmount',
      message: 'ETH amount per buy:',
      default: '0.001',
      when: () => isVolumeBot,
      validate: (input) => !isNaN(parseFloat(input)) && parseFloat(input) > 0 || 'Invalid amount',
    },
    {
      type: 'confirm',
      name: 'useFixedBuyAmount',
      message: 'Use fixed ETH amount per buy?',
      default: false,
    },
    {
      type: 'input',
      name: 'buyAmount',
      message: 'ETH amount per buy (e.g., 0.001):',
      default: '0.001',
      when: (answers) => answers.useFixedBuyAmount,
      validate: (input) => !isNaN(parseFloat(input)) && parseFloat(input) > 0 || 'Invalid amount',
    },
    {
      type: 'confirm',
      name: 'moonBagEnabled',
      message: 'Enable moon bag (keep % of tokens on sell)?',
      default: true,
    },
    {
      type: 'number',
      name: 'moonBagPercent',
      message: 'Moon bag % to keep on each sell:',
      default: 1,
      when: (answers) => answers.moonBagEnabled,
      validate: (input) => input >= 0 && input <= 50 || 'Must be 0-50%',
    },
    {
      type: 'confirm',
      name: 'startImmediately',
      message: 'Start bot immediately?',
      default: false,
    },
  ]);

  // Create bot wallet if not using main
  let botWalletAddress = mainWallet!.address;
  if (!answers.useMainWallet) {
    const botId = randomUUID();
    const botWallet = walletManager.generateBotWallet(botId);
    await storage.addBotWallet(botId, botWallet);
    botWalletAddress = botWallet.address;
  }

  // Get default settings from storage
  const defaultGasReserve = await storage.getConfig('gasReserveEth', 0.0005);
  const defaultFallbackGas = await storage.getConfig('fallbackGasEstimate', 0.00001);
  const defaultStrictMode = await storage.getConfig('strictProfitMode', true);
  const defaultStrictPercent = await storage.getConfig('strictProfitPercent', 2);
  const defaultSlippage = await storage.getConfig('slippageBps', 100);
  const defaultRetryDelay = await storage.getConfig('retryDelaySeconds', 30);

  // Create config
  const config: GridConfig = isVolumeBot
    ? {
        // Volume Bot Config
        numPositions: 0, // Not used in volume mode
        floorPrice: 0,
        ceilingPrice: 0,
        useMarketCap: false,
        takeProfitPercent: 0, // Not used
        stopLossPercent: 0,
        stopLossEnabled: false,
        buysEnabled: true,
        sellsEnabled: true,
        moonBagEnabled: false, // Not used in volume mode (sells all)
        moonBagPercent: 0,
        minProfitPercent: 0, // Not used
        maxActivePositions: 1, // Single "position" for tracking
        useFixedBuyAmount: true,
        buyAmount: parseFloat(answers.volumeBuyAmount || '0.001'),
        gasReserveEth: defaultGasReserve,
        fallbackGasEstimate: defaultFallbackGas,
        strictProfitMode: defaultStrictMode,
        strictProfitPercent: defaultStrictPercent,
        slippageBps: defaultSlippage,
        retryDelaySeconds: defaultRetryDelay,
        volumeMode: true,
        volumeBuysPerCycle: answers.volumeBuysPerCycle || 3,
        volumeBuyAmount: parseFloat(answers.volumeBuyAmount || '0.001'),
        heartbeatMs: 1000,
        skipHeartbeats: 0,
      }
    : {
        // Grid Bot Config
        numPositions: answers.numPositions,
        floorPrice: 0, // Will be calculated from current price
        ceilingPrice: 0,
        useMarketCap: false,
        takeProfitPercent: answers.takeProfitPercent,
        stopLossPercent: 10,
        stopLossEnabled: false,
        buysEnabled: true,
        sellsEnabled: true,
        moonBagEnabled: answers.moonBagEnabled !== undefined ? answers.moonBagEnabled : true,
        moonBagPercent: answers.moonBagPercent || 1,
        minProfitPercent: 2,
        maxActivePositions: answers.maxActivePositions,
        useFixedBuyAmount: answers.useFixedBuyAmount || false,
        buyAmount: answers.useFixedBuyAmount ? parseFloat(answers.buyAmount || '0.001') : 0,
        gasReserveEth: defaultGasReserve,
        fallbackGasEstimate: defaultFallbackGas,
        strictProfitMode: defaultStrictMode,
        strictProfitPercent: defaultStrictPercent,
        slippageBps: defaultSlippage,
        retryDelaySeconds: defaultRetryDelay,
        heartbeatMs: 1000,
        skipHeartbeats: 0,
      };

  // Generate grid (empty for volume bots)
  const currentPrice = 0.000001; // Placeholder - would fetch real price
  const positions = isVolumeBot ? [] : GridCalculator.generateGrid(currentPrice, config);

  // Create instance
  const instance: BotInstance = {
    id: randomUUID(),
    name: answers.name,
    tokenAddress: answers.tokenAddress,
    tokenSymbol: answers.tokenSymbol,
    chain: 'base',
    walletAddress: botWalletAddress,
    useMainWallet: answers.useMainWallet,
    config,
    positions,
    totalBuys: 0,
    totalSells: 0,
    totalProfitEth: '0',
    totalProfitUsd: 0,
    isRunning: false,
    enabled: true,  // New bots are enabled by default
    lastHeartbeat: 0,
    currentPrice,
    // Initialize volume mode state
    volumeBuysInCycle: isVolumeBot ? 0 : undefined,
    volumeAccumulatedTokens: isVolumeBot ? '0' : undefined,
    volumeCycleCount: isVolumeBot ? 0 : undefined,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };

  await storage.saveBot(instance);
  
  if (isVolumeBot) {
    console.log(chalk.green(`\n✓ Volume Bot "${answers.name}" created`));
    console.log(chalk.cyan(`  Mode: Buy ${config.volumeBuysPerCycle} times, then sell all`));
    console.log(chalk.cyan(`  Buy Amount: ${config.volumeBuyAmount} ETH per buy`));
    console.log(chalk.cyan(`  Wallet: ${botWalletAddress}`));
  } else {
    console.log(chalk.green(`\n✓ Grid Bot "${answers.name}" created with ${positions.length} positions`));
    console.log(chalk.cyan(`  Wallet: ${botWalletAddress}`));
  }

  if (answers.startImmediately) {
    console.log(chalk.yellow('\n⚠️  Fund the wallet with ETH before starting'));
  }
}

async function startBot(heartbeatManager: HeartbeatManager, storage: JsonStorage, ensureWalletInitialized: () => Promise<boolean>) {
  console.log(chalk.dim('  Checking wallet...'));
  // Ensure wallet is initialized before starting bots
  if (!await ensureWalletInitialized()) {
    return;
  }

  console.log(chalk.dim('  Loading bot list...'));
  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('\nNo bots found. Create one first.\n'));
    return;
  }

  // Filter to only enabled bots
  const enabledBots = bots.filter(b => b.enabled);
  if (enabledBots.length === 0) {
    console.log(chalk.yellow('\nNo enabled bots found. Enable a bot first.\n'));
    return;
  }

  const choices = enabledBots.map(b => ({ name: `${b.name} (${b.tokenSymbol})`, value: b.id }));
  choices.unshift({ name: 'All enabled bots', value: 'all' });
  choices.push({ name: '⬅️  Back', value: 'back' });

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to start:',
      choices,
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  // Track which bots we're starting
  const botsToStart: typeof enabledBots = [];
  
  console.log(chalk.dim('  Initializing bot(s)...'));
  
  if (botId === 'all') {
    for (const bot of enabledBots) {
      if (!bot.isRunning) {
        botsToStart.push(bot);
        await heartbeatManager.addBot(bot);
      }
    }
  } else {
    const bot = enabledBots.find(b => b.id === botId);
    if (bot && !bot.isRunning) {
      botsToStart.push(bot);
      await heartbeatManager.addBot(bot);
    }
  }

  heartbeatManager.start();
  
  // Show clean success message
  console.log(chalk.green('\n✅ Bot(s) started successfully!\n'));
  
  if (botsToStart.length > 0) {
    console.log(chalk.cyan('📊 Started:'));
    for (const bot of botsToStart) {
      const botType = bot.config.volumeMode ? chalk.magenta('[VOLUME]') : chalk.blue('[GRID]');
      const buyInfo = bot.config.volumeMode 
        ? `${bot.config.volumeBuysPerCycle || 3} buys/cycle`
        : bot.config.useFixedBuyAmount 
          ? `${bot.config.buyAmount} ETH/buy`
          : 'auto-buy';
      console.log(`   ${botType} ${chalk.bold(bot.name)} (${bot.tokenSymbol}) - ${buyInfo}`);
    }
    console.log();
  }
  
  // Automatically go to monitoring view
  console.log(chalk.dim('Opening monitoring dashboard...\n'));
  await monitorBots(storage, heartbeatManager);
}

async function stopBot(heartbeatManager: HeartbeatManager, _storage: JsonStorage) {
  const status = heartbeatManager.getStatus();
  if (status.totalBots === 0) {
    console.log(chalk.yellow('\nNo running bots\n'));
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Stop all bots?',
      default: true,
    },
  ]);

  if (confirm) {
    heartbeatManager.stop();
    console.log(chalk.green('\n✓ All bots stopped\n'));
  }
}

async function toggleBotStatus(storage: JsonStorage, heartbeatManager: HeartbeatManager) {
  console.log(chalk.cyan('\n⏸️  Enable/Disable Bot\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found.\n'));
    return;
  }

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to enable/disable:',
      choices: [
        ...bots.map(b => ({
          name: `${b.enabled ? chalk.green('✓') : chalk.red('✗')} ${b.name} (${b.tokenSymbol}) - ${b.enabled ? 'Enabled' : 'Disabled'}`,
          value: b.id,
        })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  const newStatus = !bot.enabled;
  const action = newStatus ? 'enable' : 'disable';

  console.log(chalk.yellow(`\n⚠️  About to ${action} bot: ${bot.name}`));
  if (!newStatus && bot.isRunning) {
    console.log(chalk.red('  This bot is currently running. It will be stopped.'));
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Confirm ${action}?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Cancelled.\n'));
    return;
  }

  // Update bot status
  bot.enabled = newStatus;
  bot.lastUpdated = Date.now();
  await storage.saveBot(bot);

  // If disabling and bot is running, stop it
  if (!newStatus && bot.isRunning) {
    heartbeatManager.removeBot(bot.id);
    console.log(chalk.yellow(`  Stopped running bot: ${bot.name}`));
  }

  console.log(chalk.green(`\n✓ Bot ${bot.name} is now ${newStatus ? chalk.green('ENABLED') : chalk.red('DISABLED')}\n`));
}

async function showStatus(heartbeatManager: HeartbeatManager, storage: JsonStorage) {
  console.log(chalk.dim('  Loading status...'));
  const stats = await storage.getGlobalStats();
  const status = heartbeatManager.getStatus();
  const bots = await storage.getAllBots();

  console.log(chalk.cyan('\n📊 System Status\n'));
  console.log(`CLI Heartbeat: ${status.isRunning ? chalk.green('CONNECTED') : chalk.yellow('STANDBY')}`);
  console.log(chalk.dim(`  (Controls bot monitoring, bots run independently in daemon mode)`));
  console.log(`Total bots: ${stats.totalBots}`);
  console.log(`Running: ${stats.runningBots}`);
  console.log(`Total profit: ${formatEther(BigInt(stats.totalProfitEth))} ETH`);
  console.log(`Total trades: ${stats.totalTrades}\n`);

  if (bots.length > 0) {
    console.log(chalk.cyan('All Bots:\n'));
    
    // Get working RPC for balance checks
    const workingRpc = await getWorkingRpc();
    const { createPublicClient, http, formatEther, formatUnits } = await import('viem');
    const { base } = await import('viem/chains');
    const { erc20Abi } = await import('viem');
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(workingRpc),
    });
    
    for (const bot of bots) {
      const enabledStatus = bot.enabled ? chalk.green('✓') : chalk.red('✗');
      const runningStatus = bot.isRunning ? chalk.green('● RUNNING') : chalk.gray('○ Stopped');
      const isVolumeBot = bot.config.volumeMode;
      const botTypeLabel = isVolumeBot ? chalk.magenta('[VOLUME]') : chalk.blue('[GRID]');
      const buyAmountInfo = isVolumeBot
        ? chalk.dim(`[${bot.config.volumeBuyAmount} ETH/buy, ${bot.volumeBuysInCycle || 0}/${bot.config.volumeBuysPerCycle || 3} buys]`)
        : bot.config.useFixedBuyAmount 
          ? chalk.dim(`[${bot.config.buyAmount} ETH/buy]`)
          : chalk.dim('[auto-buy]');
      
      console.log(`  ${enabledStatus} ${bot.name}: ${botTypeLabel} ${runningStatus} ${buyAmountInfo} ${!bot.enabled ? chalk.red('[DISABLED]') : ''}`);
      console.log(`     Token: ${bot.tokenSymbol} (${bot.tokenAddress.slice(0, 10)}...)`);
      console.log(`     Wallet: ${bot.walletAddress}`);
      
      // Fetch balances
      try {
        const ethBalance = await publicClient.getBalance({
          address: bot.walletAddress as `0x${string}`,
        });
        console.log(`     ETH Balance: ${formatEther(ethBalance)} ETH`);
        
        // Get token decimals
        let decimals = 18;
        try {
          decimals = await publicClient.readContract({
            address: bot.tokenAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: 'decimals',
          });
        } catch {
          // Use default 18
        }
        
        // Get token balance
        const tokenBalance = await publicClient.readContract({
          address: bot.tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [bot.walletAddress as `0x${string}`],
        });
        console.log(`     ${bot.tokenSymbol} Balance: ${formatUnits(tokenBalance, decimals)}`);
        
        // Show active positions or volume status
        if (isVolumeBot) {
          const accumulated = formatEther(BigInt(bot.volumeAccumulatedTokens || '0'));
          const cycles = bot.volumeCycleCount || 0;
          console.log(`     Volume Status: ${bot.volumeBuysInCycle || 0}/${bot.config.volumeBuysPerCycle || 3} buys, ${accumulated} tokens accumulated`);
          console.log(`     Cycles Completed: ${cycles}`);
        } else {
          const holdingPositions = bot.positions.filter(p => p.status === 'HOLDING').length;
          if (holdingPositions > 0) {
            console.log(`     Active Positions: ${holdingPositions}/${bot.config.maxActivePositions}`);
          }
        }
      } catch (error: any) {
        console.log(chalk.dim(`     ⚠ Could not fetch balances: ${error.message.slice(0, 30)}...`));
      }
      console.log();
    }
  }
}

async function monitorBots(storage: JsonStorage, heartbeatManager: HeartbeatManager) {
  console.log(chalk.cyan.bold('\n📺 Bot Monitor - Live Dashboard\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found. Create one first.\n'));
    return;
  }

  const enabledBots = bots.filter(b => b.enabled);
  if (enabledBots.length === 0) {
    console.log(chalk.yellow('No enabled bots to monitor.\n'));
    return;
  }

  // Choose monitoring mode
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Select monitoring mode:',
      choices: [
        { name: `📊 All Bots Overview (${enabledBots.length} bots)`, value: 'all' },
        { name: '🔍 Individual Bot Detail (deep dive)', value: 'single' },
        { name: '📋 Static View (no auto-refresh)', value: 'static' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (mode === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  if (mode === 'all') {
    await monitorAllBots(enabledBots, heartbeatManager, storage);
  } else if (mode === 'single') {
    await monitorSingleBot(enabledBots, heartbeatManager, storage);
  } else if (mode === 'static') {
    await monitorStaticView(enabledBots, heartbeatManager);
  }
}

async function monitorAllBots(enabledBots: BotInstance[], heartbeatManager: HeartbeatManager, storage: JsonStorage) {
  // Load refresh rate from storage (default 3000ms)
  const refreshRate = await storage.getConfig('monitorRefreshRate', 3000);
  
  let autoRefresh = false;
  let refreshCount = 0;
  let shouldExit = false;
  let refreshInterval: NodeJS.Timeout | null = null;

  // Setup keypress listener
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  const displayFleet = async () => {
    const timestamp = new Date().toLocaleTimeString();
    const dateStr = new Date().toLocaleDateString();
    refreshCount++;

    // Clear screen
    console.log('\x1Bc');

    // Header
    console.log(chalk.bgCyan.black('╔══════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bgCyan.black(`║  🤖 BASE GRID BOT FLEET OVERVIEW          ${dateStr} ${timestamp}  ║`));
    console.log(chalk.bgCyan.black('╚══════════════════════════════════════════════════════════════════╝'));
    console.log();

    // Controls hint
    console.log(chalk.dim('  Controls: [R] Refresh  [A] Toggle Auto-refresh  [X] Exit'));
    console.log(chalk.yellow(`  Auto-refresh: ${autoRefresh ? 'ON' : 'OFF'}`));
    console.log();

    // System Stats
    const status = heartbeatManager.getStatus();
    const runningBots = enabledBots.filter(b => b.isRunning).length;
    const holdingTotal = enabledBots.reduce((acc, b) => acc + b.positions.filter(p => p.status === 'HOLDING').length, 0);
    const totalBuys = enabledBots.reduce((acc, b) => acc + (b.totalBuys || 0), 0);
    const totalSells = enabledBots.reduce((acc, b) => acc + (b.totalSells || 0), 0);
    const totalProfit = enabledBots.reduce((acc, b) => acc + BigInt(b.totalProfitEth || '0'), BigInt(0));

    console.log(chalk.yellow('📊 FLEET SUMMARY'));
    console.log(chalk.yellow('═'.repeat(66)));
    console.log(`  Fleet Status:     ${chalk.green(runningBots + ' RUNNING')} / ${enabledBots.length} bots`);
    console.log(`  Heartbeat:        ${status.isRunning ? chalk.green('● ACTIVE') : chalk.red('○ STOPPED')}`);
    console.log(`  Total Positions:  ${chalk.cyan(holdingTotal + ' holding')} across all bots`);
    console.log(`  Total Trades:     ${chalk.magenta(totalBuys + ' buys')} | ${chalk.magenta(totalSells + ' sells')}`);
    console.log(`  Total Profit:     ${chalk.green(formatEther(totalProfit) + ' ETH')}`);
    console.log();

    // Bot Summary Table
    console.log(chalk.yellow('📈 BOT STATUS BOARD'));
    console.log(chalk.yellow('═'.repeat(80)));
    
    for (const bot of enabledBots) {
      const statusStr = bot.isRunning ? chalk.green('● LIVE') : chalk.gray('○ IDLE');
      const holding = bot.positions.filter(p => p.status === 'HOLDING').length;
      const emptyPositions = bot.positions.filter(p => p.status === 'EMPTY');
      const holdingPositions = bot.positions.filter(p => p.status === 'HOLDING');

      // Find nearest empty position (next potential buy)
      const nextBuy = emptyPositions
        .map(p => {
          const buyMin = p.buyMin || p.buyPrice;
          const buyMax = p.buyMax || p.buyPrice;
          const midPrice = (buyMin + buyMax) / 2;
          const distance = Math.abs(midPrice - bot.currentPrice);
          return { ...p, distance };
        })
        .sort((a, b) => a.distance - b.distance)[0];

      // Find next sell: holding position with lowest sellPrice
      const nextSell = holdingPositions
        .sort((a, b) => a.sellPrice - b.sellPrice)[0];

      // Bot header line
      console.log(`\n  ${chalk.bold(bot.name.slice(0, 15).padEnd(15))} ${statusStr} ${chalk.cyan(bot.tokenSymbol)}`);
      console.log(`  ${chalk.dim('─'.repeat(76))}`);
      
      // Current price
      console.log(`  Price: ${chalk.magenta(bot.currentPrice.toExponential(6))} ETH ${chalk.dim(`(${(bot.currentPrice * 1000000).toFixed(2)} µETH)`)}`);
      
      // Positions summary
      console.log(`  Positions: ${chalk.green(holding + ' holding')} | ${chalk.yellow(emptyPositions.length + ' empty')}`);
      
      // Next buy info
      if (nextBuy) {
        const buyMin = nextBuy.buyMin || nextBuy.buyPrice;
        const buyMax = nextBuy.buyMax || nextBuy.buyPrice;
        const distPercent = ((buyMin - bot.currentPrice) / bot.currentPrice * 100);
        const inRange = bot.currentPrice >= buyMin && bot.currentPrice <= buyMax;
        const distStr = inRange 
          ? chalk.green('IN RANGE NOW!')
          : distPercent > 0 
            ? chalk.yellow(`+${distPercent.toFixed(1)}%`)
            : chalk.green(`${Math.abs(distPercent).toFixed(1)}%`);
        console.log(`  Next Buy:  Position ${nextBuy.id} @ ${buyMin.toExponential(4)}-${buyMax.toExponential(4)} (${distStr})`);
      } else {
        console.log(`  Next Buy:  ${chalk.dim('None - all positions filled')}`);
      }
      
      // Next sell info
      if (nextSell) {
        const profit = ((nextSell.sellPrice - nextSell.buyPrice) / nextSell.buyPrice * 100);
        console.log(`  Next Sell: Position ${nextSell.id} @ ${nextSell.sellPrice.toExponential(4)} (${chalk.green('+' + profit.toFixed(1) + '%')})`);
      } else {
        console.log(`  Next Sell: ${chalk.dim('None - no holding positions')}`);
      }
      
      // Profit
      if (bot.totalProfitEth && BigInt(bot.totalProfitEth) > 0) {
        console.log(`  Profit:    ${chalk.green('+' + formatEther(BigInt(bot.totalProfitEth)).slice(0, 8) + ' ETH')}`);
      }
    }

    console.log(`\n  ${chalk.dim('═'.repeat(80))}`);
    console.log();

    // Active Alerts
    const botsWithErrors = enabledBots.filter(b => b.consecutiveErrors && b.consecutiveErrors > 0);
    if (botsWithErrors.length > 0) {
      console.log(chalk.red('⚠️  ACTIVE ALERTS'));
      console.log(chalk.red('─'.repeat(66)));
      for (const bot of botsWithErrors) {
        console.log(chalk.red(`  • ${bot.name}: ${bot.consecutiveErrors} consecutive errors`));
      }
      console.log();
    }

    // Footer
    console.log(chalk.dim('─'.repeat(66)));
    console.log(chalk.dim(`  Refresh #${refreshCount} | Press R to refresh | A to toggle auto | X to exit`));
    console.log();
  };

  // Initial display
  await displayFleet();

  const keyListener = (key: string) => {
    const lowerKey = key.toLowerCase();

    if (lowerKey === 'x') {
      shouldExit = true;
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', keyListener);
      console.log(chalk.dim('\nExiting monitor...\n'));
    } else if (lowerKey === 'r') {
      // Manual refresh
      displayFleet();
    } else if (lowerKey === 'a') {
      // Toggle auto-refresh
      autoRefresh = !autoRefresh;
      if (autoRefresh) {
        refreshInterval = setInterval(displayFleet, refreshRate);
      } else if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
      displayFleet(); // Show updated status
    }
  };

  stdin.on('data', keyListener);

  // Wait for exit
  while (!shouldExit) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Cleanup
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  try {
    stdin.setRawMode(false);
    stdin.pause();
    stdin.removeListener('data', keyListener);
  } catch {
    // Ignore cleanup errors
  }
}

async function monitorSingleBot(enabledBots: BotInstance[], _heartbeatManager: HeartbeatManager, storage: JsonStorage) {
  // Load refresh rate from storage (default 3000ms)
  const refreshRate = await storage.getConfig('monitorRefreshRate', 3000);
  
  // Select bot to monitor
  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to monitor in detail:',
      choices: [
        ...enabledBots.map(b => ({ name: `${b.name} (${b.tokenSymbol})`, value: b.id })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const bot = enabledBots.find(b => b.id === botId);
  if (!bot) return;

  // Get working RPC
  const workingRpc = await getWorkingRpc();
  const { createPublicClient, http, formatEther, formatUnits } = await import('viem');
  const { base } = await import('viem/chains');
  const { erc20Abi } = await import('viem');

  const publicClient = createPublicClient({
    chain: base,
    transport: http(workingRpc),
  });

  let autoRefresh = false;
  let refreshCount = 0;
  let shouldExit = false;
  let refreshInterval: NodeJS.Timeout | null = null;

  // Setup keypress listener
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  const displayBot = async () => {
    const timestamp = new Date().toLocaleTimeString();
    refreshCount++;

    // Clear screen
    console.log('\x1Bc');

    // Header with bot name
    const headerLine = `🔍 ${bot.name.toUpperCase()} - ${bot.tokenSymbol}`;
    console.log(chalk.bgMagenta.black('╔══════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bgMagenta.black(`║  ${headerLine.padEnd(62)} ${timestamp} ║`));
    console.log(chalk.bgMagenta.black('╚══════════════════════════════════════════════════════════════════╝'));
    console.log();

    // Controls hint
    console.log(chalk.dim('  Controls: [R] Refresh  [A] Toggle Auto-refresh  [X] Exit'));
    console.log(chalk.yellow(`  Auto-refresh: ${autoRefresh ? 'ON' : 'OFF'}`));
    console.log();

    // Status Banner
    const isRunning = bot.isRunning;
    const statusBanner = isRunning
      ? chalk.bgGreen.black('  ● BOT IS RUNNING - ACTIVE TRADING  ')
      : chalk.bgGray.black('  ○ BOT IS STOPPED - IDLE MODE  ');
    console.log(`                    ${statusBanner}`);
    console.log();

    // Fetch all data
    let ethBalance = BigInt(0);
    let tokenBalance = BigInt(0);
    let decimals = 18;

    try {
      ethBalance = await publicClient.getBalance({
        address: bot.walletAddress as `0x${string}`,
      });

      try {
        decimals = await publicClient.readContract({
          address: bot.tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'decimals',
        });
      } catch {}

      tokenBalance = await publicClient.readContract({
        address: bot.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [bot.walletAddress as `0x${string}`],
      });
    } catch {}

    // WALLET SECTION
    console.log(chalk.cyan('💼 WALLET'));
    console.log(chalk.cyan('─'.repeat(66)));
    console.log(`  Address: ${chalk.yellow(bot.walletAddress)}`);
    console.log(`  ETH:     ${chalk.green(formatEther(ethBalance).padEnd(12))} Ξ`);
    console.log(`  ${bot.tokenSymbol.padEnd(7)}  ${chalk.green(formatUnits(tokenBalance, decimals).padEnd(12))} tokens`);
    console.log();

    // CONFIGURATION SECTION
    console.log(chalk.cyan('⚙️  CONFIGURATION'));
    console.log(chalk.cyan('─'.repeat(66)));
    console.log(`  Token:        ${chalk.yellow(bot.tokenSymbol)} ${chalk.dim(`(${bot.tokenAddress})`)}`);
    console.log(`  Grid:         ${bot.config.numPositions} positions`);
    console.log(`  Take Profit:  ${bot.config.takeProfitPercent}% per position`);
    console.log(`  Max Active:   ${bot.config.maxActivePositions} concurrent buys`);
    console.log(`  Moon Bag:     ${bot.config.moonBagEnabled ? bot.config.moonBagPercent + '% kept on sell' : 'Disabled'}`);
    console.log(`  Buy Amount:   ${bot.config.useFixedBuyAmount ? bot.config.buyAmount + ' ETH fixed' : 'Auto-calculated'}`);
    console.log(`  Min Profit:   ${bot.config.minProfitPercent}% after gas`);
    console.log();

    // PRICE & MARKET SECTION
    const gridRange = bot.positions.length > 0 ? {
      floor: Math.min(...bot.positions.map(p => p.buyMin || p.buyPrice)),
      ceiling: Math.max(...bot.positions.map(p => p.buyMax || p.buyPrice))
    } : { floor: bot.currentPrice * 0.1, ceiling: bot.currentPrice * 4 };

    console.log(chalk.cyan('📊 PRICE & MARKET'));
    console.log(chalk.cyan('─'.repeat(66)));
    console.log(`  Current Price: ${chalk.magenta(bot.currentPrice.toExponential(4))} ETH`);
    console.log(`                 ${chalk.dim(`(${(bot.currentPrice * 1000000).toFixed(2)} µETH)`)}`);
    console.log(`  Grid Range:    ${chalk.dim('Floor:')} ${gridRange.floor.toExponential(4)}  ${chalk.dim('Ceiling:')} ${gridRange.ceiling.toExponential(4)}`);
    console.log(`  Coverage:      ${chalk.green('Continuous')} (no gaps between positions)`);
    console.log();

    // GRID POSITIONS SECTION
    const holdingPositions = bot.positions.filter(p => p.status === 'HOLDING').sort((a, b) => (b.buyMax || b.buyPrice) - (a.buyMax || a.buyPrice));
    const emptyPositions = bot.positions.filter(p => p.status === 'EMPTY').sort((a, b) => (b.buyMax || b.buyPrice) - (a.buyMax || a.buyPrice));
    const soldPositions = bot.positions.filter(p => p.status === 'SOLD').slice(-5);

    console.log(chalk.cyan('🎯 GRID POSITIONS'));
    console.log(chalk.cyan('─'.repeat(66)));
    console.log(`  Total: ${bot.positions.length} | ${chalk.green(holdingPositions.length + ' HOLDING')} | ${chalk.yellow(emptyPositions.length + ' EMPTY')} | ${chalk.blue(bot.positions.filter(p => p.status === 'SOLD').length + ' SOLD')}`);
    console.log();

    // HOLDING POSITIONS
    if (holdingPositions.length > 0) {
      console.log(chalk.green('  📗 HOLDING (Ready to Sell):'));
      console.log(chalk.dim('     ID  Buy Range              Buy@        Sell@        Tokens       Profit %'));
      console.log(chalk.dim('     ──────────────────────────────────────────────────────────────────────────'));

      for (const pos of holdingPositions.slice(0, 5)) {
        const buyMax = pos.buyMax || pos.buyPrice;
        const buyMin = pos.buyMin || buyMax;
        const profit = ((pos.sellPrice - buyMax) / buyMax * 100);
        const tokens = pos.tokensReceived ? formatUnits(BigInt(pos.tokensReceived), decimals).slice(0, 10) : '---';
        const rangeStr = `${buyMin.toExponential(2)}-${buyMax.toExponential(2)}`;
        console.log(`     ${String(pos.id).padStart(2)}  ${rangeStr.padEnd(20)}  ${buyMax.toExponential(4)}  ${pos.sellPrice.toExponential(4)}  ${tokens.padStart(10)}  ${chalk.green('+' + profit.toFixed(1) + '%')}`);
      }

      if (holdingPositions.length > 5) {
        console.log(chalk.dim(`     ... and ${holdingPositions.length - 5} more holding positions`));
      }
      console.log();
    }

    // NEXT BUY OPPORTUNITIES - find closest empty positions to current price
    const nextBuys = emptyPositions
      .map(p => {
        const buyMin = p.buyMin || p.buyPrice;
        const buyMax = p.buyMax || p.buyPrice;
        const midPrice = (buyMin + buyMax) / 2;
        const distance = Math.abs(midPrice - bot.currentPrice);
        return { ...p, distance, midPrice };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    if (nextBuys.length > 0) {
      console.log(chalk.yellow('  📙 NEAREST EMPTY POSITIONS (Next Potential Buys):'));
      for (const pos of nextBuys) {
        const buyMin = pos.buyMin || pos.buyPrice;
        const buyMax = pos.buyMax || pos.buyPrice;
        const distPercent = ((pos.midPrice - bot.currentPrice) / bot.currentPrice * 100);
        const distStr = distPercent > 0
          ? chalk.yellow(`${distPercent.toFixed(1)}% above current`)
          : chalk.green(`${Math.abs(distPercent).toFixed(1)}% below current`);
        const inRange = bot.currentPrice >= buyMin && bot.currentPrice <= buyMax
          ? chalk.green(' ← CURRENTLY IN RANGE!')
          : '';
        console.log(`     Position ${pos.id}: ${buyMin.toExponential(4)}-${buyMax.toExponential(4)} ETH (${distStr})${inRange}`);
      }
      console.log();
    }

    // RECENT SELL HISTORY
    if (soldPositions.length > 0) {
      console.log(chalk.blue('  📘 RECENT SELLS:'));
      for (const pos of soldPositions.reverse()) {
        const profit = ((pos.sellPrice - pos.buyPrice) / pos.buyPrice * 100);
        const time = pos.sellTimestamp ? new Date(pos.sellTimestamp).toLocaleTimeString() : 'unknown';
        console.log(`     ${time}: Position ${pos.id} sold for ${chalk.green('+' + profit.toFixed(1) + '%')}`);
      }
      console.log();
    }

    // PERFORMANCE SECTION
    console.log(chalk.cyan('💰 PERFORMANCE STATS'));
    console.log(chalk.cyan('─'.repeat(66)));
    console.log(`  Total Buys:     ${bot.totalBuys || 0}`);
    console.log(`  Total Sells:    ${bot.totalSells || 0}`);
    console.log(`  Realized P&L:   ${chalk.green(formatEther(BigInt(bot.totalProfitEth || '0')) + ' ETH')}`);

    // Calculate unrealized P&L
    let unrealizedPnl = BigInt(0);
    for (const pos of holdingPositions) {
      if (pos.tokensReceived) {
        const currentValue = BigInt(pos.tokensReceived) * BigInt(Math.floor(bot.currentPrice * 1e18)) / BigInt(1e18);
        const cost = BigInt(pos.ethCost || '0');
        unrealizedPnl += currentValue - cost;
      }
    }

    if (unrealizedPnl > 0) {
      console.log(`  Unrealized P&L: ${chalk.yellow(formatEther(unrealizedPnl) + ' ETH')} (if sold now)`);
    }

    const totalPnl = BigInt(bot.totalProfitEth || '0') + unrealizedPnl;
    console.log(`  Combined P&L:   ${totalPnl >= 0 ? chalk.green('+' + formatEther(totalPnl)) : chalk.red(formatEther(totalPnl))} ETH`);
    console.log();

    // ACTIVITY LOG
    console.log(chalk.cyan('📝 RECENT ACTIVITY'));
    console.log(chalk.cyan('─'.repeat(66)));
    console.log(`  Created:     ${new Date(bot.createdAt).toLocaleString()}`);
    console.log(`  Last Update: ${bot.lastUpdated ? new Date(bot.lastUpdated).toLocaleString() : 'Never'}`);

    if (bot.lastTradeAt) {
      const lastTrade = new Date(bot.lastTradeAt);
      const minsAgo = Math.floor((Date.now() - lastTrade.getTime()) / 60000);
      console.log(`  Last Trade:  ${lastTrade.toLocaleString()} (${minsAgo} mins ago)`);
    } else {
      console.log(`  Last Trade:  ${chalk.dim('No trades yet')}`);
    }

    if (bot.consecutiveErrors && bot.consecutiveErrors > 0) {
      console.log(chalk.red(`  ⚠️  Errors:    ${bot.consecutiveErrors} consecutive errors`));
    }

    console.log();

    // FOOTER
    console.log(chalk.dim('═'.repeat(66)));
    console.log(chalk.dim(`  Refresh #${refreshCount} | Press R to refresh | A to toggle auto | X to exit`));
    console.log();
  };

  // Initial display
  await displayBot();

  const keyListener = (key: string) => {
    const lowerKey = key.toLowerCase();
    
    if (lowerKey === 'x') {
      shouldExit = true;
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', keyListener);
      console.log(chalk.dim('\nExiting monitor...\n'));
    } else if (lowerKey === 'r') {
      // Manual refresh
      displayBot();
    } else if (lowerKey === 'a') {
      // Toggle auto-refresh
      autoRefresh = !autoRefresh;
      if (autoRefresh) {
        refreshInterval = setInterval(displayBot, refreshRate);
      } else if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
      displayBot(); // Show updated status
    }
  };

  stdin.on('data', keyListener);

  // Wait for exit
  while (!shouldExit) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Final cleanup (in case keyListener didn't fully clean up)
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  try {
    stdin.setRawMode(false);
    stdin.pause();
    stdin.removeListener('data', keyListener);
  } catch {
    // Ignore cleanup errors
  }
}

async function monitorStaticView(enabledBots: BotInstance[], heartbeatManager: HeartbeatManager) {
  // Static view - no auto-refresh, just show once and wait for keypress
  console.log(chalk.cyan.bold('\n📋 Static Bot Status View\n'));
  console.log(chalk.dim('Press Enter to return to menu...\n'));

  const status = heartbeatManager.getStatus();
  const runningBots = enabledBots.filter(b => b.isRunning).length;
  const holdingTotal = enabledBots.reduce((acc, b) => acc + b.positions.filter(p => p.status === 'HOLDING').length, 0);
  const totalBuys = enabledBots.reduce((acc, b) => acc + (b.totalBuys || 0), 0);
  const totalSells = enabledBots.reduce((acc, b) => acc + (b.totalSells || 0), 0);
  const totalProfit = enabledBots.reduce((acc, b) => acc + BigInt(b.totalProfitEth || '0'), BigInt(0));

  const timestamp = new Date().toLocaleTimeString();
  const dateStr = new Date().toLocaleDateString();

  // Header
  console.log(chalk.bgCyan.black('╔══════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bgCyan.black(`║  🤖 BASE GRID BOT FLEET OVERVIEW          ${dateStr} ${timestamp}  ║`));
  console.log(chalk.bgCyan.black('╚══════════════════════════════════════════════════════════════════╝'));
  console.log();

  // System Stats
  console.log(chalk.yellow('📊 FLEET SUMMARY'));
  console.log(chalk.yellow('═'.repeat(66)));
  console.log(`  Fleet Status:     ${chalk.green(runningBots + ' RUNNING')} / ${enabledBots.length} bots`);
  console.log(`  Heartbeat:        ${status.isRunning ? chalk.green('● ACTIVE') : chalk.red('○ STOPPED')}`);
  console.log(`  Total Positions:  ${chalk.cyan(holdingTotal + ' holding')} across all bots`);
  console.log(`  Total Trades:     ${chalk.magenta(totalBuys + ' buys')} | ${chalk.magenta(totalSells + ' sells')}`);
  console.log(`  Total Profit:     ${chalk.green(formatEther(totalProfit) + ' ETH')}`);
  console.log();

  // Bot Summary Table
  console.log(chalk.yellow('📈 BOT STATUS BOARD'));
  console.log(chalk.yellow('═'.repeat(66)));
  console.log(chalk.dim('  Name          Status   Pos    Type       Buy Config'));
  console.log(chalk.dim('  ──────────────────────────────────────────────────────'));

  for (const bot of enabledBots) {
    const statusStr = bot.isRunning ? chalk.green('RUNNING') : chalk.gray('STOPPED');
    const holding = bot.positions.filter(p => p.status === 'HOLDING').length;
    const posStr = String(holding).padStart(2, ' ');
    const typeStr = bot.config.volumeMode ? 'VOLUME' : 'GRID  ';
    const buyConfig = bot.config.useFixedBuyAmount 
      ? `${bot.config.buyAmount} ETH/buy`
      : 'auto-buy';
    const nameStr = bot.name.slice(0, 13).padEnd(13, ' ');

    console.log(`  ${nameStr} ${statusStr} ${posStr}    ${typeStr} ${buyConfig}`);
  }

  console.log();
  console.log(chalk.dim('─'.repeat(66)));
  console.log(chalk.dim('  Static view - no auto-refresh | Press Enter to exit'));
  console.log();

  // Wait for user input
  await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
}

async function viewWalletBalances(storage: JsonStorage, walletManager: WalletManager) {
  console.log(chalk.cyan('\n👛 Wallet Balances\n'));
  
  // Get working RPC
  const workingRpc = await getWorkingRpc();
  console.log(chalk.dim(`Using RPC: ${workingRpc}\n`));

  let mainWallet = await storage.getMainWallet();
  
  // If no main wallet exists, offer to create one
  if (!mainWallet) {
    console.log(chalk.yellow('No main wallet found.\n'));
    const { createWallet } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createWallet',
        message: 'Create a main wallet?',
        default: true,
      },
    ]);
    
    if (!createWallet) {
      console.log(chalk.dim('Cancelled.\n'));
      return;
    }
    
    // Create main wallet
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Create master password (min 8 chars):',
        mask: '*',
        validate: (input) => input.length >= 8 || 'Password must be at least 8 characters',
      },
    ]);
    
    await walletManager.initialize(password);
    mainWallet = walletManager.generateMainWallet();
    await storage.setMainWallet(mainWallet);
    
    console.log(chalk.green(`\n✓ Main wallet created: ${mainWallet.address}`));
    console.log(chalk.yellow('⚠️  Save this address - you need to fund it with ETH\n'));
  }

  const walletDictionary = await storage.getWalletDictionary();

  try {
    const { createPublicClient, http, formatEther } = await import('viem');
    const { base } = await import('viem/chains');

    const publicClient = createPublicClient({
      chain: base,
      transport: http(workingRpc),
    });

    // Verify chain connection
    try {
      const blockNumber = await publicClient.getBlockNumber();
      console.log(chalk.dim(`Connected to Base. Block: ${blockNumber}\n`));
    } catch (e: any) {
      console.log(chalk.red(`⚠ RPC Connection failed: ${e.message}`));
      console.log(chalk.yellow(`Trying fallback RPCs...\n`));
      
      // Try to get another working RPC
      const fallbackRpc = await getWorkingRpc();
      if (fallbackRpc !== workingRpc) {
        console.log(chalk.green(`✓ Using fallback RPC: ${fallbackRpc}\n`));
        return viewWalletBalances(storage, walletManager); // Retry with new RPC
      }
      return;
    }

    // Check main wallet balance
    const mainBalance = await publicClient.getBalance({
      address: mainWallet.address as `0x${string}`,
    });

    console.log(chalk.green('Main Wallet:'));
    console.log(`  Address: ${mainWallet.address}`);
    console.log(`  Balance: ${formatEther(mainBalance)} ETH`);
    console.log(chalk.dim(`  Raw: ${mainBalance.toString()} wei\n`));

    // Check bot wallets
    if (Object.keys(walletDictionary).length > 0) {
      console.log(chalk.cyan('Bot Wallets:'));
      for (const [id, wallet] of Object.entries(walletDictionary)) {
        const balance = await publicClient.getBalance({
          address: wallet.address as `0x${string}`,
        });
        console.log(`\n  ${id.slice(0, 16)}...:`);
        console.log(`    Address: ${wallet.address}`);
        console.log(`    Balance: ${formatEther(balance)} ETH`);
      }
    } else {
      console.log(chalk.dim('No bot wallets.\n'));
    }

    console.log();

  } catch (error: any) {
    console.log(chalk.red(`\n✗ Failed to fetch balances: ${error.message}\n`));
  }
}

async function fundWallet(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n💰 Fund Bot Wallet\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found. Create one first.\n'));
    return;
  }

  // Initialize wallet manager with password
  const mainWallet = await storage.getMainWallet();
  if (!mainWallet) {
    console.log(chalk.red('No main wallet found.\n'));
    return;
  }

  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Enter master password:',
      mask: '*',
    },
  ]);

  try {
    await walletManager.initialize(password);
    const walletDictionary = await storage.getWalletDictionary();
    const primaryWalletId = await storage.getPrimaryWalletId();
    walletManager.importData({ walletDictionary, primaryWalletId });
  } catch (error: any) {
    console.log(chalk.red(`\n✗ Invalid password: ${error.message}\n`));
    return;
  }

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to fund:',
      choices: [
        ...bots.map(b => ({ name: `${b.name} (${b.walletAddress.slice(0, 10)}...)`, value: b.id })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  console.log(chalk.cyan(`\nSelected: ${bot.name}`));
  console.log(chalk.dim(`Wallet: ${bot.walletAddress}`));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '💰 Enter amount to fund', value: 'fund' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const { amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'amount',
      message: 'Amount of ETH to send:',
      default: '0.01',
      validate: (input) => !isNaN(parseFloat(input)) && parseFloat(input) > 0 || 'Invalid amount',
    },
  ]);

  console.log(chalk.yellow(`\n⚠️  About to send ${amount} ETH to ${bot.walletAddress}`));
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Confirm?',
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Cancelled.\n'));
    return;
  }

  try {
    const workingRpc = await getWorkingRpc();
    const { createWalletClient, http, parseEther } = await import('viem');
    const { base } = await import('viem/chains');

    const mainAccount = walletManager.getMainAccount();
    const walletClient = createWalletClient({
      account: mainAccount,
      chain: base,
      transport: http(workingRpc),
    });

    console.log(chalk.dim('Sending transaction...'));

    const txHash = await walletClient.sendTransaction({
      to: bot.walletAddress as `0x${string}`,
      value: parseEther(amount),
    });

    console.log(chalk.green(`\n✓ Transaction sent: ${txHash}`));
    console.log(chalk.dim('Waiting for confirmation...'));

    const publicClient = createPublicClient({
      chain: base,
      transport: http(workingRpc),
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(chalk.green('✓ Funded successfully!\n'));

  } catch (error: any) {
    console.log(chalk.red(`\n✗ Funding failed: ${error.message}\n`));
  }
}

async function sendToExternalWallet(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n📤 Send ETH to External Wallet\n'));

  // Initialize wallet manager with password
  let mainWallet = await storage.getMainWallet();
  if (!mainWallet) {
    console.log(chalk.yellow('No main wallet found.\n'));
    const { createWallet } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createWallet',
        message: 'Create a main wallet?',
        default: true,
      },
    ]);
    
    if (!createWallet) {
      console.log(chalk.dim('Cancelled.\n'));
      return;
    }
    
    // Create main wallet
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Create master password (min 8 chars):',
        mask: '*',
        validate: (input) => input.length >= 8 || 'Password must be at least 8 characters',
      },
    ]);
    
    await walletManager.initialize(password);
    mainWallet = walletManager.generateMainWallet();
    await storage.setMainWallet(mainWallet);
    
    console.log(chalk.green(`\n✓ Main wallet created: ${mainWallet.address}`));
    console.log(chalk.yellow('⚠️  Save this address - you need to fund it with ETH\n'));
    return;
  }

  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Enter master password:',
      mask: '*',
    },
  ]);

  try {
    await walletManager.initialize(password);
    const walletDictionary = await storage.getWalletDictionary();
    const primaryWalletId = await storage.getPrimaryWalletId();
    walletManager.importData({ walletDictionary, primaryWalletId });
  } catch (error: any) {
    console.log(chalk.red(`\n✗ Invalid password: ${error.message}\n`));
    return;
  }

  // Get all wallets (main + bots)
  const walletDictionary = await storage.getWalletDictionary();
  const allWallets = [
    { name: 'Main Wallet', address: mainWallet!.address },
    ...Object.entries(walletDictionary).map(([id, wallet]) => ({
      name: `Bot Wallet (${id.slice(0, 8)}...)`,
      address: wallet.address,
    })),
  ];

  const { fromWallet } = await inquirer.prompt([
    {
      type: 'list',
      name: 'fromWallet',
      message: 'Select wallet to send from:',
      choices: [
        ...allWallets.map(w => ({ name: `${w.name}: ${w.address.slice(0, 12)}...`, value: w.address })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (fromWallet === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  console.log(chalk.dim(`From: ${fromWallet}`));

  // Check balance first
  let balanceEth = '0';
  let maxSendable = 0;
  try {
    const { createPublicClient, http, formatEther } = await import('viem');
    const { base } = await import('viem/chains');
    
    const workingRpc = await getWorkingRpc();
    const publicClient = createPublicClient({
      chain: base,
      transport: http(workingRpc),
    });
    
    const balance = await publicClient.getBalance({
      address: fromWallet as `0x${string}`,
    });
    
    balanceEth = formatEther(balance);
    console.log(chalk.cyan(`   Balance: ${balanceEth} ETH`));
    
    // Estimate gas (typically ~0.00001 ETH on Base)
    const gasEstimate = 0.00001;
    maxSendable = parseFloat(balanceEth) - gasEstimate;
    
    if (maxSendable <= 0) {
      console.log(chalk.red(`\n✗ Insufficient balance. You need at least ${gasEstimate} ETH for gas.`));
      console.log(chalk.yellow(`   Current balance: ${balanceEth} ETH\n`));
      return;
    }
    
    console.log(chalk.dim(`   Max sendable: ${Math.max(0, maxSendable).toFixed(6)} ETH (keeps ~${gasEstimate} ETH for gas)`));
  } catch (error: any) {
    console.log(chalk.yellow(`\n⚠ Could not check balance: ${error.message}`));
  }

  const { recipient, amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'recipient',
      message: 'Recipient address (0x...):',
      validate: (input) => input.startsWith('0x') && input.length === 42 || 'Invalid address',
    },
    {
      type: 'input',
      name: 'amount',
      message: 'Amount of ETH to send:',
      default: '0.01',
      validate: (input) => {
        const val = parseFloat(input);
        if (isNaN(val) || val <= 0) return 'Invalid amount';
        if (maxSendable > 0 && val > maxSendable) return `Amount exceeds max sendable (${maxSendable.toFixed(6)} ETH)`;
        return true;
      },
    },
  ]);

  console.log(chalk.yellow(`\n⚠️  About to send ${amount} ETH to ${recipient}`));
  console.log(chalk.red('⚠️  DOUBLE-CHECK THE ADDRESS - TRANSACTIONS CANNOT BE REVERSED'));
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Confirm transaction?',
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Cancelled.\n'));
    return;
  }

  try {
    const { createWalletClient, http, parseEther, createPublicClient } = await import('viem');
    const { base } = await import('viem/chains');

    const workingRpc = await getWorkingRpc();
    const account = walletManager.getAccountForAddress(fromWallet);
    
    // Debug: verify account address matches
    if (account.address.toLowerCase() !== fromWallet.toLowerCase()) {
      console.log(chalk.red(`\n✗ Address mismatch!`));
      console.log(chalk.yellow(`  Expected: ${fromWallet}`));
      console.log(chalk.yellow(`  Got: ${account.address}\n`));
      return;
    }
    
    // Check actual balance before sending
    const publicClient = createPublicClient({ chain: base, transport: http(workingRpc) });
    const actualBalance = await publicClient.getBalance({ address: account.address });
    console.log(chalk.dim(`Verifying balance: ${Number(actualBalance) / 1e18} ETH`));
    
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(workingRpc),
    });

    console.log(chalk.dim('Sending transaction...'));

    const txHash = await walletClient.sendTransaction({
      to: recipient as `0x${string}`,
      value: parseEther(amount),
    });

    console.log(chalk.green(`\n✓ Transaction sent: ${txHash}`));
    console.log(chalk.dim('Waiting for confirmation...'));

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(chalk.green(`✓ Sent ${amount} ETH to ${recipient.slice(0, 10)}... successfully!\n`));

  } catch (error: any) {
    console.log(chalk.red(`\n✗ Transaction failed: ${error.message}`));
    if (error.message?.includes('insufficient funds')) {
      console.log(chalk.yellow(`\n💡 Troubleshooting:`));
      console.log(chalk.yellow(`  1. Check the wallet address on Basescan`));
      console.log(chalk.yellow(`  2. Verify you're on Base mainnet (chainId: 8453)`));
      console.log(chalk.yellow(`  3. Try a smaller amount to reserve more gas`));
      console.log(chalk.yellow(`  4. The RPC might be out of sync - try again in 30 seconds\n`));
    } else {
      console.log();
    }
  }
}

/**
 * Get token balances for a wallet
 * Checks bot positions and common tokens
 */
async function getTokenBalances(walletAddress: string, storage: JsonStorage): Promise<Array<{address: string, symbol: string, balance: string}>> {
  const balances: Array<{address: string, symbol: string, balance: string}> = [];
  
  try {
    const workingRpc = await getWorkingRpc();
    const { createPublicClient, http, formatUnits } = await import('viem');
    const { base } = await import('viem/chains');
    const { erc20Abi } = await import('viem');
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(workingRpc),
    });
    
    // Get tokens from bot positions
    const bots = await storage.getAllBots();
    const botTokens = new Set<string>();
    
    for (const bot of bots) {
      // Check if this wallet is used by any bot
      if (bot.walletAddress.toLowerCase() === walletAddress.toLowerCase()) {
        botTokens.add(bot.tokenAddress);
      }
      
      // Also check positions with tokens
      for (const position of bot.positions) {
        if (position.tokensReceived && BigInt(position.tokensReceived) > 0) {
          botTokens.add(bot.tokenAddress);
        }
      }
    }
    
    // Add common Base tokens
    const commonTokens = [
      { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' },
      { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
      { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI' },
      { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH' },
    ];
    
    for (const token of commonTokens) {
      botTokens.add(token.address);
    }
    
    // Check balances for all tokens
    for (const tokenAddress of botTokens) {
      try {
        // Get decimals
        let decimals = 18;
        try {
          decimals = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: 'decimals',
          });
        } catch {
          // Default to 18 if fails
        }
        
        // Get balance
        const balance = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        });
        
        // Get symbol
        let symbol = 'TOKEN';
        try {
          symbol = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: 'symbol',
          });
        } catch {
          // Check if it's in common tokens
          const common = commonTokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
          if (common) symbol = common.symbol;
        }
        
        // Only add if balance > 0
        if (balance > BigInt(0)) {
          balances.push({
            address: tokenAddress,
            symbol,
            balance: formatUnits(balance, decimals),
          });
        }
      } catch {
        // Skip tokens that fail
        continue;
      }
    }
    
    // Sort by balance (descending)
    balances.sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));
    
  } catch (error: any) {
    console.log(chalk.yellow(`⚠ Could not fetch token balances: ${error.message}`));
  }
  
  return balances;
}

async function sendTokensToExternal(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n🪙 Send Tokens to External Wallet\n'));

  // Initialize wallet manager with password
  let mainWallet = await storage.getMainWallet();
  if (!mainWallet) {
    console.log(chalk.yellow('No main wallet found.\n'));
    const { createWallet } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createWallet',
        message: 'Create a main wallet?',
        default: true,
      },
    ]);
    
    if (!createWallet) {
      console.log(chalk.dim('Cancelled.\n'));
      return;
    }
    
    // Create main wallet
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Create master password (min 8 chars):',
        mask: '*',
        validate: (input) => input.length >= 8 || 'Password must be at least 8 characters',
      },
    ]);
    
    await walletManager.initialize(password);
    mainWallet = walletManager.generateMainWallet();
    await storage.setMainWallet(mainWallet);
    
    console.log(chalk.green(`\n✓ Main wallet created: ${mainWallet.address}`));
    console.log(chalk.yellow('⚠️  Save this address - you need to fund it with ETH\n'));
    return;
  }

  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Enter master password:',
      mask: '*',
    },
  ]);

  try {
    await walletManager.initialize(password);
    const walletDictionary = await storage.getWalletDictionary();
    const primaryWalletId = await storage.getPrimaryWalletId();
    walletManager.importData({ walletDictionary, primaryWalletId });
  } catch (error: any) {
    console.log(chalk.red(`\n✗ Invalid password: ${error.message}\n`));
    return;
  }

  // Get all wallets (main + bots)
  const walletDictionary = await storage.getWalletDictionary();
  const mainWalletData = Object.values(walletDictionary).find(w => w.type === 'main');
  const allWallets = [
    { name: 'Main Wallet', address: mainWalletData?.address || '', id: 'main' },
    ...Object.entries(walletDictionary).map(([id, wallet]) => ({
      name: `Bot Wallet (${id.slice(0, 8)}...)`,
      address: wallet.address,
      id,
    })),
  ];

  const { fromWallet } = await inquirer.prompt([
    {
      type: 'list',
      name: 'fromWallet',
      message: 'Select wallet to send from:',
      choices: [
        ...allWallets.map(w => ({ name: `${w.name}: ${w.address.slice(0, 12)}...`, value: w.address })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (fromWallet === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  // Check token balances and show selection
  console.log(chalk.dim('\nChecking token balances...'));
  
  const tokensWithBalance = await getTokenBalances(fromWallet, storage);
  
  if (tokensWithBalance.length === 0) {
    console.log(chalk.yellow('\nNo token balances found.\n'));
    
    // Offer manual entry
    const { manualEntry } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'manualEntry',
        message: 'Enter token address manually?',
        default: false,
      },
    ]);
    
    if (!manualEntry) {
      console.log(chalk.dim('Cancelled.\n'));
      return;
    }
  }
  
  // Build token choices
  const tokenChoices = tokensWithBalance.map(t => ({
    name: `${t.symbol}: ${t.balance} (${t.address.slice(0, 10)}...)`,
    value: t.address,
  }));
  
  // Add manual entry option
  tokenChoices.push({ name: '✏️  Enter token address manually', value: 'manual' });
  tokenChoices.push({ name: '⬅️  Back', value: 'back' });
  
  const { selectedToken } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedToken',
      message: 'Select token to send:',
      choices: tokenChoices,
    },
  ]);
  
  if (selectedToken === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }
  
  let tokenAddress: string;
  let tokenSymbol: string;
  
  if (selectedToken === 'manual') {
    const { manualToken } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualToken',
        message: 'Token contract address (0x...):',
        validate: (input) => input.startsWith('0x') && input.length === 42 || 'Invalid address',
      },
    ]);
    tokenAddress = manualToken;
    tokenSymbol = 'TOKEN';
  } else {
    tokenAddress = selectedToken;
    const selected = tokensWithBalance.find(t => t.address === selectedToken);
    tokenSymbol = selected?.symbol || 'TOKEN';
  }

  const { recipient, amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'recipient',
      message: 'Recipient address (0x...):',
      validate: (input) => input.startsWith('0x') && input.length === 42 || 'Invalid address',
    },
    {
      type: 'input',
      name: 'amount',
      message: `Amount of ${tokenSymbol} to send:`,
      validate: (input) => !isNaN(parseFloat(input)) && parseFloat(input) > 0 || 'Invalid amount',
    },
  ]);

  console.log(chalk.yellow(`\n⚠️  About to send ${amount} ${tokenSymbol} to ${recipient}`));
  console.log(chalk.red('⚠️  DOUBLE-CHECK THE TOKEN AND ADDRESS - TRANSACTIONS CANNOT BE REVERSED'));

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Confirm sending ${tokenSymbol}?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Cancelled.\n'));
    return;
  }

  try {
    const workingRpc = await getWorkingRpc();
    const { createWalletClient, http, parseUnits, erc20Abi } = await import('viem');
    const { base } = await import('viem/chains');

    const account = walletManager.getAccountForAddress(fromWallet);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(workingRpc),
    });

    // Get token decimals (assume 18 if fails)
    let decimals = 18;
    try {
      const publicClient = createPublicClient({ chain: base, transport: http(workingRpc) });
      decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'decimals',
      });
    } catch {
      console.log(chalk.yellow('⚠ Could not read token decimals, using 18'));
    }

    const tokenAmount = parseUnits(amount, decimals);

    console.log(chalk.dim('Sending token transaction...'));

    const txHash = await walletClient.writeContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient as `0x${string}`, tokenAmount],
    });

    console.log(chalk.green(`\n✓ Transaction sent: ${txHash}`));
    console.log(chalk.dim('Waiting for confirmation...'));

    const publicClient = createPublicClient({ chain: base, transport: http(workingRpc) });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(chalk.green(`✓ Sent ${amount} tokens to ${recipient.slice(0, 10)}... successfully!\n`));

  } catch (error: any) {
    console.log(chalk.red(`\n✗ Transaction failed: ${error.message}\n`));
  }
}

async function manageWallets(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n👛 Wallet Management\n'));

  const walletDictionary = await storage.getWalletDictionary();
  const mainWallets = Object.entries(walletDictionary).filter(([_, w]) => w.type === 'main');
  
  // If no wallets exist, require password setup
  let password: string;
  if (mainWallets.length === 0) {
    console.log(chalk.yellow('No wallets found. Create your first wallet.\n'));
    const { newPassword } = await inquirer.prompt([
      {
        type: 'password',
        name: 'newPassword',
        message: 'Create master password (min 8 chars):',
        mask: '*',
        validate: (input) => input.length >= 8 || 'Password must be at least 8 characters',
      },
    ]);
    password = newPassword;
    await walletManager.initialize(password);
  } else {
    // Existing wallets - require password
    const { existingPassword } = await inquirer.prompt([
      {
        type: 'password',
        name: 'existingPassword',
        message: 'Enter master password:',
        mask: '*',
      },
    ]);
    password = existingPassword;
    
    try {
      await walletManager.initialize(password);
      walletManager.importData({ 
        walletDictionary, 
        primaryWalletId: await storage.getPrimaryWalletId() 
      });
    } catch (error: any) {
      console.log(chalk.red(`\n✗ Invalid password: ${error.message}\n`));
      return;
    }
  }

  while (true) {
    // Refresh wallet data
    const currentDictionary = await storage.getWalletDictionary();
    const currentMainWallets = Object.entries(currentDictionary).filter(([_, w]) => w.type === 'main');
    const currentBotWallets = Object.entries(currentDictionary).filter(([_, w]) => w.type === 'bot');
    const primaryId = await storage.getPrimaryWalletId();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `Wallet Management (${currentMainWallets.length} main, ${currentBotWallets.length} bot):`,
        choices: [
          { name: '📋 List all wallets', value: 'list' },
          { name: '➕ Create new main wallet', value: 'create' },
          { name: '⭐ Set primary wallet', value: 'primary' },
          { name: '🔑 Export private key', value: 'export' },
          { name: '⬅️  Back', value: 'back' },
        ],
      },
    ]);

    if (action === 'back') break;

    if (action === 'list') {
      console.log(chalk.cyan('\n📋 All Wallets:\n'));
      
      if (currentMainWallets.length === 0) {
        console.log(chalk.dim('No main wallets.\n'));
      } else {
        console.log(chalk.green('Main Wallets:'));
        for (const [id, wallet] of currentMainWallets) {
          const isPrimary = id === primaryId ? chalk.yellow(' ⭐ PRIMARY') : '';
          console.log(`  ${chalk.green('●')} ${wallet.name || 'Main Wallet'}: ${wallet.address.slice(0, 16)}...${isPrimary}`);
        }
        console.log();
      }

      if (currentBotWallets.length === 0) {
        console.log(chalk.dim('No bot wallets.\n'));
      } else {
        console.log(chalk.cyan('Bot Wallets:'));
        for (const [id, wallet] of currentBotWallets) {
          console.log(`  ${chalk.blue('●')} ${wallet.name || id.slice(0, 16)}...: ${wallet.address.slice(0, 16)}...`);
        }
        console.log();
      }
    }

    if (action === 'create') {
      const { walletName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'walletName',
          message: 'Wallet name (optional):',
          default: `Main Wallet ${currentMainWallets.length + 1}`,
        },
      ]);

      const newWallet = walletManager.generateMainWallet(walletName);
      const walletId = Object.keys(walletManager.getAllWallets()).find(
        id => walletManager.getAllWallets()[id].address === newWallet.address
      );
      
      if (walletId) {
        await storage.addWallet(walletId, { ...newWallet, type: 'main', name: walletName });
        
        // Set as primary if it's the first one
        if (currentMainWallets.length === 0) {
          await storage.setPrimaryWalletId(walletId);
        }
        
        console.log(chalk.green(`\n✓ Main wallet created: ${newWallet.address}`));
        console.log(chalk.yellow('⚠️  Save this address - you need to fund it with ETH\n'));
      }
    }

    if (action === 'primary') {
      if (currentMainWallets.length < 2) {
        console.log(chalk.yellow('\nNeed at least 2 main wallets to set primary.\n'));
        continue;
      }

      const { selectedId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedId',
          message: 'Select primary wallet:',
          choices: currentMainWallets.map(([id, wallet]) => ({
            name: `${wallet.name || 'Main Wallet'}: ${wallet.address.slice(0, 16)}... ${id === primaryId ? '(current)' : ''}`,
            value: id,
          })),
        },
      ]);

      await storage.setPrimaryWalletId(selectedId);
      walletManager.setPrimaryWallet(selectedId);
      console.log(chalk.green('\n✓ Primary wallet updated\n'));
    }

    if (action === 'export') {
      const allWallets = [
        ...currentMainWallets.map(([id, wallet]) => ({ 
          name: `${wallet.name || 'Main Wallet'} ${id === primaryId ? '⭐' : ''}`, 
          id 
        })),
        ...currentBotWallets.map(([id, wallet]) => ({ 
          name: wallet.name || `Bot Wallet (${id.slice(0, 8)}...)`, 
          id 
        })),
      ];

      if (allWallets.length === 0) {
        console.log(chalk.yellow('\nNo wallets to export.\n'));
        continue;
      }

      const { walletId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'walletId',
          message: 'Select wallet to export:',
          choices: [
            ...allWallets.map(w => ({ name: w.name, value: w.id })),
            { name: '⬅️  Back', value: 'back' },
          ],
        },
      ]);

      if (walletId === 'back') continue;

      console.log(chalk.red('\n🚨 SECURITY WARNING 🚨'));
      console.log(chalk.red('The private key gives FULL CONTROL of the wallet.'));
      console.log(chalk.red('Never share it with anyone!'));
      console.log(chalk.yellow('\n⚠️  Only export to use in another wallet interface (MetaMask, etc.)'));
      console.log(chalk.yellow('⚠️  Store it securely offline (password manager, encrypted file, paper)'));
      console.log(chalk.yellow('⚠️  Anyone with this key can steal all funds!\n'));

      const { confirmExport } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmExport',
          message: chalk.red('I understand the risks. Show me the private key.'),
          default: false,
        },
      ]);

      if (!confirmExport) {
        console.log(chalk.yellow('Export cancelled.\n'));
        continue;
      }

      try {
        const privateKey = walletManager.exportPrivateKey(walletId);
        const walletInfo = currentDictionary[walletId];

        console.log(chalk.cyan('\n🔑 Private Key:'));
        console.log(chalk.green(privateKey));
        console.log(chalk.cyan('\n📍 Address:'));
        console.log(chalk.green(walletInfo.address));
        console.log(chalk.cyan('\n📛 Name:'));
        console.log(chalk.green(walletInfo.name || 'Unnamed'));
        console.log(chalk.red('\n⚠️  Copy this key NOW. Clear your terminal history after!'));
        console.log(chalk.dim('   (Type "history -c" in bash to clear)\n'));

        const { clearNow } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'clearNow',
            message: 'Have you copied the key? (Will pause 10s before continuing)',
            default: false,
          },
        ]);

        if (clearNow) {
          console.log(chalk.yellow('\n⏸ Pausing for 10 seconds...'));
          await new Promise(resolve => setTimeout(resolve, 10000));
          console.log(chalk.dim('Screen cleared from memory.\n'));
        }

      } catch (error: any) {
        console.log(chalk.red(`\n✗ Export failed: ${error.message}\n`));
      }
    }
  }
}

async function reconfigureBot(storage: JsonStorage) {
  console.log(chalk.cyan('\n⚙️  Reconfigure Bot\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found.\n'));
    return;
  }

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to reconfigure:',
      choices: [
        ...bots.map(b => ({ name: `${b.name} (${b.tokenSymbol})`, value: b.id })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  // Warn if bot is running
  if (bot.isRunning) {
    console.log(chalk.yellow('\n⚠️  This bot is currently running.'));
    console.log(chalk.yellow('   Stop the bot first to avoid conflicts.\n'));
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed anyway?',
        default: false,
      },
    ]);
    if (!proceed) {
      console.log(chalk.dim('Cancelled.\n'));
      return;
    }
  }

  console.log(chalk.cyan(`\nCurrent Configuration for ${bot.name}:`));
  console.log(`  Token: ${bot.tokenSymbol} (${bot.tokenAddress})`);
  console.log(`  Positions: ${bot.config.numPositions}`);
  console.log(`  Take Profit: ${bot.config.takeProfitPercent}%`);
  console.log(`  Max Active: ${bot.config.maxActivePositions}`);
  console.log(`  Moon Bag: ${bot.config.moonBagEnabled ? bot.config.moonBagPercent + '%' : 'Disabled'}`);
  console.log(`  Buy Amount: ${bot.config.useFixedBuyAmount ? bot.config.buyAmount + ' ETH' : 'Auto'}\n`);

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to change?',
      choices: [
        { name: '📊 Change grid settings (positions, profit %)', value: 'grid' },
        { name: '💰 Change buy settings (fixed amount, moon bag)', value: 'buy' },
        { name: '📈 Update profit targets (all positions)', value: 'profit' },
        { name: '🔄 Regenerate positions (preserve balances)', value: 'regenerate' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  if (action === 'profit') {
    console.log(chalk.cyan('\n📈 Update Profit Targets\n'));
    console.log(chalk.dim('This updates the sell price for ALL existing positions.'));
    console.log(chalk.dim('Use this to change profit % without regenerating the grid.\n'));
    console.log(chalk.dim(`Current take profit: ${bot.config.takeProfitPercent}%`));

    const { newProfitPercent, confirm } = await inquirer.prompt([
      {
        type: 'number',
        name: 'newProfitPercent',
        message: 'New take profit % per position:',
        default: bot.config.takeProfitPercent,
        validate: (input) => input > 0 || 'Must be positive',
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: (answers) => `Update all ${bot.positions.length} positions to ${answers.newProfitPercent}% profit?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.dim('\nCancelled.\n'));
      return;
    }

    // Update config
    const oldProfit = bot.config.takeProfitPercent;
    bot.config.takeProfitPercent = newProfitPercent;

    // Update all positions
    let updatedCount = 0;
    for (const position of bot.positions) {
      // Calculate new sell price based on buy price and new profit %
      const newSellPrice = position.buyPrice * (1 + newProfitPercent / 100);
      position.sellPrice = newSellPrice;
      updatedCount++;
    }

    bot.lastUpdated = Date.now();
    await storage.saveBot(bot);

    console.log(chalk.green(`\n✓ Updated ${updatedCount} positions`));
    console.log(chalk.dim(`  Old profit: ${oldProfit}%`));
    console.log(chalk.dim(`  New profit: ${newProfitPercent}%`));
    console.log(chalk.dim(`  Grid structure: Unchanged\n`));
  }

  if (action === 'grid') {
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'numPositions',
        message: 'Number of grid positions:',
        default: bot.config.numPositions,
      },
      {
        type: 'number',
        name: 'takeProfitPercent',
        message: 'Take profit % per position:',
        default: bot.config.takeProfitPercent,
      },
      {
        type: 'number',
        name: 'maxActivePositions',
        message: 'Max active positions:',
        default: bot.config.maxActivePositions,
      },
    ]);

    bot.config.numPositions = answers.numPositions;
    bot.config.takeProfitPercent = answers.takeProfitPercent;
    bot.config.maxActivePositions = answers.maxActivePositions;
    bot.lastUpdated = Date.now();
    await storage.saveBot(bot);

    console.log(chalk.green('\n✓ Grid settings updated\n'));
  }

  if (action === 'buy') {
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useFixedBuyAmount',
        message: 'Use fixed ETH amount per buy?',
        default: bot.config.useFixedBuyAmount,
      },
      {
        type: 'input',
        name: 'buyAmount',
        message: 'ETH amount per buy:',
        default: String(bot.config.buyAmount || 0.001),
        when: (a) => a.useFixedBuyAmount,
      },
      {
        type: 'confirm',
        name: 'moonBagEnabled',
        message: 'Enable moon bag?',
        default: bot.config.moonBagEnabled,
      },
      {
        type: 'number',
        name: 'moonBagPercent',
        message: 'Moon bag % to keep:',
        default: bot.config.moonBagPercent || 1,
        when: (a) => a.moonBagEnabled,
      },
    ]);

    bot.config.useFixedBuyAmount = answers.useFixedBuyAmount;
    if (answers.useFixedBuyAmount) {
      bot.config.buyAmount = parseFloat(answers.buyAmount);
    }
    bot.config.moonBagEnabled = answers.moonBagEnabled;
    if (answers.moonBagEnabled) {
      bot.config.moonBagPercent = answers.moonBagPercent;
    }
    bot.lastUpdated = Date.now();
    await storage.saveBot(bot);

    console.log(chalk.green('\n✓ Buy settings updated\n'));
  }

  if (action === 'regenerate') {
    console.log(chalk.cyan('\n🔄 Regenerate Grid Positions\n'));

    // Fetch current price from blockchain
    console.log(chalk.dim('Fetching current token price...'));
    let currentPrice = bot.currentPrice || 0;
    
    try {
      // Show current price info
      console.log(chalk.cyan(`\n📊 Current Market Data:`));
      console.log(`  Token: ${bot.tokenSymbol}`);
      console.log(`  Chain: ${bot.chain || 'base'}`);
      
      if (currentPrice > 0) {
        console.log(`  Current Price: ${currentPrice.toExponential(6)} ETH (${currentPrice.toFixed(10)} ETH)`);
      } else {
        console.log(`  Current Price: ${chalk.yellow('Not available - will use auto-calculation')}`);
      }
      console.log();
      
    } catch (error: any) {
      console.log(chalk.yellow(`Could not fetch current price: ${error.message}`));
      console.log(chalk.dim('Using stored price or auto-calculation.\n'));
    }

    // Determine floor/ceiling options
    const existingFloor = bot.config.floorPrice;
    const existingCeiling = bot.config.ceilingPrice;
    
    console.log(chalk.cyan('📏 Price Range Configuration\n'));
    
    // Show current ranges if they exist
    if (existingFloor && existingCeiling) {
      console.log(`  Current Floor:    ${existingFloor.toExponential(6)} ETH`);
      console.log(`  Current Ceiling:  ${existingCeiling.toExponential(6)} ETH`);
      console.log();
    }
    
    // Show auto-calculation preview
    if (currentPrice > 0) {
      const autoFloor = currentPrice / 10;
      const autoCeiling = currentPrice * 4;
      console.log(`  Auto Floor (1/10):   ${autoFloor.toExponential(6)} ETH`);
      console.log(`  Auto Ceiling (4x):   ${autoCeiling.toExponential(6)} ETH`);
      console.log();
    }

    const { rangeChoice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'rangeChoice',
        message: 'Choose price range:',
        choices: [
          ...(currentPrice > 0 ? [{ name: `🎯 Auto (Floor: ${(currentPrice / 10).toExponential(4)}, Ceiling: ${(currentPrice * 4).toExponential(4)})`, value: 'auto' }] : []),
          ...(existingFloor && existingCeiling ? [{ name: `📍 Keep Existing (Floor: ${existingFloor.toExponential(4)}, Ceiling: ${existingCeiling.toExponential(4)})`, value: 'existing' }] : []),
          { name: '✏️  Custom Floor/Ceiling', value: 'custom' },
          { name: '⬅️  Back', value: 'back' },
        ],
      },
    ]);

    if (rangeChoice === 'back') {
      console.log(chalk.dim('\nCancelled.\n'));
      return;
    }

    let floorPrice: number | undefined;
    let ceilingPrice: number | undefined;

    if (rangeChoice === 'auto') {
      if (currentPrice > 0) {
        floorPrice = currentPrice / 10;
        ceilingPrice = currentPrice * 4;
        console.log(chalk.green(`\n✓ Using auto-calculated range:`));
        console.log(`  Floor:   ${floorPrice.toExponential(6)} ETH`);
        console.log(`  Ceiling: ${ceilingPrice.toExponential(6)} ETH`);
      }
    } else if (rangeChoice === 'existing') {
      floorPrice = existingFloor;
      ceilingPrice = existingCeiling;
      console.log(chalk.green(`\n✓ Keeping existing range:`));
      console.log(`  Floor:   ${floorPrice?.toExponential(6)} ETH`);
      console.log(`  Ceiling: ${ceilingPrice?.toExponential(6)} ETH`);
    } else if (rangeChoice === 'custom') {
      const { floorInput, ceilingInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'floorInput',
          message: `Enter floor price (in ETH):`,
          default: currentPrice > 0 ? (currentPrice / 10).toExponential(4) : '0.000001',
          validate: (input) => {
            const val = parseFloat(input);
            return (!isNaN(val) && val > 0) || 'Must be a positive number';
          },
        },
        {
          type: 'input',
          name: 'ceilingInput',
          message: `Enter ceiling price (in ETH):`,
          default: currentPrice > 0 ? (currentPrice * 4).toExponential(4) : '0.00001',
          validate: (input) => {
            const val = parseFloat(input);
            return (!isNaN(val) && val > 0) || 'Must be a positive number';
          },
        },
      ]);
      
      floorPrice = parseFloat(floorInput);
      ceilingPrice = parseFloat(ceilingInput);
      
      console.log(chalk.green(`\n✓ Using custom range:`));
      console.log(`  Floor:   ${floorPrice.toExponential(6)} ETH`);
      console.log(`  Ceiling: ${ceilingPrice.toExponential(6)} ETH`);
    }

    // Store current holding positions
    const holdingPositions = bot.positions.filter(p => p.status === 'HOLDING' && p.tokensReceived);
    
    if (holdingPositions.length > 0) {
      console.log(chalk.cyan(`\n💼 Found ${holdingPositions.length} positions with balances to preserve:`));
      for (const pos of holdingPositions) {
        const tokens = pos.tokensReceived ? (Number(pos.tokensReceived) / 1e18).toFixed(4) : '0';
        console.log(`  Position ${pos.id}: ${tokens} ${bot.tokenSymbol} @ buy ${pos.buyPrice.toExponential(4)}`);
      }
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `\nRegenerate ${bot.config.numPositions} positions with ${holdingPositions.length} balances preserved?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.dim('\nCancelled.\n'));
      return;
    }

    // Update config with new floor/ceiling
    if (floorPrice !== undefined && ceilingPrice !== undefined) {
      bot.config.floorPrice = floorPrice;
      bot.config.ceilingPrice = ceilingPrice;
    }

    // Use current price for grid generation
    const gridPrice = currentPrice > 0 ? currentPrice : (floorPrice || 0.000001);
    
    // Generate new grid
    const newPositions = GridCalculator.generateGrid(gridPrice, bot.config);

    // Merge holding positions into new grid
    if (holdingPositions.length > 0) {
      // Sort holding positions by buy price (descending - highest first)
      const sortedHolding = [...holdingPositions].sort((a, b) => b.buyPrice - a.buyPrice);
      
      // If fewer new positions than holding positions, combine
      if (newPositions.length < sortedHolding.length) {
        console.log(chalk.yellow(`\n⚠️  New grid has fewer positions (${newPositions.length}) than holding positions (${sortedHolding.length})`));
        console.log(chalk.yellow('   Combining positions into new grid...\n'));
        
        // Calculate combined position
        let totalTokens = BigInt(0);
        let totalEthCost = BigInt(0);
        let highestSellPrice = 0;
        let latestBuyTimestamp = 0;
        
        for (const pos of sortedHolding) {
          totalTokens += BigInt(pos.tokensReceived || '0');
          totalEthCost += BigInt(pos.ethCost || '0');
          highestSellPrice = Math.max(highestSellPrice, pos.sellPrice);
          latestBuyTimestamp = Math.max(latestBuyTimestamp, pos.buyTimestamp || 0);
        }
        
        // Create a combined position at the best price level
        const buyMax = sortedHolding[0].buyMax || sortedHolding[0].buyPrice;
        const buyMin = sortedHolding[0].buyMin || buyMax;
        const combinedPosition: Position = {
          id: 0,
          buyMin,
          buyMax,
          buyPrice: buyMax,
          sellPrice: highestSellPrice,
          stopLossPrice: sortedHolding[0].stopLossPrice,
          status: 'HOLDING',
          buyTxHash: sortedHolding[0].buyTxHash,
          buyTimestamp: latestBuyTimestamp,
          tokensReceived: totalTokens.toString(),
          ethCost: totalEthCost.toString(),
        };
        
        // Replace first position with combined
        if (newPositions.length > 0) {
          newPositions[0] = combinedPosition;
        }
        
        console.log(chalk.green(`✓ Combined ${sortedHolding.length} positions into 1`));
        console.log(chalk.green(`  Total tokens: ${totalTokens}`));
        console.log(chalk.green(`  Sell price: ${highestSellPrice} (highest from combined)`));
      } else {
        // Enough positions - try to match holding positions to new grid
        console.log(chalk.cyan('\nMatching holding positions to new grid...\n'));
        
        for (const holdingPos of sortedHolding) {
          // Find closest new position by matching buy range (not just buy price)
          // Look for position where holding's buy price falls within the new position's range
          // or closest to it
          let targetIndex = newPositions.findIndex(p => 
            holdingPos.buyPrice >= p.buyMin && holdingPos.buyPrice <= p.buyMax
          );
          
          // If no exact range match, find closest by distance to range midpoint
          if (targetIndex < 0) {
            let minDistance = Infinity;
            for (let i = 0; i < newPositions.length; i++) {
              const p = newPositions[i];
              const midPrice = (p.buyMin + p.buyMax) / 2;
              const distance = Math.abs(holdingPos.buyPrice - midPrice);
              if (distance < minDistance) {
                minDistance = distance;
                targetIndex = i;
              }
            }
          }
          
          if (targetIndex >= 0) {
            // Check if target position already has a holding
            if (newPositions[targetIndex].status === 'HOLDING') {
              // Merge with existing holding
              const existingTokens = BigInt(newPositions[targetIndex].tokensReceived || '0');
              const holdingTokens = BigInt(holdingPos.tokensReceived || '0');
              const existingCost = BigInt(newPositions[targetIndex].ethCost || '0');
              const holdingCost = BigInt(holdingPos.ethCost || '0');
              
              newPositions[targetIndex] = {
                ...holdingPos,
                id: newPositions[targetIndex].id,
                tokensReceived: (existingTokens + holdingTokens).toString(),
                ethCost: (existingCost + holdingCost).toString(),
                sellPrice: Math.max(holdingPos.sellPrice, newPositions[targetIndex].sellPrice),
              };
              console.log(`  ✓ Position ${holdingPos.id} → merged into position ${newPositions[targetIndex].id}`);
            } else {
              // Place holding in empty position
              newPositions[targetIndex] = {
                ...holdingPos,
                id: newPositions[targetIndex].id,
                // Keep original sell price if higher than new grid's sell price
                sellPrice: Math.max(holdingPos.sellPrice, newPositions[targetIndex].sellPrice),
              };
              console.log(`  ✓ Position ${holdingPos.id} → new position ${newPositions[targetIndex].id}`);
            }
          }
        }
      }
    }

    // Update bot with new positions
    bot.positions = newPositions;
    bot.lastUpdated = Date.now();
    await storage.saveBot(bot);

    // Count actual holding positions after merge
    const finalHoldingCount = newPositions.filter(p => p.status === 'HOLDING').length;
    const mergedCount = holdingPositions.length - finalHoldingCount;

    console.log(chalk.green('\n✓ Positions regenerated successfully'));
    console.log(chalk.cyan(`\n📊 New Grid Configuration:`));
    console.log(`  Total positions: ${newPositions.length}`);
    console.log(`  Price range: ${bot.config.floorPrice?.toExponential(6)} - ${bot.config.ceilingPrice?.toExponential(6)} ETH`);
    console.log(`  Original holdings: ${holdingPositions.length}`);
    if (mergedCount > 0) {
      console.log(`  Final holdings: ${finalHoldingCount} (${mergedCount} merged)`);
    } else {
      console.log(`  Holdings preserved: ${finalHoldingCount}`);
    }
    console.log(`  Empty positions: ${newPositions.filter(p => p.status === 'EMPTY').length}`);
    
    if (newPositions.length > 0) {
      const firstPos = newPositions[0];
      const lastPos = newPositions[newPositions.length - 1];
      console.log(`  First position buy: ${firstPos.buyMin.toExponential(4)} - ${firstPos.buyMax.toExponential(4)} ETH`);
      console.log(`  Last position buy: ${lastPos.buyMin.toExponential(4)} - ${lastPos.buyMax.toExponential(4)} ETH`);
    }
    console.log();
  }
}

async function reclaimFunds(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n🏧 Reclaim Funds\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found.\n'));
    return;
  }

  const mainWallet = await storage.getMainWallet();
  if (!mainWallet) {
    console.log(chalk.red('No main wallet found.\n'));
    return;
  }

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to reclaim from:',
      choices: [
        { name: 'All bots', value: 'all' },
        ...bots.map(b => ({ name: `${b.name} (${b.walletAddress.slice(0, 10)}...)`, value: b.id })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const botsToReclaim = botId === 'all' ? bots : bots.filter(b => b.id === botId);

  console.log(chalk.yellow(`\n⚠️  This will reclaim from ${botsToReclaim.length} bot(s):`));
  for (const bot of botsToReclaim) {
    const ethBalance = await getBotEthBalance(walletManager, bot);
    console.log(chalk.yellow(`  - ${bot.name}: ${ethBalance} ETH`));
  }
  console.log(chalk.yellow(`\nFunds will be sent to main wallet: ${mainWallet.address}`));

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Confirm reclaim?',
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Cancelled.\n'));
    return;
  }

  // Simple ETH reclaim (tokens would need TradingBot liquidation)
  for (const bot of botsToReclaim) {
    console.log(chalk.dim(`\nReclaiming from ${bot.name}...`));
    
    try {
      const success = await reclaimBotEth(walletManager, storage, bot, mainWallet.address);
      if (success) {
        console.log(chalk.green(`✓ Reclaimed from ${bot.name}`));
      } else {
        console.log(chalk.yellow(`⚠ No ETH to reclaim from ${bot.name}`));
      }
    } catch (error: any) {
      console.log(chalk.red(`✗ Failed to reclaim from ${bot.name}: ${error.message}`));
    }
  }

  console.log(chalk.green('\n✓ Reclaim process complete\n'));
  console.log(chalk.yellow('Note: Tokens were not sold. Use TradingBot liquidation to sell tokens first.'));
}

async function getBotEthBalance(_walletManager: WalletManager, bot: BotInstance): Promise<string> {
  try {
    const workingRpc = await getWorkingRpc();
    const { createPublicClient, http, formatEther } = await import('viem');
    const { base } = await import('viem/chains');
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(workingRpc),
    });
    
    const balance = await publicClient.getBalance({
      address: bot.walletAddress as `0x${string}`,
    });
    
    return formatEther(balance);
  } catch {
    return '0';
  }
}

async function reclaimBotEth(walletManager: WalletManager, storage: JsonStorage, bot: BotInstance, mainAddress: string): Promise<boolean> {
  const workingRpc = await getWorkingRpc();
  const { createWalletClient, http, parseEther } = await import('viem');
  const { base } = await import('viem/chains');
  const { createPublicClient } = await import('viem');
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http(workingRpc),
  });
  
  // Get bot's balance
  const balance = await publicClient.getBalance({
    address: bot.walletAddress as `0x${string}`,
  });
  
  // Leave 0.0001 ETH for gas
  const reclaimAmount = balance - parseEther('0.0001');
  
  if (reclaimAmount <= BigInt(0)) {
    return false;
  }
  
  // Create wallet client for bot
  let account;
  if (bot.useMainWallet) {
    account = walletManager.getMainAccount();
  } else {
    const walletDict = await storage.getWalletDictionary();
    const botWalletData = walletDict[bot.id];
    if (!botWalletData) return false;
    
    // Need to decrypt and get account
    // This requires wallet manager to support loading arbitrary wallets
    console.log(chalk.yellow(`⚠ Cannot reclaim from ${bot.name} - bot wallet decryption not implemented`));
    return false;
  }
  
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(workingRpc),
  });
  
  const txHash = await walletClient.sendTransaction({
    to: mainAddress as `0x${string}`,
    value: reclaimAmount,
  });
  
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return true;
}

async function deleteBot(heartbeatManager: HeartbeatManager, storage: JsonStorage, walletManager: WalletManager) {
  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('\nNo bots found\n'));
    return;
  }

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to delete:',
      choices: [
        ...bots.map(b => ({ name: b.name, value: b.id })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  // Check for funds
  const ethBalance = await getBotEthBalance(walletManager, bot);
  const hasPositions = bot.positions.some(p => p.status === 'HOLDING');

  if (parseFloat(ethBalance) > 0 || hasPositions) {
    console.log(chalk.red('\n🚨 WARNING: This bot has funds!'));
    console.log(chalk.yellow(`   ETH Balance: ${ethBalance} ETH`));
    console.log(chalk.yellow(`   Active Positions: ${bot.positions.filter(p => p.status === 'HOLDING').length}`));
    console.log(chalk.red('\n⚠️  Deleting will NOT reclaim these funds!'));
    console.log(chalk.dim('   Use "🏧 Reclaim funds" first to recover your ETH\n'));
    
    const { forceDelete } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'forceDelete',
        message: chalk.red('Delete anyway? (Funds will be lost!)'),
        default: false,
      },
    ]);
    
    if (!forceDelete) {
      console.log(chalk.yellow('Cancelled. Use "🏧 Reclaim funds" first.\n'));
      return;
    }
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.red('Are you sure? This cannot be undone!'),
      default: false,
    },
  ]);

  if (confirm) {
    heartbeatManager.removeBot(botId);
    await storage.deleteBot(botId);
    console.log(chalk.green('\n✓ Bot deleted'));
    console.log(chalk.dim('Note: Bot wallet still exists in storage but is no longer accessible via CLI\n'));
  }
}

/**
 * Configure Telegram notifications
 */
async function configureTelegram() {
  console.log(chalk.cyan('\n🔔 Telegram Notification Configuration\n'));

  // Check current configuration
  const currentToken = process.env.TELEGRAM_BOT_TOKEN;
  const currentChatId = process.env.TELEGRAM_CHAT_ID;

  if (currentToken && currentChatId) {
    console.log(chalk.green('✓ Telegram is currently configured'));
    console.log(chalk.dim(`  Chat ID: ${currentChatId}`));
    console.log(chalk.dim(`  Token: ${currentToken.slice(0, 10)}...${currentToken.slice(-5)}\n`));
  } else {
    console.log(chalk.yellow('⚠ Telegram is not configured'));
    console.log(chalk.dim('  You need to set up a Telegram bot to receive notifications.\n'));
    console.log(chalk.cyan('Setup instructions:'));
    console.log('  1. Message @BotFather on Telegram');
    console.log('  2. Create a new bot with /newbot');
    console.log('  3. Copy the bot token');
    console.log('  4. Message your bot or add it to a group');
    console.log('  5. Message @userinfobot to get your chat ID\n');
  }

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: currentToken ? '📝 Update configuration' : '📝 Configure Telegram', value: 'configure' },
        { name: '🧪 Test notification', value: 'test', disabled: !currentToken },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  if (action === 'configure') {
    const { botToken, chatId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'botToken',
        message: 'Telegram Bot Token (from @BotFather):',
        default: currentToken || '',
        validate: (input) => input.length > 0 || 'Bot token is required',
      },
      {
        type: 'input',
        name: 'chatId',
        message: 'Telegram Chat ID (from @userinfobot):',
        default: currentChatId || '',
        validate: (input) => input.length > 0 || 'Chat ID is required',
      },
    ]);

    console.log(chalk.yellow('\n⚠️  About to save Telegram configuration'));
    console.log(chalk.dim('  This will update your .env file\n'));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Save configuration?',
        default: true,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Cancelled.\n'));
      return;
    }

    // Update environment variables in memory
    process.env.TELEGRAM_BOT_TOKEN = botToken;
    process.env.TELEGRAM_CHAT_ID = chatId;

    // Update .env file
    try {
      const fs = await import('fs');
      const path = await import('path');
      const envPath = path.default.resolve('.env');

      let envContent = '';
      if (fs.default.existsSync(envPath)) {
        envContent = fs.default.readFileSync(envPath, 'utf-8');
      }

      // Update or add TELEGRAM_BOT_TOKEN
      if (envContent.includes('TELEGRAM_BOT_TOKEN=')) {
        envContent = envContent.replace(
          /TELEGRAM_BOT_TOKEN=.*/,
          `TELEGRAM_BOT_TOKEN=${botToken}`
        );
      } else {
        envContent += `\nTELEGRAM_BOT_TOKEN=${botToken}\n`;
      }

      // Update or add TELEGRAM_CHAT_ID
      if (envContent.includes('TELEGRAM_CHAT_ID=')) {
        envContent = envContent.replace(
          /TELEGRAM_CHAT_ID=.*/,
          `TELEGRAM_CHAT_ID=${chatId}`
        );
      } else {
        envContent += `TELEGRAM_CHAT_ID=${chatId}\n`;
      }

      fs.default.writeFileSync(envPath, envContent);

      console.log(chalk.green('\n✓ Configuration saved to .env'));
      console.log(chalk.cyan('\n🧪 Testing connection...\n'));

      // Test the connection
      const bot = new TelegramBot({ botToken, chatId });
      const result = await bot.testConnection();

      if (result.success) {
        console.log(chalk.green('✓ Test notification sent successfully!'));
        console.log(chalk.dim('  Check your Telegram for the test message.\n'));
      } else {
        console.log(chalk.red(`✗ Test failed: ${result.message}`));
        console.log(chalk.yellow('\n⚠ Please verify:'));
        console.log('  - The bot token is correct');
        console.log('  - You have messaged the bot at least once');
        console.log('  - The chat ID is correct\n');
      }
    } catch (error: any) {
      console.log(chalk.red(`\n✗ Failed to save configuration: ${error.message}\n`));
    }
  }

  if (action === 'test') {
    console.log(chalk.cyan('\n🧪 Sending test notification...\n'));

    const bot = TelegramBot.fromEnv();
    if (!bot) {
      console.log(chalk.red('✗ Telegram is not properly configured\n'));
      return;
    }

    const result = await bot.testConnection();

    if (result.success) {
      console.log(chalk.green('✓ Test notification sent successfully!'));
      console.log(chalk.dim('  Check your Telegram for the test message.\n'));
    } else {
      console.log(chalk.red(`✗ Test failed: ${result.message}`));
      console.log(chalk.yellow('\n⚠ Please verify your configuration.\n'));
    }
  }
}

/**
 * Show P&L Report
 */
async function showPnlReport(pnLTracker: PnLTracker, storage: JsonStorage) {
  console.log(chalk.cyan('\n📈 Profit & Loss Report\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found. Create one first.\n'));
    return;
  }

  const allTrades = pnLTracker.getAllTrades();
  const cumulativePnl = pnLTracker.getCumulativePnL();

  if (allTrades.length === 0) {
    console.log(chalk.yellow('No trades recorded yet.\n'));
    return;
  }

  // Show summary
  console.log(chalk.yellow('═'.repeat(66)));
  console.log(chalk.yellow('📊 CUMULATIVE P&L SUMMARY'));
  console.log(chalk.yellow('═'.repeat(66)));
  console.log(`  Total Trades:    ${chalk.cyan(cumulativePnl.totalTrades)}`);
  console.log(`  Total Buys:      ${chalk.cyan(cumulativePnl.totalBuys)}`);
  console.log(`  Total Sells:     ${chalk.cyan(cumulativePnl.totalSells)}`);
  console.log(`  Total Profit:    ${chalk.green(formatEther(BigInt(cumulativePnl.totalProfitEth)) + ' ETH')}`);
  console.log(`  Total Volume:    ${chalk.cyan(formatEther(BigInt(cumulativePnl.totalVolumeEth)) + ' ETH')}`);
  console.log(`  Period:          ${chalk.dim(new Date(cumulativePnl.startDate).toLocaleDateString())} → ${new Date(cumulativePnl.endDate).toLocaleDateString()}`);
  console.log();

  // Per-bot breakdown
  console.log(chalk.yellow('📈 PER-BOT BREAKDOWN'));
  console.log(chalk.yellow('─'.repeat(66)));
  console.log(chalk.dim('  Bot Name              Trades    Buys    Sells    Profit (ETH)'));
  console.log(chalk.dim('  ───────────────────────────────────────────────────────────────'));

  for (const bot of bots) {
    const botTrades = pnLTracker.getTradesByBot(bot.id);
    const botBuys = botTrades.filter(t => t.action === 'buy');
    const botSells = botTrades.filter(t => t.action === 'sell');
    const botProfit = botSells.reduce((sum, t) => sum + BigInt(t.profit || '0'), BigInt(0));
    
    const name = bot.name.slice(0, 20).padEnd(20, ' ');
    const trades = String(botTrades.length).padStart(6);
    const buys = String(botBuys.length).padStart(6);
    const sells = String(botSells.length).padStart(7);
    const profit = formatEther(botProfit).slice(0, 10).padStart(12);
    const profitColor = botProfit > 0 ? chalk.green : botProfit < 0 ? chalk.red : chalk.gray;
    
    console.log(`  ${name} ${trades} ${buys} ${sells} ${profitColor(profit)}`);
  }
  console.log();

  // Recent trades
  const recentTrades = [...allTrades].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
  console.log(chalk.yellow('📝 RECENT TRADES (Last 10)'));
  console.log(chalk.yellow('─'.repeat(66)));
  console.log(chalk.dim('  Time                Bot              Action    Token        Profit'));
  console.log(chalk.dim('  ───────────────────────────────────────────────────────────────────'));

  for (const trade of recentTrades) {
    const time = new Date(trade.timestamp).toLocaleTimeString().padEnd(17);
    const botName = trade.botName.slice(0, 14).padEnd(14);
    const action = trade.action === 'buy' ? chalk.yellow('BUY ') : chalk.green('SELL');
    const token = trade.tokenSymbol.slice(0, 10).padEnd(10);
    const profit = trade.profit ? formatEther(BigInt(trade.profit)).slice(0, 10).padStart(10) : chalk.gray('      —   ');
    const profitColor = trade.profit && BigInt(trade.profit) > 0 ? chalk.green : chalk.gray;
    
    console.log(`  ${time} ${botName} ${action}    ${token} ${profitColor(profit)}`);
  }
  console.log();

  // Calculate unrealized P&L
  let totalUnrealized = BigInt(0);
  for (const bot of bots) {
    const holdingPositions = bot.positions.filter(p => p.status === 'HOLDING');
    for (const pos of holdingPositions) {
      if (pos.tokensReceived && pos.ethCost) {
        const currentValue = BigInt(pos.tokensReceived) * BigInt(Math.floor(bot.currentPrice * 1e18)) / BigInt(1e18);
        const cost = BigInt(pos.ethCost);
        totalUnrealized += currentValue - cost;
      }
    }
  }

  if (totalUnrealized !== BigInt(0)) {
    console.log(chalk.yellow('💰 UNREALIZED P&L (Holding Positions)'));
    console.log(chalk.yellow('─'.repeat(66)));
    const unrealizedStr = formatEther(totalUnrealized);
    const color = totalUnrealized > 0 ? chalk.green : totalUnrealized < 0 ? chalk.red : chalk.gray;
    console.log(`  Unrealized P&L: ${color(unrealizedStr + ' ETH')}`);
    console.log(chalk.dim('  (Profit/loss if all holding positions were sold now)'));
    console.log();
  }

  // Show combined P&L
  const totalRealized = BigInt(cumulativePnl.totalProfitEth);
  const combinedPnl = totalRealized + totalUnrealized;
  console.log(chalk.yellow('📊 COMBINED P&L (Realized + Unrealized)'));
  console.log(chalk.yellow('─'.repeat(66)));
  console.log(`  Realized P&L:   ${totalRealized > 0 ? chalk.green : chalk.gray(formatEther(totalRealized) + ' ETH')}`);
  console.log(`  Unrealized P&L: ${totalUnrealized > 0 ? chalk.green : totalUnrealized < 0 ? chalk.red : chalk.gray(formatEther(totalUnrealized) + ' ETH')}`);
  const combinedColor = combinedPnl > 0 ? chalk.green.bold : combinedPnl < 0 ? chalk.red.bold : chalk.gray.bold;
  console.log(`  Combined P&L:   ${combinedColor(formatEther(combinedPnl) + ' ETH')}`);
  console.log();

  // Menu for export
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '💾 Export to CSV', value: 'export' },
        { name: '📅 View daily breakdown', value: 'daily' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'export') {
    await exportPnlToCsv(pnLTracker, bots);
  } else if (action === 'daily') {
    await showDailyPnlBreakdown(pnLTracker);
  }
}

/**
 * Show daily P&L breakdown
 */
async function showDailyPnlBreakdown(pnLTracker: PnLTracker) {
  console.log(chalk.cyan('\n📅 Daily P&L Breakdown\n'));

  const allTrades = pnLTracker.getAllTrades();
  if (allTrades.length === 0) {
    console.log(chalk.yellow('No trades recorded yet.\n'));
    return;
  }

  // Get unique dates
  const dates = new Set<string>();
  for (const trade of allTrades) {
    dates.add(new Date(trade.timestamp).toISOString().split('T')[0]);
  }

  const sortedDates = Array.from(dates).sort().reverse();

  console.log(chalk.yellow('─'.repeat(66)));
  console.log(chalk.dim('  Date         Trades    Buys    Sells    Volume (ETH)    Profit (ETH)'));
  console.log(chalk.dim('  ───────────────────────────────────────────────────────────────────'));

  for (const dateStr of sortedDates.slice(0, 14)) { // Last 14 days
    const date = new Date(dateStr);
    const dailyPnl = pnLTracker.getDailyPnL(date);
    
    for (const day of dailyPnl) {
      const dateDisplay = dateStr.slice(5); // MM-DD
      const trades = String(day.buys + day.sells).padStart(6);
      const buys = String(day.buys).padStart(6);
      const sells = String(day.sells).padStart(7);
      const volume = formatEther(BigInt(day.volumeEth)).slice(0, 12).padStart(14);
      const profit = formatEther(BigInt(day.profitEth)).slice(0, 12).padStart(13);
      const profitColor = BigInt(day.profitEth) > 0 ? chalk.green : BigInt(day.profitEth) < 0 ? chalk.red : chalk.gray;
      
      console.log(`  ${dateDisplay}       ${trades} ${buys} ${sells} ${chalk.cyan(volume)} ${profitColor(profit)}`);
    }
  }
  console.log();
}

/**
 * Export P&L to CSV
 */
async function exportPnlToCsv(pnLTracker: PnLTracker, bots: BotInstance[]) {
  console.log(chalk.cyan('\n💾 Export P&L to CSV\n'));

  const allTrades = pnLTracker.getAllTrades();
  if (allTrades.length === 0) {
    console.log(chalk.yellow('No trades to export.\n'));
    return;
  }

  const { exportType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'exportType',
      message: 'What would you like to export?',
      choices: [
        { name: '📊 All trades (all bots)', value: 'all' },
        { name: '🤖 Specific bot', value: 'bot' },
        { name: '📅 Date range', value: 'range' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (exportType === 'back') {
    return;
  }

  let options: { botId?: string; startDate?: Date; endDate?: Date } = {};

  if (exportType === 'bot') {
    const { botId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'botId',
        message: 'Select bot to export:',
        choices: bots.map(b => ({ name: b.name, value: b.id })),
      },
    ]);
    options.botId = botId;
  }

  if (exportType === 'range') {
    const { startDate, endDate } = await inquirer.prompt([
      {
        type: 'input',
        name: 'startDate',
        message: 'Start date (YYYY-MM-DD):',
        default: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        validate: (input) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Invalid date format',
      },
      {
        type: 'input',
        name: 'endDate',
        message: 'End date (YYYY-MM-DD):',
        default: new Date().toISOString().split('T')[0],
        validate: (input) => /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Invalid date format',
      },
    ]);
    options.startDate = new Date(startDate);
    options.endDate = new Date(endDate);
    options.endDate.setHours(23, 59, 59, 999); // End of day
  }

  // Generate CSV
  const csv = CsvExporter.exportToCsv(allTrades, {
    botId: options.botId,
    startDate: options.startDate,
    endDate: options.endDate,
    includeHeaders: true,
  });

  const filename = CsvExporter.generateFilename(options);

  console.log(chalk.dim(`\nExporting ${allTrades.length} trades...`));

  try {
    writeFileSync(filename, csv);
    console.log(chalk.green(`\n✓ Exported to ${filename}`));
    console.log(chalk.dim(`  Location: ${process.cwd()}/${filename}\n`));
  } catch (error: any) {
    console.log(chalk.red(`\n✗ Export failed: ${error.message}\n`));
  }
}

/**
 * Show Price Oracle status and health
 */
async function showOracleStatus() {
  console.log(chalk.cyan('\n🔮 Price Oracle Status\n'));

  try {
    const workingRpc = await getWorkingRpc();
    const oracle = new PriceOracle({
      rpcUrl: workingRpc,
      minConfidence: 0.8,
      allowFallback: true,
      preferChainlink: true,
    });

    console.log(chalk.dim('Running health check...\n'));

    const health = await oracle.healthCheck();

    if (health.healthy) {
      console.log(chalk.green('✓ Oracle Status: HEALTHY'));
    } else {
      console.log(chalk.red('✗ Oracle Status: UNHEALTHY'));
    }

    console.log(`\n${chalk.cyan('Chainlink Feeds:')} ${health.chainlinkWorking ? chalk.green('✓ Working') : chalk.red('✗ Failed')}`);
    console.log(`${chalk.cyan('Uniswap V3 TWAP:')} ${health.uniswapWorking ? chalk.green('✓ Working') : chalk.red('✗ Failed')}`);

    if (health.ethPrice) {
      console.log(`\n${chalk.cyan('ETH Price (Chainlink):')} $${health.ethPrice.toFixed(2)}`);
    } else {
      console.log(`\n${chalk.yellow('⚠ Could not fetch ETH price')}`);
    }

    // Test with a common token (WETH)
    const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
    console.log(chalk.dim('\nTesting WETH price lookup...'));

    const wethPrice = await oracle.getPrice(WETH_ADDRESS);
    if (wethPrice) {
      console.log(`${chalk.cyan('WETH Price:')} ${wethPrice.price.toFixed(6)} ETH`);
      console.log(`${chalk.cyan('Source:')} ${wethPrice.source}`);
      console.log(`${chalk.cyan('Confidence:')} ${(wethPrice.confidence * 100).toFixed(1)}%`);
    }

    // Show supported Chainlink feeds
    console.log(chalk.cyan('\nSupported Chainlink Feeds:'));
    const { CHAINLINK_FEEDS } = await import('./oracle/ChainlinkFeed.js');
    for (const [symbol, address] of Object.entries(CHAINLINK_FEEDS)) {
      console.log(`  ${chalk.dim(symbol.padEnd(10))} ${address}`);
    }

    console.log();
  } catch (error: any) {
    console.log(chalk.red(`\n✗ Oracle check failed: ${error.message}\n`));
  }
}

/**
 * Toggle price validation for bots
 */
async function togglePriceValidation(storage: JsonStorage, heartbeatManager: HeartbeatManager) {
  console.log(chalk.cyan('\n⚡ Toggle Price Validation\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found.\n'));
    return;
  }

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to configure price validation:',
      choices: [
        ...bots.map(b => ({
          name: `${b.name} (${b.tokenSymbol}) - Oracle: ${b.config.usePriceOracle !== false ? chalk.green('ON') : chalk.red('OFF')}`,
          value: b.id,
        })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  const currentStatus = bot.config.usePriceOracle === true; // Default to false (disabled)
  const newStatus = !currentStatus;

  console.log(chalk.yellow(`\n${currentStatus ? 'Disabling' : 'Enabling'} price validation for ${bot.name}`));
  console.log(chalk.dim(`Current: ${currentStatus ? 'ENABLED' : 'DISABLED'} → New: ${newStatus ? 'ENABLED' : 'DISABLED'}`));

  if (newStatus) {
    console.log(chalk.green('\n✓ Price validation will:'));
    console.log(chalk.dim('  - Validate prices using Chainlink + Uniswap TWAP before trades'));
    console.log(chalk.dim('  - Skip trades if confidence is below 80%'));
    console.log(chalk.dim('  - Log price confidence for each trade'));
  } else {
    console.log(chalk.red('\n⚠ Price validation will be DISABLED:'));
    console.log(chalk.dim('  - Trades will execute without oracle price checks'));
    console.log(chalk.dim('  - Only 0x API prices will be used'));
    console.log(chalk.yellow('  - This increases risk of trading on bad prices!'));
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Confirm ${newStatus ? 'enable' : 'disable'} price validation?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Cancelled.\n'));
    return;
  }

  // Update bot config
  bot.config.usePriceOracle = newStatus;
  bot.lastUpdated = Date.now();
  await storage.saveBot(bot);

  // Restart bot if running to apply changes
  if (bot.isRunning) {
    console.log(chalk.dim('\nRestarting bot to apply changes...'));
    heartbeatManager.removeBot(bot.id);
    await heartbeatManager.addBot(bot);
    console.log(chalk.green('✓ Bot restarted with new settings'));
  }

  console.log(chalk.green(`\n✓ Price validation is now ${newStatus ? chalk.green('ENABLED') : chalk.red('DISABLED')} for ${bot.name}\n`));
}

/**
 * Run comprehensive diagnostic on a bot
 */
async function runDiagnostic(storage: JsonStorage, _heartbeatManager: HeartbeatManager) {
  console.log(chalk.cyan('\n📊 Bot Diagnostic\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found.\n'));
    return;
  }

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to diagnose:',
      choices: [
        ...bots.map(b => ({
          name: `${b.name} (${b.tokenSymbol}) - ${b.isRunning ? chalk.green('● Running') : chalk.gray('○ Stopped')}`,
          value: b.id,
        })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  console.log(chalk.cyan(`\n🔍 Diagnosing: ${chalk.bold(bot.name)} (${bot.tokenSymbol})\n`));

  // 1. Basic Info
  console.log(chalk.yellow('📋 Basic Info:'));
  console.log(`  Token: ${bot.tokenAddress}`);
  console.log(`  Wallet: ${bot.walletAddress}`);
  console.log(`  Chain: ${bot.chain || 'base'}`);
  console.log(`  Status: ${bot.isRunning ? chalk.green('Running') : chalk.red('Stopped')}`);
  console.log(`  Enabled: ${bot.enabled ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`  Type: ${bot.config.volumeMode ? chalk.magenta('Volume Bot') : chalk.blue('Grid Bot')}`);
  console.log();

  // 2. Grid Configuration
  console.log(chalk.yellow('📏 Grid Configuration:'));
  console.log(`  Positions: ${bot.config.numPositions}`);
  console.log(`  Take Profit: ${bot.config.takeProfitPercent}%`);
  console.log(`  Max Active: ${bot.config.maxActivePositions}`);
  if (bot.config.floorPrice && bot.config.ceilingPrice) {
    console.log(`  Floor: ${bot.config.floorPrice.toExponential(6)} ETH`);
    console.log(`  Ceiling: ${bot.config.ceilingPrice.toExponential(6)} ETH`);
  } else {
    console.log(`  Range: ${chalk.yellow('Auto (based on current price)')}`);
  }
  console.log();

  // 3. Position Status
  const holdingPositions = bot.positions.filter(p => p.status === 'HOLDING');
  const emptyPositions = bot.positions.filter(p => p.status === 'EMPTY');
  const soldPositions = bot.positions.filter(p => p.status === 'SOLD');

  console.log(chalk.yellow('📊 Position Status:'));
  console.log(`  Total: ${bot.positions.length}`);
  console.log(`  ${chalk.green('● Holding')}: ${holdingPositions.length}`);
  console.log(`  ${chalk.gray('○ Empty')}: ${emptyPositions.length}`);
  console.log(`  ${chalk.blue('● Sold')}: ${soldPositions.length}`);
  console.log(`  Active/Max: ${holdingPositions.length}/${bot.config.maxActivePositions}`);
  console.log();

  // 4. Buy Settings
  console.log(chalk.yellow('💰 Buy Settings:'));
  if (bot.config.useFixedBuyAmount) {
    console.log(`  Mode: Fixed amount`);
    console.log(`  Amount: ${bot.config.buyAmount} ETH per buy`);
  } else {
    console.log(`  Mode: Auto-calculate`);
    console.log(`  Amount: Based on available balance`);
  }
  console.log(`  Moon Bag: ${bot.config.moonBagEnabled ? bot.config.moonBagPercent + '%' : 'Disabled'}`);
  console.log(`  Price Oracle: ${bot.config.usePriceOracle !== false ? chalk.green('Enabled') : chalk.red('Disabled')}`);
  console.log();

  // 5. Try to fetch current price and balances
  console.log(chalk.yellow('💵 Current State:'));
  try {
    const workingRpc = await getWorkingRpc(bot.chain || 'base');
    const { createPublicClient, http, formatEther } = await import('viem');
    const { erc20Abi } = await import('viem');
    const chainConfig = bot.chain === 'ethereum'
      ? (await import('viem/chains')).mainnet
      : (await import('viem/chains')).base;

    const publicClient = createPublicClient({
      chain: chainConfig,
      transport: http(workingRpc, { timeout: 5000 }),
    });

    // Get ETH balance
    const ethBalance = await publicClient.getBalance({
      address: bot.walletAddress as `0x${string}`,
    });
    const ethBalanceFormatted = Number(formatEther(ethBalance));
    console.log(`  ETH Balance: ${ethBalanceFormatted.toFixed(6)} ETH`);

    // Get token balance
    let tokenBalance = BigInt(0);
    let decimals = 18;
    try {
      decimals = await publicClient.readContract({
        address: bot.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'decimals',
      });
      tokenBalance = await publicClient.readContract({
        address: bot.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [bot.walletAddress as `0x${string}`],
      });
    } catch {
      // Token contract might not have standard decimals
    }
    const tokenBalanceFormatted = Number(tokenBalance) / Math.pow(10, decimals);
    console.log(`  Token Balance: ${tokenBalanceFormatted.toFixed(4)} ${bot.tokenSymbol}`);

    // Check if enough ETH for buys
    const minBuyAmount = bot.config.useFixedBuyAmount ? bot.config.buyAmount : 0.0001;
    if (ethBalanceFormatted < minBuyAmount) {
      console.log(chalk.red(`\n  ⚠️  WARNING: Low ETH balance!`));
      console.log(chalk.red(`      Need at least ${minBuyAmount} ETH for buys`));
    } else {
      const estimatedBuys = Math.floor(ethBalanceFormatted / minBuyAmount);
      console.log(chalk.green(`\n  ✓ Can execute ~${estimatedBuys} buys`));
    }

    console.log();

    // 6. Price Analysis
    console.log(chalk.yellow('📈 Price Analysis:'));
    const currentPrice = bot.currentPrice;
    if (currentPrice && currentPrice > 0) {
      console.log(`  Current Price: ${currentPrice.toExponential(6)} ETH`);

      if (bot.config.floorPrice && bot.config.ceilingPrice) {
        const inRange = currentPrice >= bot.config.floorPrice && currentPrice <= bot.config.ceilingPrice;
        if (inRange) {
          console.log(chalk.green(`  ✓ Price is WITHIN grid range`));

          // Find which position would buy at this price
          const buyPosition = bot.positions.find(p =>
            p.status === 'EMPTY' &&
            currentPrice >= p.buyMin &&
            currentPrice <= p.buyMax
          );

          if (buyPosition) {
            console.log(chalk.green(`  ✓ Position ${buyPosition.id} is ready to buy!`));
            console.log(`    Buy range: ${buyPosition.buyMin.toExponential(4)} - ${buyPosition.buyMax.toExponential(4)} ETH`);
          } else {
            console.log(chalk.yellow(`  ⚠ No empty position matches current price`));
            if (holdingPositions.length >= bot.config.maxActivePositions) {
              console.log(chalk.yellow(`  Reason: Max active positions reached (${bot.config.maxActivePositions})`));
            }
          }
        } else {
          console.log(chalk.red(`  ✗ Price is OUTSIDE grid range!`));
          if (currentPrice < bot.config.floorPrice) {
            console.log(chalk.red(`    Price is BELOW floor (${bot.config.floorPrice.toExponential(6)} ETH)`));
            console.log(chalk.yellow(`    Consider regenerating grid with lower floor`));
          } else {
            console.log(chalk.red(`    Price is ABOVE ceiling (${bot.config.ceilingPrice.toExponential(6)} ETH)`));
            console.log(chalk.yellow(`    Consider regenerating grid with higher ceiling`));
          }
        }
      } else {
        console.log(chalk.dim(`  Grid range: Auto-calculated (no floor/ceiling set)`));
      }
    } else {
      console.log(chalk.yellow(`  Current Price: Unknown (not fetched yet)`));
    }

  } catch (error: any) {
    console.log(chalk.red(`  Error fetching state: ${error.message}`));
  }

  console.log();

  // 7. Issues Summary
  console.log(chalk.yellow('🔍 Issues Summary:'));
  const issues: string[] = [];

  if (!bot.enabled) {
    issues.push(chalk.red('• Bot is DISABLED'));
  }
  if (!bot.isRunning) {
    issues.push(chalk.yellow('• Bot is not running'));
  }
  if (holdingPositions.length >= bot.config.maxActivePositions) {
    issues.push(chalk.yellow(`• Max active positions reached (${holdingPositions.length}/${bot.config.maxActivePositions})`));
  }

  if (issues.length === 0) {
    console.log(chalk.green('  ✓ No issues detected'));
  } else {
    issues.forEach(issue => console.log(`  ${issue}`));
  }

  console.log();

  // 8. Recommendations
  console.log(chalk.yellow('💡 Recommendations:'));
  const recommendations: string[] = [];

  if (!bot.enabled) {
    recommendations.push('Enable the bot to start trading');
  }
  if (!bot.isRunning && bot.enabled) {
    recommendations.push('Start the bot from the main menu');
  }
  if (holdingPositions.length >= bot.config.maxActivePositions) {
    recommendations.push('Wait for sells or increase maxActivePositions');
  }

  if (recommendations.length === 0) {
    console.log(chalk.green('  ✓ Bot should be trading normally'));
  } else {
    recommendations.forEach((rec, i) => console.log(`  ${i + 1}. ${rec}`));
  }

  console.log();
}

/**
 * System settings configuration
 */
async function systemSettings(storage: JsonStorage, heartbeatManager: HeartbeatManager) {
  console.log(chalk.cyan('\n⚙️  System Settings\n'));

  // Get current settings from storage
  const currentGasReserve = await storage.getConfig('gasReserveEth', 0.0005);
  const currentFallbackGas = await storage.getConfig('fallbackGasEstimate', 0.00001);
  const currentStrictMode = await storage.getConfig('strictProfitMode', true);
  const currentStrictPercent = await storage.getConfig('strictProfitPercent', 2);
  const currentSlippage = await storage.getConfig('slippageBps', 100);
  const currentRetryDelay = await storage.getConfig('retryDelaySeconds', 30);

  const { setting } = await inquirer.prompt([
    {
      type: 'list',
      name: 'setting',
      message: 'What would you like to configure?',
      choices: [
        { name: `⏱️  Heartbeat interval (current: ${heartbeatManager.getInterval()}ms)`, value: 'heartbeat' },
        { name: '📺 Live monitor refresh rate', value: 'monitor_refresh' },
        { name: `⛽ Gas reserve (current: ${currentGasReserve} ETH)`, value: 'gas_reserve' },
        { name: `🔧 Fallback gas estimate (current: ${currentFallbackGas} ETH)`, value: 'fallback_gas' },
        { name: `🔒 Strict profit mode (${currentStrictMode ? 'ON' : 'OFF'} ${currentStrictPercent}%)`, value: 'strict_profit' },
        { name: `📉 Slippage tolerance (${currentSlippage/100}%)`, value: 'slippage' },
        { name: `⏳ Retry delay (${currentRetryDelay}s)`, value: 'retry_delay' },
        { name: '📊 Default price oracle confidence', value: 'confidence' },
        { name: '🔔 Global notification settings', value: 'notifications' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (setting === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  if (setting === 'heartbeat') {
    const currentInterval = heartbeatManager.getInterval();
    console.log(chalk.dim(`\nCurrent heartbeat interval: ${currentInterval}ms`));
    console.log(chalk.dim(`Status: ${heartbeatManager.getStatus().isRunning ? 'Running' : 'Stopped'}\n`));

    const { interval } = await inquirer.prompt([
      {
        type: 'list',
        name: 'interval',
        message: 'Select new heartbeat interval:',
        choices: [
          { name: '1 second (fastest, more RPC calls)', value: 1000 },
          { name: '2 seconds (recommended)', value: 2000 },
          { name: '3 seconds (balanced)', value: 3000 },
          { name: '5 seconds (slower, fewer RPC calls)', value: 5000 },
          { name: '10 seconds (slowest, minimal RPC)', value: 10000 },
          { name: '⬅️  Back', value: 'back' },
        ],
      },
    ]);

    if (interval === 'back') {
      console.log(chalk.dim('\nCancelled.\n'));
      return;
    }

    // Apply immediately without restart
    heartbeatManager.updateInterval(interval);
    console.log(chalk.green(`\n✓ Heartbeat interval updated to ${interval}ms`));
    console.log(chalk.dim('Change applied immediately to all running bots.\n'));
  }

  if (setting === 'monitor_refresh') {
    console.log(chalk.cyan('\n📺 Live Monitor Refresh Rate\n'));
    console.log(chalk.dim('This controls how often the live monitor updates when auto-refresh is ON.'));
    console.log(chalk.dim('Note: Manual refresh is always available with the [R] key.\n'));

    const { refreshRate } = await inquirer.prompt([
      {
        type: 'list',
        name: 'refreshRate',
        message: 'Select monitor refresh rate:',
        choices: [
          { name: '1 second (real-time, more flicker)', value: 1000 },
          { name: '2 seconds (responsive)', value: 2000 },
          { name: '3 seconds (recommended)', value: 3000 },
          { name: '5 seconds (calm)', value: 5000 },
          { name: '10 seconds (minimal updates)', value: 10000 },
          { name: '⬅️  Back', value: 'back' },
        ],
      },
    ]);

    if (refreshRate === 'back') {
      console.log(chalk.dim('\nCancelled.\n'));
      return;
    }

    // Store in storage for persistence
    await storage.setConfig('monitorRefreshRate', refreshRate);
    console.log(chalk.green(`\n✓ Monitor refresh rate set to ${refreshRate}ms`));
    console.log(chalk.dim('Will apply to new monitor sessions.\n'));
  }

  if (setting === 'gas_reserve') {
    console.log(chalk.cyan('\n⛽ Gas Reserve Amount\n'));
    console.log(chalk.dim('This is the amount of ETH kept in reserve for gas fees.'));
    console.log(chalk.dim('It is subtracted from your balance when auto-calculating buy amounts.\n'));
    console.log(chalk.dim(`Current: ${currentGasReserve} ETH`));
    console.log(chalk.dim('Recommended: 0.0005 - 0.001 ETH for Base\n'));

    const { gasReserve } = await inquirer.prompt([
      {
        type: 'input',
        name: 'gasReserve',
        message: 'Enter gas reserve amount (ETH):',
        default: String(currentGasReserve),
        validate: (input) => {
          const val = parseFloat(input);
          return (!isNaN(val) && val >= 0) || 'Must be a positive number';
        },
      },
    ]);

    const newReserve = parseFloat(gasReserve);
    await storage.setConfig('gasReserveEth', newReserve);

    // Update all bots to use new reserve
    const bots = await storage.getAllBots();
    for (const bot of bots) {
      bot.config.gasReserveEth = newReserve;
      bot.lastUpdated = Date.now();
      await storage.saveBot(bot);
    }

    console.log(chalk.green(`\n✓ Gas reserve set to ${newReserve} ETH`));
    console.log(chalk.dim('Applied to all bots immediately.\n'));
  }

  if (setting === 'fallback_gas') {
    console.log(chalk.cyan('\n🔧 Fallback Gas Estimate\n'));
    console.log(chalk.dim('This is the estimated gas cost used when 0x API does not provide gas estimates.'));
    console.log(chalk.dim('Used for profitability calculations before executing sells.\n'));
    console.log(chalk.dim(`Current: ${currentFallbackGas} ETH`));
    console.log(chalk.dim('Recommended: 0.00001 - 0.00003 ETH for Base\n'));

    const { fallbackGas } = await inquirer.prompt([
      {
        type: 'input',
        name: 'fallbackGas',
        message: 'Enter fallback gas estimate (ETH):',
        default: String(currentFallbackGas),
        validate: (input) => {
          const val = parseFloat(input);
          return (!isNaN(val) && val > 0) || 'Must be a positive number';
        },
      },
    ]);

    const newFallbackGas = parseFloat(fallbackGas);
    await storage.setConfig('fallbackGasEstimate', newFallbackGas);

    // Update all bots to use new fallback
    const bots = await storage.getAllBots();
    for (const bot of bots) {
      bot.config.fallbackGasEstimate = newFallbackGas;
      bot.lastUpdated = Date.now();
      await storage.saveBot(bot);
    }

    console.log(chalk.green(`\n✓ Fallback gas estimate set to ${newFallbackGas} ETH`));
    console.log(chalk.dim('Applied to all bots immediately.\n'));
  }

  if (setting === 'strict_profit') {
    console.log(chalk.cyan('\n🔒 Strict Profit Mode\n'));
    console.log(chalk.dim('When enabled, sells only execute if ETH received >= (cost + gas) * (1 + profit%).'));
    console.log(chalk.dim('This guarantees a minimum profit on every trade after gas costs.\n'));

    const { strictMode } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'strictMode',
        message: 'Enable strict profit mode?',
        default: currentStrictMode,
      },
    ]);

    let strictPercent = currentStrictPercent;
    if (strictMode) {
      const { percent } = await inquirer.prompt([
        {
          type: 'number',
          name: 'percent',
          message: 'Minimum profit percent (after gas):',
          default: currentStrictPercent,
          validate: (input) => input >= 0 || 'Must be 0 or positive',
        },
      ]);
      strictPercent = percent;
    }

    await storage.setConfig('strictProfitMode', strictMode);
    await storage.setConfig('strictProfitPercent', strictPercent);

    // Update all bots
    const bots = await storage.getAllBots();
    for (const bot of bots) {
      bot.config.strictProfitMode = strictMode;
      bot.config.strictProfitPercent = strictPercent;
      bot.lastUpdated = Date.now();
      await storage.saveBot(bot);
    }

    console.log(chalk.green(`\n✓ Strict profit mode ${strictMode ? 'ENABLED' : 'DISABLED'}`));
    if (strictMode) {
      console.log(chalk.dim(`  Minimum profit: ${strictPercent}% after gas`));
    }
    console.log(chalk.dim('Applied to all bots immediately.\n'));
  }

  if (setting === 'slippage') {
    console.log(chalk.cyan('\n📉 Slippage Tolerance\n'));
    console.log(chalk.dim('Higher slippage = more likely to succeed but worse price.'));
    console.log(chalk.dim('Lower slippage = better price but may fail if market moves.\n'));
    console.log(chalk.dim(`Current: ${currentSlippage/100}% (${currentSlippage} bps)`));
    console.log(chalk.dim('Recommended: 1-3% for most tokens\n'));

    const { slippagePercent } = await inquirer.prompt([
      {
        type: 'number',
        name: 'slippagePercent',
        message: 'Slippage tolerance (%):',
        default: currentSlippage / 100,
        validate: (input) => input >= 0.1 && input <= 10 || 'Must be 0.1-10%',
      },
    ]);

    const newSlippageBps = Math.round(slippagePercent * 100);
    await storage.setConfig('slippageBps', newSlippageBps);

    // Update all bots
    const bots = await storage.getAllBots();
    for (const bot of bots) {
      bot.config.slippageBps = newSlippageBps;
      bot.lastUpdated = Date.now();
      await storage.saveBot(bot);
    }

    console.log(chalk.green(`\n✓ Slippage tolerance set to ${slippagePercent}%`));
    console.log(chalk.dim('Applied to all bots immediately.\n'));
  }

  if (setting === 'retry_delay') {
    console.log(chalk.cyan('\n⏳ Retry Delay\n'));
    console.log(chalk.dim('How long to wait after a failed trade before retrying.'));
    console.log(chalk.dim('Prevents rapid-fire retries that waste gas on reverting transactions.\n'));
    console.log(chalk.dim(`Current: ${currentRetryDelay} seconds`));
    console.log(chalk.dim('Recommended: 30-60 seconds\n'));

    const { retryDelay } = await inquirer.prompt([
      {
        type: 'number',
        name: 'retryDelay',
        message: 'Retry delay (seconds):',
        default: currentRetryDelay,
        validate: (input) => input >= 5 && input <= 300 || 'Must be 5-300 seconds',
      },
    ]);

    await storage.setConfig('retryDelaySeconds', retryDelay);

    // Update all bots
    const bots = await storage.getAllBots();
    for (const bot of bots) {
      bot.config.retryDelaySeconds = retryDelay;
      bot.lastUpdated = Date.now();
      await storage.saveBot(bot);
    }

    console.log(chalk.green(`\n✓ Retry delay set to ${retryDelay} seconds`));
    console.log(chalk.dim('Applied to all bots immediately.\n'));
  }

  if (setting === 'confidence') {
    const { confidence } = await inquirer.prompt([
      {
        type: 'list',
        name: 'confidence',
        message: 'Select minimum price confidence:',
        choices: [
          { name: '60% (less strict, more trades)', value: 0.6 },
          { name: '70% (balanced)', value: 0.7 },
          { name: '80% (recommended)', value: 0.8 },
          { name: '90% (strict, fewer trades)', value: 0.9 },
          { name: '95% (very strict)', value: 0.95 },
          { name: '⬅️  Back', value: 'back' },
        ],
      },
    ]);

    if (confidence === 'back') {
      console.log(chalk.dim('\nCancelled.\n'));
      return;
    }

    // Update all bots
    const bots = await storage.getAllBots();
    for (const bot of bots) {
      bot.config.minPriceConfidence = confidence;
      bot.lastUpdated = Date.now();
      await storage.saveBot(bot);
    }

    console.log(chalk.green(`\n✓ Price confidence set to ${(confidence * 100).toFixed(0)}% for all bots`));
    console.log(chalk.dim('Running bots will apply on next price check.\n'));
  }

  if (setting === 'notifications') {
    const notificationService = NotificationService.getInstance();
    const isConfigured = notificationService.isConfigured();

    console.log(chalk.cyan('\n🔔 Global Notification Settings\n'));
    console.log(`Current Status: ${isConfigured ? chalk.green('Configured') : chalk.yellow('Not configured')}`);

    if (isConfigured) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '🔕 Disable notifications', value: 'disable' },
            { name: '📋 View current config', value: 'view' },
            { name: '⬅️  Back', value: 'back' },
          ],
        },
      ]);

      if (action === 'disable') {
        // Note: Can't truly disable without storing in config
        // This is a placeholder for future implementation
        console.log(chalk.yellow('\nNote: Use "Configure Telegram" from main menu to change settings.\n'));
      } else if (action === 'view') {
        console.log(chalk.dim('\nView notification config in .env file\n'));
      }
    } else {
      console.log(chalk.yellow('\nNotifications not configured.'));
      console.log(chalk.dim('Use "🔔 Configure Telegram" from the main menu to set up.\n'));
    }
  }
}

/**
 * Run token screener for grid trading candidates
 */
async function runTokenScreener() {
  console.log(chalk.cyan('\n🎯 Token Discovery Options\n'));
  
  const { discoveryType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'discoveryType',
      message: 'Choose token discovery source:',
      choices: [
        { name: '📋  Known + Trending (Recommended)', value: 'known' },
        { name: '🔥  Trending (Top Boosted)', value: 'trending' },
        { name: '✨  Latest Profiles', value: 'latest' },
        { name: '🚀  Community Takeovers', value: 'community' },
        { name: '📢  Advertised', value: 'ads' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);
  
  if (discoveryType === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }
  
  try {
    await runScreener(discoveryType);
  } catch (error: any) {
    console.error(chalk.red('Screener error:', error.message));
  }
}

/**
 * View complete grid positions for a bot
 */
async function viewGridPositions(storage: JsonStorage) {
  console.log(chalk.cyan('\n🧮 View Grid Positions\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found.\n'));
    return;
  }

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to view grid:',
      choices: [
        ...bots.map(b => ({
          name: `${b.name} (${b.tokenSymbol}) - ${b.positions.length} positions`,
          value: b.id,
        })),
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (botId === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
  }

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  console.log(chalk.cyan(`\n📊 ${chalk.bold(bot.name)} - Complete Grid Overview\n`));
  
  // Bot Summary
  console.log(chalk.yellow('Bot Configuration:'));
  console.log(`  Token: ${bot.tokenSymbol} (${bot.tokenAddress})`);
  console.log(`  Total Positions: ${bot.config.numPositions}`);
  console.log(`  Take Profit: ${bot.config.takeProfitPercent}%`);
  console.log(`  Max Active: ${bot.config.maxActivePositions}`);
  if (bot.config.floorPrice && bot.config.ceilingPrice) {
    console.log(`  Floor: ${bot.config.floorPrice.toExponential(6)} ETH`);
    console.log(`  Ceiling: ${bot.config.ceilingPrice.toExponential(6)} ETH`);
  }
  console.log();

  // Current Price
  if (bot.currentPrice && bot.currentPrice > 0) {
    console.log(chalk.yellow('Current Market:'));
    console.log(`  Price: ${bot.currentPrice.toExponential(6)} ETH`);
    console.log();
  }

  // Sort positions by buy price (highest first)
  const sortedPositions = [...bot.positions].sort((a, b) => b.buyPrice - a.buyPrice);

  // Full Position Table
  console.log(chalk.yellow('All Positions (sorted by buy price, highest first):'));
  console.log(chalk.dim('─'.repeat(100)));
  console.log(
    chalk.dim(
      '  ID  '.padEnd(6) +
      'Status    '.padEnd(10) +
      'Buy Range (ETH)          '.padEnd(26) +
      'Buy@        '.padEnd(12) +
      'Sell@       '.padEnd(12) +
      'Tokens      '.padEnd(14) +
      'ETH Cost'
    )
  );
  console.log(chalk.dim('─'.repeat(100)));

  for (const pos of sortedPositions) {
    const id = String(pos.id).padStart(3, ' ').padEnd(6, ' ');
    
    let status: string;
    let statusColor: (s: string) => string;
    switch (pos.status) {
      case 'HOLDING':
        status = 'HOLDING';
        statusColor = chalk.green;
        break;
      case 'SOLD':
        status = 'SOLD  ';
        statusColor = chalk.blue;
        break;
      default:
        status = 'EMPTY ';
        statusColor = chalk.gray;
    }

    const buyRange = `${pos.buyMin.toExponential(3)}-${pos.buyMax.toExponential(3)}`.padEnd(25, ' ');
    const buyAt = pos.buyPrice.toExponential(4).padEnd(12, ' ');
    const sellAt = pos.sellPrice.toExponential(4).padEnd(12, ' ');
    
    const tokens = pos.tokensReceived 
      ? (Number(pos.tokensReceived) / 1e18).toFixed(4).padEnd(14, ' ')
      : chalk.gray('-'.padEnd(14, ' '));
    
    const ethCost = pos.ethCost 
      ? (Number(pos.ethCost) / 1e18).toFixed(6).padEnd(10, ' ')
      : chalk.gray('-'.padEnd(10, ' '));

    // Highlight positions near current price
    let highlight = '';
    if (bot.currentPrice && pos.status === 'EMPTY') {
      if (bot.currentPrice >= pos.buyMin && bot.currentPrice <= pos.buyMax) {
        highlight = chalk.yellow(' ← CURRENT PRICE IN RANGE');
      }
    }

    console.log(`  ${id}${statusColor(status)} ${buyRange} ${buyAt} ${sellAt} ${tokens} ${ethCost}${highlight}`);
  }

  console.log(chalk.dim('─'.repeat(100)));
  console.log();

  // Position Summary
  const holding = bot.positions.filter(p => p.status === 'HOLDING');
  const sold = bot.positions.filter(p => p.status === 'SOLD');
  const empty = bot.positions.filter(p => p.status === 'EMPTY');

  console.log(chalk.yellow('Position Summary:'));
  console.log(`  ${chalk.green('HOLDING')}: ${holding.length} positions`);
  console.log(`  ${chalk.gray('EMPTY')}: ${empty.length} positions`);
  console.log(`  ${chalk.blue('SOLD')}: ${sold.length} positions`);
  console.log();

  // Holding positions detail
  if (holding.length > 0) {
    console.log(chalk.yellow('Holding Positions Detail:'));
    for (const pos of holding) {
      const tokens = pos.tokensReceived ? (Number(pos.tokensReceived) / 1e18).toFixed(6) : '0';
      const cost = pos.ethCost ? (Number(pos.ethCost) / 1e18).toFixed(6) : '0';
      const buyDate = pos.buyTimestamp ? new Date(pos.buyTimestamp).toLocaleDateString() : 'Unknown';
      
      console.log(`  Position ${pos.id}:`);
      console.log(`    Tokens: ${tokens} ${bot.tokenSymbol}`);
      console.log(`    Cost: ${cost} ETH @ ${pos.buyPrice.toExponential(6)} ETH/token`);
      console.log(`    Target Sell: ${pos.sellPrice.toExponential(6)} ETH/token`);
      console.log(`    Buy Date: ${buyDate}`);
      if (pos.buyTxHash) {
        console.log(`    TX: ${pos.buyTxHash.slice(0, 20)}...`);
      }
      console.log();
    }
  }

  // Next actions
  console.log(chalk.yellow('Next Actions:'));
  const nextBuy = empty
    .filter(p => !bot.currentPrice || p.buyMax < bot.currentPrice)
    .sort((a, b) => b.buyPrice - a.buyPrice)[0];
  
  const nextSell = holding
    .sort((a, b) => a.sellPrice - b.sellPrice)[0];

  if (nextBuy) {
    console.log(`  Next Buy: Position ${nextBuy.id} @ ${nextBuy.buyMin.toExponential(4)}-${nextBuy.buyMax.toExponential(4)} ETH`);
  }
  if (nextSell) {
    console.log(`  Next Sell: Position ${nextSell.id} @ ${nextSell.sellPrice.toExponential(4)} ETH`);
  }
  if (!nextBuy && !nextSell) {
    console.log('  No pending actions');
  }
  console.log();
}

/**
 * Show daemon status
 */
async function showDaemonStatus() {
  console.log(chalk.cyan('\n👁️  Daemon Status\n'));

  const daemon = new BotDaemon();
  const status = daemon.getStatus();

  if (status.running) {
    console.log(chalk.green('✓ Daemon is RUNNING'));
    console.log(`  PID: ${status.pid}`);
    if (status.uptime) {
      console.log(`  Uptime: ${status.uptime}`);
    }
    console.log(chalk.dim('\nBots will continue trading even if you exit the CLI.\n'));
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Daemon actions:',
        choices: [
          { name: '📋 View recent logs', value: 'logs' },
          { name: '🔄 Restart daemon', value: 'restart' },
          { name: '⏹️  Stop daemon', value: 'stop' },
          { name: '⬅️  Back', value: 'back' },
        ],
      },
    ]);

    if (action === 'logs') {
      console.log(chalk.dim('\n--- Recent Daemon Logs ---\n'));
      console.log(daemon.getLogs(30));
      console.log(chalk.dim('\n--- End of Logs ---\n'));
    } else if (action === 'restart') {
      daemon.restart();
      console.log(chalk.yellow('\n🔄 Daemon restarting...\n'));
    } else if (action === 'stop') {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: chalk.red('Stop the daemon? All bots will stop trading.'),
          default: false,
        },
      ]);
      if (confirm) {
        daemon.stop();
        console.log(chalk.yellow('\n⏹️  Daemon stopped\n'));
      }
    }
  } else {
    console.log(chalk.yellow('○ Daemon is NOT RUNNING'));
    console.log(chalk.dim('\nBots will only trade while the CLI is open.\n'));
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Daemon actions:',
        choices: [
          { name: '▶️  Start daemon', value: 'start' },
          { name: '⬅️  Back', value: 'back' },
        ],
      },
    ]);

    if (action === 'start') {
      const success = daemon.start();
      if (success) {
        console.log(chalk.green('\n▶️  Daemon started\n'));
        console.log(chalk.dim('Bots will now continue trading in the background.\n'));
      } else {
        console.log(chalk.red('\n✗ Failed to start daemon\n'));
      }
    }
  }
}

// Start the application
main().catch(console.error);
