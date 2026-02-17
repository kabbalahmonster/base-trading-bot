// src/notifications/TelegramNotifier.ts
// Telegram Bot API integration for trading bot alerts

import axios, { AxiosError } from 'axios';

export type AlertLevel = 'all' | 'trades-only' | 'errors-only' | 'none';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  alertLevel: AlertLevel;
}

export interface NotificationPayload {
  type: 'trade' | 'profit' | 'error' | 'warning' | 'summary';
  botName: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class TelegramNotifier {
  private config: TelegramConfig;
  private lastError: string | null = null;
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 5;
  private disabledUntil: number = 0;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  /**
   * Check if notifications are enabled and properly configured
   */
  isEnabled(): boolean {
    if (!this.config.enabled) return false;
    if (!this.config.botToken || !this.config.chatId) return false;
    if (this.config.alertLevel === 'none') return false;
    if (Date.now() < this.disabledUntil) return false;
    return true;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TelegramConfig>): void {
    this.config = { ...this.config, ...config };
    // Reset failure tracking on config update
    if (config.botToken || config.chatId) {
      this.consecutiveFailures = 0;
      this.disabledUntil = 0;
    }
  }

  /**
   * Get current configuration (without sensitive data)
   */
  getConfig(): Omit<TelegramConfig, 'botToken'> & { tokenConfigured: boolean } {
    return {
      chatId: this.config.chatId,
      enabled: this.config.enabled,
      alertLevel: this.config.alertLevel,
      tokenConfigured: !!this.config.botToken,
    };
  }

  /**
   * Send a notification if it passes the alert level filter
   */
  async notify(payload: NotificationPayload): Promise<boolean> {
    if (!this.isEnabled()) return false;
    if (!this.shouldSend(payload.type)) return false;

    try {
      const formattedMessage = this.formatMessage(payload);
      await this.sendTelegramMessage(formattedMessage);
      
      // Reset failure counter on success
      this.consecutiveFailures = 0;
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  /**
   * Send a test message to verify configuration
   */
  async sendTestMessage(): Promise<{ success: boolean; message: string }> {
    if (!this.config.botToken || !this.config.chatId) {
      return { 
        success: false, 
        message: 'Configuration incomplete: missing bot token or chat ID' 
      };
    }

    const testPayload: NotificationPayload = {
      type: 'summary',
      botName: 'Test',
      message: '🔔 Telegram notifications are configured correctly!\n\nYou will receive alerts for your trading bots here.',
      timestamp: Date.now(),
    };

    try {
      const formattedMessage = this.formatMessage(testPayload);
      await this.sendTelegramMessage(formattedMessage);
      return { success: true, message: 'Test message sent successfully!' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Failed to send test: ${errorMessage}` };
    }
  }

  /**
   * Check if notification type should be sent based on alert level
   */
  private shouldSend(type: NotificationPayload['type']): boolean {
    switch (this.config.alertLevel) {
      case 'all':
        return true;
      case 'trades-only':
        return type === 'trade' || type === 'profit';
      case 'errors-only':
        return type === 'error' || type === 'warning';
      case 'none':
        return false;
      default:
        return true;
    }
  }

  /**
   * Format payload into Telegram message with HTML formatting
   */
  private formatMessage(payload: NotificationPayload): string {
    const timestamp = new Date(payload.timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    let emoji: string;
    switch (payload.type) {
      case 'trade':
        emoji = '💹';
        break;
      case 'profit':
        emoji = '💰';
        break;
      case 'error':
        emoji = '⚠️';
        break;
      case 'warning':
        emoji = '⏸️';
        break;
      case 'summary':
        emoji = '📊';
        break;
      default:
        emoji = 'ℹ️';
    }

    let message = `${emoji} <b>${this.escapeHtml(payload.botName)}</b>\n`;
    message += `<code>${timestamp}</code>\n\n`;
    message += this.escapeHtml(payload.message);

    return message;
  }

  /**
   * Escape HTML special characters for Telegram HTML parse mode
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Send message via Telegram Bot API
   */
  private async sendTelegramMessage(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
    
    const response = await axios.post(url, {
      chat_id: this.config.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.data?.ok) {
      throw new Error(`Telegram API error: ${response.data?.description || 'Unknown error'}`);
    }
  }

  /**
   * Handle errors with exponential backoff
   */
  private handleError(error: unknown): void {
    this.consecutiveFailures++;
    
    let errorMessage = 'Unknown error';
    if (error instanceof AxiosError) {
      errorMessage = error.response?.data?.description || error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    this.lastError = errorMessage;

    // Log error but don't expose token
    const safeError = errorMessage.includes('token') 
      ? 'Authentication failed' 
      : errorMessage;
    
    console.error(`Telegram notification failed (${this.consecutiveFailures}/${this.maxConsecutiveFailures}): ${safeError}`);

    // Disable temporarily if too many failures
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      const backoffMinutes = Math.min(30, Math.pow(2, this.consecutiveFailures - this.maxConsecutiveFailures));
      this.disabledUntil = Date.now() + (backoffMinutes * 60 * 1000);
      console.error(`Telegram notifications disabled for ${backoffMinutes} minutes due to repeated failures`);
    }
  }

  /**
   * Get last error message (for debugging)
   */
  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Reset failure state (call after fixing configuration)
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.disabledUntil = 0;
    this.lastError = null;
  }

  /**
   * Format large numbers nicely (e.g., 1,234.56)
   */
  static formatNumber(num: number | string, decimals: number = 4): string {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '0';
    
    // For very small numbers, use scientific notation
    if (n > 0 && n < 0.0001) {
      return n.toExponential(2);
    }
    
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * Format ETH amounts with appropriate precision
   */
  static formatEth(wei: string | bigint, decimals: number = 6): string {
    try {
      const eth = typeof wei === 'bigint' 
        ? Number(wei) / 1e18 
        : parseFloat(wei) / 1e18;
      return TelegramNotifier.formatNumber(eth, decimals);
    } catch {
      return '0';
    }
  }

  /**
   * Format percentage with sign
   */
  static formatPercent(percent: number): string {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  }
}
