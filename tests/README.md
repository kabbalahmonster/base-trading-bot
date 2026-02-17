# Test Suite Documentation

## Overview

This test suite provides comprehensive coverage for the Base Trading Bot, including unit tests, integration tests, performance benchmarks, and security tests.

## Running Tests

### Run all tests
```bash
npm test
```

### Run with coverage
```bash
npm run test:coverage
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run specific test file
```bash
npx vitest run tests/integration/TradingBot.test.ts
```

### Run benchmarks
```bash
npx vitest bench
```

## Test Structure

```
tests/
├── integration/          # Integration tests
│   ├── TradingBot.test.ts
│   ├── WalletManager.test.ts
│   └── GridCalculator.test.ts
├── performance/          # Performance benchmarks
│   ├── rpcLatency.test.ts
│   ├── gridCalculation.test.ts
│   ├── walletEncryption.test.ts
│   └── memoryUsage.test.ts
├── security/             # Security tests
│   ├── encryption.test.ts
│   ├── inputValidation.test.ts
│   └── filePermissions.test.ts
├── utils/                # Test utilities
│   ├── mockRpcProvider.ts
│   ├── mockZeroXApi.ts
│   ├── testWallets.ts
│   ├── factories.ts
│   └── index.ts
├── TradingBot.test.ts    # Original unit tests
├── WalletManager.test.ts
└── GridCalculator.test.ts
```

## Test Categories

### Integration Tests

Test the interaction between multiple components:

- **TradingBot**: Full trading loop, buy/sell execution, price updates
- **WalletManager**: Wallet creation, encryption, import/export
- **GridCalculator**: Grid generation, position finding

### Performance Tests

Benchmark critical operations:

- **RPC Latency**: Measure response times for blockchain calls
- **Grid Calculation**: Test grid generation speed with various sizes
- **Wallet Encryption**: Benchmark encryption/decryption performance
- **Memory Usage**: Ensure no memory leaks with large datasets

### Security Tests

Verify security requirements:

- **Encryption**: Private key encryption, password strength
- **Input Validation**: Address validation, bounds checking
- **File Permissions**: Wallet file permissions, access controls

## Test Utilities

### Mock RPC Provider (`tests/utils/mockRpcProvider.ts`)

Simulates Ethereum RPC responses for testing without hitting real nodes:

```typescript
import { createMockRpcProvider } from './utils/mockRpcProvider.js';

const mockProvider = createMockRpcProvider();
mockProvider.setResponse('eth_getBalance', '0xde0b6b3a7640000');
```

### Mock 0x API (`tests/utils/mockZeroXApi.ts`)

Simulates 0x API responses:

```typescript
import { createMockZeroXApi } from './utils/mockZeroXApi.js';

const mockZeroX = createMockZeroXApi({
  buyAmount: '1000000000000000000',
  shouldFail: false,
});
```

### Factories (`tests/utils/factories.ts`)

Create test data objects:

```typescript
import { createBotInstance, createGridConfig } from './utils/factories.js';

const config = createGridConfig({ numPositions: 10 });
const bot = createBotInstance({ config });
```

## Coverage Requirements

The test suite targets 80%+ coverage across:

- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 80%
- **Statements**: 80%

Coverage reports are generated in:
- `coverage/lcov-report/index.html` (HTML)
- `coverage/lcov.info` (LCOV)
- `coverage/coverage-final.json` (JSON)

## Continuous Integration

Tests run automatically on:
- Push to `main` branch
- Push to `experimental/*` branches
- Pull requests to `main`

GitHub Actions workflow in `.github/workflows/tests.yml`:
- Runs tests on Node.js 18.x, 20.x, 22.x
- Generates coverage reports
- Runs performance benchmarks
- Uploads artifacts

## Adding New Tests

1. Choose appropriate category (integration/performance/security)
2. Use existing utilities or create new ones
3. Follow naming convention: `*.test.ts` for tests, `*.bench.ts` for benchmarks
4. Run tests locally before pushing
5. Ensure coverage stays above thresholds

## Tips

- Use `beforeEach`/`afterEach` for test isolation
- Clean up temporary files in `afterEach`
- Mock external APIs to avoid network dependencies
- Use factories for consistent test data
- Tag slow tests with `// @slow` and filter with `-t "!@slow"`
