import type { LeagueTeam, Game } from '@/types'

const N_SIMS = 50_000
const HOME_ELO_ADV = 65
const ELO_SCALE = 400

// ---------------------------------------------------------------------------
// Core math
// ---------------------------------------------------------------------------

function winProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, -(eloA - eloB) / ELO_SCALE))
}

function choose(n: number, k: number): number {
  if (k > n || k < 0) return 0
  if (k === 0 || k === n) return 1
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

/**
 * Probability of winning a best-of-N series given per-game win probability p.
 * bestOf = 1 → single elimination game (returns p directly).
 */
function seriesWinProb(p: number, bestOf = 7): number {
  if (bestOf === 1) return p
  const wins = Math.ceil(bestOf / 2)
  let prob = 0
  for (let n = wins; n <= bestOf; n++) {
    prob += choose(n - 1, wins - 1) * Math.pow(p, wins) * Math.pow(1 - p, n - wins)
  }
  return prob
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SimState {
  wins: number[]
  losses: number[]
  elos: number[]
  // Tiebreaker records — updated as games are simulated
  divWins: number[]
  divLosses: number[]
  confWins: number[]
  confLosses: number[]
}

function cloneState(teams: LeagueTeam[]): SimState {
  return {
    wins:        teams.map(t => t.wins),
    losses:      teams.map(t => t.losses),
    elos:        teams.map(t => t.elo),
    divWins:     teams.map(t => t.divisionWins),
    divLosses:   teams.map(t => t.divisionLosses),
    confWins:    teams.map(t => t.conferenceWins),
    confLosses:  teams.map(t => t.conferenceLosses),
  }
}

function winPct(state: SimState, i: number): number {
  return state.wins[i] / Math.max(1, state.wins[i] + state.losses[i])
}

/**
 * Sort team indices descending by record using sport-standard tiebreaker chain:
 *   1. Overall win%
 *   2. Division win% (games vs same-division opponents)
 *   3. Conference win% (games vs same-conference opponents)
 *   4. Total wins (final fallback)
 *
 * Note: true H2H tiebreaking (primary in MLB/NFL/NBA rules) requires full
 * season game logs and is tracked as a future improvement.
 */
function sortByRecord(idxs: number[], state: SimState): number[] {
  return [...idxs].sort((a, b) => {
    const wpDiff = winPct(state, b) - winPct(state, a)
    if (Math.abs(wpDiff) > 1e-9) return wpDiff

    // Division record tiebreaker
    const divWpA = state.divWins[a] / Math.max(1, state.divWins[a] + state.divLosses[a])
    const divWpB = state.divWins[b] / Math.max(1, state.divWins[b] + state.divLosses[b])
    const divDiff = divWpB - divWpA
    if (Math.abs(divDiff) > 1e-9) return divDiff

    // Conference record tiebreaker
    const confWpA = state.confWins[a] / Math.max(1, state.confWins[a] + state.confLosses[a])
    const confWpB = state.confWins[b] / Math.max(1, state.confWins[b] + state.confLosses[b])
    const confDiff = confWpB - confWpA
    if (Math.abs(confDiff) > 1e-9) return confDiff

    // Final: total wins
    return state.wins[b] - state.wins[a]
  })
}

/** Group team indices by their division field */
function groupByDivision(idxs: number[], teams: LeagueTeam[]): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const i of idxs) {
    const d = teams[i].division
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(i)
  }
  return map
}

/**
 * Simulate a series/game. Returns winner index.
 * Higher seed (home team) gets HOME_ELO_ADV for best-of series.
 * For single games (bestOf=1), higher seed hosts (home advantage).
 * Championship games are neutral site (no home advantage).
 */
function simulateMatchup(
  highSeedIdx: number,
  lowSeedIdx: number,
  state: SimState,
  bestOf: number,
  neutralSite = false,
): number {
  const adj = neutralSite ? 0 : HOME_ELO_ADV
  const p = seriesWinProb(winProb(state.elos[highSeedIdx] + adj, state.elos[lowSeedIdx]), bestOf)
  return Math.random() < p ? highSeedIdx : lowSeedIdx
}

