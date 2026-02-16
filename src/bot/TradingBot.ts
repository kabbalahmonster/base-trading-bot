// src/bot/TradingBot.ts

import { WalletClient, formatEther, parseEther } from 'viem';
import { BotInstance, Position, TradeResult, GridConfig } from '../types';
import { WalletManager } from '../wallet/WalletManager';
import { ZeroXApi } from '../api/ZeroXApi';
import { GridCalculator } from '../grid/GridCalculator';
import { JsonStorage } from '../storage/JsonStorage';

export class TradingBot {
  private instance: BotInstance;
  private walletManager: WalletManager;
  private zeroXApi: ZeroXApi;
  private storage: JsonStorage;
  private rpcUrl: string;
  
  private walletClient: WalletClient | null = null;
  private isRunning: boolean = false;

  constructor(
    instance: BotInstance,
    walletManager: WalletManager,
    zeroXApi: ZeroXApi,
    storage: JsonStorage,
    rpcUrl: string
  ) {
    this.instance = instance;
    this.walletManager = walletManager;
    this.zeroXApi = zeroXApi;
    this.storage = storage;
    this.rpcUrl = rpcUrl;
  }

  /**
   * Initialize the bot
   */
  async init(): Promise<void> {
    // Get wallet client
    if (this.instance.useMainWallet) {
      this.walletClient = this.walletManager.getMainWalletClient(this.rpcUrl) as any;
    } else {
      this.walletClient = this.walletManager.getBotWalletClient(this.instance.id, this.rpcUrl) as any;
    }

    // Initialize positions if empty
    if (this.instance.positions.length === 0) {
      const currentPrice = await this.getCurrentPrice();
      this.instance.positions = GridCalculator.generateGrid(currentPrice, this.instance.config);
      this.instance.currentPrice = currentPrice;
      await this.storage.saveBot(this.instance);
    }

    this.isRunning = true;
    this.instance.isRunning = true;
    this.instance.lastHeartbeat = Date.now();
    await this.storage.saveBot(this.instance);
  }

  /**
   * Main heartbeat iteration
   */
  async tick(): Promise<void> {
    if (!this.isRunning || !this.walletClient) return;

    this.instance.lastHeartbeat = Date.now();

    // Update current price
    const currentPrice = await this.getCurrentPrice();
    this.instance.currentPrice = currentPrice;

    // Check for buys
    if (this.instance.config.buysEnabled) {
      await this.checkBuys(currentPrice);
    }

    // Check for sells
    if (this.instance.config.sellsEnabled) {
      await this.checkSells(currentPrice);
    }

    // Save state
    await this.storage.saveBot(this.instance);
  }

  /**
   * Check and execute buy opportunities
   */
  private async checkBuys(currentPrice: number): Promise<void> {
    // Check max active positions
    const activeCount = GridCalculator.countActivePositions(this.instance.positions);
    if (activeCount >= this.instance.config.maxActivePositions) {
      return;
    }

    // Find buy opportunity
    const position = GridCalculator.findBuyPosition(
      this.instance.positions,
      currentPrice
    );

    if (!position) return;

    // Calculate buy amount
    const ethBalance = await this.getEthBalance();
    const buyAmount = GridCalculator.calculatePositionSize(
      parseEther(ethBalance.toString()).toString(),
      this.instance.config.numPositions
    );

    // Check minimum ETH
    if (BigInt(buyAmount) < parseEther('0.0001')) {
      console.log(`Insufficient ETH for buy: ${formatEther(BigInt(buyAmount))}`);
      return;
    }

    // Execute buy
    const result = await this.executeBuy(position, buyAmount);

    if (result.success) {
      console.log(`✓ Buy executed: Position ${position.id} at ${GridCalculator.formatPrice(currentPrice)}`);
      this.instance.totalBuys++;
    } else {
      console.error(`✗ Buy failed: ${result.error}`);
    }
  }

