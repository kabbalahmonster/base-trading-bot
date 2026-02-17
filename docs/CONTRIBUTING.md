# Contributing Guide

Thank you for your interest in contributing to the Base Grid Trading Bot!

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Commit Messages](#commit-messages)
- [Architecture Decisions](#architecture-decisions)

---

## Development Setup

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ or **pnpm**
- **Git**
- **TypeScript** knowledge

### Installation

```bash
# Fork the repository
# Clone your fork
git clone https://github.com/YOUR_USERNAME/base-trading-bot.git
cd base-trading-bot

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Start development mode
npm run dev
```

### Environment Setup

```bash
# Copy example environment
cp .env.example .env

# Edit .env with your settings
# (you don't need real keys for most development)
```

### Project Structure

```
base-trading-bot/
├── src/
│   ├── api/           # External API clients (0x)
│   ├── bot/           # Trading bot logic
│   ├── grid/          # Grid calculation
│   ├── notifications/ # Telegram alerts
│   ├── oracle/        # Price oracles
│   ├── analytics/     # P&L tracking
│   ├── storage/       # Data persistence
│   ├── types/         # TypeScript interfaces
│   ├── wallet/        # Wallet management
│   └── index.ts       # CLI entry point
├── tests/
│   ├── unit/          # Unit tests
│   ├── integration/   # Integration tests
│   ├── security/      # Security tests
│   └── utils/         # Test utilities
├── docs/              # Documentation
└── data/              # Runtime data (gitignored)
```

---

## Code Style

### TypeScript Conventions

**Use strict TypeScript:**
```typescript
// ✅ Good
function calculateProfit(cost: bigint, revenue: bigint): bigint {
  return revenue - cost;
}

// ❌ Bad
function calculateProfit(cost, revenue) {
  return revenue - cost;
}
```

**Explicit return types:**
```typescript
// ✅ Good
async function getBalance(address: string): Promise<bigint> {
  // ...
}

// ❌ Bad
async function getBalance(address: string) {
  // ...
}
```

**Use interfaces for objects:**
```typescript
// ✅ Good
interface TradeParams {
  sellToken: string;
  buyToken: string;
  amount: bigint;
}

function executeTrade(params: TradeParams): void {
  // ...
}
```

### Naming Conventions

```typescript
// Classes: PascalCase
class TradingBot { }
class GridCalculator { }

// Functions/Variables: camelCase
function calculateGrid() { }
const currentPrice = 0.0001;

// Constants: UPPER_SNAKE_CASE
const MAX_POSITIONS = 24;
const DEFAULT_PROFIT_PERCENT = 8;

// Private methods: _prefix (optional)
private _internalHelper(): void { }

// Interfaces: PascalCase with descriptive names
interface BotConfiguration { }
interface TradeExecutionResult { }
```

### Error Handling

**Always use typed errors:**
```typescript
// ✅ Good
class BotError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'BotError';
  }
}

try {
  await bot.executeTrade();
} catch (error) {
  if (error instanceof BotError) {
    console.error(`Bot error [${error.code}]: ${error.message}`);
  } else {
    console.error('Unknown error:', error);
  }
}
```

**Never swallow errors:**
```typescript
// ❌ Bad
try {
  await riskyOperation();
} catch (e) {
  // Silent failure!
}

// ✅ Good
try {
  await riskyOperation();
} catch (error) {
  console.error('Operation failed:', error);
  throw new BotError('Trade execution failed', 'EXECUTION_FAILED');
}
```

### Async/Await

**Prefer async/await over callbacks:**
```typescript
// ✅ Good
async function fetchData(): Promise<Data> {
  const response = await fetch('/api/data');
  return await response.json();
}

// ❌ Bad
function fetchData(): Promise<Data> {
  return fetch('/api/data')
    .then(response => response.json());
}
```

**Handle all promises:**
```typescript
// ✅ Good
await someAsyncOperation();

// ❌ Bad (unhandled promise)
someAsyncOperation();

// If you must fire-and-forget:
someAsyncOperation().catch(console.error);
```

---

## Testing

### Test Structure

```typescript
// tests/unit/GridCalculator.test.ts
import { describe, it, expect } from 'vitest';
import { GridCalculator } from '../../src/grid/GridCalculator.js';

describe('GridCalculator', () => {
  describe('generateGrid', () => {
    it('should create continuous coverage', () => {
      const positions = GridCalculator.generateGrid(0.0001, {
        numPositions: 24,
        floorPrice: 0.00001,
        ceilingPrice: 0.0004,
        takeProfitPercent: 8
      });

      expect(positions).toHaveLength(24);
      expect(GridCalculator.validateContinuousCoverage(positions)).toBe(true);
    });

    it('should set correct sell prices', () => {
      const positions = GridCalculator.generateGrid(0.0001, config);
      
      for (const pos of positions) {
        const expectedSell = pos.buyMax * 1.08;
        expect(pos.sellPrice).toBeCloseTo(expectedSell, 10);
      }
    });
  });
});
```

### Testing Guidelines

1. **Test behavior, not implementation:**
```typescript
// ✅ Good: Test what it does
it('should find buy position when price in range', () => {
  const position = GridCalculator.findBuyPosition(positions, 0.0001);
  expect(position).not.toBeNull();
  expect(position?.status).toBe('EMPTY');
});

// ❌ Bad: Test how it does it
it('should use binary search', () => {
  // Testing implementation details is fragile
});
```

2. **Use descriptive test names:**
```typescript
// ✅ Good
describe('when price drops into buy range', () => {
  it('should execute buy and update position status', async () => {
    // ...
  });
});
```

3. **Mock external dependencies:**
```typescript
// ✅ Good
vi.mock('../../src/api/ZeroXApi.js', () => ({
  ZeroXApi: vi.fn().mockImplementation(() => ({
    getPrice: vi.fn().mockResolvedValue(0.0001)
  }))
}));
```

### Coverage Requirements

- **Minimum 80%** overall coverage
- **100%** coverage for critical paths:
  - Wallet encryption/decryption
  - Trade execution logic
  - Grid calculations

Check coverage:
```bash
npm run test:coverage
```

---

## Pull Request Process

### Before Submitting

1. **Update documentation:**
   - README.md (if user-facing changes)
   - API_REFERENCE.md (if new APIs)
   - This guide (if process changes)

2. **Add tests:**
   - Unit tests for new functions
   - Integration tests for new features
   - Update existing tests if behavior changed

3. **Verify build:**
   ```bash
   npm run build
   npm run test
   npm run lint
   ```

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests added/updated
- [ ] All tests pass
- [ ] Coverage maintained

## Checklist
- [ ] Code follows style guide
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console.logs left
```

### Review Process

1. **Automated checks** must pass:
   - Build success
   - All tests pass
   - Coverage > 80%
   - Linting passes

2. **Code review** by maintainer:
   - Architecture alignment
   - Security considerations
   - Performance impact

3. **Approval & merge**:
   - Squash commits if needed
   - Use descriptive merge commit

---

## Commit Messages

### Format

```
type(scope): subject

body (optional)

footer (optional)
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only
- **style**: Formatting, no code change
- **refactor**: Code restructuring
- **test**: Adding/updating tests
- **chore**: Build, dependencies, etc.

### Examples

```bash
# Feature
feat(grid): add continuous range-based positions

# Bug fix
fix(wallet): handle empty password gracefully

# Documentation
docs(readme): update monitoring section

# Test
test(oracle): add Chainlink feed tests

# Refactoring
refactor(storage): consolidate file operations
```

### Subject Guidelines

- Use imperative mood: "Add feature" not "Added feature"
- Don't capitalize first letter
- No period at end
- Max 50 characters

### Body Guidelines

- Explain what and why (not how)
- Wrap at 72 characters
- Reference issues: "Fixes #123"

---

## Architecture Decisions

### Why TypeScript?

- Type safety for financial operations
- Better IDE support
- Self-documenting code

### Why 0x API?

- Best liquidity aggregation on Base
- Mature, well-documented API
- No fees for takers

### Why JSON Storage?

- Human-readable for debugging
- Easy backup/restore
- No database dependencies
- Sufficient for single-user bot

### Why PBKDF2 + AES-256-GCM?

- Industry standard for key derivation
- 600k iterations slows brute-force
- GCM provides authentication
- No additional dependencies

### Why Sequential Bot Execution?

- Prevents nonce conflicts
- Reduces gas price competition
- Simpler error handling
- Sufficient for grid trading pace

---

## Security Considerations

### Handling Private Keys

**Never:**
- Log private keys
- Store unencrypted
- Include in error messages
- Send over network

**Always:**
- Encrypt at rest
- Clear from memory after use
- Validate file permissions (600)

### Input Validation

```typescript
// ✅ Good
function setBuyAmount(amount: string): void {
  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0) {
    throw new ValidationError('Invalid amount');
  }
  if (parsed > 1) {
    throw new ValidationError('Amount too large');
  }
  this.buyAmount = parsed;
}
```

### External API Calls

- Always validate responses
- Implement retry with backoff
- Never trust external prices blindly
- Use oracle validation for critical operations

---

## Performance Guidelines

### Optimization Targets

| Operation | Target | Max |
|-----------|--------|-----|
| Grid generation | <10ms | 50ms |
| Price fetch | <500ms | 2s |
| Wallet decrypt | <100ms | 500ms |
| Storage read | <50ms | 200ms |

### Memory Management

```typescript
// ✅ Good: Clear sensitive data
function decryptKey(encrypted: string): string {
  const key = decrypt(encrypted);
  try {
    return useKey(key);
  } finally {
    key.fill(0); // Zero memory
  }
}
```

---

## Questions?

- Check existing [issues](https://github.com/kabbalahmonster/base-trading-bot/issues)
- Read [ARCHITECTURE.md](./ARCHITECTURE.md)
- Join our [Discord](https://discord.gg/clawd) (if available)

---

**Thank you for contributing to the Cult of the Shell!** 🦑