// ---------------------------------------------------------------------------
// Sport-specific playoff seeding
// ---------------------------------------------------------------------------

/**
 * Returns team indices in seed order for one conference/league.
 * Division winners always get priority over wild-card teams.
 *
 * MLB  (baseball):  3 div winners → seeds 1-3 (ordered by record)
 *                   3 wild cards  → seeds 4-6
 *                   Seeds 1-2 get byes (skip WC round)
 *
 * NFL  (football):  4 div winners → seeds 1-4 (ordered by record)
 *                   3 wild cards  → seeds 5-7
 *                   Seed 1 gets bye
 *
 * NBA  (basketball):top 6 guaranteed → seeds 1-6
 *                   seeds 7-10 enter play-in tournament
 *
 * NHL  (hockey):    top 3 per division → 6 teams
 *                   2 wild cards (best remaining in conference) → seeds 7-8
 *                   Total 8 per conference
 */
function getPlayoffSeeds(
  sport: string,
  confIdxs: number[],
  teams: LeagueTeam[],
  state: SimState,
): number[] {
  if (sport === 'baseball' || sport === 'football') {
    const nDivWinners = sport === 'baseball' ? 3 : 4
    const nWildCards = sport === 'baseball' ? 3 : 3

    // One winner per division — best record in that division
    const divGroups = groupByDivision(confIdxs, teams)
    const divWinners: number[] = []
    for (const [, idxs] of divGroups) {
      divWinners.push(sortByRecord(idxs, state)[0])
    }
    // Sort division winners by record (seed 1 = best)
    const sortedDivWinners = sortByRecord(divWinners, state).slice(0, nDivWinners)

    // Wild cards: best records among non-division-winners
    const divWinnerSet = new Set(sortedDivWinners)
    const rest = sortByRecord(
      confIdxs.filter(i => !divWinnerSet.has(i)),
      state,
    )
    const wildCards = rest.slice(0, nWildCards)

    return [...sortedDivWinners, ...wildCards]
  }

  if (sport === 'hockey') {
    // Top 3 per division + 2 wild cards per conference
    const divGroups = groupByDivision(confIdxs, teams)
    const divTop3: number[] = []
    const divRest: number[] = []

    for (const [, idxs] of divGroups) {
      const sorted = sortByRecord(idxs, state)
      divTop3.push(...sorted.slice(0, 3))
      divRest.push(...sorted.slice(3))
    }

    // Div winners = best in each division (for seeding priority)
    const divWinners = [...divGroups.values()]
      .map(idxs => sortByRecord(idxs, state)[0])
    const divWinnerSet = new Set(divWinners)
    const sortedDivWinners = sortByRecord(divWinners, state)

    // Non-winner div qualifiers (2nd/3rd in each division)
    const divNonWinners = sortByRecord(divTop3.filter(i => !divWinnerSet.has(i)), state)

    // Wild cards: best records from the rest of the conference
    const wildCards = sortByRecord(divRest, state).slice(0, 2)

    return [...sortedDivWinners, ...divNonWinners, ...wildCards]
  }

  if (sport === 'basketball') {
    // NBA: top 10 returned (6 guaranteed + 4 play-in candidates)
    return sortByRecord(confIdxs, state).slice(0, 10)
  }

  // Default / soccer: top N by record
  return sortByRecord(confIdxs, state)
}

// ---------------------------------------------------------------------------
// Sport-specific bracket simulators
// ---------------------------------------------------------------------------

/**
 * NBA play-in tournament (seeds 7-10).
 * Returns [seed7winner, seed8winner] team indices.
 */
