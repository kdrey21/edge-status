/**
 * "Parlay of the Month" — a cross-league championship parlay, one champion pick
 * per major league (NFL, NBA, NHL, MLB), chosen by market edge.
 *
 * Cadence: generated once per month and locked. Skipped in the months a league's
 * title is being decided (Feb = Super Bowl, June = NBA/NHL Finals, Nov = World
 * Series) so a frozen parlay never outlives a championship — 9 posts/year.
 *
 * Shared by the generator (scripts/simulate.ts) and the UI card.
 */

/** Leagues that make up the parlay, in display order. */
export const PARLAY_LEAGUES = ['nfl', 'nba', 'nhl', 'mlb'] as const
export type ParlayLeague = (typeof PARLAY_LEAGUES)[number]

/** 1-indexed months to skip (a league championship is being contested). */
export const PARLAY_SKIP_MONTHS = new Set([2, 6, 11]) // Feb, June, November

/** Candidate pool size per league (top-N by championship odds — realism filter). */
export const PARLAY_TOP_N = 10

export interface ParlayLeg {
  league: string
  team: string
  /** Kalshi field-normalized championship % (prediction market). */
  kalshi_pct: number
  /** De-vigged sportsbook championship %. */
  book_pct: number
  /** Edge = kalshi − book (why this team was picked). */
  edge_pct: number
  /** Raw sportsbook decimal odds (with vig) used for the payout. */
  decimal_odds: number
  /** Same, as American odds (for display). */
  american_odds: number
}

export interface ParlayOfMonth {
  month_key: string // 'YYYY-MM'
  generated_at: string
  legs: ParlayLeg[]
  combined_decimal: number
  combined_american: number
  combined_implied_pct: number
  payout_per_100: number // total return on a $100 stake
}

/** 'YYYY-MM' for a date, or null if it's a skip month (no parlay that month). */
export function parlayMonthKey(date = new Date()): string | null {
  const month = date.getMonth() + 1
  if (PARLAY_SKIP_MONTHS.has(month)) return null
  return `${date.getFullYear()}-${String(month).padStart(2, '0')}`
}

/** Full month name for display, e.g. '2026-09' → 'September 2026'. */
export function parlayMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const name = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' })
  return `${name} ${y}`
}

export function americanToDecimal(price: number): number {
  return price > 0 ? price / 100 + 1 : 100 / Math.abs(price) + 1
}

export function decimalToAmerican(decimal: number): number {
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1))
}

/** Format American odds with a sign, e.g. 250 → "+250". */
export function formatAmerican(american: number): string {
  return (american > 0 ? '+' : '') + american
}

/**
 * Combine legs (multiplicative in decimal odds) into the parlay totals.
 * combined decimal = Π decimal_odds; payout = stake × combined; implied = 1/combined.
 */
export function combineParlay(legs: ParlayLeg[]): Omit<ParlayOfMonth, 'month_key' | 'generated_at' | 'legs'> {
  const combined_decimal = legs.reduce((p, l) => p * l.decimal_odds, 1)
  return {
    combined_decimal,
    combined_american: decimalToAmerican(combined_decimal),
    combined_implied_pct: (1 / combined_decimal) * 100,
    payout_per_100: 100 * combined_decimal,
  }
}
