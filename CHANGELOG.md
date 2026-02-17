# Changelog

All notable changes to the Base Grid Trading Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-02-17

### Added
- **Continuous Range-Based Grid** - No gaps between positions
  - Each position has buyMin to buyMax range
  - Positions are continuous: position[i].buyMax = position[i+1].buyMin
  - Entire floor-to-ceiling range covered
  - Buy triggers when price enters any range
  - Sell price = buyMax × profit% (guaranteed minimum profit)
  - Stop loss = buyMin × stopLoss%
- **Dual-View Monitoring Dashboard**
  - All Bots Overview - Fleet summary table with all bots
  - Individual Bot Detail - Deep dive with all metrics
  - Real-time balance fetching from blockchain
  - 60-second auto-refresh with countdown
- **Bot Reconfiguration with Position Preservation**
  - Change grid settings (positions, profit %)
  - Change buy settings (fixed amount, moon bag)
  - Regenerate positions while preserving balances
  - Intelligent position matching and combining
- **Moonbag Configuration**
  - Configurable 0-50% per bot
  - Set during creation or reconfiguration
- **P&L Tracking & Analytics**
  - Realized P&L tracking
  - Unrealized P&L calculation
  - Combined P&L reporting
  - CSV export for tax reporting
  - Trade history with timestamps
- **Telegram Notifications**
  - Trade execution alerts
  - Profit alerts
  - Error/warning notifications
  - Daily summary reports
  - Configurable alert levels
- **Price Oracles**
  - Chainlink price feed integration
  - Uniswap V3 TWAP (30min default)
  - Confidence scoring (80% minimum)
  - Fallback to 0x API
- **80%+ Test Coverage**
  - Unit tests
  - Integration tests
  - Security tests
  - Performance benchmarks

### Changed
- GridCalculator completely rewritten for range-based logic
- Position type updated with buyMin/buyMax fields
- Monitor displays use exponential notation for small prices
- All views updated to show buy ranges

### Documentation
- README.md completely rewritten with new features
- API_REFERENCE.md added
- ARCHITECTURE.md added
- TROUBLESHOOTING.md added
- CONTRIBUTING.md added

## [1.2.0] - 2026-02-17

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

[1.3.0]: https://github.com/kabbalahmonster/base-trading-bot/releases/tag/v1.3.0
[1.2.0]: https://github.com/kabbalahmonster/base-trading-bot/releases/tag/v1.2.0
[1.1.0]: https://github.com/kabbalahmonster/base-trading-bot/releases/tag/v1.1.0
[1.0.0]: https://github.com/kabbalahmonster/base-trading-bot/releases/tag/v1.0.0
[0.9.0]: https://github.com/kabbalahmonster/base-trading-bot/releases/tag/v0.9.0
