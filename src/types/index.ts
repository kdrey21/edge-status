export interface SimResult {
  id: string
  team: string
  league: string
  playoff_pct: number
  div_title_pct: number
  conf_title_pct: number
  championship_pct: number
  seed_distribution: Record<string, number>
  magic_number: number | null
  elim_number: number | null
  updated_at: string
}

export interface LeagueTeam {
  id: string
  name: string
  abbreviation: string
  displayName: string
  wins: number
  losses: number
  ties: number
  winPct: number
  gamesBack: number
  division: string
  conference: string
  elo: number
  gamesRemaining: number
}

export interface Game {
  homeTeamId: string
  awayTeamId: string
  date: string
  completed: boolean
  homeScore?: number
  awayScore?: number
}

export interface LeagueConfig {
  name: string
  slug: string
  sport: string
  espnPath: string
  coreLeague?: string   // overrides the league segment in the core API URL
  totalGames: number
  playoffTeamsPerConference: number
}

export const LEAGUES: LeagueConfig[] = [
  {
    name: 'NBA',
    slug: 'nba',
    sport: 'basketball',
    espnPath: 'basketball/nba',
    totalGames: 82,
    playoffTeamsPerConference: 8,
  },
  {
    name: 'NHL',
    slug: 'nhl',
    sport: 'hockey',
    espnPath: 'hockey/nhl',
    totalGames: 82,
    playoffTeamsPerConference: 8,
  },
  {
    name: 'MLB',
    slug: 'mlb',
    sport: 'baseball',
    espnPath: 'baseball/mlb',
    totalGames: 162,
    playoffTeamsPerConference: 6,
  },
  {
    name: 'NFL',
    slug: 'nfl',
    sport: 'football',
    espnPath: 'football/nfl',
    totalGames: 17,
    playoffTeamsPerConference: 7,
  },
  {
    name: 'MLS',
    slug: 'mls',
    sport: 'soccer',
    espnPath: 'soccer/usa.1',
    coreLeague: 'mls',
    totalGames: 34,
    playoffTeamsPerConference: 9,
  },
]

export function getLeague(slug: string): LeagueConfig | undefined {
  return LEAGUES.find(l => l.slug === slug)
}
