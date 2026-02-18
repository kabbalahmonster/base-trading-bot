/**
 * @fileoverview Core trading bot implementation for the Base Grid Trading Bot
 * @module bot/TradingBot
 * @version 1.4.0
 */

import { WalletClient, formatEther, parseEther, createPublicClient, http, erc20Abi } from 'viem';
import { base, mainnet } from 'viem/chains';
import { BotInstance, Position, TradeResult, Chain } from '../types/index.js';
import { WalletManager } from '../wallet/WalletManager.js';
import { ZeroXApi } from '../api/ZeroXApi.js';
import { GridCalculator } from '../grid/GridCalculator.js';
import { JsonStorage } from '../storage/JsonStorage.js';
import { PriceOracle, PriceData, ValidationResult } from '../oracle/index.js';
import { PnLTracker } from '../analytics/PnLTracker.js';
import { NotificationService } from '../notifications/NotificationService.js';

/**
 * Chain configuration mapping
 * @constant {Record<Chain, typeof base | typeof mainnet>}
 */
const CHAIN_CONFIG: Record<Chain, typeof base | typeof mainnet> = {
  base,
  ethereum: mainnet,
};

/**
 * Core trading engine that executes grid strategies
 * @class TradingBot
 * @description Manages price monitoring, trade execution, and state for a single bot instance
 */
export class TradingBot {
  private instance: BotInstance;
  private walletManager: WalletManager;
  private zeroXApi: ZeroXApi;
  private storage: JsonStorage;
  private rpcUrl: string;
  private pnLTracker: PnLTracker | null = null;
  
  private walletClient: WalletClient | null = null;
  private publicClient: any = null;
  private isRunning: boolean = false;
  private dryRun: boolean = false;
  private consecutiveErrors: number = 0;
  private maxConsecutiveErrors: number = 5;
  
  // Price Oracle for reliable price validation
  private priceOracle: PriceOracle | null = null;
  private lastOraclePrice: PriceData | null = null;
  private oracleValidationEnabled: boolean = true;
  private minPriceConfidence: number = 0.8; // 80% minimum confidence
  
  // Chain
  private chain: Chain;

  /**
   * Creates a new TradingBot instance
   * @constructor
   * @param {BotInstance} instance - Bot configuration and state
   * @param {WalletManager} walletManager - Wallet management instance
   * @param {ZeroXApi} zeroXApi - 0x API client
   * @param {JsonStorage} storage - Storage instance for persistence
   * @param {string} rpcUrl - RPC endpoint URL
   * @param {boolean} [enablePriceOracle=true] - Enable price oracle validation
   * @param {PnLTracker} [pnLTracker] - Optional P&L tracker
   * @description Initializes a trading bot with all required dependencies.
   * The bot will use the chain specified in the instance configuration.
   */
  constructor(
    instance: BotInstance,
    walletManager: WalletManager,
    zeroXApi: ZeroXApi,
    storage: JsonStorage,
    rpcUrl: string,
    enablePriceOracle: boolean = true,
    pnLTracker?: PnLTracker
  ) {
    this.instance = instance;
    this.walletManager = walletManager;
    this.zeroXApi = zeroXApi;
    this.storage = storage;
    this.rpcUrl = rpcUrl;
    this.chain = instance.chain ?? 'base';
    this.pnLTracker = pnLTracker || null;
    // Price validation DISABLED by default - using 0x quotes only
    // User can enable via config if they want oracle validation
    this.oracleValidationEnabled = instance.config.usePriceOracle === true;
    this.minPriceConfidence = instance.config.minPriceConfidence ?? 0.8;
    
    // Prevent unused parameter warning (legacy compatibility)
    if (enablePriceOracle && !this.oracleValidationEnabled) {
      // Parameter requested oracle but config disables it - config wins
    }
    
    // Update 0x API chain to match bot chain
    this.zeroXApi.setChain(this.chain);
  }

  /**
   * Get the chain for this bot
   * @returns {Chain} The chain this bot is trading on ('base' | 'ethereum')
   */
  getChain(): Chain {
    return this.chain;
  }

  /**
   * Set the PnL tracker (can be called after construction)
   */
  setPnLTracker(pnLTracker: PnLTracker): void {
    this.pnLTracker = pnLTracker;
  }

