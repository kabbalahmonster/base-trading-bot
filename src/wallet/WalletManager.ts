// src/wallet/WalletManager.ts

import { generatePrivateKey, privateKeyToAccount, Account } from 'viem/accounts';
import { createWalletClient, http, publicActions } from 'viem';
import { base } from 'viem/chains';
import CryptoJS from 'crypto-js';
import { WalletData, WalletDictionary } from '../types/index.js';

const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH = 32;

export class WalletManager {
  private walletDictionary: WalletDictionary = {};
  private password: string | null = null;
  private primaryWalletId: string | null = null;

  async initialize(password: string): Promise<void> {
    // Validate password strength
    if (!password || password.length === 0) {
      throw new Error('Password cannot be empty');
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    this.password = password;
  }

  /**
   * Check if the wallet manager has been initialized with a password
   */
  isInitialized(): boolean {
    return this.password !== null && this.password.length > 0;
  }

  /**
   * Generate a new main wallet with custom name
   */
  generateMainWallet(name?: string): WalletData {
    if (!this.password) throw new Error('WalletManager not initialized');

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const walletId = `main-${Date.now()}`;

    const encryptedPrivateKey = this.encryptPrivateKey(privateKey, this.password);

    const walletData: WalletData = {
      address: account.address,
      encryptedPrivateKey,
      createdAt: Date.now(),
      name: name || `Main Wallet ${Object.keys(this.walletDictionary).filter(k => k.startsWith('main-')).length + 1}`,
      type: 'main',
    };

    this.walletDictionary[walletId] = walletData;
    
    // Set as primary if it's the first main wallet
    if (!this.primaryWalletId || !this.getPrimaryWallet()) {
      this.primaryWalletId = walletId;
    }

    return walletData;
  }

  /**
   * Generate a wallet for a specific bot
   */
  generateBotWallet(botId: string): WalletData {
    if (!this.password) throw new Error('WalletManager not initialized');

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    const encryptedPrivateKey = this.encryptPrivateKey(privateKey, this.password);

    const walletData: WalletData = {
      address: account.address,
      encryptedPrivateKey,
      createdAt: Date.now(),
      name: `Bot ${botId.slice(0, 8)}...`,
      type: 'bot',
    };

    this.walletDictionary[botId] = walletData;
    return walletData;
  }

  /**
   * Get the primary/main wallet (for backward compatibility)
   */
  getPrimaryWallet(): WalletData | null {
    if (this.primaryWalletId && this.walletDictionary[this.primaryWalletId]) {
      return this.walletDictionary[this.primaryWalletId];
    }
    
    // Find first main wallet
    for (const [id, wallet] of Object.entries(this.walletDictionary)) {
      if (wallet.type === 'main') {
        this.primaryWalletId = id;
        return wallet;
      }
    }
    
    return null;
  }

  /**
   * Set primary wallet
   */
  setPrimaryWallet(walletId: string): void {
    if (!this.walletDictionary[walletId]) {
      throw new Error(`Wallet not found: ${walletId}`);
    }
    this.primaryWalletId = walletId;
  }

  /**
   * Get account for primary wallet (backward compatibility)
   */
  getMainAccount(): Account {
    const primaryWallet = this.getPrimaryWallet();
    if (!this.password || !primaryWallet) {
      throw new Error('Main wallet not initialized');
    }

    const privateKey = this.decryptPrivateKey(
      primaryWallet.encryptedPrivateKey,
      this.password
    );

    return privateKeyToAccount(privateKey as `0x${string}`);
  }

  /**
   * Get account for any wallet by ID
   */
  getAccount(walletId: string): Account {
    if (!this.password) throw new Error('WalletManager not initialized');

    const walletData = this.walletDictionary[walletId];
    if (!walletData) throw new Error(`No wallet found for ID: ${walletId}`);

    const privateKey = this.decryptPrivateKey(
      walletData.encryptedPrivateKey,
      this.password
    );

    return privateKeyToAccount(privateKey as `0x${string}`);
  }

  /**
   * Get account for bot wallet (legacy)
   */
  getBotAccount(botId: string): Account {
    return this.getAccount(botId);
  }

  /**
   * Get account for any wallet address
   */
  getAccountForAddress(address: string): Account {
    if (!this.password) throw new Error('WalletManager not initialized');

    for (const [id, walletData] of Object.entries(this.walletDictionary)) {
      if (walletData.address.toLowerCase() === address.toLowerCase()) {
        return this.getAccount(id);
      }
    }

    throw new Error(`No wallet found for address: ${address}`);
  }

  /**
   * Get wallet ID for an address
   */
  getWalletIdForAddress(address: string): { id: string; wallet: WalletData } | null {
    for (const [id, walletData] of Object.entries(this.walletDictionary)) {
      if (walletData.address.toLowerCase() === address.toLowerCase()) {
        return { id, wallet: walletData };
      }
    }
    return null;
  }

  /**
   * Get wallet client for any wallet
   */
  getWalletClient(walletId: string, rpcUrl: string) {
    const account = this.getAccount(walletId);
    return createWalletClient({
      account,
      chain: base,
      transport: http(rpcUrl),
    }).extend(publicActions);
  }

  /**
   * Get wallet client for primary wallet (backward compatibility)
   */
  getMainWalletClient(rpcUrl: string) {
    const account = this.getMainAccount();
    return createWalletClient({
      account,
      chain: base,
      transport: http(rpcUrl),
    }).extend(publicActions);
  }

  /**
   * Get wallet client for bot wallet (legacy)
   */
  getBotWalletClient(botId: string, rpcUrl: string) {
    return this.getWalletClient(botId, rpcUrl);
  }

  /**
   * Get all wallets
   */
  getAllWallets(): WalletDictionary {
    return this.walletDictionary;
  }

  /**
   * Get only main wallets
   */
  getMainWallets(): Record<string, WalletData> {
    const mainWallets: Record<string, WalletData> = {};
    for (const [id, wallet] of Object.entries(this.walletDictionary)) {
      if (wallet.type === 'main') {
        mainWallets[id] = wallet;
      }
    }
    return mainWallets;
  }

  /**
   * Get only bot wallets
   */
  getBotWallets(): Record<string, WalletData> {
    const botWallets: Record<string, WalletData> = {};
    for (const [id, wallet] of Object.entries(this.walletDictionary)) {
      if (wallet.type === 'bot') {
        botWallets[id] = wallet;
      }
    }
    return botWallets;
  }

  /**
   * Get primary wallet ID
   */
  getPrimaryWalletId(): string | null {
    return this.primaryWalletId;
  }

  /**
   * Export private key for a wallet
   */
  exportPrivateKey(walletId: string): string {
    if (!this.password) throw new Error('WalletManager not initialized');

    const walletData = this.walletDictionary[walletId];
    if (!walletData) throw new Error(`Wallet not found for ID: ${walletId}`);

    return this.decryptPrivateKey(walletData.encryptedPrivateKey, this.password);
  }

  /**
   * Encrypt private key using PBKDF2
   */
  private encryptPrivateKey(privateKey: string, password: string): string {
    const salt = CryptoJS.lib.WordArray.random(SALT_LENGTH).toString();
    
    const key = CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: PBKDF2_ITERATIONS,
    });

    const encrypted = CryptoJS.AES.encrypt(privateKey, key.toString(), {
      iv: CryptoJS.lib.WordArray.random(16),
    });

    return `${salt}:${encrypted.toString()}`;
  }

  /**
   * Decrypt private key
   */
  private decryptPrivateKey(encryptedData: string, password: string): string {
    const [salt, encrypted] = encryptedData.split(':');
    
    if (!salt || !encrypted) throw new Error('Invalid encrypted data');

    const key = CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: PBKDF2_ITERATIONS,
    });

    const decrypted = CryptoJS.AES.decrypt(encrypted, key.toString());
    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Export data for storage
   */
  exportData() {
    return {
      walletDictionary: this.walletDictionary,
      primaryWalletId: this.primaryWalletId,
    };
  }

  /**
   * Import data from storage
   */
  importData(data: { walletDictionary?: WalletDictionary; primaryWalletId?: string | null }) {
    if (data.walletDictionary) this.walletDictionary = data.walletDictionary;
    if (data.primaryWalletId) this.primaryWalletId = data.primaryWalletId;
  }
}
