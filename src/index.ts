#!/usr/bin/env node
// src/index.ts - Main CLI entry point

import chalk from 'chalk';
import inquirer from 'inquirer';
import { WalletManager } from './wallet/WalletManager.js';
import { ZeroXApi } from './api/ZeroXApi.js';
import { JsonStorage } from './storage/JsonStorage.js';
import { HeartbeatManager } from './bot/HeartbeatManager.js';
import { GridCalculator } from './grid/GridCalculator.js';
import { BotInstance, GridConfig, Position } from './types/index.js';
import { formatEther, createPublicClient, formatUnits } from 'viem';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.BASE_RPC_URL || 'https://base.llamarpc.com';
const ZEROX_API_KEY = process.env.ZEROX_API_KEY;

// Fallback RPC endpoints for resilience
const RPC_FALLBACKS = [
  'https://base.llamarpc.com',
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://base.drpc.org',
  'https://1rpc.io/base',
];

// Track working RPC
let currentRpcUrl = RPC_URL;
let lastSuccessfulRpcIndex = 0;

/**
 * Get a working RPC URL with fallback support
 */
async function getWorkingRpc(): Promise<string> {
  // First try the current/preferred RPC
  const rpcsToTry = [currentRpcUrl, ...RPC_FALLBACKS.filter(r => r !== currentRpcUrl)];
  
  for (let i = 0; i < rpcsToTry.length; i++) {
    const rpc = rpcsToTry[i];
    try {
      const { createPublicClient, http } = await import('viem');
      const { base } = await import('viem/chains');
      
      const client = createPublicClient({
        chain: base,
        transport: http(rpc),
      });
      
      // Test connection with a simple block number request
      await client.getBlockNumber();
      
      // Success! Update current RPC
      currentRpcUrl = rpc;
      lastSuccessfulRpcIndex = i;
      
      if (i > 0) {
        console.log(chalk.green(`✓ Switched to working RPC: ${rpc}`));
      }
      
      return rpc;
    } catch (error) {
      console.log(chalk.yellow(`⚠ RPC failed: ${rpc}`));
      continue;
    }
  }
  
  // All RPCs failed, return default and let it fail later with proper error
  console.log(chalk.red('✗ All RPC endpoints failed. Using default.'));
  return RPC_URL;
}

console.log(chalk.cyan.bold('\n🤖 Base Grid Trading Bot\n'));

async function main() {
  const storage = new JsonStorage('./bots.json');
  await storage.init();

  const walletManager = new WalletManager();
  const zeroXApi = new ZeroXApi(ZEROX_API_KEY);
  const heartbeatManager = new HeartbeatManager(
    walletManager,
    zeroXApi,
    storage,
    RPC_URL
  );

  // Load existing bots
  await heartbeatManager.loadBots();

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
          { name: '💰 Fund wallet', value: 'fund' },
          { name: '👛 View wallet balances', value: 'view_balances' },
          { name: '📤 Send ETH to external', value: 'send_external' },
          { name: '🪙 Send tokens to external', value: 'send_tokens' },
          { name: '🔧 Manage wallets', value: 'manage_wallets' },
          { name: '🏧 Reclaim funds', value: 'reclaim' },
          { name: '🗑️  Delete bot', value: 'delete' },
          { name: '❌ Exit', value: 'exit' },
        ],
      },
    ]);

    if (action === 'exit') break;

    try {
      switch (action) {
        case 'create':
          await createBot(storage, walletManager);
          break;
        case 'start':
          await startBot(heartbeatManager, storage);
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
        case 'reclaim':
          await reclaimFunds(walletManager, storage);
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
    walletManager.importData({ mainWallet, walletDictionary: await storage.getWalletDictionary() });
  }

  // Bot configuration
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Bot name:',
      default: `Bot-${Date.now()}`,
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
    },
    {
      type: 'confirm',
      name: 'autoPriceRange',
      message: 'Auto-calculate price range (floor=1/10 current, ceiling=4x)?',
      default: true,
    },
    {
      type: 'number',
      name: 'takeProfitPercent',
      message: 'Take profit % per position:',
      default: 8,
    },
    {
      type: 'number',
      name: 'maxActivePositions',
      message: 'Max active positions:',
      default: 4,
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

  // Create config
  const config: GridConfig = {
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
    heartbeatMs: 1000,
    skipHeartbeats: 0,
  };

  // Generate grid
  const currentPrice = 0.000001; // Placeholder - would fetch real price
  const positions = GridCalculator.generateGrid(currentPrice, config);

  // Create instance
  const instance: BotInstance = {
    id: randomUUID(),
    name: answers.name,
    tokenAddress: answers.tokenAddress,
    tokenSymbol: answers.tokenSymbol,
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
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };

  await storage.saveBot(instance);
  console.log(chalk.green(`\n✓ Bot "${answers.name}" created with ${positions.length} positions`));
  console.log(chalk.cyan(`  Wallet: ${botWalletAddress}`));

  if (answers.startImmediately) {
    console.log(chalk.yellow('\n⚠️  Fund the wallet with ETH before starting'));
  }
}

