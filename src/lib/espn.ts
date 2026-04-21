import type { LeagueTeam, Game } from '@/types'

const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports'
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports'
const FETCH_TIMEOUT_MS = 8000

async function espnFetch(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 0 },
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Pull the numeric ID out of a $ref URL, e.g. ".../groups/3?..." → "3"
function refId(ref: string, segment: string): string | null {
  const m = ref.match(new RegExp(`/${segment}/(\\w[\\w.]*?)(?:[/?]|$)`))
  return m ? m[1] : null
}

// "10-8" or "94-68" → { wins, losses }
function parseSummary(summary: string): { wins: number; losses: number } {
  const parts = summary.split('-').map(n => parseInt(n, 10))
  return { wins: parts[0] ?? 0, losses: parts[1] ?? 0 }
}

// Current season year — winter sports (hockey/basketball) started previous Oct
function seasonYear(sport: string): number {
  const month = new Date().getMonth() + 1 // 1-12
  const year = new Date().getFullYear()
  if (sport === 'hockey' || sport === 'basketball') {
    return month >= 10 ? year : year - 1
  }
  return year
}

// Best-guess conference from a division/group name
function inferConference(groupName: string, sport: string): string {
  const g = groupName.toLowerCase()
  if (sport === 'baseball') {
    if (g.includes('al ') || g.startsWith('al') || g.includes('american')) return 'AL'
    if (g.includes('nl ') || g.startsWith('nl') || g.includes('national')) return 'NL'
  }
  if (g.includes('afc') || g.startsWith('afc')) return 'AFC'
  if (g.includes('nfc') || g.startsWith('nfc')) return 'NFC'
  if (g.includes('east') || g.includes('atlantic') || g.includes('metropolitan')) return 'Eastern Conference'
  if (g.includes('west') || g.includes('pacific') || g.includes('northwest') || g.includes('southwest')) return 'Western Conference'
  if (g.includes('central') || g.includes('south')) return 'Western Conference'
  return groupName
}

// Build teamId → metadata map from the site API teams endpoint
async function buildTeamMap(
  espnPath: string,
): Promise<Map<string, { name: string; abbreviation: string; displayName: string }>> {
  const map = new Map<string, { name: string; abbreviation: string; displayName: string }>()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await espnFetch(`${ESPN_SITE}/${espnPath}/teams?limit=100`)) as any
    const teams: unknown[] = data.sports?.[0]?.leagues?.[0]?.teams ?? []
    for (const t of teams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const team = (t as any).team
      if (team?.id) {
        map.set(String(team.id), {
          name: team.name ?? team.displayName,
          abbreviation: team.abbreviation ?? team.name,
          displayName: team.displayName ?? team.name,
        })
      }
    }
  } catch {
    // Site API unavailable — use fallback names from team IDs
  }
  return map
}

// Get all division/conference group IDs for a league+season
async function fetchGroupIds(sport: string, league: string, season: number): Promise<string[]> {
  try {
    const url = `${ESPN_CORE}/${sport}/leagues/${league}/seasons/${season}/types/2/groups?limit=100`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await espnFetch(url)) as any
    const items: unknown[] = data.items ?? []
    return items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(item => refId((item as any).$ref ?? '', 'groups'))
      .filter((id): id is string => id !== null)
  } catch {
    return []
  }
}

// Get one group's name
async function fetchGroupName(
  sport: string,
  league: string,
  season: number,
  groupId: string,
): Promise<string> {
  try {
    const url = `${ESPN_CORE}/${sport}/leagues/${league}/seasons/${season}/types/2/groups/${groupId}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await espnFetch(url)) as any
    return data.abbreviation ?? data.name ?? `Group ${groupId}`
  } catch {
    return `Group ${groupId}`
  }
}

// Get standings for one group, returning LeagueTeam entries
async function fetchGroupStandings(
  sport: string,
  league: string,
  season: number,
  groupId: string,
  groupName: string,
  teamMap: Map<string, { name: string; abbreviation: string; displayName: string }>,
  totalGames: number,
): Promise<LeagueTeam[]> {
  try {
    const url = `${ESPN_CORE}/${sport}/leagues/${league}/seasons/${season}/types/2/groups/${groupId}/standings/0`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await espnFetch(url)) as any
    const teams: LeagueTeam[] = []

    for (const standing of data.standings ?? []) {
      const teamId = refId(standing.team?.$ref ?? '', 'teams')
      if (!teamId) continue

      const meta = teamMap.get(teamId)
      const record = standing.records?.[0]
      const { wins, losses } = record?.summary ? parseSummary(record.summary) : { wins: 0, losses: 0 }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statsArr: any[] = record?.stats ?? []
      const otl = statsArr.find(s => s.name === 'OTLosses')?.value ?? 0

      const gamesPlayed = wins + losses + Math.round(otl)
      const gamesRemaining = Math.max(0, totalGames - gamesPlayed)
      const winPct = gamesPlayed > 0 ? wins / gamesPlayed : 0
      const elo = 1500 + (winPct - 0.5) * 400

      teams.push({
        id: teamId,
        name: meta?.name ?? `Team ${teamId}`,
        abbreviation: meta?.abbreviation ?? `T${teamId}`,
        displayName: meta?.displayName ?? `Team ${teamId}`,
        wins,
        losses,
        ties: Math.round(otl),
        winPct,
        gamesBack: 0,
        division: groupName,
        conference: inferConference(groupName, sport),
        elo,
        gamesRemaining,
      })
    }
    return teams
  } catch {
    return []
  }
}

export async function fetchStandings(espnPath: string, totalGames: number): Promise<LeagueTeam[]> {
  const [sport, league] = espnPath.split('/')
  const season = seasonYear(sport)

  const [teamMap, groupIds] = await Promise.all([
    buildTeamMap(espnPath),
    fetchGroupIds(sport, league, season),
  ])

  if (groupIds.length === 0) return []

  const allTeams: LeagueTeam[] = []

  await Promise.all(
    groupIds.map(async groupId => {
      const groupName = await fetchGroupName(sport, league, season, groupId)
      const teams = await fetchGroupStandings(
        sport,
        league,
        season,
        groupId,
        groupName,
        teamMap,
        totalGames,
      )
      allTeams.push(...teams)
    }),
  )

  return allTeams
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
      `${ESPN_SITE}/${espnPath}/scoreboard?dates=${fmt(today)}-${fmt(end)}&limit=500`,
    )) as any

    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const home = (comp.competitors as any[])?.find((c: any) => c.homeAway === 'home')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const away = (comp.competitors as any[])?.find((c: any) => c.homeAway === 'away')
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
    // Fail gracefully
  }
  return games
}

export function isLeagueActive(teams: LeagueTeam[]): boolean {
  if (teams.length < 4) return false
  return teams.some(t => t.wins + t.losses + t.ties > 0)
}
