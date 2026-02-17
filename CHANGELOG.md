# Changelog

All notable changes to the Base Grid Trading Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-17

### Added
- **Multiple main wallets** - Create unlimited main wallets
- **Wallet naming** - Organize wallets with custom names
- **Primary wallet** - Mark main trading wallet with ⭐
- **Token balance display** - Select tokens from balance list
- **RPC fallback system** - 5 endpoints with auto-switching
- **Enable/disable bots** - Toggle without deleting
- **Fixed buy amounts** - Set exact ETH per buy
- **"Back" options** - All menus have back navigation
- **Wallet management** - Independent of bot creation
- **FEATURE_AUDIT.md** - Complete feature analysis

### Changed
- Wallet system refactored to unified dictionary
- All wallets (main + bot) accessible for transfers
- Updated README with comprehensive features

## [1.0.0] - 2026-02-17

### Added
- Grid trading engine with configurable positions
- 0x API integration for swap routing
- Automatic price discovery via 0x
- Wallet encryption using PBKDF2 (600k iterations)
- Multi-bot support with sequential execution
- Dry-run mode for testing
- Liquidation function for emergency exits
- Comprehensive CLI with inquirer.js
- Security audit (Grade B+)
- Full test suite with vitest
- Complete documentation
- External wallet sending (ETH + tokens)
- Private key export functionality
- Balance checking before transactions

### Security
- PBKDF2-SHA256 encryption for private keys
- AES-256-GCM for wallet data
- File permissions set to 600
- No private key logging
- Exact token approvals (not unlimited)
- Consecutive error tracking

### Features
- 24-position grid (default)
- Auto price range calculation
- Take profit targeting (8% default)
- Stop loss protection (optional)
- Moon bag support (1% default)
- Min profit enforcement (2% after gas)
- Fund/reclaim wallet functions
- Real-time status dashboard
- Reclaim funds functionality

## [0.9.0] - 2026-02-16

### Added
- Initial project scaffold
- TypeScript + viem setup
- Basic wallet management
- 0x API client
- Grid calculation logic

[1.1.0]: https://github.com/kabbalahmonster/base-trading-bot/releases/tag/v1.1.0
[1.0.0]: https://github.com/kabbalahmonster/base-trading-bot/releases/tag/v1.0.0
[0.9.0]: https://github.com/kabbalahmonster/base-trading-bot/releases/tag/v0.9.0
