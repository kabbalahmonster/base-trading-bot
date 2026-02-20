/**
 * @fileoverview 0x Protocol API client for the Base Grid Trading Bot
 * @module api/ZeroXApi
 * @version 1.4.0
 */

import chalk from 'chalk';
import axios, { AxiosInstance } from 'axios';
import { parseEther } from 'viem';
import { ZeroXQuote, Chain } from '../types/index.js';

const ZEROX_API_BASE = 'https://api.0x.org';

/**
 * Chain ID mapping for 0x API
 * @constant {Record<Chain, number>}
 */
const CHAIN_ID_MAP: Record<Chain, number> = {
  base: 8453,
  ethereum: 1,
};

/**
 * Client for the 0x Protocol swap API with multi-chain support
 * @class ZeroXApi
 * @description Handles price discovery and swap quotes from 0x Protocol
 */
export class ZeroXApi {
  private client: AxiosInstance;
  private chainId: number;

  /**
   * Creates a new 0x API client
   * @constructor
   * @param {string} [apiKey] - Optional 0x API key for higher rate limits
   * @param {Chain} [chain='base'] - Blockchain to use ('base' | 'ethereum')
   */
  constructor(apiKey?: string, chain: Chain = 'base') {
    this.chainId = CHAIN_ID_MAP[chain];
    
    this.client = axios.create({
      baseURL: ZEROX_API_BASE,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        '0x-version': 'v2',
        ...(apiKey && { '0x-api-key': apiKey }),
      },
    });

