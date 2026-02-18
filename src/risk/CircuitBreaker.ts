// src/risk/CircuitBreaker.ts
// Global risk management - stops all bots if portfolio drops too much

import { BotInstance } from '../types/index.js';
import { JsonStorage } from '../storage/JsonStorage.js';
import { NotificationService } from '../notifications/NotificationService.js';

export interface CircuitBreakerConfig {
  enabled: boolean;
  maxDailyLossPercent: number;     // Stop if portfolio drops X% in a day (default: 10%)
  maxTotalLossPercent: number;     // Stop if portfolio drops X% total (default: 20%)
  cooldownMinutes: number;         // How long to wait before allowing restart (default: 60)
  autoResetAtMidnight: boolean;    // Reset daily stats at midnight (default: true)
}

export interface CircuitBreakerState {
  triggered: boolean;
  triggeredAt: number | null;
  reason: string | null;
  dailyStartValue: string;         // Portfolio value at start of day
  dailyLoss: string;               // Current daily loss in wei
  totalLoss: string;               // Total loss since bot started
  lastResetDate: string;           // YYYY-MM-DD of last reset
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState;
  private storage: JsonStorage;
  private lastCheckTime: number = 0;

  constructor(storage: JsonStorage, config?: Partial<CircuitBreakerConfig>) {
    this.storage = storage;
    this.config = {
      enabled: true,
      maxDailyLossPercent: 10,
      maxTotalLossPercent: 20,
      cooldownMinutes: 60,
      autoResetAtMidnight: true,
      ...config,
    };
    
    this.state = {
      triggered: false,
      triggeredAt: null,
      reason: null,
      dailyStartValue: '0',
      dailyLoss: '0',
      totalLoss: '0',
      lastResetDate: new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Initialize circuit breaker and load state
   */
  async init(): Promise<void> {
    const saved = await this.storage.loadCircuitBreaker();
    if (saved) {
      this.state = { ...this.state, ...saved };
    }
    
    // Check if we need to reset for a new day
    this.checkDailyReset();
  }

  /**
   * Get current configuration
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  /**
   * Check if circuit breaker is triggered
   */
  isTriggered(): boolean {
    if (!this.state.triggered) return false;
    
    // Check if cooldown has expired
    if (this.state.triggeredAt) {
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      if (Date.now() - this.state.triggeredAt > cooldownMs) {
        // Cooldown expired - auto-reset
        this.reset();
        return false;
      }
    }
    
    return true;
  }

  /**
   * Check if should reset based on new day
   */
  private checkDailyReset(): void {
    if (!this.config.autoResetAtMidnight) return;
    
    const today = new Date().toISOString().split('T')[0];
    if (this.state.lastResetDate !== today) {
      this.resetDailyStats();
    }
  }

  /**
   * Reset daily statistics
   */
  private resetDailyStats(): void {
    this.state.dailyLoss = '0';
    this.state.lastResetDate = new Date().toISOString().split('T')[0];
    this.saveState();
  }

  /**
   * Calculate total portfolio value across all bots
   */
  private calculatePortfolioValue(bots: BotInstance[]): { 
    totalEth: bigint; 
    totalProfit: bigint;
    totalInvested: bigint;
  } {
    let totalEth = BigInt(0);
    let totalProfit = BigInt(0);
    let totalInvested = BigInt(0);

    for (const bot of bots) {
      // Add wallet ETH balance
      // Note: This is a simplified calculation - in production you'd query actual balances
      
      // Add realized profits
      totalProfit += BigInt(bot.totalProfitEth);
      
      // Track positions
      for (const pos of bot.positions) {
        if (pos.status === 'HOLDING' && pos.ethCost) {
          totalInvested += BigInt(pos.ethCost);
        }
      }
    }

    return { totalEth, totalProfit, totalInvested };
  }

  /**
   * Check if we should trigger the circuit breaker
   * Returns true if trading should be stopped
   */
  async check(bots: BotInstance[]): Promise<{ 
    triggered: boolean; 
    reason?: string;
    dailyLossPercent: number;
    totalLossPercent: number;
  }> {
    // Check daily reset first
    this.checkDailyReset();
    
    // Already triggered?
    if (this.isTriggered()) {
      return { 
        triggered: true, 
        reason: this.state.reason || 'Circuit breaker active',
        dailyLossPercent: this.calculatePercent(this.state.dailyLoss, this.state.dailyStartValue),
        totalLossPercent: this.calculatePercent(this.state.totalLoss, this.state.dailyStartValue),
      };
    }

    if (!this.config.enabled) {
      return { triggered: false, dailyLossPercent: 0, totalLossPercent: 0 };
    }

    // Rate limit checks to once per minute
    if (Date.now() - this.lastCheckTime < 60000) {
      return { 
        triggered: false, 
        dailyLossPercent: this.calculatePercent(this.state.dailyLoss, this.state.dailyStartValue),
        totalLossPercent: this.calculatePercent(this.state.totalLoss, this.state.dailyStartValue),
      };
    }
    this.lastCheckTime = Date.now();

    // Initialize daily start value if needed
    if (this.state.dailyStartValue === '0' && bots.length > 0) {
      const { totalProfit, totalInvested } = this.calculatePortfolioValue(bots);
      this.state.dailyStartValue = (totalProfit + totalInvested).toString();
      await this.saveState();
    }

    // Calculate current loss
    const { totalProfit } = this.calculatePortfolioValue(bots);
    const startValue = BigInt(this.state.dailyStartValue);
    
    if (startValue > BigInt(0)) {
      const currentValue = totalProfit; // Simplified - in production include holdings
      
      if (currentValue < BigInt(0)) {
        this.state.dailyLoss = (-currentValue).toString();
      } else {
        this.state.dailyLoss = '0';
      }
      
      this.state.totalLoss = this.state.dailyLoss; // Cumulative in this simplified version
    }

    const dailyLossPercent = this.calculatePercent(this.state.dailyLoss, this.state.dailyStartValue);
    const totalLossPercent = this.calculatePercent(this.state.totalLoss, this.state.dailyStartValue);

    // Check thresholds
    if (dailyLossPercent >= this.config.maxDailyLossPercent) {
      await this.trigger(
        `Daily loss limit reached: ${dailyLossPercent.toFixed(2)}% (limit: ${this.config.maxDailyLossPercent}%)`
      );
      return { triggered: true, reason: this.state.reason!, dailyLossPercent, totalLossPercent };
    }

    if (totalLossPercent >= this.config.maxTotalLossPercent) {
      await this.trigger(
        `Total loss limit reached: ${totalLossPercent.toFixed(2)}% (limit: ${this.config.maxTotalLossPercent}%)`
      );
      return { triggered: true, reason: this.state.reason!, dailyLossPercent, totalLossPercent };
    }

    await this.saveState();
    return { triggered: false, dailyLossPercent, totalLossPercent };
  }

  /**
   * Calculate percentage loss
   */
  private calculatePercent(loss: string, base: string): number {
    const lossBig = BigInt(loss);
    const baseBig = BigInt(base);
    
    if (baseBig === BigInt(0)) return 0;
    
    return Number((lossBig * BigInt(10000)) / baseBig) / 100;
  }

  /**
   * Trigger the circuit breaker
   */
  private async trigger(reason: string): Promise<void> {
    this.state.triggered = true;
    this.state.triggeredAt = Date.now();
    this.state.reason = reason;
    
    await this.saveState();

    // Send notification
    const notificationService = NotificationService.getInstance();
    await notificationService.sendMessage(
      `🚨 CIRCUIT BREAKER TRIGGERED\n` +
      `Reason: ${reason}\n` +
      `All trading bots have been stopped.\n` +
      `Cooldown: ${this.config.cooldownMinutes} minutes`
    );
  }

  /**
   * Reset the circuit breaker
   */
  async reset(): Promise<void> {
    const wasTriggered = this.state.triggered;
    
    this.state.triggered = false;
    this.state.triggeredAt = null;
    this.state.reason = null;
    this.state.dailyLoss = '0';
    this.state.totalLoss = '0';
    this.state.dailyStartValue = '0'; // Will be recalculated on next check
    
    await this.saveState();

    if (wasTriggered) {
      const notificationService = NotificationService.getInstance();
      await notificationService.sendMessage(
        `✅ Circuit breaker has been reset. Trading can resume.`
      );
    }
  }

  /**
   * Force trigger (for manual stop)
   */
  async forceTrigger(reason: string): Promise<void> {
    await this.trigger(reason);
  }

  /**
   * Save state to storage
   */
  private async saveState(): Promise<void> {
    await this.storage.saveCircuitBreaker(this.state);
  }

  /**
   * Get status summary for display
   */
  getStatus(): {
    enabled: boolean;
    triggered: boolean;
    dailyLossPercent: number;
    totalLossPercent: number;
    cooldownRemaining: number | null;
    config: CircuitBreakerConfig;
  } {
    let cooldownRemaining: number | null = null;
    
    if (this.state.triggered && this.state.triggeredAt) {
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      const elapsed = Date.now() - this.state.triggeredAt;
      const remaining = Math.max(0, cooldownMs - elapsed);
      cooldownRemaining = Math.ceil(remaining / 60000); // Convert to minutes
    }

    return {
      enabled: this.config.enabled,
      triggered: this.state.triggered,
      dailyLossPercent: this.calculatePercent(this.state.dailyLoss, this.state.dailyStartValue),
      totalLossPercent: this.calculatePercent(this.state.totalLoss, this.state.dailyStartValue),
      cooldownRemaining,
      config: this.config,
    };
  }
}
