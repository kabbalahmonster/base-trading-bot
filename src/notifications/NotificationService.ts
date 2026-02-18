// src/notifications/NotificationService.ts
// Global notification service for the trading bot - supports Telegram and Discord

import { TelegramNotifier, TelegramConfig, NotificationPayload } from './TelegramNotifier.js';
import { DiscordNotifier, DiscordConfig } from './DiscordNotifier.js';
import { AlertTemplates } from './AlertTemplates.js';
import { BotInstance, AlertLevel } from '../types/index.js';

export interface NotificationServiceConfig {
  // Telegram
  botToken?: string;
  chatId?: string;
  // Discord
  discordWebhookUrl?: string;
  // Common
  enabled?: boolean;
  alertLevel?: AlertLevel;
}

export class NotificationService {
  private static instance: NotificationService;
  private telegramNotifier: TelegramNotifier | null = null;
  private discordNotifier: DiscordNotifier | null = null;
  private globalEnabled: boolean = false;
  private globalAlertLevel: AlertLevel = 'all';

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize from environment variables
   */
  initializeFromEnv(): void {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    const config: NotificationServiceConfig = {
      enabled: true,
      alertLevel: 'all',
    };

    if (botToken && chatId) {
      config.botToken = botToken;
      config.chatId = chatId;
    }

    if (discordWebhookUrl) {
      config.discordWebhookUrl = discordWebhookUrl;
    }

    if (config.botToken || config.discordWebhookUrl) {
      this.configure(config);
    }
  }

  /**
   * Configure the notification service
   */
  configure(config: NotificationServiceConfig): void {
    this.globalEnabled = config.enabled ?? this.globalEnabled;
    this.globalAlertLevel = config.alertLevel ?? this.globalAlertLevel;

    // Configure Telegram
    if (config.botToken && config.chatId) {
      this.telegramNotifier = new TelegramNotifier({
        botToken: config.botToken,
        chatId: config.chatId,
        enabled: this.globalEnabled,
        alertLevel: this.globalAlertLevel,
      });
    }

    // Configure Discord
    if (config.discordWebhookUrl) {
      this.discordNotifier = new DiscordNotifier({
        webhookUrl: config.discordWebhookUrl,
        enabled: this.globalEnabled,
        alertLevel: this.globalAlertLevel,
      });
    }
  }

  /**
   * Check if any notifications are configured and enabled
   */
  isConfigured(): boolean {
    return (
      (this.telegramNotifier !== null && this.telegramNotifier.isEnabled()) ||
      (this.discordNotifier !== null && this.discordNotifier.isEnabled())
    );
  }

  /**
   * Check if Discord is configured
   */
  isDiscordConfigured(): boolean {
    return this.discordNotifier !== null && this.discordNotifier.isEnabled();
  }

  /**
   * Check if Telegram is configured
   */
  isTelegramConfigured(): boolean {
    return this.telegramNotifier !== null && this.telegramNotifier.isEnabled();
  }

  /**
   * Get current configuration (safe - no tokens)
   */
  getConfig(): { 
    enabled: boolean; 
    alertLevel: AlertLevel; 
    telegramConfigured: boolean;
    discordConfigured: boolean;
  } {
    return {
      enabled: this.globalEnabled,
      alertLevel: this.globalAlertLevel,
      telegramConfigured: this.telegramNotifier !== null,
      discordConfigured: this.discordNotifier !== null,
    };
  }

  /**
   * Update global settings
   */
  updateSettings(enabled: boolean, alertLevel: AlertLevel): void {
    this.globalEnabled = enabled;
    this.globalAlertLevel = alertLevel;
    
    if (this.telegramNotifier) {
      this.telegramNotifier.updateConfig({ enabled, alertLevel });
    }
    
    if (this.discordNotifier) {
      this.discordNotifier.updateConfig({ enabled, alertLevel });
    }
  }