  /**
   * Get the PnL tracker
   */
  getPnLTracker(): PnLTracker | null {
    return this.pnLTracker;
  }

  /**
   * Initialize the bot
   */
  async init(): Promise<void> {
    const chainConfig = CHAIN_CONFIG[this.chain];
    
    // Create public client for reading
    this.publicClient = createPublicClient({
      chain: chainConfig,
      transport: http(this.rpcUrl),
    });

    // Initialize Price Oracle if enabled
    if (this.oracleValidationEnabled) {
      this.priceOracle = new PriceOracle({
        chain: this.chain,
        rpcUrl: this.rpcUrl,
        minConfidence: this.minPriceConfidence,
        allowFallback: true,
        preferChainlink: true,
        twapSeconds: 1800, // 30 minutes default TWAP
      });
      
      // Run health check
      const health = await this.priceOracle.healthCheck();
      if (health.healthy) {
        console.log(`✓ Price Oracle initialized (ETH: $${health.ethPrice?.toFixed(2) ?? 'N/A'})`);
      } else {
        console.warn(`⚠ Price Oracle health check failed - continuing with 0x prices only`);
      }
    }

    // Get wallet client - extends publicActions for waitForTransactionReceipt
    const chain = this.chain;
    if (this.instance.useMainWallet) {
      this.walletClient = this.walletManager.getMainWalletClient(this.rpcUrl, chain) as WalletClient & { waitForTransactionReceipt: any };
    } else {
      this.walletClient = this.walletManager.getBotWalletClient(this.instance.id, this.rpcUrl, chain) as WalletClient & { waitForTransactionReceipt: any };
    }

    // Initialize positions if empty
    if (this.instance.positions.length === 0) {
      const currentPrice = await this.getCurrentPrice();
      this.instance.positions = GridCalculator.generateGrid(currentPrice, this.instance.config);
      this.instance.currentPrice = currentPrice;
      await this.storage.saveBot(this.instance);
      console.log(`✓ Grid initialized with ${this.instance.positions.length} positions at ${GridCalculator.formatPrice(currentPrice)} ETH/token`);
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
    if (!this.isRunning || !this.walletClient || !this.publicClient) return;

    this.instance.lastHeartbeat = Date.now();

    try {
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
    } catch (error: any) {
      console.error(`Bot ${this.instance.id} tick error:`, error.message);
    }
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

    // Validate price using oracle before buying
    if (this.oracleValidationEnabled && this.priceOracle) {
      const validation = await this.validatePriceForTrading();
      
      if (!validation.valid) {
        console.log(`\n⏸ Buy opportunity found but price confidence too low: ${validation.reason}`);
        console.log(`   Confidence: ${(validation.confidence * 100).toFixed(1)}% (minimum: ${(this.minPriceConfidence * 100).toFixed(0)}%)`);
        return;
      }
      
      console.log(`\n✓ Price validated - Confidence: ${(validation.confidence * 100).toFixed(1)}%`);
    }

    console.log(`\n🎯 Buy opportunity found: Position ${position.id} at ${GridCalculator.formatPrice(position.buyPrice)} ETH`);

    // Calculate buy amount
    let buyAmountEth: number;
    
    if (this.instance.config.useFixedBuyAmount && this.instance.config.buyAmount > 0) {
      // Use fixed buy amount
      buyAmountEth = this.instance.config.buyAmount;
      console.log(`   Using fixed buy amount: ${buyAmountEth} ETH`);
    } else {
      // Auto-calculate based on available balance
      const ethBalance = await this.getEthBalance();
      const minReserve = 0.0005; // Keep some ETH for gas
      const availableEth = Math.max(0, ethBalance - minReserve);
      
      // Distribute equally across remaining positions
      const remainingPositions = this.instance.positions.filter(p => p.status === 'EMPTY').length;
      buyAmountEth = remainingPositions > 0 
        ? availableEth / Math.max(1, remainingPositions - activeCount)
        : availableEth;
      
      console.log(`   Auto-calculated buy amount: ${buyAmountEth.toFixed(6)} ETH`);
    }

    // Check minimum ETH
    if (buyAmountEth < 0.0001) {
      console.log(`⚠ Insufficient ETH for buy: ${buyAmountEth.toFixed(6)} ETH available`);
      return;
    }

    // Execute buy
    const result = await this.executeBuy(position, buyAmountEth.toString());

    if (result.success) {
      console.log(`✅ Buy executed: Position ${position.id}`);
      console.log(`   TX: ${result.txHash}`);
      console.log(`   Bought: ${formatEther(BigInt(position.tokensReceived || '0'))} tokens`);
      console.log(`   Cost: ${formatEther(BigInt(position.ethCost || '0'))} ETH`);
      this.instance.totalBuys++;
      
      // Send notification
      const notificationService = NotificationService.getInstance();
      await notificationService.notifyTradeExecuted(
        this.instance,
        formatEther(BigInt(position.tokensReceived || '0')),
        formatEther(BigInt(position.ethCost || '0')),
        position.id
      );
    } else {
      console.error(`❌ Buy failed: ${result.error}`);
    }

    await this.storage.saveBot(this.instance);
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
      if (!position.tokensReceived || position.status !== 'HOLDING') continue;

      console.log(`\n💰 Sell opportunity: Position ${position.id} at ${GridCalculator.formatPrice(currentPrice)} ETH`);

      // Calculate moon bag amount
      let sellAmount = position.tokensReceived;
      if (this.instance.config.moonBagEnabled) {
        const moonBagAmount = (BigInt(sellAmount) * BigInt(this.instance.config.moonBagPercent)) / BigInt(100);
        sellAmount = (BigInt(sellAmount) - moonBagAmount).toString();
        console.log(`   Moon bag: Keeping ${formatEther(moonBagAmount)} tokens`);
      }

      // Check profitability with STRICT 2% minimum guarantee
      // Requires: ETH received >= (buy cost + gas) * 1.02
      const { profitable, quote, actualProfit, strictCheck } = await this.zeroXApi.isProfitable(
        this.instance.tokenAddress,
        sellAmount,
        position.ethCost || '0',
        this.instance.config.minProfitPercent,
        this.instance.walletAddress,
        true // strict mode enabled
      );

      if (!profitable || !quote) {
        const reason = strictCheck === false 
          ? `fails strict 2% minimum (need >= (cost + gas) * 1.02)`
          : `not profitable yet`;
        console.log(`   ⏸ Sell skipped: ${reason} (current: ${actualProfit.toFixed(2)}%)`);
        continue;
      }

      console.log(`   ✅ Meets strict 2% profit requirement - Executing sell...`);

      // Execute sell
      const result = await this.executeSell(position, sellAmount, quote);

      if (result.success) {
        console.log(`✅ Sell executed: Position ${position.id}`);
        console.log(`   TX: ${result.txHash}`);
        console.log(`   Profit: ${position.profitPercent?.toFixed(2)}% (${formatEther(BigInt(position.profitEth || '0'))} ETH)`);
        this.instance.totalSells++;
        this.instance.totalProfitEth = (BigInt(this.instance.totalProfitEth) + BigInt(position.profitEth || '0')).toString();
        
        // Send notification
        const notificationService = NotificationService.getInstance();
        await notificationService.notifyProfit(
          this.instance,
          position.profitPercent || 0,
          position.profitEth || '0',
          position.ethReceived,
          position.id
        );
      } else {
        console.error(`❌ Sell failed: ${result.error}`);
      }

      await this.storage.saveBot(this.instance);
    }
  }

