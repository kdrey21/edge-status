import type { LeagueTeam, Game } from '@/types'

const N_SIMS = 50_000
const HOME_ELO_ADV = 65
const ELO_SCALE = 400

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

// Probability of winning a best-of-7 series given per-game win probability p
function seriesWinProb(p: number): number {
  let prob = 0
  for (let n = 4; n <= 7; n++) {
    prob += choose(n - 1, 3) * Math.pow(p, 4) * Math.pow(1 - p, n - 4)
  }
  return prob
}

// Build remaining schedule from ESPN future games.
// Returns [] when ESPN provides no future games — this is correct behavior during playoffs
// (regular season is over; the sim runs only the playoff bracket on current standings).
// We do NOT synthesize a fake schedule: fabricating random games when there's no real
// schedule corrupts results (it adds noise that makes every team converge toward 50%).
function buildRemainingSchedule(
  teams: LeagueTeam[],
  espnGames: Game[],
): Array<[number, number]> {
  const idToIdx = new Map(teams.map((t, i) => [t.id, i]))

  const futureGames = espnGames.filter(g => !g.completed)
  const pairs: Array<[number, number]> = []
  for (const g of futureGames) {
    const hi = idToIdx.get(g.homeTeamId)
    const ai = idToIdx.get(g.awayTeamId)
    if (hi !== undefined && ai !== undefined) pairs.push([hi, ai])
  }
  return pairs
}

interface SimState {
  wins: number[]
  losses: number[]
  elos: number[]
}

function cloneState(teams: LeagueTeam[]): SimState {
  return {
    wins: teams.map(t => t.wins),
    losses: teams.map(t => t.losses),
    elos: teams.map(t => t.elo),
  }
}

function playoffBracket(
  teams: LeagueTeam[],
  state: SimState,
  playoffPerConf: number,
): { champion: number; confWinners: number[]; playoffTeams: number[] } {
  const n = teams.length

  // Group by conference
  const confMap = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const c = teams[i].conference
    if (!confMap.has(c)) confMap.set(c, [])
    confMap.get(c)!.push(i)
  }

  const allPlayoffTeams: number[] = []
  const confWinners: number[] = []

  for (const [, confIdxs] of confMap) {
    // Sort by simulated win%
    const sorted = [...confIdxs].sort((a, b) => {
      const wa = state.wins[a] / Math.max(1, state.wins[a] + state.losses[a])
      const wb = state.wins[b] / Math.max(1, state.wins[b] + state.losses[b])
      return wb - wa || state.wins[b] - state.wins[a]
    })

    const seeds = sorted.slice(0, playoffPerConf)
    for (const s of seeds) allPlayoffTeams.push(s)

    // Simulate bracket: 1 vs 8, 2 vs 7, ... with home advantage for higher seed
    let remaining = [...seeds]
    while (remaining.length > 1) {
      const next: number[] = []
      const half = Math.floor(remaining.length / 2)
      for (let i = 0; i < half; i++) {
        const hi = remaining[i]         // higher seed (home)
        const lo = remaining[remaining.length - 1 - i]
        const adjElo = state.elos[hi] + HOME_ELO_ADV
        const p = seriesWinProb(winProb(adjElo, state.elos[lo]))
        next.push(Math.random() < p ? hi : lo)
      }
      // Odd team gets a bye
      if (remaining.length % 2 === 1) next.push(remaining[Math.floor(remaining.length / 2)])
      remaining = next
    }
    confWinners.push(remaining[0])
  }

  // Championship: neutral site (no home advantage)
  let champion = confWinners[0]
  if (confWinners.length >= 2) {
    const [a, b] = confWinners
    const p = seriesWinProb(winProb(state.elos[a], state.elos[b]))
    champion = Math.random() < p ? a : b
  }

  return { champion, confWinners, playoffTeams: allPlayoffTeams }
}

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

export function runSimulation(
  teams: LeagueTeam[],
  espnGames: Game[],
  leagueSlug: string,
  playoffPerConf: number,
): SimResults[] {
  const n = teams.length
  if (n === 0) return []

  const schedule = buildRemainingSchedule(teams, espnGames)

  // Accumulators
  const playoffCount = new Int32Array(n)
  const divTitleCount = new Int32Array(n)
  const confTitleCount = new Int32Array(n)
  const champCount = new Int32Array(n)
  const seedCount: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0))

  for (let sim = 0; sim < N_SIMS; sim++) {
    const state = cloneState(teams)

    // Simulate remaining regular season
    for (const [homeIdx, awayIdx] of schedule) {
      const adjElo = state.elos[homeIdx] + HOME_ELO_ADV
      const p = winProb(adjElo, state.elos[awayIdx])
      if (Math.random() < p) {
        state.wins[homeIdx]++
        state.losses[awayIdx]++
      } else {
        state.wins[awayIdx]++
        state.losses[homeIdx]++
      }
    }

    // Determine division leaders
    const divMap = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      const d = teams[i].division
      const cur = divMap.get(d)
      if (
        cur === undefined ||
        state.wins[i] / Math.max(1, state.wins[i] + state.losses[i]) >
          state.wins[cur] / Math.max(1, state.wins[cur] + state.losses[cur])
      ) {
        divMap.set(d, i)
      }
    }
    for (const [, idx] of divMap) divTitleCount[idx]++

    // Compute seeds per conference
    const confMap = new Map<string, number[]>()
    for (let i = 0; i < n; i++) {
      const c = teams[i].conference
      if (!confMap.has(c)) confMap.set(c, [])
      confMap.get(c)!.push(i)
    }

    for (const [, confIdxs] of confMap) {
      const sorted = [...confIdxs].sort((a, b) => {
        const wa = state.wins[a] / Math.max(1, state.wins[a] + state.losses[a])
        const wb = state.wins[b] / Math.max(1, state.wins[b] + state.losses[b])
        return wb - wa || state.wins[b] - state.wins[a]
      })
      for (let rank = 0; rank < sorted.length; rank++) {
        seedCount[sorted[rank]][rank + 1]++
        if (rank < playoffPerConf) playoffCount[sorted[rank]]++
      }
    }

    // Simulate playoffs
    const { champion, confWinners } = playoffBracket(teams, state, playoffPerConf)
    champCount[champion]++
    for (const cw of confWinners) confTitleCount[cw]++
  }

  // Compute magic/elimination numbers (based on current standings, not simulation)
  function computeMagicNumber(teamIdx: number): number | null {
    const t = teams[teamIdx]
    // Find division leader
    const divLeader = teams
      .filter(x => x.division === t.division)
      .sort((a, b) => b.winPct - a.winPct)[0]
    if (divLeader.id === t.id) {
      // Magic number vs closest chaser
      const chaser = teams
        .filter(x => x.division === t.division && x.id !== t.id)
        .sort((a, b) => b.winPct - a.winPct)[0]
      if (!chaser) return 1
      const mn = t.gamesRemaining + chaser.gamesRemaining - (chaser.wins - t.wins) + 1
      return mn > 0 ? mn : null
    }
    return null
  }

  function computeElimNumber(teamIdx: number): number | null {
    const t = teams[teamIdx]
    const divLeader = teams
      .filter(x => x.division === t.division)
      .sort((a, b) => b.winPct - a.winPct)[0]
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
