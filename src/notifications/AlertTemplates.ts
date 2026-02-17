// src/notifications/AlertTemplates.ts
// Predefined alert message templates with emojis

import { TelegramNotifier } from './TelegramNotifier.js';

export class AlertTemplates {
  /**
   * Trade executed notification
   * "✅ Bot-1 bought 1000 COMPUTE at 0.0001 ETH"
   */
  static tradeExecuted(
    botName: string,
    tokenSymbol: string,
    tokenAmount: string | number,
    ethAmount: string | number,
    positionId?: number
  ): string {
    const formattedTokens = TelegramNotifier.formatNumber(tokenAmount, 2);
    const formattedEth = TelegramNotifier.formatNumber(ethAmount, 6);
    const positionInfo = positionId !== undefined ? ` (Position ${positionId})` : '';
    
    return `✅ <b>BUY EXECUTED</b>${positionInfo}\n\n` +
           `🤖 Bot: ${botName}\n` +
           `💎 Bought: ${formattedTokens} ${tokenSymbol}\n` +
           `💵 Cost: ${formattedEth} ETH`;
  }

  /**
   * Trade profit notification
   * "💰 Bot-1 sold for +8% profit (0.001 ETH)"
   */
  static tradeProfit(
    botName: string,
    tokenSymbol: string,
    profitPercent: number,
    profitEth: string | bigint,
    totalEth?: string | bigint,
    positionId?: number
  ): string {
    const formattedProfit = TelegramNotifier.formatEth(profitEth, 6);
    const percentStr = TelegramNotifier.formatPercent(profitPercent);
    const positionInfo = positionId !== undefined ? ` (Position ${positionId})` : '';
    
    let message = `💰 <b>PROFIT REALIZED</b>${positionInfo}\n\n` +
                  `🤖 Bot: ${botName}\n` +
                  `💎 Sold: ${tokenSymbol}\n` +
                  `📈 Profit: ${percentStr} (${formattedProfit} ETH)`;
    
    if (totalEth !== undefined) {
      message += `\n💵 Total Received: ${TelegramNotifier.formatEth(totalEth, 6)} ETH`;
    }
    
    return message;
  }

  /**
   * Error notification
   * "⚠️ Bot-1 error: insufficient funds"
   */
  static error(
    botName: string,
    errorMessage: string,
    context?: string
  ): string {
    const safeMessage = errorMessage.length > 200 
      ? errorMessage.substring(0, 200) + '...' 
      : errorMessage;
    
    let message = `⚠️ <b>ERROR ALERT</b>\n\n` +
                  `🤖 Bot: ${botName}\n` +
                  `❌ Error: ${safeMessage}`;
    
    if (context) {
      message += `\n📍 Context: ${context}`;
    }
    
    return message;
  }

  /**
   * Warning notification
   * "⏸ Bot-1 stopped after 5 errors"
   */
  static warning(
    botName: string,
    warningMessage: string,
    action?: string
  ): string {
    let message = `⏸️ <b>WARNING</b>\n\n` +
                  `🤖 Bot: ${botName}\n` +
                  `⚡ ${warningMessage}`;
    
    if (action) {
      message += `\n🔄 Action: ${action}`;
    }
    
    return message;
  }

  /**
   * Bot stopped due to errors
   */
  static botStopped(
    botName: string,
    errorCount: number,
    reason: string
  ): string {
    return `🛑 <b>BOT STOPPED</b>\n\n` +
           `🤖 Bot: ${botName}\n` +
           `⚠️ Stopped after ${errorCount} consecutive errors\n` +
           `📝 Reason: ${reason}`;
  }

  /**
   * Daily summary notification
   * "📊 Daily Report: +0.05 ETH profit, 12 trades"
   */
  static dailySummary(
    date: string,
    totalProfitEth: string | bigint,
    totalTrades: number,
    buyCount: number,
    sellCount: number,
    activeBots: number
  ): string {
    const formattedProfit = TelegramNotifier.formatEth(totalProfitEth, 6);
    const profitEmoji = parseFloat(formattedProfit) >= 0 ? '🟢' : '🔴';
    
    return `📊 <b>DAILY SUMMARY - ${date}</b>\n\n` +
           `${profitEmoji} Total Profit: ${formattedProfit} ETH\n` +
           `📈 Total Trades: ${totalTrades}\n` +
           `   • Buys: ${buyCount}\n` +
           `   • Sells: ${sellCount}\n` +
           `🤖 Active Bots: ${activeBots}`;
  }