  /**
   * Validate current price using oracle before trading
   */
  private async validatePriceForTrading(): Promise<ValidationResult> {
    if (!this.priceOracle) {
      return { valid: true, confidence: 1.0 };
    }

    try {
      const validation = await this.priceOracle.validatePrice(
        this.instance.tokenAddress,
        this.minPriceConfidence
      );
      
      // Also fetch and store the price data for logging
      this.lastOraclePrice = await this.priceOracle.getPrice(this.instance.tokenAddress);
      
      return validation;
    } catch (error: any) {
      console.error('Price validation error:', error.message);
      return { valid: false, reason: error.message, confidence: 0 };
    }
  }

  /**
   * Get current token price from 0x API with oracle validation
   */
  private async getCurrentPrice(): Promise<number> {
    try {
      // Try to get price from oracle first if available
      if (this.priceOracle) {
        const oraclePrice = await this.priceOracle.getPrice(this.instance.tokenAddress);
        if (oraclePrice && oraclePrice.confidence >= this.minPriceConfidence) {
          this.lastOraclePrice = oraclePrice;
          this.instance.currentPrice = oraclePrice.price;
          return oraclePrice.price;
        }
      }

      // Fallback to 0x API
      const price = await this.zeroXApi.getTokenPrice(
        this.instance.tokenAddress,
        this.instance.walletAddress
      );
      
      if (price && price > 0) {
        // Validate 0x price against oracle if available
        if (this.priceOracle && this.lastOraclePrice) {
          const priceDiff = Math.abs(price - this.lastOraclePrice.price) / this.lastOraclePrice.price;
          if (priceDiff > 0.05) { // >5% difference
            console.warn(`⚠ 0x price (${price}) differs from oracle (${this.lastOraclePrice.price}) by ${(priceDiff * 100).toFixed(2)}%`);
          }
        }
        
        // Update stored price
        this.instance.currentPrice = price;
        return price;
      }
      
      // Fallback to stored price if available
      if (this.instance.currentPrice && this.instance.currentPrice > 0) {
        return this.instance.currentPrice;
      }
      
      // Last resort: use oracle price even if low confidence
      if (this.lastOraclePrice) {
        return this.lastOraclePrice.price;
      }
      
      // Final fallback
      console.log('⚠ Could not fetch price from 0x or oracle - using default');
      return 0.000001; // Default fallback
    } catch (error: any) {
      console.error('Price fetch error:', error.message);
      return this.instance.currentPrice || this.lastOraclePrice?.price || 0.000001;
    }
  }

