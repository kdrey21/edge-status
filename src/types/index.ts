export interface SimResult {
  id: string
  team: string
  league: string
  wins: number | null
  losses: number | null
  games_back: number | null
  playoff_pct: number | null
  div_title_pct: number | null
  conf_title_pct: number | null
  championship_pct: number | null
  seed_distribution: Record<string, number> | null
  magic_number: number | null
  elim_number: number | null
  // Market edge columns (Phase 3) — null when API keys not set or market unavailable
  kalshi_champ_pct: number | null       // unused (Kalshi doesn't have per-team futures)
  sportsbook_champ_pct: number | null   // Odds API multiplicatively de-vigged championship %
  champ_ev_pct: number | null           // Edge: sim championship_pct − sportsbook_champ_pct
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
  // Tiebreaker records — extracted from ESPN standings breakdown
  divisionWins: number
  divisionLosses: number
  conferenceWins: number
  conferenceLosses: number
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
  teams: string[]
  // Market data sources (Phase 3)
  oddsApiSport?: string  // The Odds API sport key, e.g. 'basketball_nba_championship_winner'
  kalshiSeries?: string  // Kalshi series ticker prefix, e.g. 'NBACHAMP'
                         // ⚠ Verify exact ticker in Kalshi dashboard after signing up —
                         //   may be 'KXNBACHAMP' or similar; update this if markets return 0.
  // Off-season market matching: lowercase partial city/name → team abbreviation.
  // Used when ESPN standings are unavailable (off-season) but futures markets still trade.
  // Keys should match what Kalshi yes_sub_title and Odds API team names contain.
  marketNameMap?: Record<string, string>
  // Team abbr → division name (for position summaries and tiebreaker context)
  divisionMap?: Record<string, string>
  // Team abbr → conference name (short form, e.g. "AL", "NFC", "Eastern Conference")
  conferenceMap?: Record<string, string>
  // Futures-only league: never run the Monte Carlo sim, always use the
  // market-only futures path (Kalshi/sportsbook championship odds). Used for
  // leagues whose playoff format the sim engine doesn't model — e.g. the
  // college-football 12-team CFP. Shows Championship Futures year-round.
  futuresOnly?: boolean
}

