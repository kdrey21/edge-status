import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'EdgeStatus — Playoff Probability',
  description: 'Real-time sports playoff probability powered by Monte Carlo simulation.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0f1117] text-gray-100">
        <header className="border-b border-surface-border sticky top-0 z-50 backdrop-blur-sm bg-[#0f1117]/90">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white">
                Edge<span className="text-blue-400">Status</span>
              </span>
            </Link>
            <span className="text-xs text-gray-500">50,000 sims · daily update</span>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-surface-border mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
              {/* What this is */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                  What is EdgeStatus?
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  A daily sports analytics tool that runs Monte Carlo simulations and
                  compares the results to real-money prediction markets and sportsbook
                  odds — finding where the numbers disagree.
                </p>
              </div>

              {/* How it works */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                  How it works
                </p>
                <ul className="text-xs text-gray-600 space-y-1.5 leading-relaxed">
                  <li>→ 50,000 simulated seasons run each morning via Elo ratings</li>
                  <li>→ Playoff &amp; championship odds come from those sims</li>
                  <li>→ Kalshi (regulated prediction market) provides a real-money reference price</li>
                  <li>→ EV% = Kalshi % − de-vigged sportsbook % · positive = potential underpricing</li>
                </ul>
              </div>

              {/* Disclaimer */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                  Disclaimer
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  EdgeStatus is a simulation model for informational purposes only.
                  It is <span className="text-gray-400 font-semibold">not financial advice</span> and
                  does not constitute a recommendation to place any bet or trade.
                  Prediction markets and sports betting involve real financial risk.
                  Always do your own research.
                </p>
              </div>
            </div>

            <div className="border-t border-surface-border/40 pt-5 flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="text-xs font-black tracking-tight text-gray-600">
                Edge<span className="text-blue-400/60">Status</span>
              </span>
              <p className="text-[10px] text-gray-700">
                Data: ESPN · Kalshi API · The Odds API · Updates daily at 06:00 UTC
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
