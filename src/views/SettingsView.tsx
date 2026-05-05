import { useState } from 'react'
import { updateBaby } from '../lib/api'
import { toDateInput } from '../lib/format'
import type { Baby, Sex } from '../lib/types'

export function SettingsView({
  baby,
  onUpdated,
}: {
  baby: Baby
  onUpdated: (b: Baby) => void
}) {
  const [name, setName] = useState(baby.name)
  const [sex, setSex] = useState<Sex>(baby.sex)
  const [birthday, setBirthday] = useState(baby.birthday)
  const [gaWeeks, setGaWeeks] = useState<string>(
    baby.gestational_age_weeks?.toString() ?? '40',
  )
  const [gaDays, setGaDays] = useState<string>(
    baby.gestational_age_days?.toString() ?? '0',
  )
  const [breastRate, setBreastRate] = useState<string>(
    baby.breast_ml_per_min?.toString() ?? '20',
  )
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number>(0)
  const [error, setError] = useState<string>('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await updateBaby(baby.id, {
        name: name.trim(),
        sex,
        birthday,
        gestational_age_weeks: gaWeeks === '' ? null : Number(gaWeeks),
        gestational_age_days: gaDays === '' ? 0 : Number(gaDays),
        breast_ml_per_min:
          breastRate === '' || Number(breastRate) <= 0
            ? null
            : Number(breastRate),
      })
      onUpdated(updated)
      setSavedAt(Date.now())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
          Baby profile
        </h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Sex (used for growth percentiles)</label>
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as Sex[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(s)}
                  className={`btn ${
                    sex === s
                      ? 'bg-brand-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700'
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
              <span className="text-slate-400 font-normal">(40w 0d = full-term)</span>
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
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
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
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  days
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Used to compute corrected age and to align growth-curve overlays
              for preterm babies.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="breastRate">
              Breastfeeding rate{' '}
              <span className="text-slate-400 font-normal">(mL per minute)</span>
            </label>
            <div className="relative">
              <input
                id="breastRate"
                type="number"
                min={1}
                max={60}
                step="0.5"
                inputMode="decimal"
                value={breastRate}
                onChange={(e) => setBreastRate(e.target.value)}
                className="input pr-14"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                mL/min
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Used on the Feeding page to convert breastfeeding minutes into a
              volume estimate. Newborns: ~5–10 mL/min. 2–4 mo: ~15–25 mL/min.
              Adjust to match what your pediatrician or weighed-feeds suggest.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {savedAt > 0 && !saving && (
              <span className="text-xs text-emerald-600">Saved.</span>
            )}
          </div>
        </form>
      </section>

      <section className="card p-5 text-sm text-slate-600 space-y-2">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">
          About
        </h2>
        <p>
          Data is stored in your private Supabase project. Anyone you've added as a
          user in your Supabase Auth dashboard can sign in with their email.
        </p>
        <p>
          Growth percentiles are based on the WHO Child Growth Standards
          (weight-for-age, 0–36 months) and are intended for general visualization
          only — not medical advice.
        </p>
      </section>
    </div>
  )
}
