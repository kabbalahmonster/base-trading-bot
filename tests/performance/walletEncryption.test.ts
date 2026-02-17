// tests/performance/walletEncryption.test.ts

import { describe, it, expect, bench, beforeEach } from 'vitest';
import { WalletManager } from '../../src/wallet/WalletManager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Wallet Encryption Performance', () => {
  let tempDir: string;
  let walletManager: WalletManager;
  const testPassword = 'test-password-for-performance-testing';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-perf-test-'));
    walletManager = new WalletManager(tempDir);
    await walletManager.initialize(testPassword);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('Wallet Generation Speed', () => {
    bench('generate main wallet', () => {
      walletManager.generateMainWallet();
    });

    bench('generate bot wallet', () => {
      walletManager.generateBotWallet('perf-test-bot');
    });

    it('should generate 10 wallets in under 500ms', () => {
      const start = performance.now();
      
      for (let i = 0; i < 10; i++) {
        walletManager.generateBotWallet(`bot-${i}`);
      }
      
      const end = performance.now();
      expect(end - start).toBeLessThan(500);
    });
  });

  describe('Encryption/Decryption Speed', () => {
    beforeEach(() => {
      walletManager.generateMainWallet();
    });

    bench('export private key (decrypt)', () => {
      const walletId = Object.keys(walletManager.getAllWallets())[0];
      walletManager.exportPrivateKey(walletId);
    });

    bench('create wallet client (decrypt + setup)', () => {
      walletManager.getMainWalletClient('https://base.llamarpc.com');
    });

    it('should decrypt wallet in under 100ms', () => {
      const walletId = Object.keys(walletManager.getAllWallets())[0];
      
      const start = performance.now();
      walletManager.exportPrivateKey(walletId);
      const end = performance.now();

      expect(end - start).toBeLessThan(100);
    });
  });

  describe('Multiple Wallet Operations', () => {
    beforeEach(() => {
      // Generate multiple wallets
      walletManager.generateMainWallet();
      for (let i = 0; i < 20; i++) {
        walletManager.generateBotWallet(`bot-${i}`);
      }
    });

    bench('getAllWallets with 21 wallets', () => {
      walletManager.getAllWallets();
    });

    bench('getMainWallets with 1 main wallet', () => {
      walletManager.getMainWallets();
    });

    bench('getBotWallets with 20 bot wallets', () => {
      walletManager.getBotWallets();
    });

    bench('exportData with 21 wallets', () => {
      walletManager.exportData();
    });

    it('should retrieve all 21 wallets in under 10ms', () => {
      const start = performance.now();
      const wallets = walletManager.getAllWallets();
      const end = performance.now();

      expect(Object.keys(wallets).length).toBe(21);
      expect(end - start).toBeLessThan(10);
    });
  });

  describe('Import/Export Performance', () => {
    it('should export 50 wallets quickly', () => {
      // Generate 50 wallets
      walletManager.generateMainWallet();
      for (let i = 0; i < 49; i++) {
        walletManager.generateBotWallet(`bot-${i}`);
      }

      const start = performance.now();
      const exported = walletManager.exportData();
      const end = performance.now();

      expect(Object.keys(exported.walletDictionary).length).toBe(50);
      expect(end - start).toBeLessThan(50);
    });

    it('should import 50 wallets quickly', () => {
      // Generate and export
      walletManager.generateMainWallet();
      for (let i = 0; i < 49; i++) {
        walletManager.generateBotWallet(`bot-${i}`);
      }
      const exported = walletManager.exportData();

      // Create new manager and import
      const newManager = new WalletManager(tempDir);
      
      const start = performance.now();
      newManager.importData(exported);
      const end = performance.now();

      expect(Object.keys(newManager.getAllWallets()).length).toBe(50);
      expect(end - start).toBeLessThan(50);
    });
  });

  describe('Client Creation Performance', () => {
    beforeEach(() => {
      walletManager.generateMainWallet();
      for (let i = 0; i < 10; i++) {
        walletManager.generateBotWallet(`bot-${i}`);
      }
    });

    it('should create 10 wallet clients in under 200ms', () => {
      const botIds = Object.keys(walletManager.getBotWallets());
      const rpcUrl = 'https://base.llamarpc.com';

      const start = performance.now();
      
      for (const botId of botIds) {
        walletManager.getBotWalletClient(botId, rpcUrl);
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(200);
    });
  });
});
