/**
 * The Odds API client — championship futures (outrights).
 *
 * Returns a Map<lowercaseTeamName, deViggedChampionshipPct> for each team
 * found across all bookmakers, averaged across books.
 *
 * De-vig method: multiplicative (proportional allocation).
 *   1. Convert each American price to raw implied probability.
 *   2. Sum all raw probs for the book → overround.
 *   3. De-vigged prob = raw / sum  (each team's share of 100%).
 *   4. Average each team's de-vigged prob across all books.
 *
 * Usage (server-side / GitHub Actions only):
 *   import { fetchSportsbookChampionshipOdds } from '@/lib/odds'
 *   const probs = await fetchSportsbookChampionshipOdds(
 *     'basketball_nba_championship_winner',
 *     process.env.ODDS_API_KEY!,
 *   )
 *   // probs.get('boston celtics') → 32.4 (percent)
 *
 * ⚠ NEVER import this file in browser/client components — it expects a
 * non-NEXT_PUBLIC_ env var (ODDS_API_KEY) that is not bundled to the browser.
 */

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'

interface OddsOutcome {
  name: string
  price: number  // American format: +250, -150, etc.
}

interface OddsMarket {
  key: string
  outcomes: OddsOutcome[]
}

interface OddsBookmaker {
  key: string
  title: string
  markets: OddsMarket[]
}

interface OddsEvent {
  id: string
  sport_key: string
  bookmakers: OddsBookmaker[]
}

/** Convert American odds to raw implied probability (not de-vigged). */
function americanToImplied(price: number): number {
  if (price > 0) return 100 / (100 + price)
  return Math.abs(price) / (Math.abs(price) + 100)
}

/**
 * Fetch and de-vig championship futures from The Odds API.
 * @param sportKey   e.g. 'basketball_nba_championship_winner'
 * @param apiKey     ODDS_API_KEY env var
 * @returns Map from lowercase team name → de-vigged championship % (0–100)
 *          Returns empty Map on error or if market unavailable.
 */
export async function fetchSportsbookChampionshipOdds(
  sportKey: string,
  apiKey: string,
): Promise<Map<string, number>> {
  const empty = new Map<string, number>()

  try {
    const url =
      `${ODDS_API_BASE}/sports/${sportKey}/odds/` +
      `?apiKey=${apiKey}&regions=us&markets=outrights&oddsFormat=american`

    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      console.warn(`  [Odds API] HTTP ${res.status} for ${sportKey}`)
      return empty
    }

    const data = (await res.json()) as OddsEvent[]
    if (!Array.isArray(data) || data.length === 0) return empty

    // Collect de-vigged probs per team, per book (across all "events")
    const teamProbs = new Map<string, number[]>()

    for (const event of data) {
      for (const book of event.bookmakers ?? []) {
        const market = book.markets.find(m => m.key === 'outrights')
        if (!market || market.outcomes.length === 0) continue

        // Compute raw implied probs for this book
        const raw = market.outcomes.map(o => ({
          name: o.name.trim().toLowerCase(),
          implied: americanToImplied(o.price),
        }))

        // Sum of raw probs = overround
        const overround = raw.reduce((s, o) => s + o.implied, 0)
        if (overround <= 0) continue

        // Multiplicative de-vig: each team's share × 100 → %
        for (const { name, implied } of raw) {
          const deVigged = (implied / overround) * 100
          if (!teamProbs.has(name)) teamProbs.set(name, [])
          teamProbs.get(name)!.push(deVigged)
        }
      }
    }

    if (teamProbs.size === 0) return empty

    // Average across books for consensus line
    const result = new Map<string, number>()
    for (const [name, values] of teamProbs) {
      result.set(name, values.reduce((s, v) => s + v, 0) / values.length)
    }
    return result
  } catch (err) {
    console.warn(`  [Odds API] Error fetching ${sportKey}: ${err}`)
    return empty
  }
}
