# Troubleshooting Guide

Common issues and solutions for the Base Grid Trading Bot.

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

---

### 2. "Main wallet not initialized"

#### Symptom
Error when funding wallet or starting bot.

#### Solution
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

---

### 3. "No quote available from 0x"

#### Symptom
Bot can't get swap quotes.

#### Causes

**Low Liquidity Token**
- Token has no 0x liquidity
- Solution: Try different token

**Invalid Token Address**
- Check address on [basescan.org](https://basescan.org)
- Solution: Verify contract address

**0x API Rate Limit**
- Free tier limited to 10 req/s
- Solution: Add ZEROX_API_KEY to .env

---

### 4. Wallet Shows 0 Balance

#### Symptom
Balance displays 0.000 ETH but you sent funds.

#### Solutions

**1. Wait for RPC Sync**
```
Wait 30 seconds and refresh
```

**2. Check Correct Address**
```
→ 👛 View wallet balances
Compare with Basescan: https://basescan.org/address/YOUR_ADDRESS
```

**3. RPC Issues**
```
→ 📊 View status (shows which RPC is active)
If one fails, bot auto-switches to fallback
```

**4. Wrong Network**
```
Verify: Basescan shows Base mainnet
Not: Ethereum mainnet or Base testnet
```

---

### 5. "Insufficient funds for gas"

#### Symptom
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
Visit: https://basescan.org/gastracker
Base gas usually: 0.1-0.5 gwei (very cheap)
```

---

### 6. Bot Stopped After Errors

#### Symptom
Bot shows "○ Stopped" with error count.

#### Check Errors
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

---

### 7. "Transaction failed"

#### Symptom
Trade appears on chain but failed (out of gas, reverted).

#### Solutions

**Check Transaction**
```
1. Copy TX hash from monitor
2. Paste into: https://basescan.org/tx/YOUR_TX_HASH
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

### 8. Can't Export Private Key

#### Symptom
Export fails with error.

#### Solutions

**Check Password**
```
Must enter correct master password
→ 🔧 Manage wallets → Export private key
```

**Check Wallet Exists**
```
→ 🔧 Manage wallets → List all wallets
Verify wallet is in list
```

**Secure Terminal**
```
Warning: Private key will display in terminal
Make sure: No screen recording, no shoulder surfing
After export: Run "history -c" to clear bash history
```

---

### 9. Grid Positions Not Covering Price

#### Symptom
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

### 10. Telegram Notifications Not Working

#### Symptom
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

### 11. P&L Numbers Don't Match

#### Symptom
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

### 12. "Token approval failed"

#### Symptom
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

Or use Basescan:
```
1. Go to token contract on Basescan
2. Connect wallet
3. Write contract → approve
4. Spender: 0x (0x exchange proxy)
5. Amount: max uint256
```

**Note:** Bot uses exact approvals normally. Manual unlimited approval fixes this.

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

---

## Getting Help

### Logs Location

```bash
# Application logs
tail -f logs/app.log

# Error logs
tail -f logs/error.log

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

---

## Quick Reference Card

| Problem | Quick Fix |
|---------|-----------|
| No trades | Check "NEXT BUY" in monitor |
| 0 balance | Wait 30s, check Basescan |
| Gas error | Keep 0.01+ ETH reserved |
| Bot stopped | ▶️ Start bot(s) |
| No quotes | Check token liquidity |
| Export fails | Re-enter password |
| Price out of range | 🔄 Regenerate positions |
| No Telegram | Check .env config |
| P&L confusion | Check realized vs unrealized |

---

**Still stuck? Check the [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system understanding.**
