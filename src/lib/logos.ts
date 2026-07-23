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
  AFA: '2005', AKR: '2006', ALA: '333', APP: '2026', ARIZ: '12', ARK: '8', ARMY: '349', ARST: '2032',
  ASU: '9', AUB: '2', BALL: '2050', BAY: '239', BC: '103', BGSU: '189', BOIS: '68', BUFF: '2084',
  BYU: '252', CAL: '25', CCU: '324', CIN: '2132', CLEM: '228', CLT: '2429', CMU: '2117', COLO: '38',
  CONN: '41', CSU: '36', DEL: '48', DUKE: '150', ECU: '151', EMU: '2199', FAU: '2226', FIU: '2229',
  FLA: '57', FRES: '278', FSU: '52', GASO: '290', GAST: '2247', GT: '59', HAW: '62', HOU: '248',
  ILL: '356', IOWA: '2294', ISU: '66', IU: '84', JMU: '256', JVST: '55', KENN: '338', KENT: '2309',
  KSU: '2306', KU: '2305', LIB: '2335', LOU: '97', LSU: '99', LT: '2348', 'M-OH': '193', MASS: '113',
  MD: '120', MEM: '235', MIA: '2390', MICH: '130', MINN: '135', MISS: '145', MIZ: '142', MOST: '2623',
  MRSH: '276', MSST: '344', MSU: '127', MTSU: '2393', NAVY: '2426', NCSU: '152', ND: '87', NDSU: '2449',
  NEB: '158', NEV: '2440', NIU: '2459', NMSU: '166', NU: '77', ODU: '295', OHIO: '195', OKST: '197',
  ORE: '2483', ORST: '204', OSU: '194', OU: '201', PITT: '221', PSU: '213', PUR: '2509', RICE: '242',
  RUTG: '164', SAC: '16', SC: '2579', SDSU: '21', SHSU: '2534', SJSU: '23', SMU: '2567', STAN: '24',
  SYR: '183', 'TA&M': '245', TCU: '2628', TEM: '218', TENN: '2633', TEX: '251', TLSA: '202', TOL: '2649',
  TROY: '2653', TTU: '2641', TULN: '2655', TXST: '326', UAB: '5', UCF: '2116', UCLA: '26', UGA: '61',
  UK: '96', UL: '309', ULM: '2433', UNC: '153', UNLV: '2439', UNM: '167', UNT: '249', USA: '6', USC: '30',
  USF: '58', USM: '2572', USU: '328', UTAH: '254', UTEP: '2638', UTSA: '2636', UVA: '258', VAN: '238',
  VT: '259', WAKE: '154', WASH: '264', WIS: '275', WKU: '98', WMU: '2711', WSU: '265', WVU: '277',
  WYO: '2751',
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
