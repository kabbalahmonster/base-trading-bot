// src/notifications/TelegramBot.ts
// Telegram Bot wrapper for trading bot notifications

import { TelegramNotifier, TelegramConfig, NotificationPayload, AlertLevel } from './TelegramNotifier.js';

export interface TelegramBotConfig {
  botToken: string;
  chatId: string;
  enabled?: boolean;
  alertLevel?: AlertLevel;
}

/**
 * TelegramBot - Wrapper class for Telegram notifications
 * 
 * This class provides a simplified interface for sending Telegram messages
 * from the trading bot. It wraps the TelegramNotifier with a more
 * straightforward API focused on trading bot use cases.
 */
export class TelegramBot {
  private notifier: TelegramNotifier;
  private config: TelegramConfig;

  constructor(config: TelegramBotConfig) {
    this.config = {
      botToken: config.botToken,
      chatId: config.chatId,
      enabled: config.enabled ?? true,
      alertLevel: config.alertLevel ?? 'all',
    };
    this.notifier = new TelegramNotifier(this.config);
  }

  /**
   * Initialize the bot with credentials from environment variables
   */
  static fromEnv(): TelegramBot | null {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.log('⚠️  Telegram not configured: Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
      return null;
    }

    return new TelegramBot({
      botToken,
      chatId,
      enabled: true,
      alertLevel: 'all',
    });
  }

  /**
   * Send a simple text message
   */
  async sendMessage(message: string, options?: { parseMode?: 'HTML' | 'Markdown' }): Promise<boolean> {
    try {
      // For simple messages, we bypass the notifier's formatting
      await this.sendRawMessage(message, options?.parseMode);
      return true;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return false;
    }
  }

  /**
   * Send a trade notification
   */
  async sendTradeAlert(botName: string, tokenSymbol: string, tokenAmount: string, ethAmount: string, positionId?: number): Promise<boolean> {
    const positionStr = positionId !== undefined ? ` (Position #${positionId})` : '';
    const message = `🛒 <b>Buy Executed${positionStr}</b>\n\n` +
      `Token: <b>${tokenSymbol}</b>\n` +
      `Amount: ${tokenAmount} tokens\n` +
      `Cost: ${ethAmount} ETH`;

    const payload: NotificationPayload = {
      type: 'trade',
      botName,
      message,
      timestamp: Date.now(),
      metadata: { tokenSymbol, tokenAmount, ethAmount, positionId },
    };

    return this.notifier.notify(payload);
  }

  /**
   * Send a profit notification
   */
  async sendProfitAlert(botName: string, tokenSymbol: string, profitPercent: number, profitEth: string, positionId?: number): Promise<boolean> {
    const positionStr = positionId !== undefined ? ` (Position #${positionId})` : '';
    const message = `💰 <b>Profit Realized${positionStr}</b>\n\n` +
      `Token: <b>${tokenSymbol}</b>\n` +
      `Profit: <b>+${profitPercent.toFixed(2)}%</b>\n` +
      `Earned: ${profitEth} ETH`;

    const payload: NotificationPayload = {
      type: 'profit',
      botName,
      message,
      timestamp: Date.now(),
      metadata: { tokenSymbol, profitPercent, profitEth, positionId },
    };

    return this.notifier.notify(payload);
  }

  /**
   * Send an error notification
   */
  async sendErrorAlert(botName: string, errorMessage: string, context?: string): Promise<boolean> {
    const contextStr = context ? `\nContext: ${context}` : '';
    const message = `⚠️ <b>Error in ${botName}</b>\n\n` +
      `${errorMessage}${contextStr}`;

    const payload: NotificationPayload = {
      type: 'error',
      botName,
      message,
      timestamp: Date.now(),
      metadata: { error: errorMessage, context },
    };

    return this.notifier.notify(payload);
  }

  /**
   * Test the connection to Telegram
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    return this.notifier.sendTestMessage();
  }

  /**
   * Check if the bot is properly configured and enabled
   */
  isConfigured(): boolean {
    return this.notifier.isEnabled();
  }

  /**
   * Get bot configuration (safe - no token)
   */
  getConfig(): { chatId: string; enabled: boolean; alertLevel: AlertLevel } {
    const config = this.notifier.getConfig();
    return {
      chatId: config.chatId,
      enabled: config.enabled,
      alertLevel: config.alertLevel,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TelegramBotConfig>): void {
    this.notifier.updateConfig({
      ...this.config,
      ...config,
    });
  }

  /**
   * Send raw message directly to Telegram API
   */
  private async sendRawMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<void> {
    const axios = (await import('axios')).default;
    
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
    
    const response = await axios.post(url, {
      chat_id: this.config.chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.data?.ok) {
      throw new Error(`Telegram API error: ${response.data?.description || 'Unknown error'}`);
    }
  }
}

export default TelegramBot;
