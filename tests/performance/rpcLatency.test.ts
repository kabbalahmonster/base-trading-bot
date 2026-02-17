// tests/performance/rpcLatency.test.ts

import { describe, it, expect, bench } from 'vitest';
import { createMockRpcProvider } from '../utils/mockRpcProvider.js';

describe('RPC Latency Benchmarks', () => {
  describe('Mock Provider Performance', () => {
    it('should measure basic RPC call latency', async () => {
      const mockProvider = createMockRpcProvider();
      const provider = mockProvider.getProvider();

      const start = performance.now();
      await provider({ method: 'eth_chainId' });
      const end = performance.now();

      const latency = end - start;
      expect(latency).toBeLessThan(10); // Should be very fast (mock)
    });

    bench('eth_chainId call', async () => {
      const mockProvider = createMockRpcProvider();
      const provider = mockProvider.getProvider();
      await provider({ method: 'eth_chainId' });
    });

    bench('eth_getBalance call', async () => {
      const mockProvider = createMockRpcProvider();
      const provider = mockProvider.getProvider();
      await provider({ 
        method: 'eth_getBalance',
        params: ['0x' + 'a'.repeat(40), 'latest']
      });
    });

    bench('eth_getBlockNumber call', async () => {
      const mockProvider = createMockRpcProvider();
      const provider = mockProvider.getProvider();
      await provider({ method: 'eth_blockNumber' });
    });

    bench('sequential multiple calls', async () => {
      const mockProvider = createMockRpcProvider();
      const provider = mockProvider.getProvider();
      
      await provider({ method: 'eth_chainId' });
      await provider({ method: 'eth_blockNumber' });
      await provider({ method: 'eth_gasPrice' });
      await provider({ 
        method: 'eth_getBalance',
        params: ['0x' + 'a'.repeat(40), 'latest']
      });
    });
  });

  describe('Simulated Network Latency', () => {
    it('should handle 100ms latency', async () => {
      const mockProvider = createMockRpcProvider();
      mockProvider.setDelay(100);
      const provider = mockProvider.getProvider();

      const start = performance.now();
      await provider({ method: 'eth_chainId' });
      const end = performance.now();

      const latency = end - start;
      expect(latency).toBeGreaterThanOrEqual(100);
      expect(latency).toBeLessThan(150); // Allow some overhead
    });

    it('should handle varying latency', async () => {
      const latencies = [10, 50, 100, 200];
      
      for (const delay of latencies) {
        const mockProvider = createMockRpcProvider();
        mockProvider.setDelay(delay);
        const provider = mockProvider.getProvider();

        const start = performance.now();
        await provider({ method: 'eth_chainId' });
        const end = performance.now();

        const actualLatency = end - start;
        expect(actualLatency).toBeGreaterThanOrEqual(delay * 0.8); // Allow 20% variance
      }
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests', async () => {
      const mockProvider = createMockRpcProvider();
      mockProvider.setDelay(10);
      const provider = mockProvider.getProvider();

      const start = performance.now();
      
      const promises = Array.from({ length: 10 }, () => 
        provider({ method: 'eth_getBalance', params: ['0x' + 'a'.repeat(40)] })
      );
      
      await Promise.all(promises);
      
      const end = performance.now();
      const totalTime = end - start;

      // Should be faster than sequential (10 * 10ms = 100ms)
      expect(totalTime).toBeLessThan(100);
    });

    bench('10 concurrent balance checks', async () => {
      const mockProvider = createMockRpcProvider();
      const provider = mockProvider.getProvider();
      
      const promises = Array.from({ length: 10 }, (_, i) => 
        provider({ 
          method: 'eth_getBalance', 
          params: [`0x${i.toString().padStart(40, '0')}`, 'latest']
        })
      );
      
      await Promise.all(promises);
    });
  });
});
