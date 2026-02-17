// src/analytics/CsvExporter.ts

import { TradeRecord } from './PnLTracker.js';

export interface CsvExportOptions {
  startDate?: Date;
  endDate?: Date;
  botId?: string;
  includeHeaders?: boolean;
}

/**
 * Exports trade data to CSV format for tax reporting
 */
export class CsvExporter {
  private static readonly CSV_HEADERS = [
    'Date',
    'Time',
    'Bot ID',
    'Bot Name',
    'Token Symbol',
    'Token Address',
    'Action',
    'Amount (tokens)',
    'Price (ETH)',
    'ETH Value',
    'Gas Cost (ETH)',
    'Profit (ETH)',
    'Profit %',
    'Position ID',
    'Transaction Hash',
  ];

  /**
   * Export trades to CSV string
   */
  static exportToCsv(trades: TradeRecord[], options: CsvExportOptions = {}): string {
    const { includeHeaders = true } = options;

    let filtered = trades;

    if (options.startDate || options.endDate) {
      const start = options.startDate?.getTime() || 0;
      const end = options.endDate?.getTime() || Date.now();
      filtered = filtered.filter(t => t.timestamp >= start && t.timestamp <= end);
    }

    if (options.botId) {
      filtered = filtered.filter(t => t.botId === options.botId);
    }

    // Sort by date ascending
    filtered.sort((a, b) => a.timestamp - b.timestamp);

    const lines: string[] = [];

    if (includeHeaders) {
      lines.push(this.CSV_HEADERS.join(','));
    }

    for (const trade of filtered) {
      const date = new Date(trade.timestamp);
      const dateStr = date.toISOString().split('T')[0];
      const timeStr = date.toISOString().split('T')[1].split('.')[0];

      const row = [
        dateStr,
        timeStr,
        this.escapeCsv(trade.botId),
        this.escapeCsv(trade.botName),
        this.escapeCsv(trade.tokenSymbol),
        trade.tokenAddress,
        trade.action,
        this.formatAmount(trade.amount),
        trade.price.toString(),
        this.formatEth(trade.ethValue),
        this.formatEth(trade.gasCost),
        trade.profit ? this.formatEth(trade.profit) : '0',
        trade.profitPercent ? trade.profitPercent.toFixed(2) : '0',
        trade.positionId?.toString() || '',
        trade.txHash,
      ];

      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Generate filename for export
   */
  static generateFilename(options: CsvExportOptions = {}): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    if (options.botId) {
      return `pnl_${options.botId.slice(0, 8)}_${dateStr}.csv`;
    }

    return `pnl_all_${dateStr}.csv`;
  }

  /**
   * Escape special characters for CSV
   */
  private static escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Format wei amount to ETH string
   */
  private static formatEth(wei: string): string {
    const eth = BigInt(wei) / BigInt(10 ** 18);
    const remainder = BigInt(wei) % BigInt(10 ** 18);
    const decimal = remainder.toString().padStart(18, '0').slice(0, 6);
    return `${eth}.${decimal}`;
  }

  /**
   * Format token amount (assumes 18 decimals)
   */
  private static formatAmount(wei: string): string {
    return this.formatEth(wei);
  }
}
