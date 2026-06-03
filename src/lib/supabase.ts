import { createClient } from '@supabase/supabase-js'
import type { SimResult } from '@/types'

// Uses NEXT_PUBLIC_ vars so this client is safe to call from the browser.
// These are baked into the JS bundle at build time by Next.js.
function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase public env vars not set')
  return createClient(url, key)
}

export async function getLeagueResults(league: string): Promise<SimResult[]> {
  const { data, error } = await getAnonClient()
    .from('sim_results')
    .select('*')
    .eq('league', league)
    .order('playoff_pct', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getTeamResult(league: string, team: string): Promise<SimResult | null> {
  const { data, error } = await getAnonClient()
    .from('sim_results')
    .select('*')
    .eq('league', league)
    .eq('team', team)
    .single()

  if (error) return null
  return data
}

// ---------------------------------------------------------------------------
// Game importance
// ---------------------------------------------------------------------------

export interface ImportantGame {
  league: string
  game_date: string
  home_team: string
  away_team: string
  home_playoff_swing: number
  away_playoff_swing: number
  importance_score: number
}

/**
 * Fetch the most important upcoming games for a league, sorted by importance.
 * An optional teamAbbr filters to games involving a specific team.
 */
export async function getLeagueImportantGames(
  league: string,
  teamAbbr?: string,
  limit = 10,
): Promise<ImportantGame[]> {
  let query = getAnonClient()
    .from('game_importance')
    .select('*')
    .eq('league', league)
    .gte('game_date', new Date().toISOString().slice(0, 10))
    .order('importance_score', { ascending: false })
    .limit(limit)

  if (teamAbbr) {
    query = getAnonClient()
      .from('game_importance')
      .select('*')
      .eq('league', league)
      .gte('game_date', new Date().toISOString().slice(0, 10))
      .or(`home_team.eq.${teamAbbr},away_team.eq.${teamAbbr}`)
      .order('importance_score', { ascending: false })
      .limit(limit)
  }

  const { data, error } = await query
  if (error || !data) return []
  return data as ImportantGame[]
}

// ---------------------------------------------------------------------------
// Snapshot history (Phase 4)
// ---------------------------------------------------------------------------

export interface SnapPoint {
  team: string
  snap_date: string
  playoff_pct: number | null
  championship_pct: number | null
  kalshi_champ_pct: number | null
  champ_ev_pct: number | null
}

/**
 * Fetch the last `days` days of snapshots for a league.
 * Returns rows sorted oldest→newest so sparklines render left-to-right.
 */
export async function getLeagueSnapshots(
  league: string,
  days = 14,
): Promise<SnapPoint[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await getAnonClient()
    .from('sim_snapshots')
    .select('team, snap_date, playoff_pct, championship_pct, kalshi_champ_pct, champ_ev_pct')
    .eq('league', league)
    .gte('snap_date', sinceStr)
    .order('snap_date', { ascending: true })

  if (error || !data) return []
  return data as SnapPoint[]
}

export async function getAllLeaguesSummary(): Promise<
  { league: string; count: number; updated_at: string; hasSim: boolean }[]
> {
  const { data, error } = await getAnonClient()
    .from('sim_results')
    .select('league, updated_at, playoff_pct')

  if (error || !data) return []

  const byLeague = new Map<string, string>()
  for (const row of data) {
    const existing = byLeague.get(row.league)
    if (!existing || row.updated_at > existing) {
      byLeague.set(row.league, row.updated_at)
    }
  }

  return [...byLeague.entries()].map(([league, updated_at]) => ({
    league,
    updated_at,
    count: data.filter(r => r.league === league).length,
    // hasSim: true when at least one team has sim results (playoff_pct not null)
    hasSim: data.some(r => r.league === league && r.playoff_pct != null),
  }))
}