  /**
   * Send a simple text message to all configured channels
   */
  async sendMessage(message: string): Promise<boolean> {
    const results: boolean[] = [];
    
    if (this.telegramNotifier) {
      results.push(await this.telegramNotifier.sendMessage(message));
    }
    
    if (this.discordNotifier) {
      results.push(await this.discordNotifier.sendMessage(message));
    }
    
    return results.some(r => r); // Return true if any succeeded
  }

  /**
   * Send notification for a bot to all configured channels
   */
  async notify(bot: BotInstance, payload: Omit<NotificationPayload, 'botName'>): Promise<boolean> {
    const results: boolean[] = [];

    // Send via Telegram
    if (this.telegramNotifier) {
      const botAlertLevel = this.getBotAlertLevel(bot);
      const botConfig: TelegramConfig = {
        ...this.telegramNotifier.getConfig(),
        alertLevel: botAlertLevel,
        botToken: '',
        chatId: '',
      };

      const tempNotifier = new TelegramNotifier(botConfig);
      if (tempNotifier.isEnabled()) {
        results.push(await this.telegramNotifier.notify({
          ...payload,
          botName: bot.name,
        }));
      }
    }

    // Send via Discord
    if (this.discordNotifier) {
      const botAlertLevel = this.getBotAlertLevel(bot);
      const botConfig: DiscordConfig = {
        ...this.discordNotifier.getConfig(),
        alertLevel: botAlertLevel,
        webhookUrl: '',
      };

      const tempNotifier = new DiscordNotifier(botConfig);
      if (tempNotifier.isEnabled()) {
        // Convert payload to Discord format based on type
        switch (payload.type) {
          case 'trade':
            results.push(await this.discordNotifier.notifyTrade(
              bot.name,
              bot.tokenSymbol,
              'buy',
              (payload.metadata as any)?.tokenAmount || '0',
              (payload.metadata as any)?.ethAmount || '0',
              (payload.metadata as any)?.positionId
            ));
            break;
          case 'profit':
            results.push(await this.discordNotifier.notifyProfit(
              bot.name,
              bot.tokenSymbol,
              (payload.metadata as any)?.profitPercent || 0,
              ((payload.metadata as any)?.profitEth || '0').toString(),
              (payload.metadata as any)?.positionId
            ));
            break;
          case 'error':
            results.push(await this.discordNotifier.notifyError(
              bot.name,
              (payload.metadata as any)?.error || 'Unknown error',
              (payload.metadata as any)?.context
            ));
            break;
          case 'warning':
            results.push(await this.discordNotifier.notifyWarning(
              bot.name,
              (payload.metadata as any)?.warning || 'Warning',
              (payload.metadata as any)?.action
            ));
            break;
        }
      }
    }

    return results.some(r => r);
  }

  /**
   * Get the effective alert level for a bot
   */
  private getBotAlertLevel(bot: BotInstance): AlertLevel {
    if (bot.notifications && !bot.notifications.useGlobal) {
      return bot.notifications.alertLevel;
    }
    return this.globalAlertLevel;
  }

  /**
   * Send trade executed notification
   */
  async notifyTradeExecuted(
    bot: BotInstance,
    tokenAmount: string,
    ethAmount: string,
    positionId?: number
  ): Promise<boolean> {
    const results: boolean[] = [];

    // Telegram
    if (this.telegramNotifier) {
      const message = AlertTemplates.tradeExecuted(
        bot.name,
        bot.tokenSymbol,
        tokenAmount,
        ethAmount,
        positionId
      );

      results.push(await this.notify(bot, {
        type: 'trade',
        message,
        timestamp: Date.now(),
        metadata: { positionId, tokenAmount, ethAmount },
      }));
    }

    // Discord
    if (this.discordNotifier) {
      results.push(await this.discordNotifier.notifyTrade(
        bot.name,
        bot.tokenSymbol,
        'buy',
        tokenAmount,
        ethAmount,
        positionId
      ));
    }

    return results.some(r => r);
  }

