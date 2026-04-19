import type { LeagueTeam, Game } from '@/types'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const FETCH_TIMEOUT_MS = 5000

async function espnFetch(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`ESPN returned ${res.status} for ${url}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

function statValue(
  stats: Array<{ name: string; value: number; displayValue?: string }>,
  name: string,
): number {
  return stats.find(s => s.name === name)?.value ?? 0
}

export async function fetchStandings(
  espnPath: string,
  totalGames: number,
): Promise<LeagueTeam[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await espnFetch(`${ESPN_BASE}/${espnPath}/standings`)) as any
  const teams: LeagueTeam[] = []

  const topGroups: unknown[] = data.children ?? data.groups ?? []

  for (const group of topGroups) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = group as any
    const confName: string = g.name ?? 'Unknown'
    const divisions: unknown[] = g.children ?? [g]

    for (const div of divisions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = div as any
      const divName: string = d.name ?? confName
      const entries: unknown[] = d.standings?.entries ?? []

      for (const entry of entries) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = entry as any
        const stats = e.stats ?? []
        const wins = statValue(stats, 'wins')
        const losses = statValue(stats, 'losses')
        const otl = statValue(stats, 'overtimeLosses') + statValue(stats, 'ties')
        const gamesPlayed = wins + losses + otl
        const gamesRemaining = Math.max(0, totalGames - gamesPlayed)
        const winPct = gamesPlayed > 0 ? wins / gamesPlayed : 0
        const elo = 1500 + (winPct - 0.5) * 400

        teams.push({
          id: String(e.team.id),
          name: e.team.name ?? e.team.displayName,
          abbreviation: e.team.abbreviation,
          displayName: e.team.displayName,
          wins,
          losses,
          ties: otl,
          winPct,
          gamesBack: statValue(stats, 'gamesBehind'),
          division: divName,
          conference: confName,
          elo,
          gamesRemaining,
        })
      }
    }
  }

  return teams
}

export async function fetchUpcomingGames(espnPath: string): Promise<Game[]> {
  const games: Game[] = []
  try {
    const today = new Date()
    const end = new Date(today)
    end.setDate(end.getDate() + 30)
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await espnFetch(
      `${ESPN_BASE}/${espnPath}/scoreboard?dates=${fmt(today)}-${fmt(end)}&limit=500`,
    )) as any

    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      const competitors: unknown[] = comp.competitors ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const home = (competitors as any[]).find((c: any) => c.homeAway === 'home')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const away = (competitors as any[]).find((c: any) => c.homeAway === 'away')
      if (!home || !away) continue
      const completed = Boolean(event.status?.type?.completed)
      games.push({
        homeTeamId: String(home.team.id),
        awayTeamId: String(away.team.id),
        date: event.date,
        completed,
        homeScore: completed ? parseInt(home.score, 10) : undefined,
        awayScore: completed ? parseInt(away.score, 10) : undefined,
      })
    }
  } catch {
    // Fail gracefully — caller handles empty array
  }
  return games
}

export function isLeagueActive(teams: LeagueTeam[]): boolean {
  if (teams.length === 0) return false
  return teams.some(t => t.wins + t.losses > 0)
}
