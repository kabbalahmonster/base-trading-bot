// src/notifications/NotificationService.ts
// Global notification service for the trading bot

import { TelegramNotifier, TelegramConfig, NotificationPayload } from './TelegramNotifier.js';
import { AlertTemplates } from './AlertTemplates.js';
import { BotInstance, AlertLevel } from '../types/index.js';

export interface NotificationServiceConfig {
  botToken?: string;
  chatId?: string;
  enabled?: boolean;
  alertLevel?: AlertLevel;
}

export class NotificationService {
  private static instance: NotificationService;
  private notifier: TelegramNotifier | null = null;
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
    
    if (botToken && chatId) {
      this.configure({
        botToken,
        chatId,
        enabled: true,
        alertLevel: 'all',
      });
    }
  }

  /**
   * Configure the notification service
   */
  configure(config: NotificationServiceConfig): void {
    this.globalEnabled = config.enabled ?? this.globalEnabled;
    this.globalAlertLevel = config.alertLevel ?? this.globalAlertLevel;

    if (config.botToken && config.chatId) {
      this.notifier = new TelegramNotifier({
        botToken: config.botToken,
        chatId: config.chatId,
        enabled: this.globalEnabled,
        alertLevel: this.globalAlertLevel,
      });
    }
  }

  /**
   * Check if notifications are configured and enabled
   */
  isConfigured(): boolean {
    return this.notifier !== null && this.notifier.isEnabled();
  }

  /**
   * Get current configuration (safe - no token)
   */
  getConfig(): { enabled: boolean; alertLevel: AlertLevel; configured: boolean } {
    return {
      enabled: this.globalEnabled,
      alertLevel: this.globalAlertLevel,
      configured: this.notifier !== null,
    };
  }

  /**
   * Update global settings
   */
  updateSettings(enabled: boolean, alertLevel: AlertLevel): void {
    this.globalEnabled = enabled;
    this.globalAlertLevel = alertLevel;
    
    if (this.notifier) {
      this.notifier.updateConfig({ enabled, alertLevel });
    }
  }

  /**
   * Send notification for a bot
   */
  async notify(bot: BotInstance, payload: Omit<NotificationPayload, 'botName'>): Promise<boolean> {
    if (!this.notifier) return false;

    // Check bot-specific notification settings
    const botAlertLevel = this.getBotAlertLevel(bot);
    
    // Create a temporary notifier with bot's alert level
    const botConfig: TelegramConfig = {
      ...this.notifier.getConfig(),
      alertLevel: botAlertLevel,
      botToken: '', // Not needed for check
      chatId: '',   // Not needed for check
    };

    // Check if this type should be sent for this bot
    const tempNotifier = new TelegramNotifier(botConfig);
    if (!tempNotifier.isEnabled()) return false;

    // Send the notification
    return this.notifier.notify({
      ...payload,
      botName: bot.name,
    });
  }

  /**
   * Get the effective alert level for a bot
   */
  private getBotAlertLevel(bot: BotInstance): AlertLevel {
    // If bot has its own settings and doesn't use global
    if (bot.notifications && !bot.notifications.useGlobal) {
      return bot.notifications.alertLevel;
    }
    // Otherwise use global
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
    const message = AlertTemplates.tradeExecuted(
      bot.name,
      bot.tokenSymbol,
      tokenAmount,
      ethAmount,
      positionId
    );

    return this.notify(bot, {
      type: 'trade',
      message,
      timestamp: Date.now(),
      metadata: { positionId, tokenAmount, ethAmount },
    });
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
    const message = AlertTemplates.tradeProfit(
      bot.name,
      bot.tokenSymbol,
      profitPercent,
      profitEth,
      totalEth,
      positionId
    );

    return this.notify(bot, {
      type: 'profit',
      message,
      timestamp: Date.now(),
      metadata: { positionId, profitPercent, profitEth, totalEth },
    });
  }

  /**
   * Send error notification
   */
  async notifyError(
    bot: BotInstance,
    errorMessage: string,
    context?: string
  ): Promise<boolean> {
    const message = AlertTemplates.error(bot.name, errorMessage, context);

    return this.notify(bot, {
      type: 'error',
      message,
      timestamp: Date.now(),
      metadata: { error: errorMessage, context },
    });
  }

  /**
   * Send warning notification
   */
  async notifyWarning(
    bot: BotInstance,
    warningMessage: string,
    action?: string
  ): Promise<boolean> {
    const message = AlertTemplates.warning(bot.name, warningMessage, action);

    return this.notify(bot, {
      type: 'warning',
      message,
      timestamp: Date.now(),
      metadata: { warning: warningMessage, action },
    });
  }

  /**
   * Send bot stopped notification
   */
  async notifyBotStopped(
    bot: BotInstance,
    errorCount: number,
    reason: string
  ): Promise<boolean> {
    const message = AlertTemplates.botStopped(bot.name, errorCount, reason);

    return this.notify(bot, {
      type: 'warning',
      message,
      timestamp: Date.now(),
      metadata: { errorCount, reason },
    });
  }

  /**
   * Send daily summary (global, not bot-specific)
   */
  async sendDailySummary(
    totalProfitEth: string | bigint,
    totalTrades: number,
    buyCount: number,
    sellCount: number,
    activeBots: number
  ): Promise<boolean> {
    if (!this.notifier) return false;

    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    const message = AlertTemplates.dailySummary(
      date,
      totalProfitEth,
      totalTrades,
      buyCount,
      sellCount,
      activeBots
    );

    return this.notifier.notify({
      type: 'summary',
      botName: 'Daily Report',
      message,
      timestamp: Date.now(),
      metadata: { totalProfitEth, totalTrades, buyCount, sellCount, activeBots },
    });
  }

  /**
   * Send liquidation notification
   */
  async notifyLiquidation(
    bot: BotInstance,
    positionsLiquidated: number,
    totalEthReceived: string | bigint
  ): Promise<boolean> {
    const message = AlertTemplates.allPositionsLiquidated(
      bot.name,
      positionsLiquidated,
      totalEthReceived
    );

    return this.notify(bot, {
      type: 'warning',
      message,
      timestamp: Date.now(),
      metadata: { positionsLiquidated, totalEthReceived },
    });
  }

  /**
   * Send test notification
   */
  async sendTestNotification(): Promise<{ success: boolean; message: string }> {
    if (!this.notifier) {
      return {
        success: false,
        message: 'Notifications not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env',
      };
    }

    return this.notifier.sendTestMessage();
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
