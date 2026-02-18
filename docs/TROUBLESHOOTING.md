# Troubleshooting Guide

Common issues and solutions for the Base Grid Trading Bot v1.4.0

## Quick Diagnostics

Run the diagnostic command:
```bash
npm run diagnose
```

Or check status:
```bash
npm start
→ 📊 View status
```

---

## Common Issues

### 1. Bot Not Trading

#### Symptom
Bot shows "RUNNING" but no trades appear on Basescan/DexScreener.

#### Possible Causes & Solutions

**Price Hasn't Hit Range**
```
Check: 📺 Monitor bots → Individual Bot Detail
Look at: "NEXT BUY OPPORTUNITIES"
```
- If price is far above buy ranges → Wait for dip
- If price is below all ranges → Grid floor too high
  - Solution: Reconfigure bot with lower floor
  
**Max Active Positions**
```
Check: "Active Positions: X/Y"
```
- If X = Y → Bot waiting for sells before new buys
- Solution: Wait for sells, or increase maxActivePositions

**Insufficient ETH**
```
Check: 💼 WALLET section → ETH Balance
```
- Need: 0.01+ ETH for gas + buy amount
- Solution: 💰 Fund wallet

**Bot Disabled**
```
Status shows: [DISABLED]
```
- Solution: ⏸️ Enable/Disable bot → Enable

**Price Oracle Low Confidence**
```
Monitor shows: "Price confidence: 0%"
```
- High volatility or RPC issues
- Solution: Wait for confidence to return (>80%)

**Volume Mode Cycle**
```
If in volume mode, bot accumulates before selling
```
- Check volumeBuysInCycle vs target
- Normal behavior - waits for cycle completion

---

### 2. Multi-Chain Issues

#### "Wrong chain for token"

**Symptom:**
Error when starting bot or getting quotes.

**Cause:**
Token contract doesn't exist on selected chain.

**Solution:**
1. Verify token address on chain explorer:
   - Base: https://basescan.org
   - Ethereum: https://etherscan.io
2. Create new bot with correct chain
3. Each bot is tied to one chain

#### "RPC timeout on Ethereum"

**Symptom:**
Slow responses or timeouts when using Ethereum mainnet.

**Cause:**
Ethereum mainnet has higher latency than L2s.

**Solution:**
1. Bot will auto-retry with fallback RPCs
2. Increase patience - ETH mainnet is slower
3. Consider using Base for faster trading
4. Check your internet connection

#### "Chain ID mismatch"

**Symptom:**
Transaction errors mentioning chain ID.

**Cause:**
Wallet or RPC on different chain than bot configuration.

**Solution:**
1. Verify bot.chain matches your intent
2. Check RPC URL matches chain
3. Restart bot after chain changes

---

### 3. Volume Mode Issues

#### "Volume bot not selling"

**Symptom:**
Bot buys but never sells in volume mode.

**Cause:**
Volume mode accumulates for N buys before distributing.

**Solution:**
1. Check current buy count in cycle:
   ```
   Monitor → Individual Detail → Volume Stats
   ```
2. Normal behavior - waits for cycle completion
3. Check volumeBuysPerCycle setting
4. Ensure sellsEnabled is true

#### "Volume mode cycle stuck"

**Symptom:**
Buys stop before completing cycle.

**Cause:**
Insufficient ETH or max positions reached mid-cycle.

**Solution:**
1. Fund wallet with more ETH
2. Increase maxActivePositions
3. Or reduce volumeBuysPerCycle

#### "Unexpected profit in volume mode"

**Symptom:**
Volume mode generating profit when set to break-even.

**Cause:**
Price movement between buy and sell.

**Solution:**
1. Normal market behavior
2. Set minProfitPercent to 0 for pure volume
3. Or embrace the bonus profit!

---

### 4. Wallet Issues

#### "Main wallet not initialized"

**Symptom:**
Error when funding wallet or starting bot.

**Solution:**
```bash
# Re-initialize with password
npm start
→ 🔧 Manage wallets
→ Enter master password
→ Retry operation
```

If persists:
```bash
# Check wallet file exists
ls -la data/wallets.json

# If missing, recreate:
→ 🔧 Manage wallets → Create main wallet
```

#### Cannot decrypt wallet

**Symptom:**
"Invalid password" or decryption errors.

**Cause:**
- Wrong password entered
- Wallet file corrupted
- Encryption mismatch

**Solution:**
1. Verify correct password (case-sensitive)
2. Check Caps Lock
3. If file corrupted, restore from backup
4. Worst case: Create new wallets (funds are on-chain, recoverable with private key)

---

### 5. API & Quote Issues

#### "No quote available from 0x"

**Symptom:**
Bot can't get swap quotes.

**Causes:**

**Low Liquidity Token**
- Token has no 0x liquidity
- Solution: Try different token

**Invalid Token Address**
- Check address on chain explorer
- Solution: Verify contract address

**0x API Rate Limit**
- Free tier limited to 10 req/s
- Solution: Add ZEROX_API_KEY to .env

