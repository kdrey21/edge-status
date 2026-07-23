/**
 * College Football Playoff simulator — Phase 1.
 *
 * Unlike the pro-league sim (balanced schedules, algorithmic seeding), CFB has
 * unbalanced ~12-game schedules and a subjective committee ranking, so strength
 * comes from ESPN's FPI (net-points rating) rather than record/Elo.
 *
 * Phase 1 covers the regular season + conference championships:
 *   - FPI → per-game win probability (point-spread model).
 *   - Monte Carlo of every remaining game → projected records + conference win%.
 *   - Resolve each conference's title game (top-2 by conference record) → champ.
 *
 * Phase 2 (committee ranking heuristic, 12-team selection, straight-seed bracket
 * → playoff/championship odds) builds on the per-sim standings produced here.
 */

import type { CfbSeason, CfbTeam, CfbGame } from './espn'
import { CFB_NO_TITLE_GAME } from './espn'

// --- Tunable model constants (calibrate against results once games are played) ---
/** CFB home-field advantage, in points added to the home team's expected margin. */
const HOME_FIELD_PTS = 2.4
/** Std dev of actual game margin around the FPI-expected margin, in points. */
const MARGIN_SD = 14.5
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

export interface CfbTeamResult {
  id: string
  abbr: string
  name: string
  conference: string
  fpi: number
  fpiRank: number
  /** Mean projected wins / losses across sims (regular season, incl. completed). */
  projWins: number
  projLosses: number
  /** P(win conference) — 0 for no-title-game conferences unless sole leader. */
  confChampPct: number
}

interface Rec {
  wins: number
  losses: number
  confWins: number
  confLosses: number
}

/**
 * Simulate the regular season + conference championships `sims` times and return
 * per-FBS-team projected records and conference-championship probabilities.
 */
export function simulateCfbRegularSeason(
  season: CfbSeason,
  sims = DEFAULT_SIMS,
): CfbTeamResult[] {
  // Index only FBS teams (playoff-eligible); FCS opponents affect FBS records
  // but aren't tracked as contenders.
  const fbs = [...season.teams.values()].filter(t => t.isFbs)
  const idx = new Map<string, number>()
  fbs.forEach((t, i) => idx.set(t.id, i))
  const n = fbs.length

  // FPI rank (1 = best) for reporting/tie-breaks.
  const fpiOrder = [...fbs].sort((a, b) => b.fpi - a.fpi)
  const fpiRank = new Map<string, number>()
  fpiOrder.forEach((t, i) => fpiRank.set(t.id, i + 1))

  // Teams grouped by conference (for championship games), excluding no-title confs.
  const confTeams = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const conf = fbs[i].conference!
    if (!confTeams.has(conf)) confTeams.set(conf, [])
    confTeams.get(conf)!.push(i)
  }

  const fpiOf = (i: number) => fbs[i].fpi

  // Accumulators
  const sumWins = new Float64Array(n)
  const sumLosses = new Float64Array(n)
  const confTitles = new Float64Array(n)

  for (let s = 0; s < sims; s++) {
    const rec: Rec[] = Array.from({ length: n }, () => ({
      wins: 0, losses: 0, confWins: 0, confLosses: 0,
    }))

    for (const g of season.games) {
      const hi = idx.get(g.homeId)
      const ai = idx.get(g.awayId)
      // Skip games with no FBS team on either side (shouldn't happen w/ groups=80).
      if (hi === undefined && ai === undefined) continue

      // Determine home win (actual result if completed, else sample).
      let homeWon: boolean
      if (g.completed && g.homeScore != null && g.awayScore != null) {
        homeWon = g.homeScore > g.awayScore
      } else {
        const hFpi = hi !== undefined ? fpiOf(hi) : season.teams.get(g.homeId)!.fpi
        const aFpi = ai !== undefined ? fpiOf(ai) : season.teams.get(g.awayId)!.fpi
        homeWon = Math.random() < homeWinProb(hFpi, aFpi, g.neutral)
      }

      // Update FBS records (only FBS teams are tracked).
      if (hi !== undefined) {
        if (homeWon) rec[hi].wins++; else rec[hi].losses++
        if (g.conferenceGame && ai !== undefined) {
          if (homeWon) rec[hi].confWins++; else rec[hi].confLosses++
        }
      }
      if (ai !== undefined) {
        if (!homeWon) rec[ai].wins++; else rec[ai].losses++
        if (g.conferenceGame && hi !== undefined) {
          if (!homeWon) rec[ai].confWins++; else rec[ai].confLosses++
        }
      }
    }

    for (let i = 0; i < n; i++) {
      sumWins[i] += rec[i].wins
      sumLosses[i] += rec[i].losses
    }

    // Conference championships: top-2 by conference win% meet on a neutral field.
    for (const [conf, members] of confTeams) {
      if (CFB_NO_TITLE_GAME.has(conf) || members.length < 2) continue
      const ranked = [...members].sort((a, b) => confRank(rec[a], rec[b], fpiOf(a), fpiOf(b)))
      const [top, second] = ranked
      const champ = Math.random() < homeWinProb(fpiOf(top), fpiOf(second), true) ? top : second
      confTitles[champ]++
    }
  }

  return fbs.map((t, i) => ({
    id: t.id,
    abbr: t.abbr,
    name: t.name,
    conference: t.conference!,
    fpi: t.fpi,
    fpiRank: fpiRank.get(t.id) ?? 0,
    projWins: sumWins[i] / sims,
    projLosses: sumLosses[i] / sims,
    confChampPct: (confTitles[i] / sims) * 100,
  }))
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