export const LEAGUES: LeagueConfig[] = [
  {
    name: 'NBA',
    slug: 'nba',
    sport: 'basketball',
    espnPath: 'basketball/nba',
    totalGames: 82,
    playoffTeamsPerConference: 10, // top 6 guaranteed + 4 play-in candidates
    oddsApiSport: 'basketball_nba_championship_winner',
    kalshiSeries: 'KXNBA',
    teams: [
      'ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GS',
      'HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NO','NY',
      'OKC','ORL','PHI','PHX','POR','SAC','SA','TOR','UTA','WSH',
    ],
    divisionMap: {
      BOS:'Atlantic', BKN:'Atlantic', NY:'Atlantic', PHI:'Atlantic', TOR:'Atlantic',
      CHI:'Central',  CLE:'Central',  DET:'Central', IND:'Central',  MIL:'Central',
      ATL:'Southeast',CHA:'Southeast',MIA:'Southeast',ORL:'Southeast',WSH:'Southeast',
      DEN:'Northwest',MIN:'Northwest',OKC:'Northwest',POR:'Northwest',
      // Utah Jazz: ESPN may return 'UTA' or 'UTAH'
      UTA:'Northwest', UTAH:'Northwest',
      GS:'Pacific',   LAC:'Pacific',  LAL:'Pacific',  PHX:'Pacific',  SAC:'Pacific',
      DAL:'Southwest',HOU:'Southwest',MEM:'Southwest',NO:'Southwest',  SA:'Southwest',
    },
    conferenceMap: {
      BOS:'East', BKN:'East', NY:'East',  PHI:'East', TOR:'East',
      CHI:'East', CLE:'East', DET:'East', IND:'East', MIL:'East',
      ATL:'East', CHA:'East', MIA:'East', ORL:'East', WSH:'East',
      DEN:'West', MIN:'West', OKC:'West', POR:'West',
      UTA:'West', UTAH:'West',
      GS:'West',  LAC:'West', LAL:'West', PHX:'West', SAC:'West',
      DAL:'West', HOU:'West', MEM:'West', NO:'West',  SA:'West',
    },
    // Lowercase city/name → abbreviation for off-season futures matching.
    // LA/NY disambiguated by full name; matching is substring both ways in the sim.
    marketNameMap: {
      'atlanta':                'ATL',
      'boston':                 'BOS',
      'brooklyn':               'BKN',
      'charlotte':              'CHA',
      'chicago':                'CHI',
      'cleveland':              'CLE',
      'dallas':                 'DAL',
      'denver':                 'DEN',
      'detroit':                'DET',
      'golden state':           'GS',
      'houston':                'HOU',
      'indiana':                'IND',
      'los angeles clippers':   'LAC',
      'los angeles lakers':     'LAL',
      'memphis':                'MEM',
      'miami':                  'MIA',
      'milwaukee':              'MIL',
      'minnesota':              'MIN',
      'new orleans':            'NO',
      'new york':               'NY',
      'oklahoma city':          'OKC',
      'orlando':                'ORL',
      'philadelphia':           'PHI',
      'phoenix':                'PHX',
      'portland':               'POR',
      'sacramento':             'SAC',
      'san antonio':            'SA',
      'toronto':                'TOR',
      'utah':                   'UTA',
      'washington':             'WSH',
    },
  },
  {
    name: 'NHL',
    slug: 'nhl',
    sport: 'hockey',
    espnPath: 'hockey/nhl',
    totalGames: 82,
    playoffTeamsPerConference: 8,
    oddsApiSport: 'icehockey_nhl_championship_winner',
    kalshiSeries: 'KXNHL',
    teams: [
      'ANA','BOS','BUF','CGY','CAR','CHI','COL','CBJ','DAL','DET',
      'EDM','FLA','LA','MIN','MTL','NSH','NJ','NYI','NYR','OTT',
      'PHI','PIT','SJS','SEA','STL','TB','TOR','UTA','VAN','VGK','WSH',
      'WPG','ARI',
    ],
    divisionMap: {
      BOS:'Atlantic', BUF:'Atlantic', DET:'Atlantic', FLA:'Atlantic',
      MTL:'Atlantic', OTT:'Atlantic', TB:'Atlantic',  TOR:'Atlantic',
      CAR:'Metropolitan', CBJ:'Metropolitan', NJ:'Metropolitan',  NYI:'Metropolitan',
      NYR:'Metropolitan', PHI:'Metropolitan', PIT:'Metropolitan',  WSH:'Metropolitan',
      // Utah HC: ESPN may return 'UTA' or 'UTAH'; ARI kept as alias (relocated team)
      ARI:'Central', CHI:'Central', COL:'Central', DAL:'Central',
      MIN:'Central', NSH:'Central', STL:'Central',
      UTA:'Central', UTAH:'Central',
      WPG:'Central',
      ANA:'Pacific', CGY:'Pacific', EDM:'Pacific', LA:'Pacific',
      SEA:'Pacific',
      // Sharks: ESPN may return 'SJ' or 'SJS'
      SJ:'Pacific', SJS:'Pacific',
      VAN:'Pacific', VGK:'Pacific',
    },
    conferenceMap: {
      BOS:'East', BUF:'East', DET:'East', FLA:'East', MTL:'East', OTT:'East', TB:'East', TOR:'East',
      CAR:'East', CBJ:'East', NJ:'East',  NYI:'East', NYR:'East', PHI:'East', PIT:'East', WSH:'East',
      ARI:'West', CHI:'West', COL:'West', DAL:'West', MIN:'West', NSH:'West', STL:'West',
      UTA:'West', UTAH:'West', WPG:'West',
      ANA:'West', CGY:'West', EDM:'West', LA:'West',
      SJ:'West', SJS:'West',
      SEA:'West', VAN:'West', VGK:'West',
    },
    // Lowercase city/name → abbreviation for off-season futures matching.
    // NY Rangers/Islanders keyed by nickname (both are "New York …").
    marketNameMap: {
      'anaheim':      'ANA',
      'boston':       'BOS',
      'buffalo':      'BUF',
      'calgary':      'CGY',
      'carolina':     'CAR',
      'chicago':      'CHI',
      'colorado':     'COL',
      'columbus':     'CBJ',
      'dallas':       'DAL',
      'detroit':      'DET',
      'edmonton':     'EDM',
      'florida':      'FLA',
      'los angeles':  'LA',
      'minnesota':    'MIN',
      'montreal':     'MTL',
      'nashville':    'NSH',
      'new jersey':   'NJ',
      'islanders':    'NYI',
      'rangers':      'NYR',
      'ottawa':       'OTT',
      'philadelphia': 'PHI',
      'pittsburgh':   'PIT',
      'san jose':     'SJS',
      'seattle':      'SEA',
      'st. louis':    'STL',
      'st louis':     'STL',
      'tampa bay':    'TB',
      'toronto':      'TOR',
      'utah':         'UTA',
      'vancouver':    'VAN',
      'vegas':        'VGK',
      'washington':   'WSH',
      'winnipeg':     'WPG',
    },
  },
  {
    name: 'MLB',
    slug: 'mlb',
    sport: 'baseball',
    espnPath: 'baseball/mlb',
    totalGames: 162,
    playoffTeamsPerConference: 6,
    oddsApiSport: 'baseball_mlb_world_series_winner',
    kalshiSeries: 'KXMLB',
    teams: [
      'ARI','ATL','BAL','BOS','CHC','CWS','CIN','CLE','COL','DET',
      'HOU','KC','LAA','LAD','MIA','MIL','MIN','NYM','NYY','OAK',
      'PHI','PIT','SD','SEA','SF','STL','TB','TEX','TOR','WSH',
    ],
    divisionMap: {
      BAL:'AL East',  BOS:'AL East',  NYY:'AL East',  TB:'AL East',   TOR:'AL East',
      // White Sox: ESPN uses CHW; CWS kept as alias for any historical rows
      CHW:'AL Central',CWS:'AL Central',CLE:'AL Central',DET:'AL Central',KC:'AL Central',MIN:'AL Central',
      HOU:'AL West',  LAA:'AL West',
      // Athletics: ESPN uses ATH after Sacramento move; OAK kept as alias
      ATH:'AL West',  OAK:'AL West',  SEA:'AL West',  TEX:'AL West',
      ATL:'NL East',  MIA:'NL East',  NYM:'NL East',  PHI:'NL East',  WSH:'NL East',
      CHC:'NL Central',CIN:'NL Central',MIL:'NL Central',PIT:'NL Central',STL:'NL Central',
      ARI:'NL West',  COL:'NL West',  LAD:'NL West',  SD:'NL West',   SF:'NL West',
    },
    conferenceMap: {
      BAL:'AL', BOS:'AL', NYY:'AL', TB:'AL',  TOR:'AL',
      CHW:'AL', CWS:'AL', CLE:'AL', DET:'AL', KC:'AL',  MIN:'AL',
      HOU:'AL', LAA:'AL', ATH:'AL', OAK:'AL', SEA:'AL', TEX:'AL',
      ATL:'NL', MIA:'NL', NYM:'NL', PHI:'NL', WSH:'NL',
      CHC:'NL', CIN:'NL', MIL:'NL', PIT:'NL', STL:'NL',
      ARI:'NL', COL:'NL', LAD:'NL', SD:'NL',  SF:'NL',
    },
  },
  {
    name: 'NFL',
    slug: 'nfl',
    sport: 'football',
    espnPath: 'football/nfl',
    totalGames: 17,
    playoffTeamsPerConference: 7,
    oddsApiSport: 'americanfootball_nfl_super_bowl_winner',
    kalshiSeries: 'KXSB',
    teams: [
      'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN',
      'DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA',
      'MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WSH',
    ],
    divisionMap: {
      BUF:'AFC East',  MIA:'AFC East',  NE:'AFC East',   NYJ:'AFC East',
      BAL:'AFC North', CIN:'AFC North', CLE:'AFC North', PIT:'AFC North',
      HOU:'AFC South', IND:'AFC South', JAX:'AFC South', TEN:'AFC South',
      DEN:'AFC West',  KC:'AFC West',   LAC:'AFC West',  LV:'AFC West',
      DAL:'NFC East',  NYG:'NFC East',  PHI:'NFC East',  WSH:'NFC East',
      CHI:'NFC North', DET:'NFC North', GB:'NFC North',  MIN:'NFC North',
      ATL:'NFC South', CAR:'NFC South', NO:'NFC South',  TB:'NFC South',
      ARI:'NFC West',  LAR:'NFC West',  SEA:'NFC West',  SF:'NFC West',
    },
    conferenceMap: {
      BUF:'AFC', MIA:'AFC', NE:'AFC',  NYJ:'AFC',
      BAL:'AFC', CIN:'AFC', CLE:'AFC', PIT:'AFC',
      HOU:'AFC', IND:'AFC', JAX:'AFC', TEN:'AFC',
      DEN:'AFC', KC:'AFC',  LAC:'AFC', LV:'AFC',
      DAL:'NFC', NYG:'NFC', PHI:'NFC', WSH:'NFC',
      CHI:'NFC', DET:'NFC', GB:'NFC',  MIN:'NFC',
      ATL:'NFC', CAR:'NFC', NO:'NFC',  TB:'NFC',
      ARI:'NFC', LAR:'NFC', SEA:'NFC', SF:'NFC',
    },
    // Lowercase city/name → abbreviation for off-season market matching
    marketNameMap: {
      'arizona':              'ARI',
      'atlanta':              'ATL',
      'baltimore':            'BAL',
      'buffalo':              'BUF',
      'carolina':             'CAR',
      'chicago':              'CHI',
      'cincinnati':           'CIN',
      'cleveland':            'CLE',
      'dallas':               'DAL',
      'denver':               'DEN',
      'detroit':              'DET',
      'green bay':            'GB',
      'houston':              'HOU',
      'indianapolis':         'IND',
      'jacksonville':         'JAX',
      'kansas city':          'KC',
      'los angeles chargers': 'LAC',
      'los angeles rams':     'LAR',
      'las vegas':            'LV',
      'miami':                'MIA',
      'minnesota':            'MIN',
      'new england':          'NE',
      'new orleans':          'NO',
      'new york giants':      'NYG',
      'new york jets':        'NYJ',
      'philadelphia':         'PHI',
      'pittsburgh':           'PIT',
      'seattle':              'SEA',
      'san francisco':        'SF',
      'tampa bay':            'TB',
      'tennessee':            'TEN',
      'washington':           'WSH',
    },
  },
  {
    name: 'MLS',
    slug: 'mls',
    sport: 'soccer',
    espnPath: 'soccer/usa.1',
    coreLeague: 'usa.1',
    coreSeasonType: 1,
    totalGames: 34,
    playoffTeamsPerConference: 9,
    // No oddsApiSport/kalshiSeries — MLS championship futures are thin/unavailable
    teams: [
      'ATL','ATX','CHI','CIN','CLB','CLT','COL','DAL','DC','HOU',
      'LA','LAFC','MIA','MIN','MTL','NE','NSH','RBNY','NYC','ORL',
      'PHI','POR','RSL','SD','SEA','SJ','SKC','STL','TOR','VAN',
    ],
    divisionMap: {
      ATL:'East', CHI:'East', CIN:'East', CLB:'East', CLT:'East',
      DC:'East',  MIA:'East', MTL:'East', NE:'East',  NYC:'East',
      ORL:'East', PHI:'East', RBNY:'East',TOR:'East',
      ATX:'West', COL:'West', DAL:'West', HOU:'West', LA:'West',
      LAFC:'West',MIN:'West', NSH:'West', POR:'West', RSL:'West',
      SD:'West',  SEA:'West', SJ:'West',  SKC:'West', STL:'West', VAN:'West',
    },
    conferenceMap: {
      ATL:'East', CHI:'East', CIN:'East', CLB:'East', CLT:'East',
      DC:'East',  MIA:'East', MTL:'East', NE:'East',  NYC:'East',
      ORL:'East', PHI:'East', RBNY:'East',TOR:'East',
      ATX:'West', COL:'West', DAL:'West', HOU:'West', LA:'West',
      LAFC:'West',MIN:'West', NSH:'West', POR:'West', RSL:'West',
      SD:'West',  SEA:'West', SJ:'West',  SKC:'West', STL:'West', VAN:'West',
    },
  },
  {
    name: 'NCAAF',
    slug: 'ncaaf',
    sport: 'college-football',
    espnPath: 'football/college-football',
    coreLeague: 'college-football',
    totalGames: 12,            // regular-season games (unused — futures-only)
    playoffTeamsPerConference: 12, // CFP field (unused — futures-only)
    oddsApiSport: 'americanfootball_ncaaf_championship_winner',
    kalshiSeries: 'KXNCAAF',   // "NCAAF Championship" — national title futures
    // The 12-team College Football Playoff over 130+ FBS teams is not modeled by
    // the pro-league sim engine, so NCAAF runs as a futures-only league:
    // championship futures (Kalshi + sportsbook) year-round, no Monte Carlo sim.
    futuresOnly: true,
    // Championship-futures contenders (Kalshi ticker suffix = internal abbr).
    teams: [
      'ALA', 'ARIZ', 'ARK', 'ASU', 'AUB', 'BAY', 'BYU', 'CAL', 'CLEM', 'FLA',
      'FSU', 'GT', 'HOU', 'ILL', 'IND', 'IOWA', 'JMU', 'KSU', 'LOU', 'LSU',
      'MIA', 'MICH', 'MISS', 'MIZZ', 'MOH', 'NCST', 'ND', 'OKLA', 'OKST', 'ORE',
      'OSU', 'PITT', 'PSU', 'SCAR', 'SMU', 'TCU', 'TENN', 'TEX', 'TTU', 'TULN',
      'TXAM', 'UGA', 'UK', 'UNT', 'USC', 'UTAH', 'UVA', 'VAN', 'VT', 'WASH',
    ],
    // Lowercase Kalshi yes_sub_title → abbr. Keys are the exact market names so
    // they match exactly (avoids "texas" colliding with "texas a&m"/"texas tech").
    // "<school> state" aliases are added for the "St." teams so the sportsbook
    // (Odds API) side — which spells them out — also matches. These are
    // collision-safe (no "<x> state" is a substring of another team's name).
    marketNameMap: {
      'alabama':            'ALA',
      'arizona':            'ARIZ',
      'arkansas':           'ARK',
      'arizona st.':        'ASU',
      'arizona state':      'ASU',
      'auburn':             'AUB',
      'baylor':             'BAY',
      'byu':                'BYU',
      'california':         'CAL',
      'clemson':            'CLEM',
      'florida':            'FLA',
      'florida st.':        'FSU',
      'florida state':      'FSU',
      'georgia tech':       'GT',
      'houston':            'HOU',
      'illinois':           'ILL',
      'indiana':            'IND',
      'iowa':               'IOWA',
      'james madison':      'JMU',
      'kansas st.':         'KSU',
      'kansas state':       'KSU',
      'louisville':         'LOU',
      'lsu':                'LSU',
      'miami (fl)':         'MIA',   // Kalshi name
      'miami hurricanes':   'MIA',   // Odds API name (bare "miami" would hit Miami OH)
      'michigan':           'MICH',
      'ole miss':           'MISS',
      'missouri':           'MIZZ',
      'miami (oh)':         'MOH',
      'north carolina st.': 'NCST',
      'north carolina state': 'NCST',
      'nc state':           'NCST',
      'notre dame':         'ND',
      'oklahoma':           'OKLA',
      'oklahoma st.':       'OKST',
      'oklahoma state':     'OKST',
      'oregon':             'ORE',
      'ohio st.':           'OSU',
      'ohio state':         'OSU',
      'pittsburgh':         'PITT',
      'penn st.':           'PSU',
      'penn state':         'PSU',
      'south carolina':     'SCAR',
      'smu':                'SMU',
      'tcu':                'TCU',
      'tennessee':          'TENN',
      'texas':              'TEX',
      'texas tech':         'TTU',
      'tulane':             'TULN',
      'texas a&m':          'TXAM',
      'georgia':            'UGA',
      'kentucky':           'UK',
      'north texas':        'UNT',
      'usc':                'USC',
      'utah':               'UTAH',
      'virginia':           'UVA',
      'vanderbilt':         'VAN',
      'virginia tech':      'VT',
      'washington':         'WASH',
    },
  },
]

export function getLeague(slug: string): LeagueConfig | undefined {
  return LEAGUES.find(l => l.slug === slug)
}
