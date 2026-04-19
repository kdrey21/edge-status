import type { LeagueTeam, Game } from '@/types'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const FETCH_TIMEOUT_MS = 8000

async function espnFetch(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 0 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EdgeStatus/1.0)',
        'Accept': 'application/json',
      },
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

// Current season year for a given sport
// NHL/NBA span two calendar years — use the start year (e.g. 2024 for 2024-25)
function currentSeasonYear(sport: string): number {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  const year = now.getFullYear()
  // For winter sports (hockey, basketball), season starts in Oct — use prior year if Jan-Sep
  if (sport === 'hockey' || sport === 'basketball') {
    return month >= 10 ? year : year - 1
  }
  return year
}

// Extract teams from a parsed ESPN standings response
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTeams(data: any, totalGames: number): LeagueTeam[] {
  const teams: LeagueTeam[] = []

  // ESPN returns either data.children (conferences) or data.groups
  const topGroups: unknown[] = data.children ?? data.groups ?? []

  if (topGroups.length === 0) return teams

  for (const group of topGroups) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = group as any
    const confName: string = g.name ?? 'Unknown Conference'

    // Some responses have divisions nested under conferences (g.children)
    // Others have teams directly under the conference standings
    const divisions: unknown[] = g.children && g.children.length > 0 ? g.children : [g]

    for (const div of divisions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = div as any
      const divName: string = d.name ?? confName
      const entries: unknown[] = d.standings?.entries ?? []

      for (const entry of entries) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = entry as any
        if (!e.team) continue
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
          abbreviation: e.team.abbreviation ?? e.team.name,
          displayName: e.team.displayName ?? e.team.name,
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

export async function fetchStandings(
  espnPath: string,
  totalGames: number,
): Promise<LeagueTeam[]> {
  const sport = espnPath.split('/')[0]
  const seasonYear = currentSeasonYear(sport)

  // Try with explicit season year first (more reliable), then fall back to no param
  const urls = [
    `${ESPN_BASE}/${espnPath}/standings?season=${seasonYear}&seasontype=2`,
    `${ESPN_BASE}/${espnPath}/standings?season=${seasonYear}`,
    `${ESPN_BASE}/${espnPath}/standings`,
  ]

  for (const url of urls) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await espnFetch(url)) as any
      const teams = extractTeams(data, totalGames)
      if (teams.length > 0) return teams
    } catch {
      // Try next URL
    }
  }

  return []
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
  if (teams.length < 4) return false
  // Active if any team has played games
  return teams.some(t => t.wins + t.losses + t.ties > 0)
}