function simulateNBAPlayIn(
  seed7: number,
  seed8: number,
  seed9: number,
  seed10: number,
  state: SimState,
): [number, number] {
  // Game 1: 7 vs 8 — winner gets seed 7, loser gets another chance
  const game1Winner = simulateMatchup(seed7, seed8, state, 1)
  const game1Loser = game1Winner === seed7 ? seed8 : seed7

  // Game 2: 9 vs 10 — winner advances to elimination game
  const game2Winner = simulateMatchup(seed9, seed10, state, 1)

  // Game 3: loser of game1 vs winner of game2 — winner gets seed 8
  const seed8winner = simulateMatchup(game1Loser, game2Winner, state, 1)

  return [game1Winner, seed8winner]
}

/**
 * MLB conference bracket.
 * Seeds 1-2 have byes; seeds 3-6 play wild card round.
 * WC series: best-of-3 | DS: best-of-5 | CS: best-of-7
 */
function simulateMLBConf(seeds: number[], state: SimState): number {
  // seeds[0..5] → [seed1, seed2, seed3, seed4, seed5, seed6]

  // Wild Card Series (best-of-3): 3v6, 4v5
  const wc1 = simulateMatchup(seeds[2], seeds[5], state, 3)
  const wc2 = simulateMatchup(seeds[3], seeds[4], state, 3)

  // Division Series (best-of-5): re-seed remaining 4 teams by original seed order
  // 1 vs lowest remaining, 2 vs highest remaining
  const dsField = [seeds[0], seeds[1], wc1, wc2]
    .sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b)) // sort by original seed (lower = better)
  const ds1 = simulateMatchup(dsField[0], dsField[3], state, 5)
  const ds2 = simulateMatchup(dsField[1], dsField[2], state, 5)

  // Championship Series (best-of-7)
  return simulateMatchup(ds1, ds2, state, 7)
}

/**
 * NFL conference bracket.
 * Seed 1 has bye; all games are single-elimination.
 * WC round: 2v7, 3v6, 4v5
 * Divisional: re-seed — 1 vs lowest, 2 vs next
 * Conference Championship: 1 game
 */
function simulateNFLConf(seeds: number[], state: SimState): number {
  // seeds[0..6] → [seed1..seed7]

  // Wild card round (single game)
  const wc1 = simulateMatchup(seeds[1], seeds[6], state, 1)
  const wc2 = simulateMatchup(seeds[2], seeds[5], state, 1)
  const wc3 = simulateMatchup(seeds[3], seeds[4], state, 1)

  // Divisional round (single game) — re-seed: 1 vs lowest, 2 vs next
  const divField = [seeds[0], wc1, wc2, wc3]
    .sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b))
  const div1 = simulateMatchup(divField[0], divField[3], state, 1)
  const div2 = simulateMatchup(divField[1], divField[2], state, 1)

  // Conference championship (single game)
  return simulateMatchup(div1, div2, state, 1)
}

/**
 * Standard bracket for NHL / NBA (all best-of-7).
 * Seeds: 1v8, 2v7, 3v6, 4v5 in first round; re-seed each subsequent round.
 */
function simulateStandardBracket(seeds: number[], state: SimState, bestOf = 7): number {
  let remaining = [...seeds] // already in seed order (index 0 = best)
  while (remaining.length > 1) {
    const next: number[] = []
    const half = Math.floor(remaining.length / 2)
    for (let i = 0; i < half; i++) {
      const high = remaining[i]
      const low = remaining[remaining.length - 1 - i]
      next.push(simulateMatchup(high, low, state, bestOf))
    }
    if (remaining.length % 2 === 1) {
      next.push(remaining[Math.floor(remaining.length / 2)])
    }
    remaining = next
  }
  return remaining[0]
}

// ---------------------------------------------------------------------------
// Schedule builder
// ---------------------------------------------------------------------------

interface ScheduledGame {
  homeIdx: number
  awayIdx: number
  /** Both teams in same division — result counts toward division tiebreaker */
  isDivisionGame: boolean
  /** Both teams in same conference — result counts toward conference tiebreaker */
  isConferenceGame: boolean
}

