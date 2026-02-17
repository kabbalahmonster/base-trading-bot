// tests/WalletManager.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WalletManager } from '../src/wallet/WalletManager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('WalletManager', () => {
  let walletManager: WalletManager;
  let tempDir: string;
  const testPassword = 'test-password-123';

  beforeEach(() => {
    // Create temp directory for test wallets
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-test-'));
    
    // Initialize with temp directory
    walletManager = new WalletManager(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('initialization', () => {
    it('should initialize with password', async () => {
      await walletManager.initialize(testPassword);
      expect(walletManager.isInitialized()).toBe(true);
    });

    it('should fail to initialize with empty password', async () => {
      await expect(walletManager.initialize('')).rejects.toThrow();
    });

    it('should fail to initialize with short password', async () => {
      await expect(walletManager.initialize('123')).rejects.toThrow();
    });
  });

  describe('main wallet', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
    });

    it('should generate main wallet', () => {
      const wallet = walletManager.generateMainWallet();
      
      expect(wallet).toBeDefined();
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should retrieve primary wallet', () => {
      walletManager.generateMainWallet();
      const wallet = walletManager.getPrimaryWallet();
      
      expect(wallet).toBeDefined();
      expect(wallet?.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should retrieve main account', () => {
      walletManager.generateMainWallet();
      const account = walletManager.getMainAccount();
      
      expect(account).toBeDefined();
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should throw if main wallet not found', () => {
      expect(() => walletManager.getMainAccount()).toThrow();
    });
  });

  describe('bot wallets', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
      walletManager.generateMainWallet();
    });

    it('should generate bot wallet', () => {
      const botId = 'test-bot-1';
      const wallet = walletManager.generateBotWallet(botId);
      
      expect(wallet).toBeDefined();
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(wallet.address).not.toBe(walletManager.getPrimaryWallet()?.address);
    });

    it('should generate unique wallets for different bots', () => {
      const wallet1 = walletManager.generateBotWallet('bot-1');
      const wallet2 = walletManager.generateBotWallet('bot-2');
      
      expect(wallet1.address).not.toBe(wallet2.address);
    });

    it('should return same wallet for same bot ID', () => {
      const botId = 'test-bot';
      const wallet1 = walletManager.generateBotWallet(botId);
      const wallet2 = walletManager.generateBotWallet(botId);
      
      expect(wallet1.address).toBe(wallet2.address);
    });
  });

  describe('encryption', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
    });

    it('should encrypt wallet data', () => {
      walletManager.generateMainWallet();
      
      const wallet = walletManager.getPrimaryWallet();
      expect(wallet).toBeDefined();
      expect(wallet?.encryptedPrivateKey).toBeDefined();
      expect(wallet?.encryptedPrivateKey).toContain(':');
    });

    it('should not store plain text private key', () => {
      walletManager.generateMainWallet();
      
      const wallet = walletManager.getPrimaryWallet();
      const encryptedData = wallet?.encryptedPrivateKey || '';
      
      // Should not contain typical private key patterns (0x followed by 64 hex chars)
      expect(encryptedData).not.toMatch(/^[0-9a-fA-F]{64}$/);
    });

    it('should decrypt wallet with correct password', async () => {
      walletManager.generateMainWallet();
      const account1 = walletManager.getMainAccount();
      
      // Create new instance with same directory
      const walletManager2 = new WalletManager(tempDir);
      await walletManager2.initialize(testPassword);
      walletManager2.importData(walletManager.exportData());
      const account2 = walletManager2.getMainAccount();
      
      expect(account1.address).toBe(account2.address);
    });

    it('should fail to decrypt with wrong password', async () => {
      walletManager.generateMainWallet();
      
      const walletManager2 = new WalletManager(tempDir);
      await expect(walletManager2.initialize('wrong-password')).rejects.toThrow();
    });
  });

  describe('wallet clients', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
    });

    it('should create main wallet client', () => {
      walletManager.generateMainWallet();
      const client = walletManager.getMainWalletClient('https://base.llamarpc.com');
      
      expect(client).toBeDefined();
      expect(client.account).toBeDefined();
    });

    it('should create bot wallet client', () => {
      walletManager.generateMainWallet();
      walletManager.generateBotWallet('test-bot');
      
      const client = walletManager.getBotWalletClient('test-bot', 'https://base.llamarpc.com');
      
      expect(client).toBeDefined();
      expect(client.account).toBeDefined();
    });

    it('should throw for non-existent bot wallet', () => {
      expect(() => walletManager.getBotWalletClient('non-existent', 'https://base.llamarpc.com')).toThrow();
    });
  });

  describe('wallet management', () => {
    beforeEach(async () => {
      await walletManager.initialize(testPassword);
    });

    it('should get all wallets', () => {
      walletManager.generateMainWallet('Main 1');
      walletManager.generateBotWallet('bot-1');
      
      const allWallets = walletManager.getAllWallets();
      expect(Object.keys(allWallets).length).toBe(2);
    });

    it('should filter main wallets only', () => {
      walletManager.generateMainWallet();
      walletManager.generateBotWallet('bot-1');
      
      const mainWallets = walletManager.getMainWallets();
      expect(Object.keys(mainWallets).length).toBe(1);
    });

    it('should filter bot wallets only', () => {
      walletManager.generateMainWallet();
      walletManager.generateBotWallet('bot-1');
      walletManager.generateBotWallet('bot-2');
      
      const botWallets = walletManager.getBotWallets();
      expect(Object.keys(botWallets).length).toBe(2);
    });

    it('should export and import wallet data', () => {
      const wallet = walletManager.generateMainWallet('Export Test');
      walletManager.generateBotWallet('export-bot');

      const exported = walletManager.exportData();

      expect(exported.walletDictionary).toBeDefined();
      expect(Object.keys(exported.walletDictionary).length).toBe(2);

      // Create new manager and import
      const newManager = new WalletManager(tempDir);
      newManager.importData(exported);

      const importedWallets = newManager.getAllWallets();
      expect(Object.keys(importedWallets).length).toBe(2);
    });
  });
});
