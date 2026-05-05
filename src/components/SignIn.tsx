import { useEffect, useState } from 'react'
import { AlertCircle, Baby as BabyIcon, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Mode = 'password' | 'magic'

// Pull any error returned by Supabase via the URL hash (#error=...&error_code=...).
function readUrlError(): { code: string; description: string } | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : ''
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const error = params.get('error')
  if (!error) return null
  return {
    code: params.get('error_code') ?? error,
    description: params.get('error_description') ?? error,
  }
}

function friendlyLinkError(code: string, description: string): string {
  const desc = decodeURIComponent(description.replace(/\+/g, ' '))
  switch (code) {
    case 'otp_expired':
      return 'That sign-in link has expired or was already used. Sign in below.'
    case 'access_denied':
      return 'Sign-in was denied. Try again below.'
    default:
      return desc || 'Something went wrong with that sign-in link. Try again below.'
  }
}

export function SignIn() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [linkError, setLinkError] = useState<{ code: string; description: string } | null>(null)

  useEffect(() => {
    const err = readUrlError()
    if (err) {
      setLinkError(err)
      // Clean up the URL so the error doesn't keep reappearing on reloads.
      const cleanUrl = window.location.origin + window.location.pathname + window.location.search
      window.history.replaceState({}, '', cleanUrl)
    }
  }, [])

  function clearStatus() {
    setErrorMsg('')
    setMagicLinkSent(false)
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setSubmitting(true)
    clearStatus()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      setErrorMsg(error.message)
      setSubmitting(false)
    }
    // On success, App.tsx's auth listener flips us into the app automatically.
  }

  async function onMagicSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setSubmitting(true)
    clearStatus()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    })
    if (error) {
      setErrorMsg(error.message)
    } else {
      setMagicLinkSent(true)
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-brand-600 text-white grid place-items-center">
            <BabyIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Baby Tracker</h1>
            <p className="text-sm text-slate-500">Sign in to continue</p>
          </div>
        </div>

        {magicLinkSent ? (
          <div className="text-center py-6">
            <Mail className="h-10 w-10 mx-auto text-brand-600 mb-3" />
            <h2 className="font-medium">Check your email</h2>
            <p className="text-sm text-slate-500 mt-1">
              We sent a magic sign-in link to <span className="font-medium">{email}</span>.
            </p>
            <button
              type="button"
              onClick={() => setMagicLinkSent(false)}
              className="btn-ghost mt-4"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Sign-in method"
              className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-4 text-sm"
            >
              {([
                { id: 'password', label: 'Password' },
                { id: 'magic', label: 'Magic link' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.id}
                  onClick={() => {
                    setMode(t.id)
                    clearStatus()
                  }}
                  className={`py-1.5 rounded-lg font-medium transition-colors ${
                    mode === t.id
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {linkError && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 mb-4">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{friendlyLinkError(linkError.code, linkError.description)}</span>
              </div>
            )}

            {mode === 'password' ? (
              <form onSubmit={onPasswordSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input"
                  />
                </div>
                {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full"
                >
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>
                <p className="text-xs text-slate-500 text-center">
                  Set a password for your user in the Supabase dashboard
                  (Authentication&nbsp;→&nbsp;Users).
                </p>
              </form>
            ) : (
              <form onSubmit={onMagicSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="email-magic">Email</label>
                  <input
                    id="email-magic"
                    type="email"
                    required
                    autoFocus
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input"
                  />
                </div>
                {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full"
                >
                  {submitting ? 'Sending…' : 'Send magic link'}
                </button>
                <p className="text-xs text-slate-500 text-center">
                  We'll email you a one-tap sign-in link.
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