  /**
   * Check and execute sell opportunities
   */
  private async checkSells(currentPrice: number): Promise<void> {
    const positions = GridCalculator.findSellPositions(
      this.instance.positions,
      currentPrice
    );

    for (const position of positions) {
      if (!position.tokensReceived) continue;

      // Calculate moon bag amount
      let sellAmount = position.tokensReceived;
      if (this.instance.config.moonBagEnabled) {
        const moonBagAmount = (BigInt(sellAmount) * BigInt(this.instance.config.moonBagPercent)) / BigInt(100);
        sellAmount = (BigInt(sellAmount) - moonBagAmount).toString();
      }

      // Check profitability
      const { profitable, quote, actualProfit } = await this.zeroXApi.isProfitable(
        this.instance.tokenAddress,
        sellAmount,
        position.ethCost || '0',
        this.instance.config.minProfitPercent,
        this.instance.walletAddress
      );

      if (!profitable || !quote) {
        console.log(`Sell not profitable for position ${position.id}: ${actualProfit.toFixed(2)}%`);
        continue;
      }

      // Execute sell
      const result = await this.executeSell(position, sellAmount, quote);

      if (result.success) {
        console.log(`✓ Sell executed: Position ${position.id} at ${actualProfit.toFixed(2)}% profit`);
        this.instance.totalSells++;
        this.instance.totalProfitEth = (BigInt(this.instance.totalProfitEth) + BigInt(result.gasCostEth || '0')).toString();
      } else {
        console.error(`✗ Sell failed: ${result.error}`);
      }
    }
  }

  /**
   * Execute buy transaction
   */
  private async executeBuy(position: Position, ethAmount: string): Promise<TradeResult> {
    try {
      const quote = await this.zeroXApi.getBuyQuote(
        this.instance.tokenAddress,
        ethAmount,
        this.instance.walletAddress
      );

      if (!quote) {
        return { success: false, error: 'No quote available' };
      }

      // Send transaction
      const txHash = await this.walletClient!.sendTransaction({
        to: quote.to as `0x${string}`,
        data: quote.data as `0x${string}`,
        value: BigInt(quote.value),
        gas: BigInt(quote.gas),
        gasPrice: BigInt(quote.gasPrice),
      });

      // Wait for receipt
      const receipt = await this.walletClient!.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === 'success') {
        // Update position
        position.status = 'HOLDING';
        position.buyTxHash = txHash;
        position.buyTimestamp = Date.now();
        position.tokensReceived = quote.buyAmount;
        position.ethCost = ethAmount;

        return {
          success: true,
          txHash,
          gasUsed: receipt.gasUsed,
          gasCostEth: (receipt.gasUsed * BigInt(quote.gasPrice)).toString(),
        };
      } else {
        return { success: false, error: 'Transaction failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute sell transaction
   */
  private async executeSell(position: Position, tokenAmount: string, quote: any): Promise<TradeResult> {
    try {
      // Check/approve allowance
      // (Simplified - would need token approval check here)

      // Send transaction
      const txHash = await this.walletClient!.sendTransaction({
        to: quote.to as `0x${string}`,
        data: quote.data as `0x${string}`,
        value: BigInt(quote.value || '0'),
        gas: BigInt(quote.gas),
        gasPrice: BigInt(quote.gasPrice),
      });

      // Wait for receipt
      const receipt = await this.walletClient!.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === 'success') {
        // Calculate profit
        const ethReceived = BigInt(quote.buyAmount);
        const gasCost = receipt.gasUsed * BigInt(quote.gasPrice);
        const netEth = ethReceived - gasCost;
        const ethCost = BigInt(position.ethCost || '0');
        const profit = netEth - ethCost;
        const profitPercent = Number((profit * BigInt(10000)) / ethCost) / 100;

        // Update position
        position.status = 'SOLD';
        position.sellTxHash = txHash;
        position.sellTimestamp = Date.now();
        position.ethReceived = ethReceived.toString();
        position.profitEth = profit.toString();
        position.profitPercent = profitPercent;

        return {
          success: true,
          txHash,
          gasUsed: receipt.gasUsed,
          gasCostEth: gasCost.toString(),
        };
      } else {
        return { success: false, error: 'Transaction failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current token price (placeholder - would integrate with price feed)
   */
  private async getCurrentPrice(): Promise<number> {
    // This would integrate with a price oracle (e.g., Uniswap V3, Chainlink)
    // For now, return the stored price or a mock
    return this.instance.currentPrice || 0.000001;
  }

  /**
   * Get ETH balance of bot wallet
   */
  private async getEthBalance(): Promise<number> {
    const balance = await this.walletClient!.getBalance({
      address: this.instance.walletAddress as `0x${string}`,
    });
    return Number(formatEther(balance));
  }

  stop(): void {
    this.isRunning = false;
    this.instance.isRunning = false;
    this.storage.saveBot(this.instance);
  }

  getInstance(): BotInstance {
    return this.instance;
  }
}
