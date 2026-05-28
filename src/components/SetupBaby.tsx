import { useState } from 'react'
import { Baby as BabyIcon } from 'lucide-react'
import { createBaby } from '../lib/api'
import type { Baby, Sex } from '../lib/types'
import { toDateInput } from '../lib/format'

export function SetupBaby({ onCreated }: { onCreated: (baby: Baby) => void }) {
  const [name, setName] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [birthday, setBirthday] = useState(toDateInput(new Date()))
  const [gaWeeks, setGaWeeks] = useState<string>('40')
  const [gaDays, setGaDays] = useState<string>('0')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const baby = await createBaby({
        name: name.trim(),
        sex,
        birthday,
        gestational_age_weeks: gaWeeks === '' ? null : Number(gaWeeks),
        gestational_age_days: gaDays === '' ? 0 : Number(gaDays),
      })
      onCreated(baby)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create baby')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-brand-600 text-white grid place-items-center dark:bg-brand-500">
            <BabyIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Welcome!</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Tell us about your little one.</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input
              id="name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g. Theo"
            />
          </div>
          <div>
            <label className="label">Sex</label>
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as Sex[]).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSex(s)}
                  className={`btn ${
                    sex === s
                      ? 'bg-brand-600 text-white dark:bg-brand-500'
                      : 'bg-white border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                  }`}
                >
                  {s === 'male' ? 'Boy' : 'Girl'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="birthday">Birthday</label>
            <input
              id="birthday"
              type="date"
              required
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              max={toDateInput(new Date())}
              className="input"
            />
          </div>
          <div>
            <label className="label">
              Gestational age at birth{' '}
              <span className="text-slate-400 font-normal dark:text-slate-500">(40w 0d = full-term)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min={20}
                  max={45}
                  inputMode="numeric"
                  value={gaWeeks}
                  onChange={(e) => setGaWeeks(e.target.value)}
                  className="input pr-10"
                  aria-label="Weeks at birth"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                  wks
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={6}
                  inputMode="numeric"
                  value={gaDays}
                  onChange={(e) => setGaDays(e.target.value)}
                  className="input pr-10"
                  aria-label="Days at birth"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                  days
                </span>
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Saving…' : 'Get started'}
          </button>
        </form>
      </div>
    </div>
  )
}
