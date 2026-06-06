'use client'

import { useEffect, useState } from 'react'

/**
 * Report-an-issue feedback widget.
 *
 * Static-site friendly: the page has no backend, so submissions are sent to
 * Web3Forms (https://web3forms.com), a free form-to-email relay. Web3Forms then
 * emails the report to whatever address the access key is registered to.
 *
 * SETUP (one time):
 *   1. Go to https://web3forms.com, enter your Gmail, and copy the access key.
 *   2. Set it below — either as the NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY build env
 *      var (preferred) or by replacing the placeholder string.
 *
 * The access key is SAFE to expose publicly — it only permits sending mail to
 * the registered address, never reading anything. The hidden `botcheck`
 * honeypot field gives free spam protection.
 */
const WEB3FORMS_ACCESS_KEY =
  process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY ?? 'YOUR_WEB3FORMS_ACCESS_KEY'

const ISSUE_TYPES = [
  'Data looks wrong',
  'Bug / something broken',
  'Feature request',
  'Other',
] as const

type Status = 'idle' | 'sending' | 'success' | 'error'

export default function ReportIssue() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<string>(ISSUE_TYPES[0])
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [botcheck, setBotcheck] = useState('') // honeypot — real users leave empty
  const [status, setStatus] = useState<Status>('idle')

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function reset() {
    setType(ISSUE_TYPES[0])
    setMessage('')
    setEmail('')
    setStatus('idle')
  }

  // Don't render until the Web3Forms key is configured, so the live site never
  // shows a button that can't actually submit. (Hooks above always run.)
  const configured =
    WEB3FORMS_ACCESS_KEY && WEB3FORMS_ACCESS_KEY !== 'YOUR_WEB3FORMS_ACCESS_KEY'
  if (!configured) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (botcheck) return // bot filled the honeypot — silently drop
    if (message.trim().length < 3) return
    setStatus('sending')
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: `EdgeStatus issue: ${type}`,
          from_name: 'EdgeStatus Feedback',
          // Reported details
          issue_type: type,
          message,
          reporter_email: email || '(not provided)',
          page: typeof window !== 'undefined' ? window.location.href : '',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus('success')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => { reset(); setOpen(true) }}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-card/90 px-4 py-2.5 text-xs font-semibold text-[#8892aa] shadow-card-lg backdrop-blur-md transition-colors hover:border-brand/40 hover:text-[#eef0f8]"
        aria-label="Report an issue"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
        Report an issue
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-surface-border bg-surface-card p-5 shadow-card-lg sm:rounded-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#eef0f8]">Report an issue</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-[#484f6a] transition-colors hover:text-[#eef0f8]"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {status === 'success' ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-edge-pos/15 text-edge-pos">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <p className="font-semibold text-[#eef0f8]">Thanks — report sent.</p>
                <p className="mt-1 text-xs text-[#8892aa]">We&apos;ll take a look. Appreciate the heads-up.</p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-4 rounded-lg border border-surface-border px-4 py-2 text-sm font-semibold text-[#8892aa] transition-colors hover:text-[#eef0f8]"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Honeypot — visually hidden, bots fill it */}
                <input
                  type="checkbox"
                  name="botcheck"
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                  checked={!!botcheck}
                  onChange={e => setBotcheck(e.target.checked ? '1' : '')}
                />

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#484f6a]">
                    Type
                  </label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value)}
                    className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-[#eef0f8] outline-none focus:border-brand/50"
                  >
                    {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#484f6a]">
                    What happened?
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    required
                    rows={4}
                    placeholder="e.g. NBA shows an eliminated team with championship odds…"
                    className="w-full resize-none rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-[#eef0f8] placeholder:text-[#484f6a] outline-none focus:border-brand/50"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#484f6a]">
                    Your email <span className="font-normal normal-case text-[#484f6a]/70">(optional, for follow-up)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-[#eef0f8] placeholder:text-[#484f6a] outline-none focus:border-brand/50"
                  />
                </div>

                {status === 'error' && (
                  <p className="text-xs text-edge-neg">
                    Couldn&apos;t send — please try again, or email the owner directly.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending' || message.trim().length < 3}
                  className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {status === 'sending' ? 'Sending…' : 'Send report'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
