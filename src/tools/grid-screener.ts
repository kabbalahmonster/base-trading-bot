#!/usr/bin/env node
/**
 * @fileoverview Base Grid Trading Token Screener
 * @description Analyzes Base chain tokens for grid trading suitability
 * 
 * Criteria:
 * - Volume: >$50K daily (ensures liquidity)
 * - Volatility: 5-20% daily swings (grid profit potential)
 * - Age: >30 days (rug resistance)
 * - Liquidity: Deep enough for trade sizes
 * - Pattern: Sawtooth price action (not flat/pump-only)
 */

import axios from 'axios';
import chalk from 'chalk';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest';
const BASE_CHAIN_ID = 'base';

interface TokenMetrics {
  address: string;
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  ageDays: number;
  txCount24h: number;
  buySellRatio: number;
}

interface GridScore {
  token: TokenMetrics;
  volumeScore: number;
  volatilityScore: number;
  liquidityScore: number;
  ageScore: number;
  patternScore: number;
  totalScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendation: string;
}

/**
 * Fetch top tokens on Base by volume
 */
async function fetchBaseTokens(): Promise<TokenMetrics[]> {
  console.log(chalk.cyan('🔍 Fetching Base tokens from DexScreener...\n'));
  
  try {
    // Get top tokens on Base using the token profiles endpoint
    // This gets trending tokens with highest volume
    const response = await axios.get(`${DEXSCREENER_API}/token-profiles/${BASE_CHAIN_ID}`, {
      timeout: 30000,
    });

    // Handle different response formats from DexScreener
    let pairs: any[] = [];
    
    if (response.data?.pairs) {
      pairs = response.data.pairs;
    } else if (Array.isArray(response.data)) {
      // Token profiles returns an array directly
      pairs = response.data.map((profile: any) => ({
        baseToken: {
          address: profile.tokenAddress,
          symbol: profile.symbol,
          name: profile.name,
        },
        priceUsd: profile.priceUsd,
        priceChange: { h24: profile.priceChange24h },
        volume: { h24: profile.volume24h },
        liquidity: { usd: profile.liquidityUsd },
        marketCap: profile.marketCap,
        txns: { h24: { buys: 0, sells: 0 } },  // Not available in profiles
      }));
    } else {
      console.log(chalk.yellow('No pairs found'));
      return [];
    }

    console.log(chalk.dim(`  Found ${pairs.length} pairs`));

    // Extract unique tokens (filter out stablecoins)
    const tokenMap = new Map<string, TokenMetrics>();
    const stables = ['USDC', 'USDT', 'DAI', 'USDz', 'AUSD'];

    for (const pair of pairs) {
      // Skip if liquidity too low
      if (pair.liquidity?.usd < 10000) continue;

      // Process base token (non-stable)
      const baseToken = pair.baseToken;

      if (!stables.includes(baseToken.symbol) && !baseToken.symbol.includes('USD')) {
        if (!tokenMap.has(baseToken.address)) {
          tokenMap.set(baseToken.address, {
            address: baseToken.address,
            symbol: baseToken.symbol,
            name: baseToken.name,
            price: parseFloat(pair.priceUsd) || 0,
            priceChange24h: pair.priceChange?.h24 || 0,
            volume24h: pair.volume?.h24 || 0,
            liquidity: pair.liquidity?.usd || 0,
            marketCap: pair.marketCap || 0,
            ageDays: estimateAge(pair),
            txCount24h: pair.txns?.h24?.buys + pair.txns?.h24?.sells || 0,
            buySellRatio: pair.txns?.h24?.buys / (pair.txns?.h24?.sells || 1) || 1,
          });
        }
      }
    }

    return Array.from(tokenMap.values());
  } catch (error: any) {
    console.error(chalk.red('Error fetching tokens:', error.message));
    return [];
  }
}

/**
 * Estimate token age from pair data
 */
function estimateAge(pair: any): number {
  // If we have pair creation time
  if (pair.pairCreatedAt) {
    const created = new Date(pair.pairCreatedAt);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  }
  // Default to unknown
  return 0;
}

/**
 * Calculate grid trading suitability score
 */
