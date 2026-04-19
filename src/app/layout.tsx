import type { Metadata } from 'next'
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
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white">
                Edge<span className="text-blue-400">Status</span>
              </span>
            </a>
            <span className="text-xs text-gray-500">50,000 sims · daily update</span>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-surface-border mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-xs text-gray-600">
            Sim-only data · No betting advice · Data from ESPN
          </div>
        </footer>
      </body>
    </html>
  )
}