**Chain Not Supported**
- 0x doesn't support selected chain
- Solution: Use Base or Ethereum mainnet

---

### 6. Balance Issues

#### Wallet Shows 0 Balance

**Symptom:**
Balance displays 0.000 ETH but you sent funds.

#### Solutions

**1. Wait for RPC Sync**
```
Wait 30 seconds and refresh
```

**2. Check Correct Address**
```
→ 👛 View wallet balances
Compare with chain explorer:
  Base: https://basescan.org
  Ethereum: https://etherscan.io
```

**3. RPC Issues**
```
→ 📊 View status (shows which RPC is active)
If one fails, bot auto-switches to fallback
```

**4. Wrong Network**
```
Verify explorer shows correct chain:
  - Base mainnet (not Ethereum)
  - Ethereum mainnet (not testnet)
```

---

### 7. Gas & Transaction Issues

#### "Insufficient funds for gas"

**Symptom:**
Transaction fails with gas error.

#### Solutions

**Reserve ETH for Gas**
```
Keep: 0.01 ETH minimum for gas
Total needed: buyAmount + 0.01 ETH
```

**Reduce Buy Amount**
```
→ ⚙️ Reconfigure bot
→ Change buy settings
→ Reduce ETH amount per buy
```

**Check Current Gas Prices**
```
Base: https://basescan.org/gastracker
Ethereum: https://etherscan.io/gastracker
```

#### Transaction Failed / Reverted

**Symptom:**
Trade appears on chain but failed.

#### Solutions

**Check Transaction**
```
1. Copy TX hash from monitor
2. Paste into chain explorer
3. Check error message
```

**Common Failures:**

**Out of Gas**
```
Error: "out of gas"
Solution: Bot auto-estimates, but try smaller buy amount
```

**Slippage Exceeded**
```
Error: "Too little received"
Cause: Price moved between quote and execution
Solution: Normal, bot will retry next cycle
```

**Token Transfer Failed**
```
Error: "ERC20 transfer failed"
Cause: Token has transfer tax or restrictions
Solution: Try different token
```

---

### 8. Bot Stopped

#### Bot Stopped After Errors

**Symptom:**
Bot shows "○ Stopped" with error count.

**Check Errors:**
```bash
→ 📺 Monitor bots → Individual Detail
Look at: "Errors: X consecutive errors"
```

#### Solutions

**Restart Bot**
```
→ ▶️ Start bot(s)
```

**Check Error Logs**
```bash
# View logs
tail -f logs/bot.log

# Or check last errors
grep "ERROR" data/bots.json
```

**Common Error Types:**

| Error | Cause | Fix |
|-------|-------|-----|
| "RPC timeout" | Network issue | Auto-retries, check connection |
| "Nonce too low" | Transaction stuck | Wait, then retry |
| "Insufficient allowance" | Token approval failed | Manual approval |
| "Slippage too high" | Price moved | Bot auto-retries |
| "Price confidence low" | Oracle divergence | Wait for confidence |
| "Chain ID mismatch" | Wrong network | Recreate bot on correct chain |

---

### 9. Grid Issues

#### Grid Positions Not Covering Price

**Symptom:**
Price moved outside grid range (too high or too low).

#### Solutions

**Regenerate with New Range**
```
→ ⚙️ Reconfigure bot
→ 🔄 Regenerate positions

Option 1: Lower floor (if price dropped)
Option 2: Raise ceiling (if price mooned)
Option 3: Use auto-range based on current price
```

**Check Current Grid**
```
→ 📺 Monitor bots → Individual Detail
Look at: "Price Range: Floor X - Ceiling Y"
Compare to: "Current Price: Z"

If Z < X: Price below floor
If Z > Y: Price above ceiling
```

**Position Preservation**
```
Regeneration preserves positions with balances
Combined positions use highest sell price
No lost funds during reconfiguration
```

---

### 10. Notification Issues

#### Telegram Notifications Not Working

**Symptom:**
No Telegram messages for trades.

#### Solutions

**1. Check Configuration**
```bash
cat .env | grep TELEGRAM
# Should show:
# TELEGRAM_BOT_TOKEN=your_token
# TELEGRAM_CHAT_ID=your_chat_id
```

**2. Test Notification**
```
→ 🔧 Configure notifications → Test notification
```

**3. Check Bot Permissions**
```
In Telegram:
1. Find your bot (@BotFather)
2. Check bot is not blocked
3. Verify chat ID is correct
```

**4. Alert Level Settings**
```
Check: Alert level not set to "none"
Options: "all", "trades-only", "errors-only"
```

---

### 11. P&L Issues

#### P&L Numbers Don't Match

**Symptom:**
Profit calculations seem wrong.

#### Understanding P&L

**Realized P&L**
```
Completed sells only
Based on actual trade prices
```

**Unrealized P&L**
```
Current value of holdings
Based on current market price
Changes every price update
```

**Combined P&L**
```
Realized + Unrealized
Total performance if you sold everything now
```

#### Common Confusion

**"I made 0.01 ETH but Combined shows less"**
- Some positions still holding
- Unrealized may be negative
- Wait for all positions to sell

