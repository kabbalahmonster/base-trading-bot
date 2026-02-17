// tests/integration/WalletManager.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WalletManager } from '../../src/wallet/WalletManager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('WalletManager Integration Tests', () => {
  let tempDir: string;
  let walletManager: WalletManager;
  const testPassword = 'secure-test-password-123';
  const testRpcUrl = 'https://base.llamarpc.com';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-integration-test-'));
    walletManager = new WalletManager(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize with strong password', async () => {
      await walletManager.initialize(testPassword);
      expect(walletManager.isInitialized()).toBe(true);
    });

    it('should fail with weak password', async () => {
      await expect(walletManager.initialize('123')).rejects.toThrow();
      await expect(walletManager.initialize('weak')).rejects.toThrow();
    });

    it('should fail with empty password', async () => {
      await expect(walletManager.initialize('')).rejects.toThrow();
    });

    it('should throw when accessing wallet before initialization', () => {
      expect(() => walletManager.generateMainWallet()).toThrow('WalletManager not initialized');
      expect(() => walletManager.getMainAccount()).toThrow();
    });
  });

  describe('Main Wallet Operations', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
    });

    it('should generate main wallet with custom name', () => {
      const wallet = walletManager.generateMainWallet('My Trading Wallet');
      
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(wallet.name).toBe('My Trading Wallet');
      expect(wallet.type).toBe('main');
    });

    it('should auto-name wallets when name not provided', () => {
      const wallet1 = walletManager.generateMainWallet();
      const wallet2 = walletManager.generateMainWallet();

      expect(wallet1.name).toContain('Main Wallet');
      expect(wallet2.name).toContain('Main Wallet');
    });

    it('should retrieve primary wallet', () => {
      const wallet = walletManager.generateMainWallet('Primary');
      const primary = walletManager.getPrimaryWallet();

      expect(primary).toBeDefined();
      expect(primary?.address).toBe(wallet.address);
    });

    it('should set different primary wallet', () => {
      const wallet1 = walletManager.generateMainWallet('First');
      const wallet2 = walletManager.generateMainWallet('Second');

      const allWallets = walletManager.getAllWallets();
      const walletIds = Object.keys(allWallets);

      walletManager.setPrimaryWallet(walletIds[1]);

      const primary = walletManager.getPrimaryWallet();
      expect(primary?.address).toBe(wallet2.address);
    });

    it('should get account from primary wallet', () => {
      walletManager.generateMainWallet();
      const account = walletManager.getMainAccount();

      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(account.type).toBe('local');
    });

    it('should export private key for wallet', () => {
      walletManager.generateMainWallet();
      const allWallets = walletManager.getAllWallets();
      const firstWalletId = Object.keys(allWallets)[0];
      const privateKey = walletManager.exportPrivateKey(firstWalletId);

      expect(privateKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('Bot Wallet Operations', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
      walletManager.generateMainWallet();
    });

    it('should generate unique bot wallets', () => {
      const botWallet1 = walletManager.generateBotWallet('bot-1');
      const botWallet2 = walletManager.generateBotWallet('bot-2');

      expect(botWallet1.address).not.toBe(botWallet2.address);
      expect(botWallet1.type).toBe('bot');
      expect(botWallet2.type).toBe('bot');
    });

    it('should return same wallet for same bot ID', () => {
      const wallet1 = walletManager.generateBotWallet('same-bot');
      const wallet2 = walletManager.generateBotWallet('same-bot');

      expect(wallet1.address).toBe(wallet2.address);
    });

    it('should get account for specific bot', () => {
      walletManager.generateBotWallet('test-bot');
      const account = walletManager.getBotAccount('test-bot');

      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should get account by address', () => {
      const botWallet = walletManager.generateBotWallet('address-test');
      const account = walletManager.getAccountForAddress(botWallet.address);

      expect(account.address).toBe(botWallet.address);
    });

    it('should get wallet ID for address', () => {
      const botWallet = walletManager.generateBotWallet('id-test');
      const result = walletManager.getWalletIdForAddress(botWallet.address);

      expect(result).toBeDefined();
      expect(result?.wallet.address).toBe(botWallet.address);
      expect(result?.id).toBe('id-test');
    });
  });

  describe('Wallet Client Creation', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
      walletManager.generateMainWallet();
      walletManager.generateBotWallet('test-bot');
    });

    it('should create main wallet client', () => {
      const client = walletManager.getMainWalletClient(testRpcUrl);

      expect(client).toBeDefined();
      expect(client.account).toBeDefined();
    });

    it('should create bot wallet client', () => {
      const client = walletManager.getBotWalletClient('test-bot', testRpcUrl);

      expect(client).toBeDefined();
      expect(client.account).toBeDefined();
    });

    it('should create wallet client for any wallet', () => {
      const mainWalletId = Object.keys(walletManager.getMainWallets())[0];
      const client = walletManager.getWalletClient(mainWalletId, testRpcUrl);

      expect(client).toBeDefined();
    });
  });

  describe('Wallet Dictionary Management', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
    });

    it('should get all wallets', () => {
      walletManager.generateMainWallet('Main 1');
      walletManager.generateMainWallet('Main 2');
      walletManager.generateBotWallet('bot-1');

      const allWallets = walletManager.getAllWallets();
      const walletCount = Object.keys(allWallets).length;

      expect(walletCount).toBe(3);
    });

    it('should filter main wallets only', () => {
      walletManager.generateMainWallet();
      walletManager.generateMainWallet();
      walletManager.generateBotWallet('bot-1');

      const mainWallets = walletManager.getMainWallets();
      const mainWalletCount = Object.keys(mainWallets).length;

      expect(mainWalletCount).toBe(2);
      Object.values(mainWallets).forEach(w => expect(w.type).toBe('main'));
    });

    it('should filter bot wallets only', () => {
      walletManager.generateMainWallet();
      walletManager.generateBotWallet('bot-1');
      walletManager.generateBotWallet('bot-2');

      const botWallets = walletManager.getBotWallets();
      const botWalletCount = Object.keys(botWallets).length;

      expect(botWalletCount).toBe(2);
      Object.values(botWallets).forEach(w => expect(w.type).toBe('bot'));
    });

    it('should export wallet data', () => {
      walletManager.generateMainWallet('Export Test');
      walletManager.generateBotWallet('export-bot');

      const exported = walletManager.exportData();

      expect(exported.walletDictionary).toBeDefined();
      expect(exported.primaryWalletId).toBeDefined();
      expect(Object.keys(exported.walletDictionary).length).toBe(2);
    });

    it('should import wallet data', () => {
      walletManager.generateMainWallet('Original');
      const exported = walletManager.exportData();

      // Create new manager and import
      const newManager = new WalletManager(tempDir);
      newManager.importData(exported);

      const importedWallets = newManager.getAllWallets();
      expect(Object.keys(importedWallets).length).toBe(1);
    });
  });

  describe('Import/Export Operations', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
    });

    it('should preserve wallet across import/export', async () => {
      const originalWallet = walletManager.generateMainWallet('Persistent');
      const exported = walletManager.exportData();

      // Create new manager instance with same directory
      const newManager = new WalletManager(tempDir);
      newManager.importData(exported);
      await newManager.initialize(testPassword);

      const primary = newManager.getPrimaryWallet();
      expect(primary?.address).toBe(originalWallet.address);
    });

    it('should handle multiple main wallets', () => {
      const wallet1 = walletManager.generateMainWallet('First');
      const wallet2 = walletManager.generateMainWallet('Second');
      const wallet3 = walletManager.generateMainWallet('Third');

      const mainWallets = walletManager.getMainWallets();
      expect(Object.keys(mainWallets).length).toBe(3);

      const primaryId = walletManager.getPrimaryWalletId();
      expect(primaryId).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
    });

    it('should throw for non-existent bot wallet', () => {
      expect(() => walletManager.getBotWalletClient('non-existent', testRpcUrl)).toThrow();
    });

    it('should throw for non-existent wallet ID', () => {
      expect(() => walletManager.getAccount('non-existent')).toThrow();
    });

    it('should throw for unknown address', () => {
      expect(() => walletManager.getAccountForAddress('0x0000000000000000000000000000000000000000')).toThrow();
    });

    it('should throw when setting invalid primary wallet', () => {
      expect(() => walletManager.setPrimaryWallet('invalid-id')).toThrow();
    });

    it('should return null for unknown address lookup', () => {
      const result = walletManager.getWalletIdForAddress('0x0000000000000000000000000000000000000000');
      expect(result).toBeNull();
    });
  });
});
