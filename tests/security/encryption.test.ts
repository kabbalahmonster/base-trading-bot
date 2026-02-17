// tests/security/encryption.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WalletManager } from '../../src/wallet/WalletManager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Security: Encryption Tests', () => {
  let tempDir: string;
  let walletManager: WalletManager;
  const testPassword = 'Secure-Password-123!';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-test-'));
    walletManager = new WalletManager(tempDir);
    await walletManager.initialize(testPassword);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('Private Key Encryption', () => {
    it('should encrypt private keys with strong encryption', () => {
      walletManager.generateMainWallet();
      const walletFiles = fs.readdirSync(tempDir);
      
      expect(walletFiles.length).toBeGreaterThan(0);
      
      const walletFile = fs.readFileSync(path.join(tempDir, walletFiles[0]), 'utf8');
      const walletData = JSON.parse(walletFile);
      
      // Verify encryption structure
      expect(walletData.encryptedPrivateKey).toBeDefined();
      expect(walletData.encryptedPrivateKey).toContain(':'); // salt:ciphertext format
      
      const [salt, ciphertext] = walletData.encryptedPrivateKey.split(':');
      expect(salt.length).toBeGreaterThan(16); // Should have substantial salt
      expect(ciphertext.length).toBeGreaterThan(32); // Should have ciphertext
    });

    it('should not store private keys in plaintext', () => {
      walletManager.generateMainWallet();
      const walletFiles = fs.readdirSync(tempDir);
      const walletFile = fs.readFileSync(path.join(tempDir, walletFiles[0]), 'utf8');
      
      // Check for common private key patterns (64 hex chars after 0x)
      expect(walletFile).not.toMatch(/0x[0-9a-fA-F]{64}/);
      
      // Should not contain raw hex that looks like a private key
      const privateKeyPattern = /[\"'][0-9a-fA-F]{64}[\"']/;
      expect(walletFile).not.toMatch(privateKeyPattern);
    });

    it('should use unique salt for each encryption', () => {
      walletManager.generateMainWallet('Wallet 1');
      walletManager.generateMainWallet('Wallet 2');
      
      const walletFiles = fs.readdirSync(tempDir);
      const salts: string[] = [];
      
      for (const file of walletFiles) {
        const walletData = JSON.parse(fs.readFileSync(path.join(tempDir, file), 'utf8'));
        const [salt] = walletData.encryptedPrivateKey.split(':');
        salts.push(salt);
      }
      
      // All salts should be unique
      const uniqueSalts = new Set(salts);
      expect(uniqueSalts.size).toBe(salts.length);
    });

    it('should fail to decrypt with wrong password', async () => {
      walletManager.generateMainWallet();
      const exported = walletManager.exportData();
      
      // Create new manager with wrong password
      const newManager = new WalletManager(tempDir);
      await newManager.initialize('WrongPassword123!');
      newManager.importData(exported);
      
      expect(() => newManager.getMainAccount()).toThrow();
    });

    it('should successfully decrypt with correct password', async () => {
      const originalWallet = walletManager.generateMainWallet();
      const exported = walletManager.exportData();
      
      // Create new manager with correct password
      const newManager = new WalletManager(tempDir);
      await newManager.initialize(testPassword);
      newManager.importData(exported);
      
      const account = newManager.getMainAccount();
      expect(account.address).toBe(originalWallet.address);
    });

    it('should handle password variations correctly', async () => {
      walletManager.generateMainWallet();
      const exported = walletManager.exportData();
      
      // Test similar but different passwords
      const similarPasswords = [
        testPassword.toLowerCase(),
        testPassword.toUpperCase(),
        testPassword + '1',
        testPassword.slice(0, -1),
      ];
      
      for (const wrongPassword of similarPasswords) {
        const newManager = new WalletManager(tempDir);
        await newManager.initialize(wrongPassword);
        newManager.importData(exported);
        
        expect(() => newManager.getMainAccount()).toThrow();
      }
    });
  });

  describe('Password Strength', () => {
    it('should reject very short passwords', async () => {
      await expect(walletManager.initialize('123')).rejects.toThrow();
      await expect(walletManager.initialize('ab')).rejects.toThrow();
      await expect(walletManager.initialize('x')).rejects.toThrow();
    });

    it('should reject empty passwords', async () => {
      await expect(walletManager.initialize('')).rejects.toThrow();
    });

    it('should accept reasonably strong passwords', async () => {
      const strongPasswords = [
        'StrongPass123!',
        'My-Wallet-Password-2024',
        'C0mpl3x!P@ssw0rd',
        'This is a long passphrase with spaces',
      ];
      
      for (const password of strongPasswords) {
        const newTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwd-test-'));
        const newManager = new WalletManager(newTempDir);
        
        await expect(newManager.initialize(password)).resolves.not.toThrow();
        
        fs.rmSync(newTempDir, { recursive: true });
      }
    });
  });

  describe('Wallet File Security', () => {
    it('should set restrictive file permissions on wallet files', () => {
      walletManager.generateMainWallet();
      const walletFiles = fs.readdirSync(tempDir);
      
      if (process.platform !== 'win32') {
        for (const file of walletFiles) {
          const stats = fs.statSync(path.join(tempDir, file));
          const mode = stats.mode & 0o777;
          expect(mode).toBe(0o600); // Owner read/write only
        }
      }
    });

    it('should store only necessary data in wallet files', () => {
      walletManager.generateMainWallet('Test Wallet');
      const walletFiles = fs.readdirSync(tempDir);
      const walletData = JSON.parse(fs.readFileSync(path.join(tempDir, walletFiles[0]), 'utf8'));
      
      // Allowed fields
      expect(walletData.address).toBeDefined();
      expect(walletData.encryptedPrivateKey).toBeDefined();
      expect(walletData.createdAt).toBeDefined();
      expect(walletData.name).toBeDefined();
      expect(walletData.type).toBeDefined();
      
      // Should NOT contain private key
      expect(walletData.privateKey).toBeUndefined();
    });
  });

  describe('Export Security', () => {
    it('should export encrypted data only', () => {
      walletManager.generateMainWallet();
      const exported = walletManager.exportData();
      
      // All private keys in export should be encrypted
      for (const [id, wallet] of Object.entries(exported.walletDictionary)) {
        expect(wallet.encryptedPrivateKey).toBeDefined();
        expect(wallet.encryptedPrivateKey).toContain(':');
        
        // Should not have plaintext privateKey field
        expect((wallet as any).privateKey).toBeUndefined();
      }
    });

    it('should handle export data integrity', () => {
      walletManager.generateMainWallet();
      const exported = walletManager.exportData();
      
      // Tamper with encrypted data
      const walletId = Object.keys(exported.walletDictionary)[0];
      exported.walletDictionary[walletId].encryptedPrivateKey = 'invalid:data';
      
      // Import tampered data
      const newManager = new WalletManager(tempDir);
      newManager.importData(exported);
      
      // Should throw on decryption attempt
      expect(() => newManager.getMainAccount()).toThrow();
    });
  });
});
