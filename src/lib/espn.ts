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
      // next: { revalidate: 0 } is Next.js-specific; ignored in Node.js / browser
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

// Parse a W-L or W-L-D/T record summary string.
// NBA/MLB/NFL: "94-68"    → { wins: 94, losses: 68, ties: 0 }
// NHL:         "44-32-6"  → { wins: 44, losses: 32, ties: 6 }  (OTL handled separately)
// MLS:         "20-6-8"   → { wins: 20, losses: 6,  ties: 8 }  (draws)
function parseSummary(summary: string): { wins: number; losses: number; ties: number } {
  const parts = summary.split('-').map(n => parseInt(n, 10))
  return {
    wins: parts[0] ?? 0,
    losses: parts[1] ?? 0,
    ties: parts[2] ?? 0,
  }
}

// Current season year. Winter sports (hockey/basketball) started the previous October.
function seasonYear(sport: string): number {
  const month = new Date().getMonth() + 1 // 1-12
  const year = new Date().getFullYear()
  // ESPN uses the ENDING year for multi-year seasons (e.g. 2025-26 season → "2026").
  // Seasons that start in October end the following year, so add 1 when in Oct+.
  // Jan–Sep: current year is the ending year already (e.g. Jun 2026 → 2026 = 2025-26 season).
  if (sport === 'hockey' || sport === 'basketball') {
    return month >= 10 ? year + 1 : year
  }
  return year
}

// Map a group/division name to its conference, sport-aware.
// This is data-driven to avoid the generic heuristic bugs (e.g., NBA "Central" is East,
// NHL "Central" is West).
function inferConference(groupName: string, sport: string): string {
  const g = groupName.toLowerCase()

  // Baseball — AL vs NL. Group names are like "AL East", "NL Central".
  if (sport === 'baseball') {
    if (g.startsWith('al') || g.includes('american')) return 'AL'
    if (g.startsWith('nl') || g.includes('national')) return 'NL'
    return groupName
  }

  // Football — AFC vs NFC. Group names are like "AFC East", "NFC North".
  if (sport === 'football') {
    if (g.includes('afc')) return 'AFC'
    if (g.includes('nfc')) return 'NFC'
    return groupName
  }

  // Basketball (NBA):
  //   Eastern: Atlantic, Central, Southeast
  //   Western: Northwest, Pacific, Southwest
  if (sport === 'basketball') {
    if (g.includes('atlantic') || g.includes('central') || g.includes('southeast')) {
      return 'Eastern Conference'
    }
    if (g.includes('northwest') || g.includes('pacific') || g.includes('southwest')) {
      return 'Western Conference'
    }
    // Fallback for any "East"/"West" in group name
    if (g.includes('east')) return 'Eastern Conference'
    if (g.includes('west')) return 'Western Conference'
    return groupName
  }

  // Hockey (NHL):
  //   Eastern: Atlantic, Metropolitan
  //   Western: Central, Pacific
  if (sport === 'hockey') {
    if (g.includes('atlantic') || g.includes('metropolitan')) return 'Eastern Conference'
    if (g.includes('central') || g.includes('pacific')) return 'Western Conference'
    if (g.includes('east')) return 'Eastern Conference'
    if (g.includes('west')) return 'Western Conference'
    return groupName
  }

  // Soccer (MLS) and any other sport — generic East/West fallback
  if (g.includes('east')) return 'Eastern Conference'
  if (g.includes('west')) return 'Western Conference'
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
    // Site API unavailable — fall through; team metadata will be derived from IDs
  }
  return map
}

