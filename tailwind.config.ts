import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-inter)',    'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-inter)',    'ui-monospace', 'monospace'],
      },
      colors: {
        // ── Surface elevation system ──────────────────────────────
        surface: {
          DEFAULT: '#0b0d14',     // bg-surface  — page base
          bg:      '#0b0d14',     // bg-surface-bg (alias)
          card:    '#111420',     // bg-surface-card — card default
          raised:  '#181c2b',     // bg-surface-raised — hover / elevated
          border:  '#1e2336',     // border-surface-border — visible borders
          subtle:  '#141726',     // border-surface-subtle — dividers
        },
        // ── Brand ────────────────────────────────────────────────
        brand: '#4f8ef7',
        // ── Market edge signal — reserved ONLY for EV%/VALUE ─────
        edge: {
          pos: '#16c784',   // positive EV / VALUE
          neg: '#ea3943',   // negative EV / overpriced
        },
        // ── Playoff probability heat ──────────────────────────────
        playoff: {
          high: '#22c55e',  // >60%
          mid:  '#eab308',  // 40-60%
          low:  '#ef4444',  // <40%
        },
      },
      boxShadow: {
        card:       '0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.4)',
        'card-lg':  '0 4px 16px 0 rgba(0,0,0,0.5)',
        'edge-glow':'0 0 32px 0 rgba(22,199,132,0.12)',
      },
    },
  },
  plugins: [],
}

export default config