function calculateGridScore(token: TokenMetrics): GridScore {
  // Volume score (0-20): Higher volume = better
  let volumeScore = 0;
  if (token.volume24h > 1000000) volumeScore = 20;
  else if (token.volume24h > 500000) volumeScore = 18;
  else if (token.volume24h > 100000) volumeScore = 15;
  else if (token.volume24h > 50000) volumeScore = 12;
  else if (token.volume24h > 10000) volumeScore = 8;
  else volumeScore = Math.max(0, token.volume24h / 1000);

  // Volatility score (0-25): 5-20% daily change is ideal
  let volatilityScore = 0;
  const change = Math.abs(token.priceChange24h);
  if (change >= 5 && change <= 20) {
    // Sweet spot
    volatilityScore = 25 - Math.abs(change - 12.5); // Peak at 12.5%
  } else if (change > 20 && change <= 50) {
    // High but manageable
    volatilityScore = 15;
  } else if (change < 5) {
    // Too flat
    volatilityScore = change * 3;
  } else {
    // Too volatile
    volatilityScore = 5;
  }

  // Liquidity score (0-20): Higher liquidity = better fills
  let liquidityScore = 0;
  if (token.liquidity > 1000000) liquidityScore = 20;
  else if (token.liquidity > 500000) liquidityScore = 18;
  else if (token.liquidity > 100000) liquidityScore = 15;
  else if (token.liquidity > 50000) liquidityScore = 10;
  else liquidityScore = Math.max(0, token.liquidity / 5000);

  // Age score (0-15): Older = more trustworthy
  let ageScore = 0;
  if (token.ageDays > 180) ageScore = 15;
  else if (token.ageDays > 90) ageScore = 12;
  else if (token.ageDays > 30) ageScore = 8;
  else if (token.ageDays > 7) ageScore = 4;
  else ageScore = 1;

  // Pattern score (0-20): Healthy trading activity
  let patternScore = 0;
  if (token.txCount24h > 1000) patternScore = 20;
  else if (token.txCount24h > 500) patternScore = 16;
  else if (token.txCount24h > 100) patternScore = 12;
  else if (token.txCount24h > 50) patternScore = 8;
  else patternScore = Math.max(0, token.txCount24h / 5);

  // Buy/sell ratio bonus (balanced = good for grid)
  if (token.buySellRatio >= 0.8 && token.buySellRatio <= 1.2) {
    patternScore += 5; // Balanced market
  }

  const totalScore = volumeScore + volatilityScore + liquidityScore + ageScore + patternScore;

  // Grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (totalScore >= 80) grade = 'A';
  else if (totalScore >= 65) grade = 'B';
  else if (totalScore >= 50) grade = 'C';
  else if (totalScore >= 35) grade = 'D';
  else grade = 'F';

  // Recommendation
  let recommendation = '';
  if (grade === 'A') recommendation = '🎯 EXCELLENT - Prime grid candidate';
  else if (grade === 'B') recommendation = '✅ GOOD - Solid grid potential';
  else if (grade === 'C') recommendation = '⚠️ FAIR - Use with caution';
  else if (grade === 'D') recommendation = '❌ POOR - Not recommended';
  else recommendation = '🚫 SKIP - Too risky or flat';

  return {
    token,
    volumeScore,
    volatilityScore,
    liquidityScore,
    ageScore,
    patternScore,
    totalScore,
    grade,
    recommendation,
  };
}

/**
 * Display results in a formatted table
 */
