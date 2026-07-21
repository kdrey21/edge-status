// Server component — owns generateStaticParams (tells Next.js which HTML files to build).
// Actual UI is in LeaguePageClient (client component) which fetches data at runtime.

import LeaguePageClient from './LeaguePageClient'

export function generateStaticParams() {
  return ['nba', 'nhl', 'mlb', 'nfl', 'mls', 'ncaaf'].map(league => ({ league }))
}

interface Props {
  params: { league: string }
}

export default function LeaguePage({ params }: Props) {
  return <LeaguePageClient league={params.league} />
}