  /**
   * Position liquidated (emergency exit)
   */
  static positionLiquidated(
    botName: string,
    tokenSymbol: string,
    positionId: number,
    ethReceived: string | bigint
  ): string {
    return `🚨 <b>POSITION LIQUIDATED</b>\n\n` +
           `🤖 Bot: ${botName}\n` +
           `💎 Token: ${tokenSymbol}\n` +
           `📍 Position: ${positionId}\n` +
           `💵 Received: ${TelegramNotifier.formatEth(ethReceived, 6)} ETH`;
  }

  /**
   * All positions liquidated (emergency)
   */
  static allPositionsLiquidated(
    botName: string,
    positionsLiquidated: number,
    totalEthReceived: string | bigint
  ): string {
    return `🚨 <b>EMERGENCY LIQUIDATION COMPLETE</b>\n\n` +
           `🤖 Bot: ${botName}\n` +
           `📊 Positions Sold: ${positionsLiquidated}\n` +
           `💵 Total ETH Received: ${TelegramNotifier.formatEth(totalEthReceived, 6)} ETH`;
  }

  /**
   * Grid initialized notification
   */
  static gridInitialized(
    botName: string,
    tokenSymbol: string,
    positionCount: number,
    currentPrice: number,
    floorPrice: number,
    ceilingPrice: number
  ): string {
    return `📐 <b>GRID INITIALIZED</b>\n\n` +
           `🤖 Bot: ${botName}\n` +
           `💎 Token: ${tokenSymbol}\n` +
           `📊 Positions: ${positionCount}\n` +
           `💵 Current Price: ${TelegramNotifier.formatNumber(currentPrice, 8)} ETH\n` +
           `📉 Floor: ${TelegramNotifier.formatNumber(floorPrice, 8)} ETH\n` +
           `📈 Ceiling: ${TelegramNotifier.formatNumber(ceilingPrice, 8)} ETH`;
  }

  /**
   * Low balance warning
   */
  static lowBalance(
    botName: string,
    walletAddress: string,
    currentBalance: number,
    minimumRecommended: number
  ): string {
    return `⚠️ <b>LOW BALANCE WARNING</b>\n\n` +
           `🤖 Bot: ${botName}\n` +
           `💳 Wallet: ${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}\n` +
           `💵 Current: ${TelegramNotifier.formatNumber(currentBalance, 6)} ETH\n` +
           `📊 Recommended: ${TelegramNotifier.formatNumber(minimumRecommended, 6)} ETH`;
  }

  /**
   * Configuration change notification
   */
  static configChanged(
    botName: string,
    changes: string[]
  ): string {
    const changesList = changes.map(c => `  • ${c}`).join('\n');
    return `⚙️ <b>CONFIGURATION UPDATED</b>\n\n` +
           `🤖 Bot: ${botName}\n` +
           `📝 Changes:\n${changesList}`;
  }

  /**
   * Bot started/stopped notification
   */
  static botStatusChanged(
    botName: string,
    tokenSymbol: string,
    isRunning: boolean
  ): string {
    const status = isRunning ? 'STARTED' : 'STOPPED';
    const emoji = isRunning ? '▶️' : '⏹️';
    return `${emoji} <b>BOT ${status}</b>\n\n` +
           `🤖 Bot: ${botName}\n` +
           `💎 Token: ${tokenSymbol}`;
  }

  /**
   * Test notification message
   */
  static testMessage(): string {
    return `🔔 <b>NOTIFICATION TEST</b>\n\n` +
           `✅ Telegram notifications are working correctly!\n\n` +
           `You will receive alerts for:\n` +
           `  • Trade executions\n` +
           `  • Profit realized\n` +
           `  • Errors and warnings\n` +
           `  • Daily summaries`;
  }
}
