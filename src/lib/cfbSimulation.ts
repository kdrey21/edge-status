/**
 * College Football Playoff simulator.
 *
 * Unlike the pro-league sim (balanced schedules, algorithmic seeding), CFB has
 * unbalanced ~12-game schedules and a subjective committee ranking, so strength
 * comes from ESPN's FPI (net-points rating) rather than record/Elo.
 *
 * Per Monte Carlo run:
 *   1. Simulate every remaining game (FPI point-spread model) → records + conf win%.
 *   2. Resolve each conference's title game (top-2 by conference record) → champ.
 *   3. Rank all 138 teams by a committee heuristic (losses + FPI + champ bonus).
 *   4. Select the 12-team field: 4 Power-Four champs + best Group-of-Five champ
 *      (auto-bids) + 7 highest-ranked at-large (Notre Dame's top-12 rule falls
 *      out of ranking-based at-large selection).
 *   5. Straight-seed 1–12 by ranking (top 4 byes) and simulate the bracket.
 *
 * Aggregates: projected record, conference-title %, playoff %, championship %,
 * and a seed distribution — the same columns the pro sim produces.
 */

import type { CfbSeason } from './espn'
import { CFB_NO_TITLE_GAME, CFB_POWER_FOUR } from './espn'

// --- Tunable model constants (calibrate against results once games are played) ---
/** CFB home-field advantage, in points added to the home team's expected margin. */
const HOME_FIELD_PTS = 2.4
/** Std dev of actual game margin around the FPI-expected margin, in points. */
const MARGIN_SD = 14.5
/** Committee "cost" of each loss, in FPI-equivalent points (loss-aversion). */
const LOSS_PENALTY = 7
/** Committee bonus for winning your conference (rewards championships in seeding). */
const CHAMP_BONUS = 2
const DEFAULT_SIMS = 10000

/** Standard normal CDF (Abramowitz & Stegun 26.2.17 approximation). */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2)
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

/** P(home team wins) from FPI ratings, accounting for home field / neutral site. */
function homeWinProb(homeFpi: number, awayFpi: number, neutral: boolean): number {
  const margin = homeFpi - awayFpi + (neutral ? 0 : HOME_FIELD_PTS)
  return normCdf(margin / MARGIN_SD)
}

/** Simulate one game, return true if team A wins. `homeA` = A is the home team. */
function aWins(fpiA: number, fpiB: number, neutral: boolean, homeA: boolean): boolean {
  const p = homeA ? homeWinProb(fpiA, fpiB, neutral) : 1 - homeWinProb(fpiB, fpiA, neutral)
  return Math.random() < p
}

export interface CfbTeamResult {
  id: string
  abbr: string
  name: string
  conference: string
  fpi: number
  fpiRank: number
  projWins: number
  projLosses: number
  confChampPct: number
  playoffPct: number
  championshipPct: number
  /** seed label ("1".."12") → probability (%) of receiving that seed. */
  seedDistribution: Record<string, number>
}

interface Rec {
  wins: number
  losses: number
  confWins: number
  confLosses: number
}

