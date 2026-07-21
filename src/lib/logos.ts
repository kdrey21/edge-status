// Shared ESPN team-logo URL builder.
//
// ESPN's logo CDN files are keyed by a per-team slug that USUALLY equals the
// team abbreviation — but not always. A few teams use a different slug than the
// abbreviation we store (from the ESPN core standings API), which 404s the image
// and leaves the team with no logo. Override those here.

// League slug → ESPN logo sport path segment
const LOGO_SPORT: Record<string, string> = {
  nba: 'nba', nhl: 'nhl', mlb: 'mlb', nfl: 'nfl', mls: 'soccer',
}

// `${league}:${ABBR}` → ESPN logo filename slug, for teams whose logo file
// name differs from their stored abbreviation. Verified against the CDN.
const LOGO_SLUG: Record<string, string> = {
  'nhl:SJS': 'sj',   // San Jose Sharks — logo file is sj.png, not sjs.png
  'nba:UTA': 'utah', // Utah Jazz — logo file is utah.png, not uta.png
}

// College football is the exception: ESPN's CFB logos are keyed by numeric team
// ID (e.g. .../ncaa/500/194.png), not by abbreviation. Map our internal abbr
// (the Kalshi ticker suffix) → ESPN team ID. Any abbr missing here falls back to
// the abbr slug (which 404s → hidden), so keep this in sync with LEAGUES.ncaaf.
const NCAAF_LOGO_ID: Record<string, string> = {
  ALA: '333', ARIZ: '12', ARK: '8', ASU: '9', AUB: '2', BAY: '239', BYU: '252',
  CAL: '25', CLEM: '228', FLA: '57', FSU: '52', GT: '59', HOU: '248', ILL: '356',
  IND: '84', IOWA: '2294', JMU: '256', KSU: '2306', LOU: '97', LSU: '99',
  MIA: '2390', MICH: '130', MISS: '145', MIZZ: '142', MOH: '193', NCST: '152',
  ND: '87', OKLA: '201', OKST: '197', ORE: '2483', OSU: '194', PITT: '221',
  PSU: '213', SCAR: '2579', SMU: '2567', TCU: '2628', TENN: '2633', TEX: '251',
  TTU: '2641', TULN: '2655', TXAM: '245', UGA: '61', UK: '96', UNT: '249',
  USC: '30', UTAH: '254', UVA: '258', VAN: '238', VT: '259', WASH: '264',
}

export function espnLogoUrl(league: string, abbr: string): string {
  if (league === 'ncaaf') {
    const id = NCAAF_LOGO_ID[abbr.toUpperCase()]
    if (id) return `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`
    // Fall through to the (likely-404) abbr form so onError hides it cleanly.
  }
  const sport = LOGO_SPORT[league] ?? league
  const slug = LOGO_SLUG[`${league}:${abbr.toUpperCase()}`] ?? abbr.toLowerCase()
  return `https://a.espncdn.com/i/teamlogos/${sport}/500/${slug}.png`
}
