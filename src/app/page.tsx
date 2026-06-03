'use client'

import { useState, useEffect } from 'react'
import { LEAGUES } from '@/types'
import { getAllLeaguesSummary } from '@/lib/supabase'
import LeagueCard from '@/components/LeagueCard'

export default function HomePage() {
  const [summary, setSummary] = useState<
    { league: string; count: number; updated_at: string; hasSim: boolean }[]
  >([])

  useEffect(() => {
    getAllLeaguesSummary()
      .then(setSummary)
      .catch(() => {})
  }, [])

  const summaryMap = new Map(summary.map(s => [s.league, s]))

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-4xl font-black tracking-tight text-white mb-2">
          Playoff Probabilities
        </h1>
        <p className="text-gray-400 text-lg">
          Monte Carlo simulation across 50,000 season scenarios.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LEAGUES.map(league => {
          const data = summaryMap.get(league.slug)
          const state =
            data == null || data.count === 0
              ? 'inactive'
              : data.hasSim
                ? 'active'
                : 'futures'
          return (
            <LeagueCard
              key={league.slug}
              league={league}
              state={state}
              updatedAt={data?.updated_at}
            />
          )
        })}
      </div>
    </div>
  )
}