// Get all division group IDs for a league+season.
// ESPN structures some leagues as conferences → divisions (children).
// e.g. NBA: groups = [East, West]; each has children [Atlantic, Central, Southeast, ...]
// We always want the leaf-level division groups for accurate div_title_pct tracking.
async function fetchGroupIds(
  sport: string,
  league: string,
  season: number,
  seasonType = 2,
): Promise<string[]> {
  try {
    const url = `${ESPN_CORE}/${sport}/leagues/${league}/seasons/${season}/types/${seasonType}/groups?limit=100`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await espnFetch(url)) as any
    const items: unknown[] = data.items ?? []
    const topIds = items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(item => refId((item as any).$ref ?? '', 'groups'))
      .filter((id): id is string => id !== null)

    // For each top-level group, check if it's a conference wrapper with children.
    // If so, collect the children (actual divisions) instead.
    const divisionIds: string[] = []
    await Promise.all(
      topIds.map(async gid => {
        try {
          const groupUrl = `${ESPN_CORE}/${sport}/leagues/${league}/seasons/${season}/types/${seasonType}/groups/${gid}`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const g = (await espnFetch(groupUrl)) as any
          if (g.isConference && g.children?.$ref) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const childData = (await espnFetch(g.children.$ref)) as any
            const childIds = (childData.items ?? [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((item: any) => refId(item.$ref ?? '', 'groups'))
              .filter((id: string | null): id is string => id !== null)
            divisionIds.push(...childIds)
          } else {
            divisionIds.push(gid)
          }
        } catch {
          divisionIds.push(gid) // fall back to top-level group on error
        }
      }),
    )
    return divisionIds
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
  seasonType = 2,
): Promise<string> {
  try {
    const url = `${ESPN_CORE}/${sport}/leagues/${league}/seasons/${season}/types/${seasonType}/groups/${groupId}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await espnFetch(url)) as any
    // Use full name (not abbreviation) so inferConference can pattern-match on it.
    return data.name ?? data.abbreviation ?? `Group ${groupId}`
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
  seasonType = 2,
): Promise<LeagueTeam[]> {
  try {
    const url = `${ESPN_CORE}/${sport}/leagues/${league}/seasons/${season}/types/${seasonType}/groups/${groupId}/standings/0`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await espnFetch(url)) as any
    const teams: LeagueTeam[] = []

    for (const standing of data.standings ?? []) {
      const teamId = refId(standing.team?.$ref ?? '', 'teams')
      if (!teamId) continue

      const meta = teamMap.get(teamId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const records: any[] = standing.records ?? []
      const overallRecord = records[0]

      const { wins, losses, ties: summaryTies } = overallRecord?.summary
        ? parseSummary(overallRecord.summary)
        : { wins: 0, losses: 0, ties: 0 }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statsArr: any[] = overallRecord?.stats ?? []
      // OTL for hockey; draws come from parseSummary for soccer
      const otl = statsArr.find((s: { name: string }) => s.name === 'OTLosses')?.value ?? 0
      const ties = summaryTies || Math.round(otl)

      const gamesPlayed = wins + losses + ties
      const gamesRemaining = Math.max(0, totalGames - gamesPlayed)

      // Win percentage — for soccer, draws count as half a win
      const effectiveWins = sport === 'soccer' ? wins + ties * 0.5 : wins
      const winPct = gamesPlayed > 0 ? effectiveWins / gamesPlayed : 0
      const elo = 1500 + (winPct - 0.5) * 400

      // Extract tiebreaker records from ESPN breakdown records.
      // ESPN names vary by sport: "vs. Div." / "Intradivision" for division;
      // "vs. Conf." / "Intraleague" for conference.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const findRecord = (keywords: string[]): { wins: number; losses: number } => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = records.find((rec: any) => {
          const n = (rec.name ?? '').toLowerCase()
          return keywords.some(k => n.includes(k))
        })
        if (!r?.summary) return { wins: 0, losses: 0 }
        const parsed = parseSummary(r.summary)
        return { wins: parsed.wins, losses: parsed.losses }
      }

      const divRec  = findRecord(['vs. div', 'intradiv', 'division standing'])
      const confRec = findRecord(['vs. conf', 'intraleague', 'league'])

      teams.push({
        id: teamId,
        name: meta?.name ?? `Team ${teamId}`,
        abbreviation: meta?.abbreviation ?? `T${teamId}`,
        displayName: meta?.displayName ?? `Team ${teamId}`,
        wins,
        losses,
        ties,
        winPct,
        gamesBack: 0,
        division: groupName,
        conference: inferConference(groupName, sport),
        elo,
        gamesRemaining,
        divisionWins: divRec.wins,
        divisionLosses: divRec.losses,
        conferenceWins: confRec.wins,
        conferenceLosses: confRec.losses,
      })
    }
    return teams
  } catch {
    return []
  }
}

export async function fetchStandings(
  espnPath: string,
  totalGames: number,
  coreLeague?: string,
  coreSeasonType = 2,
): Promise<LeagueTeam[]> {
  const [sport, leagueFromPath] = espnPath.split('/')
  const league = coreLeague ?? leagueFromPath
  const season = seasonYear(sport)

  const [teamMap, groupIds] = await Promise.all([
    buildTeamMap(espnPath),
    fetchGroupIds(sport, league, season, coreSeasonType),
  ])

  if (groupIds.length === 0) return []

  const allTeams: LeagueTeam[] = []

  await Promise.all(
    groupIds.map(async groupId => {
      const groupName = await fetchGroupName(sport, league, season, groupId, coreSeasonType)
      const teams = await fetchGroupStandings(
        sport,
        league,
        season,
        groupId,
        groupName,
        teamMap,
        totalGames,
        coreSeasonType,
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

/**
 * Returns the ESPN team IDs of teams currently alive in the playoffs —
 * i.e. appearing in any non-completed postseason (season type 3) event.
 *
 * Returns an empty Set when:
 *   - The league isn't in playoff season yet (MLB regular season, etc.)
 *   - The playoffs are completely finished
 *   - ESPN returns no data
 *
 * Used to zero out championship/conf odds for eliminated teams after the
 * regular season ends and we switch to pure playoff-bracket simulation.
 */
export async function fetchPlayoffAliveTeamIds(espnPath: string): Promise<Set<string>> {
  try {
    const url = `${ESPN_SITE}/${espnPath}/scoreboard?seasontype=3&limit=200`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await espnFetch(url)) as any
    const aliveIds = new Set<string>()

    for (const event of data.events ?? []) {
      // Only process actual postseason events — some leagues return regular
      // season games even when seasontype=3 is passed (e.g. MLB in June).
      if (event.season?.type !== 3) continue
      const completed = event.status?.type?.completed ?? false
      if (completed) continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comps: any[] = event.competitions?.[0]?.competitors ?? []
      for (const comp of comps) {
        const id = comp.team?.id
        if (id) aliveIds.add(String(id))
      }
    }

    return aliveIds
  } catch {
    return new Set()
  }
}
