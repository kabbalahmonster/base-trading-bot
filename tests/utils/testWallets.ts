// tests/utils/testWallets.ts

import { generatePrivateKey, privateKeyToAccount, Account } from 'viem/accounts';

export interface TestWallet {
  address: string;
  privateKey: string;
  account: Account;
}

/**
 * Generate a test wallet with random keys
 */
export function generateTestWallet(): TestWallet {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  return {
    address: account.address,
    privateKey,
    account,
  };
}

/**
 * Generate multiple test wallets
 */
export function generateTestWallets(count: number): TestWallet[] {
  return Array.from({ length: count }, () => generateTestWallet());
}

/**
 * Get a deterministic test wallet (for reproducible tests)
 */
export function getDeterministicWallet(index: number = 0): TestWallet {
  // Deterministic private keys for testing (DO NOT USE IN PRODUCTION)
  const testKeys = [
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  ];

  const privateKey = testKeys[index % testKeys.length] as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  
  return {
    address: account.address,
    privateKey,
    account,
  };
}

/**
 * Predefined test wallets with known addresses
 */
export const TEST_WALLETS = {
  main: getDeterministicWallet(0),
  bot1: getDeterministicWallet(1),
  bot2: getDeterministicWallet(2),
  bot3: getDeterministicWallet(3),
  bot4: getDeterministicWallet(4),
};

/**
 * Common test token addresses (on Base)
 */
export const TEST_TOKENS = {
  COMPUTE: '0x696381f39F17cAD67032f5f52A4924ce84e51BA3',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  CBETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
};

/**
 * Create encrypted wallet data for testing
 */
export function createEncryptedWalletData(
  wallet: TestWallet,
  password: string
): {
  address: string;
  encryptedPrivateKey: string;
  createdAt: number;
  name: string;
  type: 'main' | 'bot';
} {
  // Simple mock encryption for testing (not secure!)
  const encryptedPrivateKey = `mock_salt:mock_${Buffer.from(wallet.privateKey).toString('base64')}_${Buffer.from(password).toString('base64')}`;
  
  return {
    address: wallet.address,
    encryptedPrivateKey,
    createdAt: Date.now(),
    name: `Test Wallet ${wallet.address.slice(0, 8)}...`,
    type: 'main',
  };
}

/**
 * Test addresses for various scenarios
 */
export const TEST_ADDRESSES = {
  valid: [
    '0x696381f39F17cAD67032f5f52A4924ce84e51BA3',
    '0x4200000000000000000000000000000000000006',
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ],
  invalid: [
    'invalid-address',
    '0x123',
    '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
    '',
    'not-an-address',
  ],
  zero: '0x0000000000000000000000000000000000000000',
};