async function startBot(heartbeatManager: HeartbeatManager, storage: JsonStorage) {
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

  if (botId === 'all') {
    for (const bot of enabledBots) {
      if (!bot.isRunning) {
        await heartbeatManager.addBot(bot);
      }
    }
  } else {
    const bot = enabledBots.find(b => b.id === botId);
    if (bot && !bot.isRunning) {
      await heartbeatManager.addBot(bot);
    }
  }

  heartbeatManager.start();
  console.log(chalk.green('\n✓ Bot(s) started\n'));
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
  const stats = await storage.getGlobalStats();
  const status = heartbeatManager.getStatus();
  const bots = await storage.getAllBots();

  console.log(chalk.cyan('\n📊 System Status\n'));
  console.log(`Heartbeat: ${status.isRunning ? chalk.green('RUNNING') : chalk.red('STOPPED')}`);
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
      const buyAmountInfo = bot.config.useFixedBuyAmount 
        ? chalk.dim(`[${bot.config.buyAmount} ETH/buy]`) 
        : chalk.dim('[auto-buy]');
      
      console.log(`  ${enabledStatus} ${bot.name}: ${runningStatus} ${buyAmountInfo} ${!bot.enabled ? chalk.red('[DISABLED]') : ''}`);
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
        
        // Show active positions
        const holdingPositions = bot.positions.filter(p => p.status === 'HOLDING').length;
        if (holdingPositions > 0) {
          console.log(`     Active Positions: ${holdingPositions}/${bot.config.maxActivePositions}`);
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
  console.log(chalk.dim('Press Ctrl+C or wait 30 seconds to return to menu\n'));

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

  // Get working RPC
  const workingRpc = await getWorkingRpc();
  const { createPublicClient, http, formatEther, formatUnits } = await import('viem');
  const { base } = await import('viem/chains');
  const { erc20Abi } = await import('viem');

  const publicClient = createPublicClient({
    chain: base,
    transport: http(workingRpc),
  });

  let refreshCount = 0;
  const maxRefreshes = 30; // Run for 30 seconds (1 refresh per second)

  const interval = setInterval(async () => {
    refreshCount++;
    if (refreshCount > maxRefreshes) {
      clearInterval(interval);
      console.log(chalk.dim('\nMonitor session ended. Returning to menu...\n'));
      return;
    }

    // Clear screen (ANSI escape code)
    console.log('\x1Bc');

    // Header
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold(`║  🤖 BASE GRID BOT MONITOR                ${timestamp}    ║`));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════════╝'));
    console.log();

    // System Overview
    const status = heartbeatManager.getStatus();
    console.log(chalk.yellow('📊 SYSTEM OVERVIEW'));
    console.log(chalk.yellow('─'.repeat(64)));
    console.log(`  Heartbeat: ${status.isRunning ? chalk.green('● RUNNING') : chalk.red('○ STOPPED')}`);
    console.log(`  Active Bots: ${chalk.green(status.totalBots.toString())} / ${enabledBots.length} enabled`);
    console.log(`  RPC: ${chalk.dim(workingRpc.slice(0, 40))}...`);
    console.log();

    // Bot Details
    for (let i = 0; i < enabledBots.length; i++) {
      const bot = enabledBots[i];
      const isActive = bot.isRunning;

      // Bot header
      const botStatus = isActive ? chalk.green('● LIVE') : chalk.gray('○ IDLE');
      console.log(chalk.cyan(`📈 BOT ${i + 1}/${enabledBots.length}: ${chalk.bold(bot.name)} ${botStatus}`));
      console.log(chalk.cyan('─'.repeat(64)));

      // Basic Info
      console.log(`  Token: ${chalk.yellow(bot.tokenSymbol)} ${chalk.dim(`(${bot.tokenAddress.slice(0, 12)}...)`)}`);
      console.log(`  Wallet: ${chalk.dim(bot.walletAddress)}`);

      // Fetch balances
      try {
        const ethBalance = await publicClient.getBalance({
          address: bot.walletAddress as `0x${string}`,
        });
        console.log(`  ETH Balance: ${chalk.green(formatEther(ethBalance) + ' ETH')}`);

        // Token balance
        let decimals = 18;
        try {
          decimals = await publicClient.readContract({
            address: bot.tokenAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: 'decimals',
          });
        } catch {}

        const tokenBalance = await publicClient.readContract({
          address: bot.tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [bot.walletAddress as `0x${string}`],
        });
        console.log(`  Token Balance: ${chalk.green(formatUnits(tokenBalance, decimals) + ' ' + bot.tokenSymbol)}`);
      } catch {
        console.log(chalk.dim('  Balance: Unable to fetch'));
      }

      // Grid Info
      const holdingPositions = bot.positions.filter(p => p.status === 'HOLDING');
      const emptyPositions = bot.positions.filter(p => p.status === 'EMPTY');
      const soldPositions = bot.positions.filter(p => p.status === 'SOLD');

      console.log();
      console.log(chalk.magenta('  📊 GRID STATUS'));
      console.log(`    Positions: ${chalk.green(holdingPositions.length + ' holding')} | ` +
                  `${chalk.yellow(emptyPositions.length + ' empty')} | ` +
                  `${chalk.blue(soldPositions.length + ' sold')} / ` +
                  `${bot.positions.length} total`);

      // Next Buy Point
      const nextBuyPosition = emptyPositions
        .filter(p => p.buyPrice <= (bot.currentPrice * 1.1)) // Within 10% of current price
        .sort((a, b) => b.buyPrice - a.buyPrice)[0]; // Highest buy price first

      if (nextBuyPosition) {
        console.log(`    Next Buy:  ${chalk.green(nextBuyPosition.buyPrice.toFixed(8))} ETH ` +
                    chalk.dim(`(${(nextBuyPosition.buyPrice * 1000000).toFixed(2)}µ)`));
      } else {
        console.log(`    Next Buy:  ${chalk.dim('None in range')}`);
      }

      // Next Sell Point
      const nextSellPosition = holdingPositions
        .sort((a, b) => a.sellPrice - b.sellPrice)[0]; // Lowest sell price first

      if (nextSellPosition) {
        console.log(`    Next Sell: ${chalk.yellow(nextSellPosition.sellPrice.toFixed(8))} ETH ` +
                    chalk.dim(`(${(nextSellPosition.sellPrice * 1000000).toFixed(2)}µ)`));
        const profit = ((nextSellPosition.sellPrice - nextSellPosition.buyPrice) / nextSellPosition.buyPrice * 100);
        console.log(`             ${chalk.dim(`Profit: +${profit.toFixed(1)}%`)}`);
      } else {
        console.log(`    Next Sell: ${chalk.dim('No positions holding')}`);
      }

      // Current Price
      console.log(`    Cur Price: ${chalk.cyan(bot.currentPrice.toFixed(8))} ETH ` +
                  chalk.dim(`(${(bot.currentPrice * 1000000).toFixed(2)}µ)`));

      // Performance
      if (bot.totalBuys > 0 || bot.totalSells > 0) {
        console.log();
        console.log(chalk.magenta('  💰 PERFORMANCE'));
        console.log(`    Buys: ${bot.totalBuys} | Sells: ${bot.totalSells}`);
        console.log(`    Profit: ${chalk.green(formatEther(BigInt(bot.totalProfitEth)) + ' ETH')}`);
      }

      // Config Summary
      console.log();
      console.log(chalk.dim(`  ⚙️  ${bot.config.numPositions}pos | ${bot.config.takeProfitPercent}%tp | ` +
                  `${bot.config.maxActivePositions}max | ${bot.config.moonBagPercent}%moon`));

      console.log();
    }

    // Footer
    console.log(chalk.dim('─'.repeat(64)));
    console.log(chalk.dim(`  Auto-refresh: ${refreshCount}/${maxRefreshes}s | Press Ctrl+C to exit`));
    console.log();

  }, 1000); // Refresh every second

  // Wait for the interval to finish
  await new Promise(resolve => setTimeout(resolve, (maxRefreshes + 2) * 1000));
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
        return viewWalletBalances(storage); // Retry with new RPC
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
    walletManager.importData({ 
      mainWallet, 
      walletDictionary: await storage.getWalletDictionary(),
      primaryWalletId: await storage.getPrimaryWalletId()
    });
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
    walletManager.importData({ mainWallet, walletDictionary: await storage.getWalletDictionary() });
  } catch (error: any) {
    console.log(chalk.red(`\n✗ Invalid password: ${error.message}\n`));
    return;
  }

  // Get all wallets (main + bots)
  const allWallets = [
    { name: 'Main Wallet', address: mainWallet.address },
    ...Object.entries(await storage.getWalletDictionary()).map(([id, wallet]) => ({
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
    const { createWalletClient, http, parseEther } = await import('viem');
    const { base } = await import('viem/chains');

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
    walletManager.importData({ mainWallet, walletDictionary: await storage.getWalletDictionary() });
  } catch (error: any) {
    console.log(chalk.red(`\n✗ Invalid password: ${error.message}\n`));
    return;
  }

  // Get all wallets (main + bots)
  const allWallets = [
    { name: 'Main Wallet', address: mainWallet.address, id: 'main' },
    ...Object.entries(await storage.getWalletDictionary()).map(([id, wallet]) => ({
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
        { name: '🔄 Regenerate positions (preserve balances)', value: 'regenerate' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') {
    console.log(chalk.dim('\nCancelled.\n'));
    return;
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
    console.log(chalk.yellow('\n⚠️  Regenerating positions with balance preservation...\n'));

    // Store current holding positions
    const holdingPositions = bot.positions.filter(p => p.status === 'HOLDING' && p.tokensReceived);
    
    if (holdingPositions.length > 0) {
      console.log(chalk.cyan(`Found ${holdingPositions.length} positions with balances to preserve`));
      for (const pos of holdingPositions) {
        console.log(`  Position ${pos.id}: ${pos.tokensReceived} tokens @ buy ${pos.buyPrice}, sell ${pos.sellPrice}`);
      }
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Regenerate ${bot.config.numPositions} positions while preserving ${holdingPositions.length} balances?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.dim('Cancelled.\n'));
      return;
    }

    // Get current price (use stored or fetch)
    const currentPrice = bot.currentPrice || 0.000001;
    
    // Generate new grid
    const newPositions = GridCalculator.generateGrid(currentPrice, bot.config);

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
        const combinedPosition: Position = {
          id: 0,
          buyPrice: sortedHolding[0].buyPrice,
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
          // Find closest new position with buy price >= holding buy price
          const targetIndex = newPositions.findIndex(p => p.buyPrice <= holdingPos.buyPrice);
          
          if (targetIndex >= 0) {
            // Preserve the holding position data but update ID
            newPositions[targetIndex] = {
              ...holdingPos,
              id: newPositions[targetIndex].id,
              // Keep original sell price if higher than new grid's sell price
              sellPrice: Math.max(holdingPos.sellPrice, newPositions[targetIndex].sellPrice),
            };
            console.log(`  ✓ Position ${holdingPos.id} → new position ${newPositions[targetIndex].id}`);
          } else {
            // No suitable position found - add to lowest position
            const lowestIndex = newPositions.length - 1;
            const existingTokens = BigInt(newPositions[lowestIndex].tokensReceived || '0');
            const holdingTokens = BigInt(holdingPos.tokensReceived || '0');
            const existingCost = BigInt(newPositions[lowestIndex].ethCost || '0');
            const holdingCost = BigInt(holdingPos.ethCost || '0');
            
            newPositions[lowestIndex] = {
              ...holdingPos,
              id: newPositions[lowestIndex].id,
              tokensReceived: (existingTokens + holdingTokens).toString(),
              ethCost: (existingCost + holdingCost).toString(),
              sellPrice: Math.max(holdingPos.sellPrice, newPositions[lowestIndex].sellPrice),
            };
            console.log(`  ✓ Position ${holdingPos.id} → merged into lowest position`);
          }
        }
      }
    }

    // Update bot with new positions
    bot.positions = newPositions;
    bot.lastUpdated = Date.now();
    await storage.saveBot(bot);

    console.log(chalk.green('\n✓ Positions regenerated successfully'));
    console.log(chalk.cyan(`  Total positions: ${newPositions.length}`));
    console.log(chalk.cyan(`  Holding positions preserved: ${holdingPositions.length}`));
    console.log(chalk.cyan(`  Empty positions: ${newPositions.filter(p => p.status === 'EMPTY').length}\n`));
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

main().catch(console.error);
