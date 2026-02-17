// tests/WalletManager.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WalletManager } from '../src/wallet/WalletManager';
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
      expect(wallet.publicKey).toBeDefined();
    });

    it('should load existing main wallet', () => {
      const wallet1 = walletManager.generateMainWallet();
      const wallet2 = walletManager.loadMainWallet();
      
      expect(wallet1.address).toBe(wallet2.address);
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
      expect(wallet.address).not.toBe(walletManager.getMainAccount().address);
    });

    it('should load existing bot wallet', () => {
      const botId = 'test-bot-1';
      const wallet1 = walletManager.generateBotWallet(botId);
      const wallet2 = walletManager.loadBotWallet(botId);
      
      expect(wallet1.address).toBe(wallet2.address);
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
      
      const walletFiles = fs.readdirSync(tempDir);
      const mainWalletFile = walletFiles.find(f => f.includes('main'));
      
      expect(mainWalletFile).toBeDefined();
      
      const encryptedData = fs.readFileSync(path.join(tempDir, mainWalletFile!), 'utf8');
      const walletData = JSON.parse(encryptedData);
      
      expect(walletData.encryptedPrivateKey).toBeDefined();
      expect(walletData.salt).toBeDefined();
      expect(walletData.iv).toBeDefined();
      expect(walletData.authTag).toBeDefined();
    });

    it('should not store plain text private key', () => {
      walletManager.generateMainWallet();
      
      const walletFiles = fs.readdirSync(tempDir);
      const mainWalletFile = walletFiles.find(f => f.includes('main'));
      const encryptedData = fs.readFileSync(path.join(tempDir, mainWalletFile!), 'utf8');
      
      // Should not contain typical private key patterns
      expect(encryptedData).not.toMatch(/0x[0-9a-fA-F]{64}/);
    });

    it('should decrypt wallet with correct password', async () => {
      walletManager.generateMainWallet();
      const account1 = walletManager.getMainAccount();
      
      // Create new instance with same directory
      const walletManager2 = new WalletManager(tempDir);
      await walletManager2.initialize(testPassword);
      const account2 = walletManager2.getMainAccount();
      
      expect(account1.address).toBe(account2.address);
    });

    it('should fail to decrypt with wrong password', async () => {
      walletManager.generateMainWallet();
      
      const walletManager2 = new WalletManager(tempDir);
      await expect(walletManager2.initialize('wrong-password')).rejects.toThrow();
    });

    it('should set file permissions to 600', () => {
      walletManager.generateMainWallet();
      
      const walletFiles = fs.readdirSync(tempDir);
      const mainWalletFile = walletFiles.find(f => f.includes('main'));
      const stats = fs.statSync(path.join(tempDir, mainWalletFile!));
      
      // Check permissions (0o600 in octal = 384 in decimal)
      // Note: Windows doesn't support Unix permissions, so this may not work on Windows
      if (process.platform !== 'win32') {
        const mode = stats.mode & 0o777;
        expect(mode).toBe(0o600);
      }
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
});