  /**
   * Get ETH balance of bot wallet
   */
  private async getEthBalance(): Promise<number> {
    const balance = await this.publicClient.getBalance({
      address: this.instance.walletAddress as `0x${string}`,
    });
    return Number(formatEther(balance));
  }

  /**
   * Enable or disable dry-run mode
   */
  setDryRun(enabled: boolean): void {
    this.dryRun = enabled;
    console.log(`🧪 Dry-run mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Execute buy transaction with dry-run support
   */
  private async executeBuy(position: Position, ethAmount: string): Promise<TradeResult> {
    try {
      const amountWei = parseEther(ethAmount);
      
      console.log(`   Getting 0x quote for ${ethAmount} ETH...`);
      const quote = await this.zeroXApi.getBuyQuote(
        this.instance.tokenAddress,
        amountWei.toString(),
        this.instance.walletAddress
      );

      if (!quote) {
        return { success: false, error: 'No quote available from 0x' };
      }

      console.log(`   Expected tokens: ${formatEther(BigInt(quote.buyAmount))}`);

      // Dry-run: simulate without sending
      if (this.dryRun) {
        console.log(`   🧪 DRY-RUN: Would buy ${formatEther(BigInt(quote.buyAmount))} tokens`);
        console.log(`   🧪 DRY-RUN: TX data ready (not sending)`);
        return {
          success: true,
          txHash: '0xDRYRUN_' + Date.now(),
          gasUsed: BigInt(quote.gas),
          gasCostEth: (BigInt(quote.gas) * BigInt(quote.gasPrice)).toString(),
        };
      }

      console.log(`   Executing transaction...`);

      // Send transaction
      const txHash = await (this.walletClient as any).sendTransaction({
        to: quote.to as `0x${string}`,
        data: quote.data as `0x${string}`,
        value: BigInt(quote.value),
        gas: BigInt(quote.gas),
        gasPrice: BigInt(quote.gasPrice),
      });

      console.log(`   Transaction sent: ${txHash}`);

      // Wait for receipt using public client
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === 'success') {
        // Reset error counter on success
        this.consecutiveErrors = 0;
        
        // Update position
        position.status = 'HOLDING';
        position.buyTxHash = txHash;
        position.buyTimestamp = Date.now();
        position.tokensReceived = quote.buyAmount;
        position.ethCost = amountWei.toString();

        // Record trade in PnL tracker
        if (this.pnLTracker) {
          try {
            const gasCostWei = receipt.gasUsed * BigInt(quote.gasPrice);
            const price = Number(formatEther(amountWei)) / Number(formatEther(BigInt(quote.buyAmount)));
            
            await this.pnLTracker.recordBuy(
              this.instance,
              position.id,
              quote.buyAmount,
              price,
              amountWei.toString(),
              gasCostWei.toString(),
              txHash
            );
          } catch (error: any) {
            console.warn(`   ⚠ Failed to record buy in PnL tracker: ${error.message}`);
          }
        }

        return {
          success: true,
          txHash,
          gasUsed: receipt.gasUsed,
          gasCostEth: (receipt.gasUsed * BigInt(quote.gasPrice)).toString(),
        };
      } else {
        this.consecutiveErrors++;
        return { success: false, error: 'Transaction reverted' };
      }
    } catch (error: any) {
      this.consecutiveErrors++;
      console.error(`   Buy error: ${error.message}`);
      
      // Stop bot if too many consecutive errors
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error(`❌ Too many errors (${this.consecutiveErrors}). Stopping bot.`);
        
        // Send notification before stopping
        const notificationService = NotificationService.getInstance();
        await notificationService.notifyBotStopped(
          this.instance,
          this.consecutiveErrors,
          `Buy error: ${error.message}`
        );
        
        this.stop();
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute sell transaction with approval check and dry-run support
   */
  private async executeSell(position: Position, tokenAmount: string, quote: any): Promise<TradeResult> {
    try {
      // Check and handle token approval
      console.log(`   Checking token approval...`);
      const allowanceTarget = quote.allowanceTarget || quote.to;
      
      const currentAllowance = await (this.publicClient as any).readContract({
        address: this.instance.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [this.instance.walletAddress as `0x${string}`, allowanceTarget as `0x${string}`],
      });

      // Dry-run: skip approval check
      if (this.dryRun) {
        console.log(`   🧪 DRY-RUN: Would approve ${allowanceTarget.slice(0, 20)}...`);
        console.log(`   🧪 DRY-RUN: Would sell ${formatEther(BigInt(tokenAmount))} tokens`);
        return {
          success: true,
          txHash: '0xDRYRUN_SELL_' + Date.now(),
          gasUsed: BigInt(quote.gas),
          gasCostEth: (BigInt(quote.gas) * BigInt(quote.gasPrice)).toString(),
        };
      }

      if (BigInt(currentAllowance) < BigInt(tokenAmount)) {
        console.log(`   Approving ${allowanceTarget.slice(0, 20)}... to spend tokens...`);
        
        const approveTx = await (this.walletClient as any).writeContract({
          address: this.instance.tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'approve',
          args: [allowanceTarget as `0x${string}`, BigInt(tokenAmount)],
        });

        await this.publicClient.waitForTransactionReceipt({ hash: approveTx });
        console.log(`   ✓ Approval confirmed`);
      } else {
        console.log(`   ✓ Sufficient allowance already granted`);
      }

      console.log(`   Executing sell transaction...`);

      // Send transaction
      const txHash = await (this.walletClient as any).sendTransaction({
        to: quote.to as `0x${string}`,
        data: quote.data as `0x${string}`,
        value: BigInt(quote.value || '0'),
        gas: BigInt(quote.gas),
        gasPrice: BigInt(quote.gasPrice),
      });

      console.log(`   Transaction sent: ${txHash}`);

      // Wait for receipt using public client
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === 'success') {
        // Reset error counter on success
        this.consecutiveErrors = 0;
        
        // Calculate profit
        const ethReceived = BigInt(quote.buyAmount);
        const gasCostWei = receipt.gasUsed * BigInt(quote.gasPrice);
        const netEth = ethReceived - gasCostWei;
        const ethCost = BigInt(position.ethCost || '0');
        const profit = netEth > ethCost ? netEth - ethCost : BigInt(0);
        const profitPercent = ethCost > 0 ? Number((profit * BigInt(10000)) / ethCost) / 100 : 0;

        // Update position
        position.status = 'SOLD';
        position.sellTxHash = txHash;
        position.sellTimestamp = Date.now();
        position.ethReceived = ethReceived.toString();
        position.profitEth = profit.toString();
        position.profitPercent = profitPercent;

        // Record trade in PnL tracker
        if (this.pnLTracker) {
          try {
            const price = Number(formatEther(ethReceived)) / Number(formatEther(BigInt(tokenAmount)));
            
            await this.pnLTracker.recordSell(
              this.instance,
              position.id,
              tokenAmount,
              price,
              ethReceived.toString(),
              gasCostWei.toString(),
              profit.toString(),
              profitPercent,
              txHash
            );
          } catch (error: any) {
            console.warn(`   ⚠ Failed to record sell in PnL tracker: ${error.message}`);
          }
        }

        return {
          success: true,
          txHash,
          gasUsed: receipt.gasUsed,
          gasCostEth: gasCostWei.toString(),
        };
      } else {
        this.consecutiveErrors++;
        return { success: false, error: 'Transaction reverted' };
      }
    } catch (error: any) {
      this.consecutiveErrors++;
      console.error(`   Sell error: ${error.message}`);
      
      // Stop bot if too many consecutive errors
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error(`❌ Too many errors (${this.consecutiveErrors}). Stopping bot.`);
        
        // Send notification before stopping
        const notificationService = NotificationService.getInstance();
        await notificationService.notifyBotStopped(
          this.instance,
          this.consecutiveErrors,
          `Sell error: ${error.message}`
        );
        
        this.stop();
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Liquidate all holding positions (emergency exit)
   */
  async liquidateAll(): Promise<{ success: number; failed: number; totalProfit: string }> {
    console.log(`\n🚨 LIQUIDATING ALL POSITIONS for ${this.instance.name}`);
    
    const holdingPositions = this.instance.positions.filter(p => p.status === 'HOLDING');
    console.log(`   Found ${holdingPositions.length} positions to sell`);
    
    let success = 0;
    let failed = 0;
    let totalProfit = BigInt(0);

    for (const position of holdingPositions) {
      if (!position.tokensReceived) continue;

      console.log(`\n   Selling position ${position.id}...`);
      
      // Calculate moon bag if enabled
      let sellAmount = position.tokensReceived;
      if (this.instance.config.moonBagEnabled) {
        const moonBagAmount = (BigInt(sellAmount) * BigInt(this.instance.config.moonBagPercent)) / BigInt(100);
        sellAmount = (BigInt(sellAmount) - moonBagAmount).toString();
      }

      try {
        const quote = await this.zeroXApi.getSellQuote(
          this.instance.tokenAddress,
          sellAmount,
          this.instance.walletAddress
        );

        if (!quote) {
          console.log(`   ❌ No quote for position ${position.id}`);
          failed++;
          continue;
        }

        const result = await this.executeSell(position, sellAmount, quote);

        if (result.success) {
          success++;
          totalProfit += BigInt(position.profitEth || '0');
          console.log(`   ✅ Sold position ${position.id}`);
        } else {
          failed++;
          console.log(`   ❌ Failed to sell position ${position.id}: ${result.error}`);
        }
      } catch (error: any) {
        failed++;
        console.error(`   ❌ Error selling position ${position.id}: ${error.message}`);
      }
    }

    this.instance.totalProfitEth = (BigInt(this.instance.totalProfitEth) + totalProfit).toString();
    await this.storage.saveBot(this.instance);

    console.log(`\n📊 Liquidation complete:`);
    console.log(`   ✅ Successful: ${success}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   💰 Total profit: ${formatEther(totalProfit)} ETH`);

    return {
      success,
      failed,
      totalProfit: totalProfit.toString(),
    };
  }

  /**
   * Get bot statistics
   */
  getStats(): {
    name: string;
    chain: Chain;
    positions: { empty: number; holding: number; sold: number };
    totalBuys: number;
    totalSells: number;
    totalProfitEth: string;
    currentPrice: number;
    isRunning: boolean;
  } {
    const positions = this.instance.positions;
    return {
      name: this.instance.name,
      chain: this.chain,
      positions: {
        empty: positions.filter(p => p.status === 'EMPTY').length,
        holding: positions.filter(p => p.status === 'HOLDING').length,
        sold: positions.filter(p => p.status === 'SOLD').length,
      },
      totalBuys: this.instance.totalBuys,
      totalSells: this.instance.totalSells,
      totalProfitEth: this.instance.totalProfitEth,
      currentPrice: this.instance.currentPrice,
      isRunning: this.isRunning,
    };
  }

  stop(): void {
    this.isRunning = false;
    this.instance.isRunning = false;
    this.storage.saveBot(this.instance);
    console.log(`⏹ Bot ${this.instance.name} stopped`);
  }

  getInstance(): BotInstance {
    return this.instance;
  }
}