**"Current price is up but Unrealized is down"**
- You bought at higher prices
- Current price may be above some buys, below others
- Check individual position profit %

---

### 12. Token Approval Issues

#### "Token approval failed"

**Symptom:**
Sell fails with approval error.

#### Solution

**Manual Approval**
```bash
# Use cast (foundry)
cast send TOKEN_ADDRESS \
  "approve(address,uint256)" \
  0xDEF1ABcD... \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --rpc-url https://mainnet.base.org \
  --private-key YOUR_KEY
```

Or use chain explorer:
```
1. Go to token contract on explorer
2. Connect wallet
3. Write contract → approve
4. Spender: 0x (0x exchange proxy)
5. Amount: max uint256
```

**Note:** Bot uses exact approvals normally. Manual unlimited approval fixes this.

---

### 13. Daemon Mode Issues

#### Daemon Won't Start

**Symptom:**
Cannot start daemon process.

**Causes & Solutions:**

**Permission Denied**
```bash
# Check permissions
ls -la ~/.base-trading-bot/

# Fix
chmod 755 ~/.base-trading-bot/
```

**Port in Use**
```bash
# Check for existing process
ps aux | grep base-trading-bot

# Kill if needed
kill -9 PID
```

**Node Not Found**
```bash
# Ensure node is in PATH
which node

# Or use full path
/usr/local/bin/node dist/index.js
```

#### Daemon Stops Unexpectedly

**Symptom:**
Daemon process dies after some time.

**Check Logs:**
```bash
→ 👁️ View daemon status
→ 📋 View recent logs
```

**Common Causes:**
- Out of memory (increase swap)
- Unhandled exception (check logs)
- System restart (set up systemd service)

---

### 14. Cross-Chain Issues

#### Cannot Use Same Bot on Multiple Chains

**Symptom:**
Want to trade same token on both Base and Ethereum.

**Solution:**
```
Create separate bots:
  Bot-1-Base: chain='base'
  Bot-1-Eth:  chain='ethereum'

Each bot is independent with:
  - Separate wallet (or same address, different chain)
  - Separate configuration
  - Separate P&L tracking
```

#### Price Differences Between Chains

**Symptom:**
Same token has different prices on Base vs Ethereum.

**Explanation:**
This is normal! Prices can vary between chains due to:
- Different liquidity pools
- Arbitrage delays
- Bridge fees

**Solution:**
Each bot tracks its own chain's price independently.

---

## Debug Mode

### Enable Debug Logging

```bash
# Set environment variable
export LOG_LEVEL=debug

# Or in .env
LOG_LEVEL=debug
```

### Verbose Output

```bash
# Run with debug
npm start 2>&1 | tee debug.log
```

### Dry Run Mode

Test without spending ETH:
```typescript
// In code
bot.setDryRun(true);
```

---

## Recovery Procedures

### Emergency Stop

```bash
# Stop all bots immediately
npm start
→ ⏹️ Stop bot(s)
→ Stop all bots
```

### Reclaim All Funds

```bash
# Emergency withdrawal
npm start
→ 🏧 Reclaim funds
→ All bots
→ Confirm
```

### Restore from Backup

```bash
# If data corrupted
cp data/bots.json.backup data/bots.json
cp data/wallets.json.backup data/wallets.json
npm start
```

### Reset Everything

```bash
# ⚠️ DANGER: Deletes all data
rm -rf data/
rm -rf exports/
# Then restart and recreate wallets/bots
```

### Wallet Recovery

If wallet file is lost but you have private key:
```bash
# Import via wallet management
→ 🔧 Manage wallets
→ Import wallet (if available)
# Or create new and send funds from old address
```

---

## Getting Help

### Logs Location

```bash
# Application logs
tail -f logs/app.log

# Error logs
tail -f logs/error.log

# Daemon logs
→ 👁️ View daemon status → View logs

# Transaction logs
cat data/bots.json | jq '.bots[].positions[] | select(.status == "SOLD")'
```

### System Info

```bash
# Get system status
npm start
→ 📊 View status

# Check versions
node --version  # Should be 18+
npm --version
```

### Report Issues

Include:
1. Error message (exact text)
2. Bot configuration (share safe info only)
3. Transaction hash (if applicable)
4. Logs (redact private keys!)
5. Chain being used
6. Bot mode (profit or volume)

---

## Quick Reference Card

| Problem | Quick Fix |
|---------|-----------|
| No trades | Check "NEXT BUY" in monitor |
| 0 balance | Wait 30s, check explorer |
| Gas error | Keep 0.01+ ETH reserved |
| Bot stopped | ▶️ Start bot(s) |
| No quotes | Check token liquidity |
| Export fails | Re-enter password |
| Price out of range | 🔄 Regenerate positions |
| No Telegram | Check .env config |
| P&L confusion | Check realized vs unrealized |
| Volume not selling | Check cycle completion |
| Wrong chain | Recreate bot on correct chain |
| Daemon died | Check logs, restart |

---

**Still stuck? Check the [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system understanding.**
