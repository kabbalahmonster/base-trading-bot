// src/notifications/DiscordNotifier.ts
// Discord webhook notifications for trading bot

import { AlertLevel } from '../types/index.js';

export interface DiscordConfig {
  webhookUrl: string;
  enabled: boolean;
  alertLevel: AlertLevel;
  username?: string;
  avatarUrl?: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: {
    name: string;
    value: string;
    inline?: boolean;
  }[];
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export interface DiscordMessage {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

export class DiscordNotifier {
  private config: DiscordConfig;
  private lastError: string | null = null;
  private lastErrorTime: number = 0;

  constructor(config: DiscordConfig) {
    this.config = {
      username: '🤖 Base Trading Bot',
      avatarUrl: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.png',
      ...config,
    };
  }

  /**
   * Check if Discord is configured and enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.config.webhookUrl;
  }

  /**
   * Get current configuration
   */
  getConfig(): DiscordConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DiscordConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if this alert type should be sent based on level
   */
  shouldSend(type: 'trade' | 'profit' | 'error' | 'warning' | 'summary'): boolean {
    if (!this.isEnabled()) return false;

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
   * Send a message to Discord webhook
   */
  async sendMessage(message: string, embeds?: DiscordEmbed[]): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      const payload: DiscordMessage = {
        content: message,
        username: this.config.username,
        avatar_url: this.config.avatarUrl,
        embeds,
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Discord webhook error: ${response.status} - ${error}`);
      }

      return true;
    } catch (error: any) {
      this.lastError = error.message;
      this.lastErrorTime = Date.now();
      console.error('Discord notification failed:', error.message);
      return false;
    }
  }

  /**
   * Send trade notification with rich embed
   */
  async notifyTrade(
    botName: string,
    tokenSymbol: string,
    action: 'buy' | 'sell',
    amount: string,
    ethValue: string,
    positionId?: number,
    txHash?: string
  ): Promise<boolean> {
    if (!this.shouldSend('trade')) return false;

    const color = action === 'buy' ? 0x00ff00 : 0xff9900; // Green for buy, Orange for sell
    const emoji = action === 'buy' ? '🟢' : '🟠';
    
    const embed: DiscordEmbed = {
      title: `${emoji} ${action.toUpperCase()} Executed`,
      description: `**${botName}** ${action === 'buy' ? 'bought' : 'sold'} **${tokenSymbol}**`,
      color,
      fields: [
        {
          name: '💰 Amount',
          value: amount,
          inline: true,
        },
        {
          name: 'Ξ ETH Value',
          value: ethValue,
          inline: true,
        },
        ...(positionId !== undefined ? [{
          name: '📍 Position',
          value: `#${positionId}`,
          inline: true,
        }] : []),
        ...(txHash ? [{
          name: '🔗 Transaction',
          value: `[View on BaseScan](https://basescan.org/tx/${txHash})`,
          inline: false,
        }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Base Trading Bot',
      },
    };

    return this.sendMessage('', [embed]);
  }