  /**
   * Send profit notification
   */
  async notifyProfit(
    bot: BotInstance,
    profitPercent: number,
    profitEth: string | bigint,
    totalEth?: string | bigint,
    positionId?: number
  ): Promise<boolean> {
    const results: boolean[] = [];

    // Telegram
    if (this.telegramNotifier) {
      const message = AlertTemplates.tradeProfit(
        bot.name,
        bot.tokenSymbol,
        profitPercent,
        profitEth,
        totalEth,
        positionId
      );

      results.push(await this.notify(bot, {
        type: 'profit',
        message,
        timestamp: Date.now(),
        metadata: { positionId, profitPercent, profitEth, totalEth },
      }));
    }

    // Discord
    if (this.discordNotifier) {
      results.push(await this.discordNotifier.notifyProfit(
        bot.name,
        bot.tokenSymbol,
        profitPercent,
        profitEth.toString(),
        positionId
      ));
    }

    return results.some(r => r);
  }

  /**
   * Send error notification
   */
  async notifyError(
    bot: BotInstance,
    errorMessage: string,
    context?: string
  ): Promise<boolean> {
    const results: boolean[] = [];

    // Telegram
    if (this.telegramNotifier) {
      const message = AlertTemplates.error(bot.name, errorMessage, context);

      results.push(await this.notify(bot, {
        type: 'error',
        message,
        timestamp: Date.now(),
        metadata: { error: errorMessage, context },
      }));
    }

    // Discord
    if (this.discordNotifier) {
      results.push(await this.discordNotifier.notifyError(
        bot.name,
        errorMessage,
        context
      ));
    }

    return results.some(r => r);
  }

  /**
   * Send warning notification
   */
  async notifyWarning(
    bot: BotInstance,
    warningMessage: string,
    action?: string
  ): Promise<boolean> {
    const results: boolean[] = [];

    // Telegram
    if (this.telegramNotifier) {
      const message = AlertTemplates.warning(bot.name, warningMessage, action);

      results.push(await this.notify(bot, {
        type: 'warning',
        message,
        timestamp: Date.now(),
        metadata: { warning: warningMessage, action },
      }));
    }

    // Discord
    if (this.discordNotifier) {
      results.push(await this.discordNotifier.notifyWarning(
        bot.name,
        warningMessage,
        action
      ));
    }

    return results.some(r => r);
  }

  /**
   * Send bot stopped notification
   */
  async notifyBotStopped(
    bot: BotInstance,
    errorCount: number,
    reason: string
  ): Promise<boolean> {
    const results: boolean[] = [];

    // Telegram
    if (this.telegramNotifier) {
      const message = AlertTemplates.botStopped(bot.name, errorCount, reason);

      results.push(await this.notify(bot, {
        type: 'warning',
        message,
        timestamp: Date.now(),
        metadata: { errorCount, reason },
      }));
    }

    // Discord
    if (this.discordNotifier) {
      results.push(await this.discordNotifier.notifyWarning(
        bot.name,
        `Bot stopped after ${errorCount} errors: ${reason}`,
        'Manual restart required'
      ));
    }

    return results.some(r => r);
  }

  /**
   * Send daily summary
   */
  async sendDailySummary(
    totalProfitEth: string | bigint,
    totalTrades: number,
    buyCount: number,
    sellCount: number,
    activeBots: number
  ): Promise<boolean> {
    const results: boolean[] = [];

    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    // Telegram
    if (this.telegramNotifier) {
      const message = AlertTemplates.dailySummary(
        date,
        totalProfitEth,
        totalTrades,
        buyCount,
        sellCount,
        activeBots
      );

      results.push(await this.telegramNotifier.notify({
        type: 'summary',
        botName: 'Daily Report',
        message,
        timestamp: Date.now(),
        metadata: { totalProfitEth, totalTrades, buyCount, sellCount, activeBots },
      }));
    }

    // Discord
    if (this.discordNotifier) {
      results.push(await this.discordNotifier.sendDailySummary(
        date,
        totalProfitEth.toString(),
        totalTrades,
        buyCount,
        sellCount,
        activeBots
      ));
    }

    return results.some(r => r);
  }

