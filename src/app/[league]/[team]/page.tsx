// Server component — owns generateStaticParams.
// At build time: uses Supabase (real env vars in GitHub Actions) to get known teams,
// falls back to the hardcoded teams[] list in LEAGUES config if Supabase is unavailable.
// Actual UI is in TeamPageClient (client component) which fetches live data at runtime.

import { createClient } from '@supabase/supabase-js'
import { LEAGUES } from '@/types'
import TeamPageClient from './TeamPageClient'

// dynamicParams = false: unknown slugs get a 404 (served by GitHub Pages 404.html).
export const dynamicParams = false

export async function generateStaticParams() {
  // Merge hardcoded teams (always available) with Supabase results (available in CI)
  const hardcoded = LEAGUES.flatMap(l =>
    l.teams.map(team => ({ league: l.slug, team: team.toLowerCase() })),
  )

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return hardcoded

    const db = createClient(url, key)
    const { data } = await db.from('sim_results').select('league, team')
    if (!data || data.length === 0) return hardcoded

    // Merge: start with hardcoded, add any Supabase teams not already present
    const seen = new Set(hardcoded.map(p => `${p.league}/${p.team}`))
    for (const r of data as { league: string; team: string }[]) {
      const key = `${r.league}/${r.team.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        hardcoded.push({ league: r.league, team: r.team.toLowerCase() })
      }
    }
  } catch {
    // Supabase unreachable — fall through to hardcoded
  }

  return hardcoded
}

interface Props {
  params: { league: string; team: string }
}

export default function TeamPage({ params }: Props) {
  return <TeamPageClient league={params.league} team={params.team} />
}