    if (!apiKey) {
      console.log(chalk.yellow('⚠️  No 0x API key provided. Trading may fail or be rate-limited.'));
      console.log(chalk.dim('   Get a free key at: https://dashboard.0x.org/apps'));
    }
  }

  /**
   * Update the chain for API calls
   * @param {Chain} chain - New chain ('base' | 'ethereum')
   * @description Changes the chain for subsequent API calls. Useful for multi-chain bots.
   */
  setChain(chain: Chain): void {
    this.chainId = CHAIN_ID_MAP[chain];
  }

  /**
   * Get the current chain ID
   * @returns {number} Chain ID (8453 for Base, 1 for Ethereum)
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * Get quote for buying tokens with ETH
   * @param {string} tokenAddress - Token contract address to buy
   * @param {string} ethAmount - ETH amount in wei
   * @param {string} takerAddress - Address executing the swap
   * @param {number} [slippageBps=100] - Slippage tolerance in basis points (100 = 1%)
   * @returns {Promise<ZeroXQuote | null>} Swap quote or null if unavailable
   * @description Fetches a quote from 0x API for swapping ETH to tokens
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
          chainId: this.chainId,
          sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
          buyToken: tokenAddress,
          sellAmount: ethAmount,
          slippageBps: slippageBps.toString(),
          taker: takerAddress,
        },
      });

      // Debug: log full response structure
      console.log(chalk.dim(`   0x API response keys: ${Object.keys(response.data).join(', ')}`));
      
      // Check if transaction data might be nested differently (0x API v2 format)
      if (response.data.transaction) {
        console.log(chalk.dim(`   Found nested transaction object`));
        // Merge transaction data into top level for compatibility
        response.data.to = response.data.transaction.to;
        response.data.data = response.data.transaction.data;
        response.data.value = response.data.transaction.value;
        response.data.gas = response.data.transaction.gas;
        response.data.gasPrice = response.data.transaction.gasPrice;
      }
      
      // Check if this is an error response
      if (response.data.error) {
        console.error('   0x API returned error:', response.data.error);
        return null;
      }

      // Check if we have transaction data
      if (!response.data.to || !response.data.data) {
        console.error('   0x API returned price quote but no transaction data');
        console.error('   Response has buyAmount:', !!response.data.buyAmount);
        console.error('   Response has to:', !!response.data.to);
        console.error('   Response has data:', !!response.data.data);
        console.error('   Check if transaction data is nested under a different key');
        return null;
      }

      return response.data;
    } catch (error: any) {
      console.error('0x API error (buy quote):', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get quote for selling tokens for ETH
   * @param {string} tokenAddress - Token contract address to sell
   * @param {string} tokenAmount - Token amount in wei
   * @param {string} takerAddress - Address executing the swap
   * @param {number} [slippageBps=100] - Slippage tolerance in basis points (100 = 1%)
   * @returns {Promise<ZeroXQuote | null>} Swap quote or null if unavailable
   * @description Fetches a quote from 0x API for swapping tokens to ETH
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
          chainId: this.chainId,
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
   * Check if selling would be profitable after gas costs
   * @param {string} tokenAddress - Token contract address
   * @param {string} tokenAmount - Amount to sell in wei
   * @param {string} ethCostBasis - Original ETH cost in wei
   * @param {number} minProfitPercent - Minimum profit percentage required
   * @param {string} takerAddress - Address executing the swap
   * @returns {Promise<Object>} Profitability check result
   * @returns {boolean} return.profitable - Whether sale meets profit threshold
   * @returns {ZeroXQuote | null} return.quote - The swap quote used
   * @returns {number} return.actualProfit - Actual profit percentage
   * @description Calculates if selling tokens would be profitable considering
   * gas costs and minimum profit requirements.
   */
  async isProfitable(
    tokenAddress: string,
    tokenAmount: string,
    ethCostBasis: string,
    minProfitPercent: number,
    takerAddress: string,
    strictMode: boolean = true,
    fallbackGasEth: number = 0.00001
  ): Promise<{ profitable: boolean; quote: ZeroXQuote | null; actualProfit: number; strictCheck?: boolean }> {
    const quote = await this.getSellQuote(tokenAddress, tokenAmount, takerAddress);

    if (!quote) {
      return { profitable: false, quote: null, actualProfit: 0 };
    }

    // Validate quote has buyAmount
    if (!quote.buyAmount) {
      console.error('   Sell quote missing buyAmount');
      return { profitable: false, quote: null, actualProfit: 0 };
    }

    const ethReceived = BigInt(quote.buyAmount);
    const ethCost = BigInt(ethCostBasis);

    // Handle missing gas estimates - use configured fallback
    let gasCost: bigint;
    if (quote.gas && quote.gasPrice) {
      gasCost = BigInt(quote.gas) * BigInt(quote.gasPrice);
    } else {
      // Use configured fallback gas estimate (default: 0.00001 ETH)
      gasCost = parseEther(fallbackGasEth.toString());
      console.log(chalk.yellow(`   ⚠ Using estimated gas cost: ${fallbackGasEth} ETH`));
    }

    // Calculate actual profit after gas
    const netEth = ethReceived - gasCost;
    const profit = netEth - ethCost;
    const profitPercent = ethCost > 0 ? Number((profit * BigInt(10000)) / ethCost) / 100 : 0;

    // STRICT MODE: Enforce minimum received ETH >= (cost + gas) * 1.02
    // This guarantees at least 2% profit on every trade
    if (strictMode) {
      const minRequiredEth = ((ethCost + gasCost) * BigInt(102)) / BigInt(100);
      const meetsStrictMinimum = ethReceived >= minRequiredEth;

      return {
        profitable: meetsStrictMinimum,
        quote,
        actualProfit: profitPercent,
        strictCheck: meetsStrictMinimum,
      };
    }

    // Legacy mode: Check against minimum profit percentage
    const minProfit = (ethCost * BigInt(Math.floor(minProfitPercent * 100))) / BigInt(10000);

    return {
      profitable: profit >= minProfit,
      quote,
      actualProfit: profitPercent,
    };
  }

  /**
   * Get current token price in ETH per token
   * Uses 0x price endpoint for consistent data
   * @param {string} tokenAddress - Token contract address
   * @param {string} takerAddress - Taker address for the quote
   * @returns {Promise<number | null>} Price in ETH per token or null if unavailable
   * @description Fetches price from 0x API by simulating a small buy.
   * Returns ETH/token price ratio.
   */
  async getTokenPrice(tokenAddress: string, takerAddress: string): Promise<number | null> {
    try {
      // Use 0x price endpoint (doesn't require taker to have balance)
      const response = await this.client.get('/swap/allowance-holder/price', {
        params: {
          chainId: this.chainId,
          sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
          buyToken: tokenAddress,
          sellAmount: '1000000000000000', // 0.001 ETH
          taker: takerAddress,
        },
      });

      if (response.data && response.data.buyAmount) {
        // Calculate price: ETH amount / token amount
        const ethWei = BigInt('1000000000000000'); // 0.001 ETH in wei
        const tokensWei = BigInt(response.data.buyAmount);
        
        // Price = ETH / tokens
        const price = Number(ethWei) / Number(tokensWei);
        return price;
      }
      
      return null;
    } catch (error: any) {
      // Silently fail - will use cached price
      return null;
    }
  }

  /**
   * Get token price by selling (for tokens we hold)
   */
  async getTokenPriceBySell(tokenAddress: string, takerAddress: string): Promise<number | null> {
    try {
      const response = await this.client.get('/swap/allowance-holder/price', {
        params: {
          chainId: this.chainId,
          sellToken: tokenAddress,
          buyToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // ETH
          sellAmount: '1000000000000000000', // 1 token (assuming 18 decimals)
          taker: takerAddress,
        },
      });

      if (response.data && response.data.buyAmount) {
        // Calculate price: ETH received / 1 token
        const ethWei = BigInt(response.data.buyAmount);
        const price = Number(ethWei) / 1e18;
        return price;
      }
      
      return null;
    } catch (error: any) {
      return null;
    }
  }
}