export function simulateCfb(season: CfbSeason, sims = DEFAULT_SIMS): CfbTeamResult[] {
  const fbs = [...season.teams.values()].filter(t => t.isFbs)
  const n = fbs.length
  const idx = new Map<string, number>()
  fbs.forEach((t, i) => idx.set(t.id, i))
  const fpi = fbs.map(t => t.fpi)

  // FPI rank (1 = best) for reporting.
  const fpiRank = new Map<string, number>()
  ;[...fbs].sort((a, b) => b.fpi - a.fpi).forEach((t, i) => fpiRank.set(t.id, i + 1))

  // Conference membership; Power Four gets guaranteed auto-bids, the rest (with a
  // title game) are Group of Five competing for the single G5 auto-bid.
  const confTeams = new Map<string, number[]>()
  const isPowerConf = new Map<string, boolean>()
  for (let i = 0; i < n; i++) {
    const conf = fbs[i].conference!
    if (!confTeams.has(conf)) {
      confTeams.set(conf, [])
      isPowerConf.set(conf, CFB_POWER_FOUR.has(conf))
    }
    confTeams.get(conf)!.push(i)
  }

  // Accumulators
  const sumWins = new Float64Array(n)
  const sumLosses = new Float64Array(n)
  const confTitles = new Float64Array(n)
  const madeField = new Float64Array(n)
  const titles = new Float64Array(n)
  const seedCounts: Float64Array[] = Array.from({ length: n }, () => new Float64Array(13)) // [1..12]

  // Reusable per-sim buffers
  const rec: Rec[] = Array.from({ length: n }, () => ({ wins: 0, losses: 0, confWins: 0, confLosses: 0 }))

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) { rec[i].wins = 0; rec[i].losses = 0; rec[i].confWins = 0; rec[i].confLosses = 0 }

    // 1) Regular season
    for (const g of season.games) {
      const hi = idx.get(g.homeId)
      const ai = idx.get(g.awayId)
      if (hi === undefined && ai === undefined) continue

      let homeWon: boolean
      if (g.completed && g.homeScore != null && g.awayScore != null) {
        homeWon = g.homeScore > g.awayScore
      } else {
        const hFpi = hi !== undefined ? fpi[hi] : season.teams.get(g.homeId)!.fpi
        const aFpi = ai !== undefined ? fpi[ai] : season.teams.get(g.awayId)!.fpi
        homeWon = Math.random() < homeWinProb(hFpi, aFpi, g.neutral)
      }

      if (hi !== undefined) {
        if (homeWon) rec[hi].wins++; else rec[hi].losses++
        if (g.conferenceGame && ai !== undefined) { if (homeWon) rec[hi].confWins++; else rec[hi].confLosses++ }
      }
      if (ai !== undefined) {
        if (!homeWon) rec[ai].wins++; else rec[ai].losses++
        if (g.conferenceGame && hi !== undefined) { if (!homeWon) rec[ai].confWins++; else rec[ai].confLosses++ }
      }
    }

    for (let i = 0; i < n; i++) { sumWins[i] += rec[i].wins; sumLosses[i] += rec[i].losses }

    // 2) Conference championships → champion index per conference (null if none).
    const champOf = new Map<string, number>()
    for (const [conf, members] of confTeams) {
      if (CFB_NO_TITLE_GAME.has(conf) || members.length < 2) continue
      const ranked = [...members].sort((a, b) => confRank(rec[a], rec[b], fpi[a], fpi[b]))
      const [top, second] = ranked
      const champ = aWins(fpi[top], fpi[second], true, true) ? top : second
      champOf.set(conf, champ)
      confTitles[champ]++
    }
    const champSet = new Set(champOf.values())

    // 3) Committee ranking: score = FPI − loss penalty + conf-champ bonus.
    const score = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      score[i] = fpi[i] - LOSS_PENALTY * rec[i].losses + (champSet.has(i) ? CHAMP_BONUS : 0)
    }
    const ranking = Array.from({ length: n }, (_, i) => i).sort((a, b) => score[b] - score[a])

    // 4) Select the 12-team field.
    const field: number[] = []
    const inField = new Set<number>()
    const add = (i: number) => { if (!inField.has(i)) { inField.add(i); field.push(i) } }

    // 4a) Four Power-Four champions (guaranteed).
    for (const [conf, champ] of champOf) if (isPowerConf.get(conf)) add(champ)
    // 4b) Highest-ranked Group-of-Five champion (one auto-bid).
    let bestG5 = -1
    for (const [conf, champ] of champOf) {
      if (isPowerConf.get(conf)) continue
      if (bestG5 === -1 || score[champ] > score[bestG5]) bestG5 = champ
    }
    if (bestG5 !== -1) add(bestG5)
    // 4c) Fill to 12 with the highest-ranked remaining teams (at-large).
    for (const i of ranking) { if (field.length >= 12) break; add(i) }

    // 5) Straight seeding: order the 12 by committee ranking; top 4 get byes.
    const seeds = [...field].sort((a, b) => score[b] - score[a]).slice(0, 12)
    for (let s2 = 0; s2 < seeds.length; s2++) {
      madeField[seeds[s2]]++
      seedCounts[seeds[s2]][s2 + 1]++
    }

    // 6) Bracket (12-team, straight seeding). seeds[k] = (k+1) seed.
    const champion = simulateBracket(seeds, fpi)
    if (champion >= 0) titles[champion]++
  }

  return fbs.map((t, i) => {
    const seedDistribution: Record<string, number> = {}
    for (let s2 = 1; s2 <= 12; s2++) {
      if (seedCounts[i][s2] > 0) seedDistribution[String(s2)] = (seedCounts[i][s2] / sims) * 100
    }
    return {
      id: t.id,
      abbr: t.abbr,
      name: t.name,
      conference: t.conference!,
      fpi: t.fpi,
      fpiRank: fpiRank.get(t.id) ?? 0,
      projWins: sumWins[i] / sims,
      projLosses: sumLosses[i] / sims,
      confChampPct: (confTitles[i] / sims) * 100,
      playoffPct: (madeField[i] / sims) * 100,
      championshipPct: (titles[i] / sims) * 100,
      seedDistribution,
    }
  })
}

