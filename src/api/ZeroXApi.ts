// src/api/ZeroXApi.ts

import axios, { AxiosInstance } from 'axios';
import { ZeroXQuote, TradeResult } from '../types';

const ZEROX_API_BASE = 'https://api.0x.org';
const CHAIN_ID = 8453; // Base

export class ZeroXApi {
  private client: AxiosInstance;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    
    this.client = axios.create({
      baseURL: ZEROX_API_BASE,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        '0x-version': 'v2',
        ...(apiKey && { '0x-api-key': apiKey }),
      },
    });
  }

  /**
   * Get quote for buying tokens with ETH
   */
  async getBuyQuote(
    tokenAddress: string,
    ethAmount: string,
    takerAddress: string,
    slippageBps: number = 100 // 1%
  ): Promise<ZeroXQuote | null> {
    try {
      const response = await this.client.get('/swap/allowance-holder/quote', {
        params: {
          chainId: CHAIN_ID,
          sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
          buyToken: tokenAddress,
          sellAmount: ethAmount,
          slippageBps: slippageBps.toString(),
          taker: takerAddress,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('0x API error (buy quote):', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get quote for selling tokens for ETH
   */
  async getSellQuote(
    tokenAddress: string,
    tokenAmount: string,
    takerAddress: string,
    slippageBps: number = 100
  ): Promise<ZeroXQuote | null> {
    try {
      const response = await this.client.get('/swap/allowance-holder/quote', {
        params: {
          chainId: CHAIN_ID,
          sellToken: tokenAddress,
          buyToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
          sellAmount: tokenAmount,
          slippageBps: slippageBps.toString(),
          taker: takerAddress,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('0x API error (sell quote):', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Calculate minimum profit after gas
   */
  async calculateMinProfit(
    tokenAddress: string,
    tokenAmount: string,
    ethCostBasis: string,
    minProfitPercent: number,
    takerAddress: string
  ): Promise<{ minEthRequired: string; quote: ZeroXQuote | null }> {
    const quote = await this.getSellQuote(tokenAddress, tokenAmount, takerAddress);
    
    if (!quote) {
      return { minEthRequired: '0', quote: null };
    }

    const ethReceived = BigInt(quote.buyAmount);
    const gasCost = BigInt(quote.gas) * BigInt(quote.gasPrice);
    const ethCost = BigInt(ethCostBasis);

    // Calculate minimum required ETH (cost + profit%)
    const minProfit = (ethCost * BigInt(Math.floor(minProfitPercent * 100))) / BigInt(10000);
    const minEthRequired = ethCost + minProfit + gasCost;

    return {
      minEthRequired: minEthRequired.toString(),
      quote,
    };
  }

  /**
   * Check if sell would be profitable
   */
  async isProfitable(
    tokenAddress: string,
    tokenAmount: string,
    ethCostBasis: string,
    minProfitPercent: number,
    takerAddress: string
  ): Promise<{ profitable: boolean; quote: ZeroXQuote | null; actualProfit: number }> {
    const quote = await this.getSellQuote(tokenAddress, tokenAmount, takerAddress);
    
    if (!quote) {
      return { profitable: false, quote: null, actualProfit: 0 };
    }

    const ethReceived = BigInt(quote.buyAmount);
    const gasCost = BigInt(quote.gas) * BigInt(quote.gasPrice);
    const ethCost = BigInt(ethCostBasis);

    // Calculate actual profit after gas
    const netEth = ethReceived - gasCost;
    const profit = netEth - ethCost;
    const profitPercent = Number((profit * BigInt(10000)) / ethCost) / 100;

    // Check against minimum
    const minProfit = (ethCost * BigInt(Math.floor(minProfitPercent * 100))) / BigInt(10000);

    return {
      profitable: profit >= minProfit,
      quote,
      actualProfit: profitPercent,
    };
  }
}
