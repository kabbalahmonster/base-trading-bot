// tests/utils/mockRpcProvider.ts

import { vi } from 'vitest';

export interface MockRpcResponse {
  jsonrpc: string;
  id: number;
  result?: string;
  error?: { code: number; message: string };
}

export class MockRpcProvider {
  private responses: Map<string, MockRpcResponse> = new Map();
  private requestLog: Array<{ method: string; params: any[] }> = [];
  private delayMs: number = 0;

  /**
   * Set a mock response for a method
   */
  setResponse(method: string, result: string | object, error?: { code: number; message: string }) {
    const serializedResult = typeof result === 'object' ? JSON.stringify(result) : result;
    this.responses.set(method, {
      jsonrpc: '2.0',
      id: 1,
      result: serializedResult,
      ...(error && { error }),
    });
  }

  /**
   * Get the mock provider function for viem
   */
  getProvider() {
    return vi.fn().mockImplementation(async (request: any) => {
      if (this.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }

      const method = request.method || request;
      const params = request.params || [];
      this.requestLog.push({ method, params });

      // Handle common RPC methods
      switch (method) {
        case 'eth_chainId':
          return '0x2105'; // Base chainId
        case 'eth_blockNumber':
          return '0x' + Math.floor(Date.now() / 1000).toString(16);
        case 'eth_getBalance':
          return this.responses.get('eth_getBalance')?.result || '0xde0b6b3a7640000'; // 1 ETH default
        case 'eth_gasPrice':
          return this.responses.get('eth_gasPrice')?.result || '0x1';
        case 'eth_estimateGas':
          return this.responses.get('eth_estimateGas')?.result || '0x5208'; // 21000 default
        case 'eth_sendTransaction':
          return this.responses.get('eth_sendTransaction')?.result || '0x' + 'a'.repeat(64);
        case 'eth_getTransactionReceipt':
          return this.responses.get('eth_getTransactionReceipt')?.result || JSON.stringify({
            status: '0x1',
            transactionHash: '0x' + 'a'.repeat(64),
            blockNumber: '0x1',
            gasUsed: '0x5208',
          });
        case 'eth_call':
          return this.responses.get('eth_call')?.result || '0x';
        default:
          const response = this.responses.get(method);
          if (response) {
            if (response.error) throw new Error(response.error.message);
            return response.result;
          }
          return '0x';
      }
    });
  }

  /**
   * Get all recorded requests
   */
  getRequests() {
    return [...this.requestLog];
  }

  /**
   * Get requests for a specific method
   */
  getRequestsForMethod(method: string) {
    return this.requestLog.filter(r => r.method === method);
  }

  /**
   * Clear all recorded requests
   */
  clearRequests() {
    this.requestLog = [];
  }

  /**
   * Set artificial delay for requests
   */
  setDelay(ms: number) {
    this.delayMs = ms;
  }

  /**
   * Create a public client mock
   */
  createPublicClientMock() {
    return {
      getBalance: vi.fn().mockResolvedValue(BigInt('1000000000000000000')), // 1 ETH
      getBlockNumber: vi.fn().mockResolvedValue(BigInt(1000000)),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: 'success',
        transactionHash: '0x' + 'a'.repeat(64),
        blockNumber: BigInt(1000001),
        gasUsed: BigInt(21000),
      }),
      readContract: vi.fn().mockResolvedValue(BigInt('1000000000000000000')),
      getChainId: vi.fn().mockResolvedValue(8453),
    };
  }

  /**
   * Create a wallet client mock
   */
  createWalletClientMock() {
    return {
      sendTransaction: vi.fn().mockResolvedValue('0x' + 'a'.repeat(64)),
      writeContract: vi.fn().mockResolvedValue('0x' + 'b'.repeat(64)),
      account: {
        address: '0x' + 'c'.repeat(40),
        type: 'local',
      },
      chain: {
        id: 8453,
        name: 'Base',
      },
    };
  }
}

/**
 * Factory function to create a fresh mock provider
 */
export function createMockRpcProvider() {
  return new MockRpcProvider();
}