  /**
   * Send profit notification
   */
  async notifyProfit(
    botName: string,
    tokenSymbol: string,
    profitPercent: number,
    profitEth: string,
    positionId?: number
  ): Promise<boolean> {
    if (!this.shouldSend('profit')) return false;

    const isPositive = profitPercent >= 0;
    const color = isPositive ? 0x00ff00 : 0xff0000;
    const emoji = isPositive ? '💰' : '📉';

    const embed: DiscordEmbed = {
      title: `${emoji} Profit Realized`,
      description: `**${botName}** sold **${tokenSymbol}** with profit!`,
      color,
      fields: [
        {
          name: '📈 Profit %',
          value: `${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%`,
          inline: true,
        },
        {
          name: 'Ξ Profit',
          value: profitEth,
          inline: true,
        },
        ...(positionId !== undefined ? [{
          name: '📍 Position',
          value: `#${positionId}`,
          inline: true,
        }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Base Trading Bot',
      },
    };

    return this.sendMessage('', [embed]);
  }

  /**
   * Send error notification
   */
  async notifyError(
    botName: string,
    errorMessage: string,
    context?: string
  ): Promise<boolean> {
    if (!this.shouldSend('error')) return false;

    const embed: DiscordEmbed = {
      title: '❌ Error',
      description: `**${botName}** encountered an error`,
      color: 0xff0000,
      fields: [
        {
          name: '⚠️ Error',
          value: errorMessage.slice(0, 1024), // Discord field limit
          inline: false,
        },
        ...(context ? [{
          name: '📝 Context',
          value: context.slice(0, 1024),
          inline: false,
        }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Base Trading Bot',
      },
    };

    return this.sendMessage('@here', [embed]);
  }

  /**
   * Send warning notification
   */
  async notifyWarning(
    botName: string,
    warningMessage: string,
    action?: string
  ): Promise<boolean> {
    if (!this.shouldSend('warning')) return false;

    const embed: DiscordEmbed = {
      title: '⚠️ Warning',
      description: `**${botName}** warning`,
      color: 0xffa500,
      fields: [
        {
          name: '⚠️ Warning',
          value: warningMessage.slice(0, 1024),
          inline: false,
        },
        ...(action ? [{
          name: '🎯 Action',
          value: action.slice(0, 1024),
          inline: false,
        }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Base Trading Bot',
      },
    };

    return this.sendMessage('', [embed]);
  }

  /**
   * Send daily summary
   */
  async sendDailySummary(
    date: string,
    totalProfitEth: string,
    totalTrades: number,
    buyCount: number,
    sellCount: number,
    activeBots: number
  ): Promise<boolean> {
    if (!this.shouldSend('summary')) return false;

    const embed: DiscordEmbed = {
      title: '📊 Daily Summary',
      description: `Trading report for **${date}**`,
      color: 0x0099ff,
      fields: [
        {
          name: '💰 Total Profit',
          value: `${totalProfitEth} ETH`,
          inline: true,
        },
        {
          name: '🔄 Total Trades',
          value: totalTrades.toString(),
          inline: true,
        },
        {
          name: '🤖 Active Bots',
          value: activeBots.toString(),
          inline: true,
        },
        {
          name: '🟢 Buys',
          value: buyCount.toString(),
          inline: true,
        },
        {
          name: '🟠 Sells',
          value: sellCount.toString(),
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Base Trading Bot',
      },
    };

    return this.sendMessage('', [embed]);
  }

  /**
   * Send circuit breaker notification
   */
  async notifyCircuitBreaker(
    reason: string,
    dailyLossPercent: number,
    cooldownMinutes: number
  ): Promise<boolean> {
    const embed: DiscordEmbed = {
      title: '🚨 Circuit Breaker Triggered',
      description: 'All trading has been stopped due to risk limits.',
      color: 0xff0000,
      fields: [
        {
          name: '⚠️ Reason',
          value: reason,
          inline: false,
        },
        {
          name: '📉 Daily Loss',
          value: `${dailyLossPercent.toFixed(2)}%`,
          inline: true,
        },
        {
          name: '⏱️ Cooldown',
          value: `${cooldownMinutes} minutes`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Base Trading Bot - Risk Management',
      },
    };

    return this.sendMessage('@everyone', [embed]);
  }

  /**
   * Send test notification
   */
  async sendTestMessage(): Promise<{ success: boolean; message: string }> {
    if (!this.config.webhookUrl) {
      return {
        success: false,
        message: 'Discord webhook URL not configured. Set DISCORD_WEBHOOK_URL in .env',
      };
    }

    const embed: DiscordEmbed = {
      title: '✅ Test Notification',
      description: 'Your Discord notifications are working correctly!',
      color: 0x00ff00,
      fields: [
        {
          name: '🔔 Alert Level',
          value: this.config.alertLevel,
          inline: true,
        },
        {
          name: '🤖 Bot Name',
          value: this.config.username || 'Base Trading Bot',
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    const success = await this.sendMessage('', [embed]);

    if (success) {
      return {
        success: true,
        message: 'Test notification sent successfully to Discord!',
      };
    } else {
      return {
        success: false,
        message: this.lastError || 'Failed to send Discord notification',
      };
    }
  }

  /**
   * Get last error info
   */
  getLastError(): { message: string; time: number } | null {
    if (!this.lastError) return null;
    return {
      message: this.lastError,
      time: this.lastErrorTime,
    };
  }
}
