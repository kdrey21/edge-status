/**
 * Server-only: render the Parlay of the Month card to a PNG (for the auto-saved
 * monthly archive). Uses @resvg/resvg-js (SVG → PNG, no headless browser) so it
 * runs in the GitHub Actions sim job. NEVER import this from client code — it
 * pulls in a native module and Node `fetch`.
 */

import { Resvg } from '@resvg/resvg-js'
import { espnLogoUrl } from '@/lib/logos'
import { formatAmerican, parlayMonthLabel, type ParlayOfMonth } from '@/lib/parlay'

const LEAGUE_LABEL: Record<string, string> = { nfl: 'NFL', nba: 'NBA', nhl: 'NHL', mlb: 'MLB' }

const W = 1040
const H = 208

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function logoDataUri(league: string, team: string): Promise<string | null> {
  try {
    const res = await fetch(espnLogoUrl(league, team))
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Build the card SVG (logos pre-fetched as data URIs, aligned to parlay.legs). */
function renderSvg(parlay: ParlayOfMonth, logos: (string | null)[]): string {
  const payout = Math.round(parlay.payout_per_100).toLocaleString()
  const lockedDate = new Date(parlay.generated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  // Legs laid out left→right in the middle band.
  const legX0 = 300
  const legW = 150
  const midY = 96
  const legs = parlay.legs.map((leg, i) => {
    const x = legX0 + i * legW
    const uri = logos[i]
    const sep = i > 0
      ? `<text x="${x - 20}" y="${midY + 5}" fill="#484f6a" font-family="sans-serif" font-size="16">×</text>`
      : ''
    const logo = uri ? `<image x="${x + 26}" y="${midY - 13}" width="24" height="24" href="${uri}"/>` : ''
    return `
      ${sep}
      <text x="${x}" y="${midY - 16}" fill="#484f6a" font-family="sans-serif" font-size="11" font-weight="bold" letter-spacing="1">${esc(LEAGUE_LABEL[leg.league] ?? leg.league.toUpperCase())}</text>
      ${logo}
      <text x="${x + 54}" y="${midY + 5}" fill="#eef0f8" font-family="sans-serif" font-size="18" font-weight="bold">${esc(leg.team)}</text>
      <text x="${x}" y="${midY + 26}" fill="#fbbf24" font-family="sans-serif" font-size="13">${esc(formatAmerican(leg.american_odds))}</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0a0b0f"/>
  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="14" fill="#12141c" stroke="#f59e0b" stroke-opacity="0.4" stroke-width="1.5"/>
  <rect x="8" y="8" width="200" height="${H - 16}" rx="14" fill="#f59e0b" fill-opacity="0.06"/>

  <text x="34" y="58" fill="#fbbf24" font-family="sans-serif" font-size="15" font-weight="bold" letter-spacing="2">PARLAY OF THE MONTH</text>
  <text x="34" y="82" fill="#8892aa" font-family="sans-serif" font-size="14">${esc(parlayMonthLabel(parlay.month_key))}</text>
  <text x="34" y="104" fill="#484f6a" font-family="sans-serif" font-size="12">Locked ${esc(lockedDate)}</text>

  ${legs}

  <line x1="880" y1="40" x2="880" y2="152" stroke="#252838" stroke-width="1"/>
  <text x="1006" y="58" fill="#484f6a" font-family="sans-serif" font-size="12" text-anchor="end" letter-spacing="1">$100 PAYS</text>
  <text x="1006" y="96" fill="#fbbf24" font-family="sans-serif" font-size="34" font-weight="bold" text-anchor="end">$${payout}</text>
  <text x="1006" y="118" fill="#484f6a" font-family="sans-serif" font-size="12" text-anchor="end">${esc(formatAmerican(parlay.combined_american))} · ${parlay.combined_implied_pct.toFixed(2)}% implied</text>

  <text x="34" y="184" fill="#3a4056" font-family="sans-serif" font-size="11">Highest-edge champion per league (Kalshi vs. book), priced at the shorter of DraftKings / FanDuel · model portfolio, not a single-slip bet · not financial advice</text>
  <text x="1006" y="184" fill="#5a6480" font-family="sans-serif" font-size="11" text-anchor="end" font-weight="bold">kdrey21.github.io/edge-status</text>
</svg>`
}

/** Fetch logos, render the card, return PNG bytes (2× resolution). */
export async function buildParlayPng(parlay: ParlayOfMonth): Promise<Buffer> {
  const logos = await Promise.all(parlay.legs.map(l => logoDataUri(l.league, l.team)))
  const svg = renderSvg(parlay, logos)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W * 2 },
    font: { loadSystemFonts: true },
    background: '#0a0b0f',
  })
  return Buffer.from(resvg.render().asPng())
}
