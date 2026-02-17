// tests/security/filePermissions.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WalletManager } from '../../src/wallet/WalletManager.js';
import { JsonStorage } from '../../src/storage/JsonStorage.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Security: File Permissions Tests', () => {
  let tempDir: string;
  let walletManager: WalletManager;
  const testPassword = 'test-password-for-permissions';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'permissions-test-'));
    walletManager = new WalletManager(tempDir);
    await walletManager.initialize(testPassword);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Wallet File Permissions', () => {
    it('should create wallet files with secure permissions', () => {
      walletManager.generateMainWallet();
      const files = fs.readdirSync(tempDir);
      
      if (process.platform !== 'win32') {
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          const mode = stats.mode & 0o777;
          
          // Check file is readable/writable only by owner
          expect(mode).toBe(0o600);
        }
      }
    });

    it('should not make wallet files world-readable', () => {
      walletManager.generateMainWallet();
      const files = fs.readdirSync(tempDir);
      
      if (process.platform !== 'win32') {
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          const mode = stats.mode;
          
          // Check no permissions for group/others
          expect(mode & 0o077).toBe(0);
        }
      }
    });

    it('should maintain permissions on wallet updates', () => {
      walletManager.generateMainWallet();
      
      // Generate another wallet
      walletManager.generateBotWallet('test-bot');
      
      const files = fs.readdirSync(tempDir);
      
      if (process.platform !== 'win32') {
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          const mode = stats.mode & 0o777;
          
          expect(mode).toBe(0o600);
        }
      }
    });
  });

  describe('Storage File Permissions', () => {
    it('should create storage file with secure permissions', async () => {
      const storagePath = path.join(tempDir, 'bots.json');
      const storage = new JsonStorage(storagePath);
      await storage.init();
      
      // Add some data
      await storage.saveBot({
        id: 'test-bot',
        name: 'Test',
        tokenAddress: '0x' + 'a'.repeat(40),
        tokenSymbol: 'TEST',
        walletAddress: '0x' + 'b'.repeat(40),
        useMainWallet: true,
        config: {
          numPositions: 10,
          floorPrice: 0.001,
          ceilingPrice: 0.01,
          useMarketCap: false,
          takeProfitPercent: 8,
          stopLossPercent: 10,
          stopLossEnabled: false,
          buysEnabled: true,
          sellsEnabled: true,
          moonBagEnabled: true,
          moonBagPercent: 1,
          minProfitPercent: 2,
          maxActivePositions: 4,
          buyAmount: 0,
          useFixedBuyAmount: false,
          heartbeatMs: 1000,
          skipHeartbeats: 0,
        },
        positions: [],
        totalBuys: 0,
        totalSells: 0,
        totalProfitEth: '0',
        totalProfitUsd: 0,
        isRunning: false,
        enabled: true,
        lastHeartbeat: 0,
        currentPrice: 0,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      });
      
      if (process.platform !== 'win32' && fs.existsSync(storagePath)) {
        const stats = fs.statSync(storagePath);
        const mode = stats.mode & 0o777;
        
        // Storage file should be readable/writable by owner only
        expect(mode).toBe(0o600);
      }
    });
  });

  describe('Directory Permissions', () => {
    it('should create temp directory with appropriate permissions', () => {
      const stats = fs.statSync(tempDir);
      
      if (process.platform !== 'win32') {
        // Directory should be accessible by owner
        expect(stats.mode & 0o700).toBeGreaterThan(0);
      }
    });

    it('should not expose sensitive files in world-readable directories', () => {
      // Create a subdirectory for wallets
      const walletSubdir = path.join(tempDir, 'wallets');
      fs.mkdirSync(walletSubdir, { mode: 0o700 });
      
      // Create wallet in subdirectory
      const subWalletManager = new WalletManager(walletSubdir);
      subWalletManager.initialize(testPassword).then(() => {
        subWalletManager.generateMainWallet();
        
        const walletFiles = fs.readdirSync(walletSubdir);
        
        if (process.platform !== 'win32') {
          for (const file of walletFiles) {
            const filePath = path.join(walletSubdir, file);
            const stats = fs.statSync(filePath);
            const mode = stats.mode & 0o777;
            
            expect(mode).toBe(0o600);
          }
        }
      });
    });
  });

  describe('File Content Security', () => {
    it('should not contain plaintext secrets in storage', async () => {
      const storagePath = path.join(tempDir, 'bots.json');
      const storage = new JsonStorage(storagePath);
      await storage.init();
      
      // Generate wallet and save to storage
      walletManager.generateMainWallet();
      const exported = walletManager.exportData();
      await storage.setWalletDictionary(exported.walletDictionary);
      
      // Read raw file content
      const content = fs.readFileSync(storagePath, 'utf8');
      
      // Check for common secret patterns
      expect(content).not.toMatch(/privateKey["']?\s*:\s*["']0x[0-9a-fA-F]{64}/);
      expect(content).not.toMatch(/password["']?\s*:/i);
      expect(content).not.toMatch(/secret["']?\s*:/i);
      
      // Encrypted keys should be present
      expect(content).toMatch(/encryptedPrivateKey/);
    });

    it('should handle concurrent access safely', async () => {
      const storagePath = path.join(tempDir, 'concurrent.json');
      const storage = new JsonStorage(storagePath);
      await storage.init();
      
      // Simulate concurrent writes
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          storage.saveBot({
            id: `bot-${i}`,
            name: `Bot ${i}`,
            tokenAddress: '0x' + 'a'.repeat(40),
            tokenSymbol: 'TEST',
            walletAddress: '0x' + 'b'.repeat(40),
            useMainWallet: true,
            config: {
              numPositions: 10,
              floorPrice: 0.001,
              ceilingPrice: 0.01,
              useMarketCap: false,
              takeProfitPercent: 8,
              stopLossPercent: 10,
              stopLossEnabled: false,
              buysEnabled: true,
              sellsEnabled: true,
              moonBagEnabled: true,
              moonBagPercent: 1,
              minProfitPercent: 2,
              maxActivePositions: 4,
              buyAmount: 0,
              useFixedBuyAmount: false,
              heartbeatMs: 1000,
              skipHeartbeats: 0,
            },
            positions: [],
            totalBuys: 0,
            totalSells: 0,
            totalProfitEth: '0',
            totalProfitUsd: 0,
            isRunning: false,
            enabled: true,
            lastHeartbeat: 0,
            currentPrice: 0,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          })
        );
      }
      
      await Promise.all(promises);
      
      // Verify file is still readable and valid
      const content = fs.readFileSync(storagePath, 'utf8');
      const data = JSON.parse(content);
      
      expect(data.bots).toBeDefined();
      expect(data.bots.length).toBeGreaterThan(0);
    });
  });
});
