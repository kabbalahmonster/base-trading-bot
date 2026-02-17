// tests/utils/mockZeroXApi.ts

import { vi } from 'vitest';
import { ZeroXQuote } from '../../src/types/index.js';

export interface MockQuoteOptions {
  buyAmount?: string;
  sellAmount?: string;
  gas?: string;
  gasPrice?: string;
  price?: string;
  shouldFail?: boolean;
  errorMessage?: string;
  delayMs?: number;
}

export class MockZeroXApi {
  private buyQuote: ZeroXQuote | null = null;
  private sellQuote: ZeroXQuote | null = null;
  private shouldFail: boolean = false;
  private errorMessage: string = 'API Error';
  private delayMs: number = 0;
  private requestLog: Array<{ type: string; params: any }> = [];

  constructor(options: MockQuoteOptions = {}) {
    this.setDefaultQuotes(options);
  }

  /**
   * Set default mock quotes
   */
  setDefaultQuotes(options: MockQuoteOptions = {}) {
    this.buyQuote = options.shouldFail ? null : {
      buyToken: '0x696381f39F17cAD67032f5f52A4924ce84e51BA3',
      sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      buyAmount: options.buyAmount || '1000000000000000000000', // 1000 tokens
      sellAmount: options.sellAmount || '1000000000000000', // 0.001 ETH
      price: options.price || '0.000001',
      gas: options.gas || '200000',
      gasPrice: options.gasPrice || '1000000000',
      to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
      data: '0x' + '0'.repeat(128),
      value: options.sellAmount || '1000000000000000',
      allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
    };

    this.sellQuote = options.shouldFail ? null : {
      buyToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      sellToken: '0x696381f39F17cAD67032f5f52A4924ce84e51BA3',
      buyAmount: '1500000000000000', // 0.0015 ETH
      sellAmount: '1000000000000000000000', // 1000 tokens
      price: '0.0000015',
      gas: options.gas || '200000',
      gasPrice: options.gasPrice || '1000000000',
      to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
      data: '0x' + '0'.repeat(128),
      value: '0',
      allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
    };

    this.shouldFail = options.shouldFail || false;
    this.errorMessage = options.errorMessage || 'API Error';
    this.delayMs = options.delayMs || 0;
  }

  /**
   * Mock getBuyQuote
   */
  async getBuyQuote(
    tokenAddress: string,
    ethAmount: string,
    takerAddress: string,
    slippageBps: number = 100
  ): Promise<ZeroXQuote | null> {
    this.requestLog.push({ type: 'buy', params: { tokenAddress, ethAmount, takerAddress, slippageBps } });
    
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }

    return this.buyQuote;
  }

  /**
   * Mock getSellQuote
   */
  async getSellQuote(
    tokenAddress: string,
    tokenAmount: string,
    takerAddress: string,
    slippageBps: number = 100
  ): Promise<ZeroXQuote | null> {
    this.requestLog.push({ type: 'sell', params: { tokenAddress, tokenAmount, takerAddress, slippageBps } });
    
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }

    return this.sellQuote;
  }

  /**
   * Mock getTokenPrice
   */
  async getTokenPrice(tokenAddress: string, takerAddress: string): Promise<number | null> {
    this.requestLog.push({ type: 'price', params: { tokenAddress, takerAddress } });
    
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail) {
      return null;
    }

    return 0.0005; // Default mock price
  }

  /**
   * Mock isProfitable
   */
  async isProfitable(
    tokenAddress: string,
    tokenAmount: string,
    ethCostBasis: string,
    minProfitPercent: number,
    takerAddress: string
  ): Promise<{ profitable: boolean; quote: ZeroXQuote | null; actualProfit: number }> {
    this.requestLog.push({ type: 'isProfitable', params: { tokenAddress, tokenAmount, ethCostBasis, minProfitPercent, takerAddress } });
    
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail) {
      return { profitable: false, quote: null, actualProfit: 0 };
    }

    // Simulate profit calculation
    const ethReceived = BigInt(this.sellQuote?.buyAmount || '0');
    const gasCost = BigInt(this.sellQuote?.gas || '0') * BigInt(this.sellQuote?.gasPrice || '0');
    const ethCost = BigInt(ethCostBasis);
    const netEth = ethReceived - gasCost;
    const profit = netEth - ethCost;
    const profitPercent = Number((profit * BigInt(10000)) / ethCost) / 100;
    const minProfit = (ethCost * BigInt(Math.floor(minProfitPercent * 100))) / BigInt(10000);

    return {
      profitable: profit >= minProfit,
      quote: this.sellQuote,
      actualProfit: profitPercent,
    };
  }

  /**
   * Set custom buy quote
   */
  setBuyQuote(quote: ZeroXQuote | null) {
    this.buyQuote = quote;
  }

  /**
   * Set custom sell quote
   */
  setSellQuote(quote: ZeroXQuote | null) {
    this.sellQuote = quote;
  }

  /**
   * Simulate API failure
   */
  setFailure(shouldFail: boolean, errorMessage: string = 'API Error') {
    this.shouldFail = shouldFail;
    this.errorMessage = errorMessage;
  }

  /**
   * Set response delay
   */
  setDelay(ms: number) {
    this.delayMs = ms;
  }

  /**
   * Get request log
   */
  getRequests() {
    return [...this.requestLog];
  }

  /**
   * Clear request log
   */
  clearRequests() {
    this.requestLog = [];
  }

  /**
   * Get number of requests made
   */
  getRequestCount(): number {
    return this.requestLog.length;
  }

  /**
   * Create mock instance for dependency injection
   */
  createMock() {
    return {
      getBuyQuote: vi.fn(this.getBuyQuote.bind(this)),
      getSellQuote: vi.fn(this.getSellQuote.bind(this)),
      getTokenPrice: vi.fn(this.getTokenPrice.bind(this)),
      isProfitable: vi.fn(this.isProfitable.bind(this)),
      getTokenPriceBySell: vi.fn(this.getTokenPrice.bind(this)),
      calculateMinProfit: vi.fn().mockResolvedValue({
        minEthRequired: '1000000000000000',
        quote: this.sellQuote,
      }),
    };
  }
}

/**
 * Factory function to create a fresh mock
 */
export function createMockZeroXApi(options: MockQuoteOptions = {}) {
  return new MockZeroXApi(options);
}