function displayResults(scores: GridScore[]) {
  // Sort by total score
  scores.sort((a, b) => b.totalScore - a.totalScore);

  console.log(chalk.cyan('\n📊 GRID TRADING CANDIDATES - RANKED\n'));
  console.log(chalk.dim('═'.repeat(120)));
  
  console.log(
    chalk.bold(
      `${'Rank'.padEnd(5)} ${'Token'.padEnd(12)} ${'Grade'.padEnd(6)} ${'Score'.padEnd(6)} ` +
      `${'Vol24h'.padEnd(12)} ${'Chg24h'.padEnd(8)} ${'Liq'.padEnd(12)} ${'Age'.padEnd(6)} ${'Txns'.padEnd(8)} Recommendation`
    )
  );
  console.log(chalk.dim('─'.repeat(120)));

  scores.slice(0, 20).forEach((score, index) => {
    const t = score.token;
    const gradeColor = score.grade === 'A' ? chalk.green : 
                       score.grade === 'B' ? chalk.cyan :
                       score.grade === 'C' ? chalk.yellow :
                       score.grade === 'D' ? chalk.red : chalk.gray;

    const volumeStr = t.volume24h > 1000000 
      ? `$${(t.volume24h / 1000000).toFixed(1)}M` 
      : `$${(t.volume24h / 1000).toFixed(0)}K`;
    
    const liqStr = t.liquidity > 1000000
      ? `$${(t.liquidity / 1000000).toFixed(1)}M`
      : `$${(t.liquidity / 1000).toFixed(0)}K`;

    console.log(
      `${(index + 1).toString().padEnd(5)} ` +
      `${t.symbol.padEnd(12)} ` +
      `${gradeColor(score.grade).padEnd(6)} ` +
      `${score.totalScore.toFixed(0).padEnd(6)} ` +
      `${volumeStr.padEnd(12)} ` +
      `${(t.priceChange24h >= 0 ? '+' : '').concat(t.priceChange24h.toFixed(1)).concat('%').padEnd(8)} ` +
      `${liqStr.padEnd(12)} ` +
      `${(t.ageDays > 0 ? t.ageDays + 'd' : '?').padEnd(6)} ` +
      `${t.txCount24h.toString().padEnd(8)} ` +
      `${score.recommendation}`
    );
  });

  console.log(chalk.dim('═'.repeat(120)));

  // Show top picks
  const topPicks = scores.filter(s => s.grade === 'A' || s.grade === 'B').slice(0, 5);
  
  if (topPicks.length > 0) {
    console.log(chalk.green('\n🎯 TOP RECOMMENDED CANDIDATES:\n'));
    topPicks.forEach((score, i) => {
      const t = score.token;
      console.log(chalk.cyan(`${i + 1}. ${t.symbol} (${t.name})`));
      console.log(`   Address: ${t.address}`);
      console.log(`   Price: $${t.price.toFixed(6)} | 24h Change: ${t.priceChange24h.toFixed(2)}%`);
      console.log(`   Volume: $${t.volume24h.toLocaleString()} | Liquidity: $${t.liquidity.toLocaleString()}`);
      console.log(`   Score: ${score.totalScore.toFixed(0)}/100 (${score.grade})`);
      console.log(`   Grid Range Suggestion: ±${(Math.abs(t.priceChange24h) * 2).toFixed(0)}% floor/ceiling`);
      console.log();
    });
  }

  // Statistics
  console.log(chalk.cyan('\n📈 SCREENING STATISTICS:\n'));
  console.log(`  Total tokens analyzed: ${scores.length}`);
  console.log(`  Grade A (Excellent): ${scores.filter(s => s.grade === 'A').length}`);
  console.log(`  Grade B (Good): ${scores.filter(s => s.grade === 'B').length}`);
  console.log(`  Grade C (Fair): ${scores.filter(s => s.grade === 'C').length}`);
  console.log(`  Grade D/F (Skip): ${scores.filter(s => s.grade === 'D' || s.grade === 'F').length}`);
}

/**
 * Main screener function
 */
async function runScreener() {
  console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║     🎯 BASE GRID TRADING TOKEN SCREENER                      ║'));
  console.log(chalk.cyan('║     Find the best tokens for grid bot trading                ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝\n'));

  const tokens = await fetchBaseTokens();
  
  if (tokens.length === 0) {
    console.log(chalk.red('No tokens found. Try again later.'));
    return;
  }

  console.log(chalk.dim(`  Analyzing ${tokens.length} tokens...\n`));

  const scores = tokens.map(calculateGridScore);
  displayResults(scores);

  console.log(chalk.cyan('\n💡 NEXT STEPS:\n'));
  console.log('1. Research top candidates on basescan.org');
  console.log('2. Check tokenomics and community health');
  console.log('3. Test with small amounts first');
  console.log('4. Set grid ranges based on 7-day volatility');
  console.log();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runScreener().catch(console.error);
}

export { runScreener, calculateGridScore, fetchBaseTokens };
