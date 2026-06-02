/**
 * Kalshi API client — championship futures.
 *
 * Kalshi markets use a "series" of binary yes/no contracts, one per team.
 * Each market's `yes_ask` is in cents (0–100). We normalize the field so
 * all teams in a series sum to 100%, removing the market's house edge.
 *
 * This gives us a "fair" reference probability for each team — the idea is:
 *   • Kalshi = prediction-market reference price (relatively efficient)
 *   • Sportsbook (Odds API) = retail betting implied prob
 *   • EV% = Kalshi % − Book %
 *   • Positive EV% means the sportsbook is undervaluing the team vs Kalshi
 *
 * Usage (server-side / GitHub Actions only):
 *   import { fetchKalshiChampionshipOdds } from '@/lib/kalshi'
 *   const probs = await fetchKalshiChampionshipOdds(
 *     'NBACHAMP',
 *     process.env.KALSHI_API_TOKEN!,
 *   )
 *   // probs.get('boston celtics') → 28.7 (percent, field-normalized)
 *
 * ⚠ NEVER import this file in browser/client components.
 *
 * Ticker verification:
 *   Log into https://kalshi.com → search your series — the exact ticker prefix
 *   may differ from the config value (e.g. 'KXNBACHAMP' vs 'NBACHAMP').
 *   Update LEAGUES[].kalshiSeries in src/types/index.ts if markets return 0.
 */

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2'

interface KalshiMarket {
  ticker: string
  title: string
  yes_ask_dollars: string  // dollar string e.g. "0.6500" = 65¢ = ~65% implied
  yes_sub_title: string    // city/team name e.g. "San Antonio"
  status: string           // 'active' | 'finalized' | 'closed' etc.
}

interface KalshiMarketsResponse {
  markets: KalshiMarket[]
  cursor?: string
}

/**
 * Extract team name from a Kalshi market title.
 * Examples:
 *   "NBA Champion: Boston Celtics"  → "Boston Celtics"
 *   "2025 World Series: Houston Astros" → "Houston Astros"
 *   "Boston Celtics"               → "Boston Celtics"
 */
function extractTeamName(title: string): string {
  const colonIdx = title.indexOf(':')
  if (colonIdx !== -1) return title.slice(colonIdx + 1).trim()
  return title.trim()
}

/**
 * Fetch and field-normalize Kalshi championship markets.
 * @param seriesTicker  e.g. 'NBACHAMP' (verify in Kalshi dashboard)
 * @param apiToken      KALSHI_API_TOKEN env var (read-only Bearer token)
 * @returns Map from lowercase team name → field-normalized championship % (0–100)
 *          Returns empty Map on error or if no open markets found.
 */
export async function fetchKalshiChampionshipOdds(
  seriesTicker: string,
  apiToken: string,
): Promise<Map<string, number>> {
  const empty = new Map<string, number>()

  try {
    // Fetch all markets in the series (up to 200 is more than enough for any league)
    const url = `${KALSHI_BASE}/markets?series_ticker=${seriesTicker}&limit=200`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      console.warn(`  [Kalshi] HTTP ${res.status} for series ${seriesTicker}`)
      return empty
    }

    const data = (await res.json()) as KalshiMarketsResponse
    // Only include active (not yet resolved) markets
    const markets = (data.markets ?? []).filter(m => m.status === 'active')

    if (markets.length === 0) {
      console.warn(`  [Kalshi] No active markets found for series ${seriesTicker}`)
      return empty
    }

    // yes_ask_dollars is a string like "0.6500" → convert to 0–100 cents scale
    const prices = markets.map(m => parseFloat(m.yes_ask_dollars ?? '0') * 100)

    // Sum for field normalization (removes house edge)
    const fieldTotal = prices.reduce((s, p) => s + p, 0)
    if (fieldTotal <= 0) return empty

    // Normalize: each team's share × 100 → %
    // Use yes_sub_title (e.g. "San Antonio") as the team name key — cleaner than parsing title
    const result = new Map<string, number>()
    for (let i = 0; i < markets.length; i++) {
      const market = markets[i]
      // Prefer yes_sub_title ("San Antonio"), fall back to parsing the title
      const raw = market.yes_sub_title?.trim() || extractTeamName(market.title)
      const teamName = raw.toLowerCase()
      if (!teamName) continue
      const normalizedPct = (prices[i] / fieldTotal) * 100
      result.set(teamName, normalizedPct)
    }

    return result
  } catch (err) {
    console.warn(`  [Kalshi] Error fetching ${seriesTicker}: ${err}`)
    return empty
  }
}
