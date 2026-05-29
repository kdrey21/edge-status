export interface SimResult {
  id: string
  team: string
  league: string
  wins: number
  losses: number
  games_back: number
  playoff_pct: number
  div_title_pct: number
  conf_title_pct: number
  championship_pct: number
  seed_distribution: Record<string, number>
  magic_number: number | null
  elim_number: number | null
  // betting edge fields (Phase 3)
  implied_playoff_pct: number | null
  edge_pct: number | null
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
  coreLeague?: string      // overrides the league segment in the core API URL
  coreSeasonType?: number  // overrides season type in core API URL (default 2 = regular season)
  totalGames: number
  playoffTeamsPerConference: number
  // ESPN team abbreviations — used as fallback for generateStaticParams at build time.
  // Must match what ESPN's API returns (used as team identifiers throughout).
  teams: string[]
}

export const LEAGUES: LeagueConfig[] = [
  {
    name: 'NBA',
    slug: 'nba',
    sport: 'basketball',
    espnPath: 'basketball/nba',
    totalGames: 82,
    playoffTeamsPerConference: 8,
    // ESPN abbreviations (30 teams)
    teams: [
      'ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GS',
      'HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NO','NY',
      'OKC','ORL','PHI','PHX','POR','SAC','SA','TOR','UTA','WSH',
    ],
  },
  {
    name: 'NHL',
    slug: 'nhl',
    sport: 'hockey',
    espnPath: 'hockey/nhl',
    totalGames: 82,
    playoffTeamsPerConference: 8,
    // ESPN abbreviations (32 teams)
    teams: [
      'ANA','BOS','BUF','CGY','CAR','CHI','COL','CBJ','DAL','DET',
      'EDM','FLA','LA','MIN','MTL','NSH','NJ','NYI','NYR','OTT',
      'PHI','PIT','SJS','SEA','STL','TB','TOR','UTA','VAN','VGK','WSH',
      'ARI',
    ],
  },
  {
    name: 'MLB',
    slug: 'mlb',
    sport: 'baseball',
    espnPath: 'baseball/mlb',
    totalGames: 162,
    playoffTeamsPerConference: 6,
    // ESPN abbreviations (30 teams)
    teams: [
      'ARI','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET',
      'HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK',
      'PHI','PIT','SD','SEA','SF','STL','TB','TEX','TOR','WSH',
    ],
  },
  {
    name: 'NFL',
    slug: 'nfl',
    sport: 'football',
    espnPath: 'football/nfl',
    totalGames: 17,
    playoffTeamsPerConference: 7,
    // ESPN abbreviations (32 teams)
    teams: [
      'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN',
      'DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA',
      'MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WSH',
    ],
  },
  {
    name: 'MLS',
    slug: 'mls',
    sport: 'soccer',
    espnPath: 'soccer/usa.1',
    // Core API requires 'usa.1' (not 'mls') and season type 1 for regular season
    coreLeague: 'usa.1',
    coreSeasonType: 1,
    totalGames: 34,
    playoffTeamsPerConference: 9,
    // ESPN abbreviations — verified from site API (30 teams, 2026 season)
    teams: [
      'ATL','ATX','CHI','CIN','CLB','CLT','COL','DAL','DC','HOU',
      'LA','LAFC','MIA','MIN','MTL','NE','NSH','RBNY','NYC','ORL',
      'PHI','POR','RSL','SD','SEA','SJ','SKC','STL','TOR','VAN',
    ],
  },
]

export function getLeague(slug: string): LeagueConfig | undefined {
  return LEAGUES.find(l => l.slug === slug)
}
