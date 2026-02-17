#!/usr/bin/env node
// scripts/validate-setup.js

/**
 * Pre-flight checklist for Base Grid Trading Bot
 * Validates environment, dependencies, and configuration
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, status: '✅', error: null });
    return true;
  } catch (error) {
    checks.push({ name, status: '❌', error: error.message });
    return false;
  }
}

console.log('🔍 Base Grid Trading Bot - Setup Validation\n');

// Check Node.js version
check('Node.js version >= 18', () => {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  if (major < 18) {
    throw new Error(`Node.js ${version} found, need >= 18`);
  }
});

// Check package.json exists
check('package.json exists', () => {
  if (!fs.existsSync(path.join(rootDir, 'package.json'))) {
    throw new Error('package.json not found');
  }
});

// Check node_modules exists
check('node_modules installed', () => {
  if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
    throw new Error('Run: npm install');
  }
});

// Check TypeScript compiled
check('TypeScript compiled (dist/)', () => {
  if (!fs.existsSync(path.join(rootDir, 'dist'))) {
    throw new Error('Run: npm run build');
  }
  if (!fs.existsSync(path.join(rootDir, 'dist', 'index.js'))) {
    throw new Error('Build incomplete');
  }
});

// Check .env file (optional)
check('.env file (optional)', () => {
  const envPath = path.join(rootDir, '.env');
  const envExamplePath = path.join(rootDir, '.env.example');
  
  if (!fs.existsSync(envPath) && !fs.existsSync(envExamplePath)) {
    // Create example file
    const example = `# Base Grid Trading Bot Configuration
# Optional: 0x API key for higher rate limits
# Get one at: https://0x.org/docs/introduction/getting-started
ZEROX_API_KEY=your_api_key_here

# Optional: Custom RPC endpoint
BASE_RPC_URL=https://base.llamarpc.com

# Optional: Log level (debug, info, warn, error)
LOG_LEVEL=info
`;
    fs.writeFileSync(envExamplePath, example);
    throw new Error('.env.example created - copy to .env and configure');
  }
});

// Check data directory
check('Data directory exists', () => {
  const dataDir = path.join(rootDir, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
});

// Check wallet directory
check('Wallet directory exists', () => {
  const walletDir = path.join(rootDir, 'wallets');
  if (!fs.existsSync(walletDir)) {
    fs.mkdirSync(walletDir, { recursive: true });
  }
});

// Summary
console.log('\n📊 Validation Results:\n');
let passed = 0;
let failed = 0;

checks.forEach(({ name, status, error }) => {
  console.log(`${status} ${name}`);
  if (error) {
    console.log(`   ${error}`);
    failed++;
  } else {
    passed++;
  }
});

console.log(`\n${'='.repeat(50)}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`${'='.repeat(50)}\n`);

if (failed === 0) {
  console.log('🎉 Setup validated! Ready to run.');
  console.log('\nNext steps:');
  console.log('  1. Run: npm start');
  console.log('  2. Create your first bot');
  console.log('  3. Fund with test ETH');
  console.log('  4. Start trading!\n');
  process.exit(0);
} else {
  console.log('⚠️  Fix the issues above before running.\n');
  process.exit(1);
}
