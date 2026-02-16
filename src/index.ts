#!/usr/bin/env node
// src/index.ts - Main CLI entry point

import chalk from 'chalk';
import inquirer from 'inquirer';
import { WalletManager } from './wallet/WalletManager';
import { ZeroXApi } from './api/ZeroXApi';
import { JsonStorage } from './storage/JsonStorage';
import { HeartbeatManager } from './bot/HeartbeatManager';
import { GridCalculator } from './grid/GridCalculator';
import { BotInstance, GridConfig } from './types';
import { parseEther, formatEther, createPublicClient } from 'viem';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.BASE_RPC_URL || 'https://base.llamarpc.com';
const ZEROX_API_KEY = process.env.ZEROX_API_KEY;

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
          { name: '▶️  Start bot(s)', value: 'start' },
          { name: '⏹️  Stop bot(s)', value: 'stop' },
          { name: '📊 View status', value: 'status' },
          { name: '💰 Fund wallet', value: 'fund' },
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
        case 'status':
          await showStatus(heartbeatManager, storage);
          break;
        case 'fund':
          await fundWallet(walletManager, storage);
          break;
        case 'reclaim':
          await reclaimFunds(walletManager, storage);
          break;
        case 'delete':
          await deleteBot(heartbeatManager, storage);
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
    moonBagEnabled: true,
    moonBagPercent: 1,
    minProfitPercent: 2,
    maxActivePositions: answers.maxActivePositions,
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

  const choices = bots.map(b => ({ name: `${b.name} (${b.tokenSymbol})`, value: b.id }));
  choices.unshift({ name: 'All bots', value: 'all' });

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to start:',
      choices,
    },
  ]);

  if (botId === 'all') {
    for (const bot of bots) {
      if (!bot.isRunning) {
        await heartbeatManager.addBot(bot);
      }
    }
  } else {
    const bot = bots.find(b => b.id === botId);
    if (bot && !bot.isRunning) {
      await heartbeatManager.addBot(bot);
    }
  }

  heartbeatManager.start();
  console.log(chalk.green('\n✓ Bot(s) started\n'));
}

async function stopBot(heartbeatManager: HeartbeatManager, storage: JsonStorage) {
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

async function showStatus(heartbeatManager: HeartbeatManager, storage: JsonStorage) {
  const stats = await storage.getGlobalStats();
  const status = heartbeatManager.getStatus();

  console.log(chalk.cyan('\n📊 System Status\n'));
  console.log(`Heartbeat: ${status.isRunning ? chalk.green('RUNNING') : chalk.red('STOPPED')}`);
  console.log(`Total bots: ${stats.totalBots}`);
  console.log(`Running: ${stats.runningBots}`);
  console.log(`Total profit: ${formatEther(BigInt(stats.totalProfitEth))} ETH`);
  console.log(`Total trades: ${stats.totalTrades}\n`);

  if (status.bots.length > 0) {
    console.log(chalk.cyan('Active Bots:\n'));
    for (const bot of status.bots) {
      console.log(`  ${bot.name}: ${bot.isRunning ? chalk.green('●') : chalk.red('○')} ${new Date(bot.lastHeartbeat).toLocaleTimeString()}`);
    }
    console.log();
  }
}

async function fundWallet(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n💰 Fund Bot Wallet\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found. Create one first.\n'));
    return;
  }

  const { botId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'botId',
      message: 'Select bot to fund:',
      choices: bots.map(b => ({ name: `${b.name} (${b.walletAddress.slice(0, 10)}...)`, value: b.id })),
    },
  ]);

  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

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
    const { createWalletClient, http, parseEther } = await import('viem');
    const { base } = await import('viem/chains');

    const mainAccount = walletManager.getMainAccount();
    const walletClient = createWalletClient({
      account: mainAccount,
      chain: base,
      transport: http(RPC_URL),
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
      transport: http(RPC_URL),
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(chalk.green('✓ Funded successfully!\n'));

  } catch (error: any) {
    console.log(chalk.red(`\n✗ Funding failed: ${error.message}\n`));
  }
}

async function reclaimFunds(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n🏧 Reclaim Funds\n'));

  const bots = await storage.getAllBots();
  if (bots.length === 0) {
    console.log(chalk.yellow('No bots found.\n'));
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
      ],
    },
  ]);

  const mainWallet = await storage.getMainWallet();
  if (!mainWallet) {
    console.log(chalk.red('No main wallet found.\n'));
    return;
  }

  console.log(chalk.yellow(`\n⚠️  This will:`));
  console.log(chalk.yellow(`  1. Sell all tokens for ETH`));
  console.log(chalk.yellow(`  2. Send all ETH to main wallet: ${mainWallet.address}`));

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

  console.log(chalk.dim('\nStarting reclaim process...'));
  console.log(chalk.yellow('Note: Full reclaim implementation requires TradingBot integration'));
  console.log(chalk.dim('This is a skeleton - wire up to TradingBot.sellAll() for full functionality\n'));
}

async function deleteBot(heartbeatManager: HeartbeatManager, storage: JsonStorage) {
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
      choices: bots.map(b => ({ name: b.name, value: b.id })),
    },
  ]);

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
    console.log(chalk.green('\n✓ Bot deleted\n'));
  }
}

main().catch(console.error);
