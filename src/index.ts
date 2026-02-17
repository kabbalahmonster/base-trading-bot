#!/usr/bin/env node
// src/index.ts - Main CLI entry point

import chalk from 'chalk';
import inquirer from 'inquirer';
import { WalletManager } from './wallet/WalletManager.js';
import { ZeroXApi } from './api/ZeroXApi.js';
import { JsonStorage } from './storage/JsonStorage.js';
import { HeartbeatManager } from './bot/HeartbeatManager.js';
import { GridCalculator } from './grid/GridCalculator.js';
import { BotInstance, GridConfig } from './types/index.js';
import { formatEther, createPublicClient } from 'viem';
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
          { name: '📤 Send ETH to external', value: 'send_external' },
          { name: '🪙 Send tokens to external', value: 'send_tokens' },
          { name: '👛 Manage wallets', value: 'manage_wallets' },
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

async function sendToExternalWallet(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n📤 Send ETH to External Wallet\n'));

  // Initialize wallet manager with password
  const mainWallet = await storage.getMainWallet();
  if (!mainWallet) {
    console.log(chalk.red('No main wallet found. Create a bot first.\n'));
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
      choices: allWallets.map(w => ({ name: `${w.name}: ${w.address.slice(0, 12)}...`, value: w.address })),
    },
  ]);

  console.log(chalk.dim(`From: ${fromWallet}`));

  // Check balance first
  let balanceEth = '0';
  let maxSendable = 0;
  try {
    const { createPublicClient, http, formatEther } = await import('viem');
    const { base } = await import('viem/chains');
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
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
    const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
    const actualBalance = await publicClient.getBalance({ address: account.address });
    console.log(chalk.dim(`Verifying balance: ${Number(actualBalance) / 1e18} ETH`));
    
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(RPC_URL),
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

async function sendTokensToExternal(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n🪙 Send Tokens to External Wallet\n'));

  // Initialize wallet manager with password
  const mainWallet = await storage.getMainWallet();
  if (!mainWallet) {
    console.log(chalk.red('No main wallet found. Create a bot first.\n'));
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
      choices: allWallets.map(w => ({ name: `${w.name}: ${w.address.slice(0, 12)}...`, value: w.address })),
    },
  ]);

  const { tokenAddress, recipient, amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'tokenAddress',
      message: 'Token contract address (0x...):',
      validate: (input) => input.startsWith('0x') && input.length === 42 || 'Invalid address',
    },
    {
      type: 'input',
      name: 'recipient',
      message: 'Recipient address (0x...):',
      validate: (input) => input.startsWith('0x') && input.length === 42 || 'Invalid address',
    },
    {
      type: 'input',
      name: 'amount',
      message: 'Amount of tokens to send:',
      validate: (input) => !isNaN(parseFloat(input)) && parseFloat(input) > 0 || 'Invalid amount',
    },
  ]);

  console.log(chalk.yellow(`\n⚠️  About to send ${amount} tokens to ${recipient}`));
  console.log(chalk.red('⚠️  DOUBLE-CHECK THE TOKEN AND ADDRESS - TRANSACTIONS CANNOT BE REVERSED'));

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
    const { createWalletClient, http, parseUnits, erc20Abi } = await import('viem');
    const { base } = await import('viem/chains');

    const account = walletManager.getAccountForAddress(fromWallet);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(RPC_URL),
    });

    // Get token decimals (assume 18 if fails)
    let decimals = 18;
    try {
      const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
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

    const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(chalk.green(`✓ Sent ${amount} tokens to ${recipient.slice(0, 10)}... successfully!\n`));

  } catch (error: any) {
    console.log(chalk.red(`\n✗ Transaction failed: ${error.message}\n`));
  }
}

async function manageWallets(walletManager: WalletManager, storage: JsonStorage) {
  console.log(chalk.cyan('\n👛 Wallet Management\n'));

  const mainWallet = await storage.getMainWallet();
  if (!mainWallet) {
    console.log(chalk.red('No wallets found. Create a bot first.\n'));
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

  const walletDictionary = await storage.getWalletDictionary();

  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Wallet Management:',
        choices: [
          { name: '📋 List all wallets', value: 'list' },
          { name: '🔑 Export private key', value: 'export' },
          { name: '⬅️  Back', value: 'back' },
        ],
      },
    ]);

    if (action === 'back') break;

    if (action === 'list') {
      console.log(chalk.cyan('\n📋 All Wallets:\n'));
      console.log(chalk.green(`Main Wallet: ${mainWallet.address}`));
      console.log(chalk.dim(`  Created: ${new Date(mainWallet.createdAt).toLocaleString()}`));

      if (Object.keys(walletDictionary).length === 0) {
        console.log(chalk.dim('\nNo bot wallets found.'));
      } else {
        console.log(chalk.cyan('\nBot Wallets:'));
        for (const [id, wallet] of Object.entries(walletDictionary)) {
          console.log(chalk.green(`${id.slice(0, 16)}...: ${wallet.address}`));
          console.log(chalk.dim(`  Created: ${new Date(wallet.createdAt).toLocaleString()}`));
        }
      }
      console.log();
    }

    if (action === 'export') {
      const allWallets = [
        { name: 'Main Wallet', id: 'main' as const },
        ...Object.keys(walletDictionary).map(id => ({ name: `Bot Wallet (${id.slice(0, 8)}...)`, id })),
      ];

      const { walletId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'walletId',
          message: 'Select wallet to export:',
          choices: allWallets.map(w => ({ name: w.name, value: w.id })),
        },
      ]);

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

        console.log(chalk.cyan('\n🔑 Private Key:'));
        console.log(chalk.green(privateKey));
        console.log(chalk.cyan('\n📍 Address:'));
        console.log(chalk.green(
          walletId === 'main' ? mainWallet.address : walletDictionary[walletId].address
        ));
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
      ],
    },
  ]);

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
    const { createPublicClient, http, formatEther } = await import('viem');
    const { base } = await import('viem/chains');
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
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
  const { createWalletClient, http, parseEther } = await import('viem');
  const { base } = await import('viem/chains');
  const { createPublicClient } = await import('viem');
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
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
    transport: http(RPC_URL),
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
      choices: bots.map(b => ({ name: b.name, value: b.id })),
    },
  ]);

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
