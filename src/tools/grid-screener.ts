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

const DEXSCREENER_API_V1 = 'https://api.dexscreener.com';  // v1 endpoints at root

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
 * Known Base tokens for grid trading (fallback when APIs fail)
 */
const KNOWN_BASE_TOKENS: Partial<TokenMetrics>[] = [
  { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO', name: 'Aerodrome' },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether' },
  { address: '0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b', symbol: 'BNKR', name: 'Bankr Coin' },
  { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', symbol: 'BRETT', name: 'Brett' },
  { address: '0x98f47e10d7fB1165c0951441ac255471f07AA5f1', symbol: 'TOSHI', name: 'Toshi' },
  { address: '0x5ab3d4c385b400f3abb49e80de2faf6a88a7b691', symbol: 'FLOCK', name: 'FLock.io' },
  { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', symbol: 'DEGEN', name: 'Degen' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin' },
];

/**
 * Fetch token data from DexScreener API v1
 * Using: /tokens/v1/{chainId}/{tokenAddresses}
 * Rate limit: 300 requests per minute, up to 30 addresses per request
 */
async function fetchTokenDataBatch(tokenAddresses: string[]): Promise<TokenMetrics[]> {
  try {
    // Build comma-separated list of addresses (max 30)
    const addresses = tokenAddresses.slice(0, 30).join(',');
    const url = `${DEXSCREENER_API_V1}/tokens/v1/base/${addresses}`;
    
    console.log(chalk.dim(`  Fetching: ${url.substring(0, 80)}...`));
    
    const response = await axios.get(url, { timeout: 30000 });
    
    if (!response.data || !Array.isArray(response.data)) {
      console.log(chalk.yellow('  Unexpected response format'));
      return [];
    }

    const tokens: TokenMetrics[] = [];
    
    for (const pair of response.data) {
      // Skip if not on Base
      if (pair.chainId !== 'base') continue;
      
      const baseToken = pair.baseToken;
      
      // Skip stablecoins
      if (['USDC', 'USDT', 'DAI', 'USDbC'].includes(baseToken.symbol)) continue;
      
      // Skip if liquidity too low
      if ((pair.liquidity?.usd || 0) < 10000) continue;

      tokens.push({
        address: baseToken.address,
        symbol: baseToken.symbol,
        name: baseToken.name,
        price: parseFloat(pair.priceUsd) || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        marketCap: pair.marketCap || 0,
        ageDays: estimateAge(pair),
        txCount24h: (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
        buySellRatio: (pair.txns?.h24?.buys || 1) / (pair.txns?.h24?.sells || 1),
      });
    }

    return tokens;
  } catch (error: any) {
    console.error(chalk.red(`  API Error: ${error.message}`));
    if (error.response?.status === 429) {
      console.error(chalk.red('  Rate limited - too many requests'));
    }
    return [];
  }
}

/**
 * Discovery list types from DexScreener
 */
type DiscoveryType = 
  | 'known'      // Known established tokens
  | 'trending'   // Most boosted tokens
  | 'latest'     // Latest token profiles
  | 'community'  // Community takeovers
  | 'ads'        // Advertised tokens
  | 'search';    // Search by query

/**
 * Search for tokens on Base using DexScreener search
 */
async function searchBaseTokens(query: string): Promise<string[]> {
  try {
    const url = `${DEXSCREENER_API_V1}/latest/dex/search?q=${encodeURIComponent(query)}`;
    console.log(chalk.dim(`  Searching for "${query}"...`));
    
    const response = await axios.get(url, { timeout: 10000 });
    
    if (!response.data?.pairs || !Array.isArray(response.data.pairs)) {
      console.log(chalk.dim(`  No search results found`));
      return [];
    }

    // Extract Base chain token addresses from pairs
    const baseTokens: string[] = response.data.pairs
      .filter((p: any) => p.chainId === 'base')
      .map((p: any) => p.baseToken?.address as string)
      .filter((addr: string | undefined): addr is string => Boolean(addr));
    
    // Deduplicate
    const uniqueTokens = [...new Set(baseTokens)];
    console.log(chalk.dim(`  Found ${uniqueTokens.length} Base tokens from search`));
    return uniqueTokens;
  } catch (error: any) {
    console.error(chalk.dim(`  Search error: ${error.message}`));
    return [];
  }
}

/**
 * Fetch tokens from various DexScreener discovery endpoints
 */
async function fetchDiscoveryTokens(type: DiscoveryType, _searchQuery?: string): Promise<string[]> {
  const endpoints: Record<DiscoveryType, string> = {
    known: '', // Uses known list, not an API endpoint
    trending: '/token-boosts/top/v1',
    latest: '/token-profiles/latest/v1',
    community: '/community-takeovers/latest/v1',
    ads: '/ads/latest/v1',
    search: '', // Handled separately
  };

  if (type === 'known' || type === 'search') {
    return []; // Handled separately
  }

  try {
    const url = `${DEXSCREENER_API_V1}${endpoints[type]}`;
    console.log(chalk.dim(`  Fetching from ${type}...`));
    
    const response = await axios.get(url, { timeout: 10000 });
    
    if (!Array.isArray(response.data)) {
      console.log(chalk.dim(`  No ${type} tokens found`));
      return [];
    }

    // Extract Base chain token addresses
    const baseTokens = response.data
      .filter((t: any) => t.chainId === 'base')
      .map((t: any) => t.tokenAddress)
      .filter(Boolean);
    
    console.log(chalk.dim(`  Found ${baseTokens.length} ${type} Base tokens`));
    return baseTokens;
  } catch (error: any) {
    console.error(chalk.dim(`  Could not fetch ${type} tokens: ${error.message}`));
    return [];
  }
}

/**
 * Fetch top tokens on Base by volume
 */
async function fetchBaseTokens(discoveryType: DiscoveryType = 'known', searchQuery?: string): Promise<TokenMetrics[]> {
  console.log(chalk.cyan('🔍 Fetching Base tokens from DexScreener API v1...\n'));
  console.log(chalk.dim('  Endpoint: /tokens/v1/base/{addresses}'));
  console.log(chalk.dim('  Rate limit: 300 req/min, 30 addresses per request\n'));
  
  let allAddresses: string[] = [];
  let usedFallback = false;
  
  if (discoveryType === 'known') {
    // Get addresses from known tokens
    const knownAddresses = KNOWN_BASE_TOKENS
      .map(t => t.address)
      .filter((a): a is string => !!a);
    
    // Also fetch trending tokens
    const trendingAddresses = await fetchDiscoveryTokens('trending');
    
    // Combine and dedupe
    allAddresses = [...new Set([...knownAddresses, ...trendingAddresses])];
    
    console.log(chalk.dim(`  Checking ${knownAddresses.length} known + ${trendingAddresses.length} trending tokens...`));
  } else if (discoveryType === 'search' && searchQuery) {
    // Search for tokens
    allAddresses = await searchBaseTokens(searchQuery);
    
    // If search returns nothing, fall back to known tokens
    if (allAddresses.length === 0) {
      console.log(chalk.yellow('  Search returned no results, falling back to known tokens...'));
      allAddresses = KNOWN_BASE_TOKENS
        .map(t => t.address)
        .filter((a): a is string => !!a);
      usedFallback = true;
    }
  } else {
    // Fetch from specific discovery endpoint
    allAddresses = await fetchDiscoveryTokens(discoveryType);
    console.log(chalk.dim(`  Checking ${allAddresses.length} tokens from ${discoveryType}...`));
    
    // If discovery returns empty, fall back to known tokens
    if (allAddresses.length === 0) {
      console.log(chalk.yellow(`  No ${discoveryType} tokens found, falling back to known tokens...`));
      allAddresses = KNOWN_BASE_TOKENS
        .map(t => t.address)
        .filter((a): a is string => !!a);
      usedFallback = true;
    }
  }
  
  if (allAddresses.length === 0) {
    console.log(chalk.yellow('\n  No token addresses to analyze'));
    return [];
  }
  
  if (usedFallback) {
    console.log(chalk.dim(`  Using ${allAddresses.length} known tokens as fallback...`));
  }
  
  console.log(chalk.dim(`  Total unique: ${allAddresses.length}\n`));
  
  const tokens = await fetchTokenDataBatch(allAddresses);

  if (tokens.length === 0) {
    console.log(chalk.yellow('\n  No token data available from DexScreener'));
    console.log(chalk.dim('  This may be due to:'));
    console.log(chalk.dim('  - API rate limiting (wait 60 seconds)'));
    console.log(chalk.dim('  - Invalid token addresses'));
    console.log(chalk.dim('  - API maintenance'));
  } else {
    console.log(chalk.green(`\n  ✓ Fetched data for ${tokens.length} tokens`));
  }

  return tokens;
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
 * Discovery list options
 */
const DISCOVERY_OPTIONS: { value: DiscoveryType; label: string; description: string }[] = [
  { value: 'known', label: '📋 Known + Trending', description: 'Established tokens + most boosted' },
  { value: 'trending', label: '🔥 Trending (Top Boosted)', description: 'Most actively boosted tokens' },
  { value: 'latest', label: '✨ Latest Profiles', description: 'Newest token profiles listed' },
  { value: 'community', label: '🚀 Community Takeovers', description: 'Tokens with community takeovers' },
  { value: 'ads', label: '📢 Advertised', description: 'Tokens with paid advertisements' },
  { value: 'search', label: '🔍 Search', description: 'Search for specific tokens by name/symbol' },
];

/**
 * Get discovery type label
 */
function getDiscoveryLabel(type: DiscoveryType): string {
  return DISCOVERY_OPTIONS.find(o => o.value === type)?.label || type;
}

/**
 * Main screener function
 */
async function runScreener(discoveryType: DiscoveryType = 'known', searchQuery?: string) {
  console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║     🎯 BASE GRID TRADING TOKEN SCREENER                      ║'));
  console.log(chalk.cyan('║     Find the best tokens for grid bot trading                ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝\n'));
  
  if (discoveryType === 'search' && searchQuery) {
    console.log(chalk.dim(`Search: "${searchQuery}"\n`));
  } else {
    console.log(chalk.dim(`Source: ${getDiscoveryLabel(discoveryType)}\n`));
  }

  const tokens = await fetchBaseTokens(discoveryType, searchQuery);
  
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

// Export discovery options for the menu
export { DISCOVERY_OPTIONS, type DiscoveryType, searchBaseTokens };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runScreener().catch(console.error);
}

export { runScreener, calculateGridScore, fetchBaseTokens };
