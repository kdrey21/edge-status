import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import ReportIssue from '@/components/ReportIssue'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EdgeStatus — Where Markets Disagree',
  description: '50,000 Monte Carlo simulations daily. Surfaces where sportsbooks and prediction markets disagree on championship odds.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen bg-surface text-[#eef0f8] font-sans">

        {/* Header */}
        <header className="border-b border-surface-border sticky top-0 z-50 bg-surface/90 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-1.5">
              <span className="font-display text-lg font-bold tracking-tight text-[#eef0f8]">
                Edge<span className="text-brand">Status</span>
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-[10px] uppercase tracking-widest text-[#484f6a] font-medium">
                50k sims · daily
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-edge-pos/30 bg-edge-pos/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-edge-pos">
                <span className="h-1.5 w-1.5 rounded-full bg-edge-pos animate-pulse" />
                Live
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-surface-border mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#484f6a] mb-3">
                  What is EdgeStatus?
                </p>
                <p className="text-xs text-[#484f6a] leading-relaxed">
                  A daily sports analytics tool that runs Monte Carlo simulations and
                  compares the results to Kalshi prediction markets and sportsbook
                  odds — surfacing teams the market may be mispricing.
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#484f6a] mb-3">
                  How it works
                </p>
                <ul className="text-xs text-[#484f6a] space-y-1.5 leading-relaxed">
                  <li>→ 50,000 season simulations run each morning via Elo ratings</li>
                  <li>→ Playoff &amp; championship odds come from those sims</li>
                  <li>→ Kalshi (regulated prediction market) is the reference price</li>
                  <li>→ EV% = Kalshi % − de-vigged sportsbook % · positive = potential value</li>
                </ul>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#484f6a] mb-3">
                  Disclaimer
                </p>
                <p className="text-xs text-[#484f6a] leading-relaxed">
                  EdgeStatus is a simulation model for informational purposes only.
                  It is{' '}
                  <span className="text-[#8892aa] font-semibold">not financial advice</span>{' '}
                  and does not constitute a recommendation to place any bet or trade.
                  Prediction markets and sports betting involve real financial risk.
                </p>
              </div>
            </div>

            <div className="border-t border-surface-subtle pt-5 flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="font-display text-sm font-bold text-[#484f6a]">
                Edge<span className="text-brand/50">Status</span>
              </span>
              <p className="text-[10px] text-[#484f6a]">
                Data: ESPN · Kalshi API · The Odds API · Updates daily 06:00 UTC
              </p>
            </div>
          </div>
        </footer>

        {/* Floating feedback button (every page) */}
        <ReportIssue />

      </body>
    </html>
  )
}
