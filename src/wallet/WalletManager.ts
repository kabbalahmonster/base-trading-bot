// src/wallet/WalletManager.ts

import { generatePrivateKey, privateKeyToAccount, Account } from 'viem/accounts';
import { createWalletClient, http, publicActions } from 'viem';
import { base } from 'viem/chains';
import CryptoJS from 'crypto-js';
import { MainWallet, WalletData, WalletDictionary } from '../types';

const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH = 32;

export class WalletManager {
  private mainWallet: MainWallet | null = null;
  private walletDictionary: WalletDictionary = {};
  private password: string | null = null;

  async initialize(password: string): Promise<void> {
    this.password = password;
  }

  /**
   * Generate a new main wallet
   */
  generateMainWallet(): MainWallet {
    if (!this.password) throw new Error('WalletManager not initialized');

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    const encryptedPrivateKey = this.encryptPrivateKey(privateKey, this.password);

    this.mainWallet = {
      address: account.address,
      encryptedPrivateKey,
      createdAt: Date.now(),
    };

    return this.mainWallet;
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
    };

    this.walletDictionary[botId] = walletData;
    return walletData;
  }

  /**
   * Get account for main wallet
   */
  getMainAccount(): Account {
    if (!this.password || !this.mainWallet) {
      throw new Error('Main wallet not initialized');
    }

    const privateKey = this.decryptPrivateKey(
      this.mainWallet.encryptedPrivateKey,
      this.password
    );

    return privateKeyToAccount(privateKey as `0x${string}`);
  }

  /**
   * Get account for bot wallet
   */
  getBotAccount(botId: string): Account {
    if (!this.password) throw new Error('WalletManager not initialized');

    const walletData = this.walletDictionary[botId];
    if (!walletData) throw new Error(`No wallet found for bot ${botId}`);

    const privateKey = this.decryptPrivateKey(
      walletData.encryptedPrivateKey,
      this.password
    );

    return privateKeyToAccount(privateKey as `0x${string}`);
  }

  /**
   * Get wallet client for main wallet
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
   * Get wallet client for bot wallet
   */
  getBotWalletClient(botId: string, rpcUrl: string) {
    const account = this.getBotAccount(botId);
    return createWalletClient({
      account,
      chain: base,
      transport: http(rpcUrl),
    }).extend(publicActions);
  }

  getMainWallet(): MainWallet | null {
    return this.mainWallet;
  }

  getBotWallet(botId: string): WalletData | undefined {
    return this.walletDictionary[botId];
  }

  getAllBotWallets(): WalletDictionary {
    return this.walletDictionary;
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
      mainWallet: this.mainWallet,
      walletDictionary: this.walletDictionary,
    };
  }

  /**
   * Import data from storage
   */
  importData(data: { mainWallet?: MainWallet; walletDictionary?: WalletDictionary }) {
    if (data.mainWallet) this.mainWallet = data.mainWallet;
    if (data.walletDictionary) this.walletDictionary = data.walletDictionary;
  }
}
