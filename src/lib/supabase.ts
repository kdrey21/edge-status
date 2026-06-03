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