function buildRemainingSchedule(
  teams: LeagueTeam[],
  espnGames: Game[],
): ScheduledGame[] {
  const idToIdx = new Map(teams.map((t, i) => [t.id, i]))
  const games: ScheduledGame[] = []
  for (const g of espnGames.filter(g => !g.completed)) {
    const hi = idToIdx.get(g.homeTeamId)
    const ai = idToIdx.get(g.awayTeamId)
    if (hi !== undefined && ai !== undefined) {
      games.push({
        homeIdx: hi,
        awayIdx: ai,
        isDivisionGame: teams[hi].division === teams[ai].division,
        isConferenceGame: teams[hi].conference === teams[ai].conference,
      })
    }
  }
  return games
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SimResults {
  team: string
  league: string
  playoff_pct: number
  div_title_pct: number
  conf_title_pct: number
  championship_pct: number
  seed_distribution: Record<string, number>
  magic_number: number | null
  elim_number: number | null
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------

export function runSimulation(
  teams: LeagueTeam[],
  espnGames: Game[],
  leagueSlug: string,
  playoffPerConf: number,
  sport: string,
): SimResults[] {
  const n = teams.length
  if (n === 0) return []

  const schedule = buildRemainingSchedule(teams, espnGames)

  // Accumulators
  const playoffCount   = new Int32Array(n)
  const divTitleCount  = new Int32Array(n)
  const confTitleCount = new Int32Array(n)
  const champCount     = new Int32Array(n)
  const seedCount: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0))

  // Conference groups (stable across sims — only division membership changes per sim)
  const confMap = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const c = teams[i].conference
    if (!confMap.has(c)) confMap.set(c, [])
    confMap.get(c)!.push(i)
  }

  for (let sim = 0; sim < N_SIMS; sim++) {
    const state = cloneState(teams)

    // ── Simulate remaining regular season ──
    for (const game of schedule) {
      const { homeIdx, awayIdx, isDivisionGame, isConferenceGame } = game
      const p = winProb(state.elos[homeIdx] + HOME_ELO_ADV, state.elos[awayIdx])
      if (Math.random() < p) {
        state.wins[homeIdx]++; state.losses[awayIdx]++
        if (isDivisionGame)  { state.divWins[homeIdx]++;  state.divLosses[awayIdx]++ }
        if (isConferenceGame){ state.confWins[homeIdx]++; state.confLosses[awayIdx]++ }
      } else {
        state.wins[awayIdx]++; state.losses[homeIdx]++
        if (isDivisionGame)  { state.divWins[awayIdx]++;  state.divLosses[homeIdx]++ }
        if (isConferenceGame){ state.confWins[awayIdx]++; state.confLosses[homeIdx]++ }
      }
    }

    // ── Division title tracking ──
    const divMap = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      const d = teams[i].division
      const cur = divMap.get(d)
      if (cur === undefined || winPct(state, i) > winPct(state, cur)) {
        divMap.set(d, i)
      }
    }
    for (const [, idx] of divMap) divTitleCount[idx]++

    // ── Seeding + playoff determination ──
    const confChampions: number[] = []

    for (const [, confIdxs] of confMap) {
      const seeds = getPlayoffSeeds(sport, confIdxs, teams, state)

      if (sport === 'basketball') {
        // NBA: seeds 1-6 guaranteed; play-in for 7-10
        const guaranteed = seeds.slice(0, 6)
        for (const i of guaranteed) {
          playoffCount[i]++
          seedCount[i][guaranteed.indexOf(i) + 1]++
        }

        let bracketSeeds = [...guaranteed]

        if (seeds.length >= 10) {
          const [s7, s8] = simulateNBAPlayIn(seeds[6], seeds[7], seeds[8], seeds[9], state)
          playoffCount[s7]++
          playoffCount[s8]++
          seedCount[s7][7]++
          seedCount[s8][8]++
          bracketSeeds = [...guaranteed, s7, s8]
        }

        // Seed counting for non-playoff teams
        for (let r = 6; r < seeds.length; r++) {
          if (!bracketSeeds.includes(seeds[r])) {
            seedCount[seeds[r]][r + 1]++
          }
        }

        const confChamp = simulateStandardBracket(bracketSeeds, state, 7)
        confTitleCount[confChamp]++
        confChampions.push(confChamp)

      } else if (sport === 'baseball') {
        const playoffSeeds = seeds.slice(0, 6)
        for (let r = 0; r < playoffSeeds.length; r++) {
          playoffCount[playoffSeeds[r]]++
          seedCount[playoffSeeds[r]][r + 1]++
        }
        const confChamp = simulateMLBConf(playoffSeeds, state)
        confTitleCount[confChamp]++
        confChampions.push(confChamp)

      } else if (sport === 'football') {
        const playoffSeeds = seeds.slice(0, 7)
        for (let r = 0; r < playoffSeeds.length; r++) {
          playoffCount[playoffSeeds[r]]++
          seedCount[playoffSeeds[r]][r + 1]++
        }
        const confChamp = simulateNFLConf(playoffSeeds, state)
        confTitleCount[confChamp]++
        confChampions.push(confChamp)

      } else {
        // Hockey or default: top playoffPerConf by seeding logic, standard bracket
        const playoffSeeds = seeds.slice(0, playoffPerConf)
        for (let r = 0; r < playoffSeeds.length; r++) {
          playoffCount[playoffSeeds[r]]++
          seedCount[playoffSeeds[r]][r + 1]++
        }
        const confChamp = simulateStandardBracket(playoffSeeds, state, 7)
        confTitleCount[confChamp]++
        confChampions.push(confChamp)
      }
    }

    // ── Championship ──
    if (confChampions.length === 2) {
      const [a, b] = confChampions
      // Series length: NFL Super Bowl = single game; everything else = best-of-7
      const finalBestOf = sport === 'football' ? 1 : 7
      const champ = simulateMatchup(a, b, state, finalBestOf, true /* neutral site */)
      champCount[champ]++
    } else if (confChampions.length === 1) {
      champCount[confChampions[0]]++
    }
  }

  // ---------------------------------------------------------------------------
  // Magic / elimination numbers (based on current standings, not simulation)
  // ---------------------------------------------------------------------------

  function computeMagicNumber(teamIdx: number): number | null {
    const t = teams[teamIdx]
    const divTeams = teams.filter(x => x.division === t.division)
    const divLeader = divTeams.sort((a, b) => b.winPct - a.winPct)[0]
    if (divLeader.id !== t.id) return null
    const chaser = divTeams.filter(x => x.id !== t.id).sort((a, b) => b.winPct - a.winPct)[0]
    if (!chaser) return 1
    const mn = t.gamesRemaining + chaser.gamesRemaining - (chaser.wins - t.wins) + 1
    return mn > 0 ? mn : null
  }

  function computeElimNumber(teamIdx: number): number | null {
    const t = teams[teamIdx]
    const divTeams = teams.filter(x => x.division === t.division)
    const divLeader = divTeams.sort((a, b) => b.winPct - a.winPct)[0]
    if (divLeader.id === t.id) return null
    const en = t.gamesRemaining - (divLeader.wins - t.wins) + 1
    return en > 0 ? en : 0
  }

  return teams.map((team, i) => ({
    team: team.abbreviation,
    league: leagueSlug,
    playoff_pct: (playoffCount[i] / N_SIMS) * 100,
    div_title_pct: (divTitleCount[i] / N_SIMS) * 100,
    conf_title_pct: (confTitleCount[i] / N_SIMS) * 100,
    championship_pct: (champCount[i] / N_SIMS) * 100,
    seed_distribution: Object.fromEntries(
      seedCount[i]
        .map((v, seed) => [String(seed), (v / N_SIMS) * 100])
        .filter(([k, v]) => Number(k) > 0 && (v as number) > 0.05),
    ),
    magic_number: computeMagicNumber(i),
    elim_number: computeElimNumber(i),
  }))
}