/**
 * Simulate the 12-team straight-seeded bracket and return the champion's index.
 * seeds[k] holds the (k+1)-seed's team index. Seeds 1–4 bye; 5–12 play the
 * first round hosted by the higher seed; everything after is neutral-site.
 * Bracket: 1 v W(8/9), 4 v W(5/12) meet; 2 v W(7/10), 3 v W(6/11) meet.
 */
function simulateBracket(seeds: number[], fpi: number[]): number {
  if (seeds.length < 12) return -1
  const s = (k: number) => seeds[k - 1] // 1-indexed seed → team index

  // First round (higher seed hosts).
  const g5v12 = aWins(fpi[s(5)], fpi[s(12)], false, true) ? s(5) : s(12)
  const g6v11 = aWins(fpi[s(6)], fpi[s(11)], false, true) ? s(6) : s(11)
  const g7v10 = aWins(fpi[s(7)], fpi[s(10)], false, true) ? s(7) : s(10)
  const g8v9 = aWins(fpi[s(8)], fpi[s(9)], false, true) ? s(8) : s(9)

  // Quarterfinals (neutral).
  const qf1 = neutralWinner(s(1), g8v9, fpi)   // 1 vs W(8/9)
  const qf4 = neutralWinner(s(4), g5v12, fpi)  // 4 vs W(5/12)
  const qf2 = neutralWinner(s(2), g7v10, fpi)  // 2 vs W(7/10)
  const qf3 = neutralWinner(s(3), g6v11, fpi)  // 3 vs W(6/11)

  // Semifinals (neutral): (1-side vs 4-side), (2-side vs 3-side).
  const sf1 = neutralWinner(qf1, qf4, fpi)
  const sf2 = neutralWinner(qf2, qf3, fpi)

  // Final (neutral).
  return neutralWinner(sf1, sf2, fpi)
}

function neutralWinner(a: number, b: number, fpi: number[]): number {
  return aWins(fpi[a], fpi[b], true, true) ? a : b
}

/** Sort comparator: better conference standing first (conf win%, then FPI). */
function confRank(a: Rec, b: Rec, aFpi: number, bFpi: number): number {
  const aw = a.confWins + a.confLosses
  const bw = b.confWins + b.confLosses
  const ap = aw > 0 ? a.confWins / aw : 0
  const bp = bw > 0 ? b.confWins / bw : 0
  if (bp !== ap) return bp - ap
  return bFpi - aFpi
}
