# Deployment Guide

## Quick Start (5 minutes)

### 1. Clone and Install

```bash
git clone https://github.com/kabbalahmonster/base-trading-bot.git
cd base-trading-bot
npm install
npm run build
```

### 2. Validate Setup

```bash
node scripts/validate-setup.js
```

### 3. Start the Bot

```bash
npm start
```

### 4. First Run Setup

The CLI will guide you through:

1. **Create master password** - Remember this! It encrypts all wallets
2. **Generate main wallet** - Save the address shown
3. **Fund main wallet** - Send ETH to the main wallet address
4. **Create trading bot** - Choose token and configure grid
5. **Fund bot wallet** - Use the CLI to send ETH from main to bot
6. **Start trading** - Bot monitors prices and executes automatically

## Configuration

### Optional: 0x API Key

For higher rate limits, get a free API key:
1. Visit https://0x.org/docs/introduction/getting-started
2. Sign up for API key
3. Create `.env` file:

```bash
ZEROX_API_KEY=your_key_here
```

### Optional: Custom RPC

```bash
BASE_RPC_URL=https://your-rpc-endpoint.com
```

## Testing Strategy

### 1. Dry-Run Mode (Recommended First)

Test without spending ETH:

```typescript
// In TradingBot.ts or during development
bot.setDryRun(true);
```

### 2. Test with Small Amount

1. Fund with 0.001 ETH only
2. Watch behavior for 24 hours
3. Verify grid calculation
4. Check profit calculations

### 3. Monitor Logs

```bash
LOG_LEVEL=debug npm start
```

## Production Checklist

Before running with significant funds:

- [ ] Tested with dry-run mode
- [ ] Tested with small amount (0.001 ETH)
- [ ] Verified wallet encryption works
- [ ] Confirmed backup of master password
- [ ] Reviewed SECURITY_AUDIT.md
- [ ] Understand grid strategy and risks
- [ ] Have emergency plan (liquidate function)

## Monitoring

### Check Bot Status

```bash
# In CLI menu, select "View status"
```

### View Logs

```bash
tail -f logs/bot.log
```

### Emergency Stop

```bash
# In CLI menu, select "Stop bot(s)"
# Or press Ctrl+C
```

### Emergency Liquidation

In CLI:
1. Select "Stop bot(s)"
2. Bot will show status with liquidate option
3. Or modify bot instance to call `liquidateAll()`

## Backup

### Important Files to Backup

```
wallets/          # Encrypted wallet files
data/bots.json    # Bot configurations
```

### Backup Command

```bash
tar -czf backup-$(date +%Y%m%d).tar.gz wallets/ data/
```

⚠️ **Never lose your master password!** Without it, wallet files cannot be decrypted.

## Troubleshooting

### "No quote available from 0x"
- Token may have low liquidity
- Check token contract address
- Try different token

### "Insufficient ETH for buy"
- Keep at least 0.005 ETH for gas
- Bot reserves gas automatically
- Fund with more ETH

### "Transaction failed"
- Network congestion
- Gas prices too high
- Try again later

### "Price not updating"
- Check 0x API status
- Add ZEROX_API_KEY to .env
- Increase heartbeat interval

## Updates

### Update to Latest Version

```bash
git pull origin main
npm install
npm run build
```

### Check Version

```bash
npm start
# Shows version in welcome message
```

## Support

- GitHub Issues: https://github.com/kabbalahmonster/base-trading-bot/issues
- Documentation: See README.md and SECURITY_AUDIT.md

## Risk Warning

⚠️ **Never trade with funds you cannot afford to lose.**

Grid trading involves risks:
- Price volatility
- Impermanent loss
- Smart contract risk
- Network failures

Always test thoroughly before using significant funds.

---

**Built with 🦑 by Clawdelia for the Cult of the Shell**
