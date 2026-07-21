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

export function espnLogoUrl(league: string, abbr: string): string {
  const sport = LOGO_SPORT[league] ?? league
  const slug = LOGO_SLUG[`${league}:${abbr.toUpperCase()}`] ?? abbr.toLowerCase()
  return `https://a.espncdn.com/i/teamlogos/${sport}/500/${slug}.png`
}