  /**
   * Send liquidation notification
   */
  async notifyLiquidation(
    bot: BotInstance,
    positionsLiquidated: number,
    totalEthReceived: string | bigint
  ): Promise<boolean> {
    const results: boolean[] = [];

    // Telegram
    if (this.telegramNotifier) {
      const message = AlertTemplates.allPositionsLiquidated(
        bot.name,
        positionsLiquidated,
        totalEthReceived
      );

      results.push(await this.notify(bot, {
        type: 'warning',
        message,
        timestamp: Date.now(),
        metadata: { positionsLiquidated, totalEthReceived },
      }));
    }

    // Discord
    if (this.discordNotifier) {
      results.push(await this.discordNotifier.notifyWarning(
        bot.name,
        `Liquidated ${positionsLiquidated} positions`,
        `Received ${totalEthReceived.toString()} ETH`
      ));
    }

    return results.some(r => r);
  }

  /**
   * Send circuit breaker notification
   */
  async notifyCircuitBreaker(
    reason: string,
    dailyLossPercent: number,
    cooldownMinutes: number
  ): Promise<boolean> {
    const results: boolean[] = [];

    const message = `🚨 CIRCUIT BREAKER TRIGGERED\n` +
      `Reason: ${reason}\n` +
      `All trading bots have been stopped.\n` +
      `Cooldown: ${cooldownMinutes} minutes`;

    if (this.telegramNotifier) {
      results.push(await this.telegramNotifier.sendMessage(message));
    }

    if (this.discordNotifier) {
      results.push(await this.discordNotifier.notifyCircuitBreaker(
        reason,
        dailyLossPercent,
        cooldownMinutes
      ));
    }

    return results.some(r => r);
  }

  /**
   * Send test notification to all configured channels
   */
  async sendTestNotification(): Promise<{ success: boolean; message: string; telegram?: boolean; discord?: boolean }> {
    const result: { success: boolean; message: string; telegram?: boolean; discord?: boolean } = {
      success: false,
      message: '',
    };

    if (!this.isConfigured()) {
      result.message = 'No notifications configured. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and/or DISCORD_WEBHOOK_URL in .env';
      return result;
    }

    const results: string[] = [];

    if (this.telegramNotifier) {
      const telegramResult = await this.telegramNotifier.sendTestMessage();
      result.telegram = telegramResult.success;
      if (telegramResult.success) {
        results.push('Telegram: ✓');
      } else {
        results.push(`Telegram: ✗ (${telegramResult.message})`);
      }
    }

    if (this.discordNotifier) {
      const discordResult = await this.discordNotifier.sendTestMessage();
      result.discord = discordResult.success;
      if (discordResult.success) {
        results.push('Discord: ✓');
      } else {
        results.push(`Discord: ✗ (${discordResult.message})`);
      }
    }

    result.success = (result.telegram || false) || (result.discord || false);
    result.message = results.join(', ');
    return result;
  }

  /**
   * Get notification configuration for UI display
   */
  getBotNotificationConfig(bot: BotInstance): {
    enabled: boolean;
    alertLevel: AlertLevel;
    useGlobal: boolean;
  } {
    return {
      enabled: bot.notifications?.enabled ?? this.globalEnabled,
      alertLevel: bot.notifications?.alertLevel ?? this.globalAlertLevel,
      useGlobal: bot.notifications?.useGlobal ?? true,
    };
  }

  /**
   * Update bot-specific notification configuration
   */
  updateBotNotificationConfig(
    bot: BotInstance,
    config: Partial<{ enabled: boolean; alertLevel: AlertLevel; useGlobal: boolean }>
  ): BotInstance {
    return {
      ...bot,
      notifications: {
        enabled: config.enabled ?? bot.notifications?.enabled ?? true,
        alertLevel: config.alertLevel ?? bot.notifications?.alertLevel ?? 'all',
        useGlobal: config.useGlobal ?? bot.notifications?.useGlobal ?? true,
      },
    };
  }
}
