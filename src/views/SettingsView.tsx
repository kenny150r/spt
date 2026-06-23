import { useEffect, useState } from 'react'
import { Bell, Download, Feather, Monitor, Moon, Sun } from 'lucide-react'
import { exportBabyData, updateBaby } from '../lib/api'
import { toDateInput } from '../lib/format'
import type { Baby, Sex } from '../lib/types'
import { useVocab } from '../lib/vocab'
import type { VocabMode } from '../lib/vocab'
import { useTheme } from '../lib/theme'
import type { ThemeMode } from '../lib/theme'
import { usePapyrus } from '../lib/papyrus'

// Keep in sync with DEFAULT_STALE_HOURS_* in LogView.tsx. Duplicated
// here so the Settings form can show a meaningful placeholder.
const DEFAULT_STALE_HOURS = {
  feed: 3,
  diaper: 3,
  pump: 3,
} as const

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
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4 dark:text-slate-400">
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
            <p className="text-xs text-slate-500 mt-1.5 dark:text-slate-400">
              Used to compute corrected age and to align growth-curve overlays
              for preterm babies.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="breastRate">
              Breastfeeding rate{' '}
              <span className="text-slate-400 font-normal dark:text-slate-500">(mL per minute)</span>
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
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                mL/min
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 dark:text-slate-400">
              Used on the Feeding page to convert breastfeeding minutes into a
              volume estimate. Newborns: ~5–10 mL/min. 2–4 mo: ~15–25 mL/min.
              Adjust to match what your pediatrician or weighed-feeds suggest.
            </p>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {savedAt > 0 && !saving && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</span>
            )}
          </div>
        </form>
      </section>

      <AppearanceCard />

      <NotificationsCard baby={baby} onUpdated={onUpdated} />

      <VocabularyCard />

      <ExportCard baby={baby} />

      <section className="card p-5 text-sm text-slate-600 space-y-2 dark:text-slate-300">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1 dark:text-slate-400">
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

const VOCAB_OPTIONS: { id: VocabMode; label: string; sample: string }[] = [
  { id: 'casual', label: 'Casual', sample: 'peepies / poopies' },
  { id: 'sophisticated', label: 'Sophisticated', sample: 'urine / stool' },
]

// Downloads a single self-contained JSON file with every row across all
// tables for the active baby. Handy as a quick "give me a copy in
// Dropbox/iCloud right now" backup that works on a phone with no CLI.
// Pair with `npm run backup` (SQL dump) for full-fidelity restorable
// backups on the developer's machine.
function ExportCard({ baby }: { baby: Baby }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>('')
  const [lastDownload, setLastDownload] = useState<{
    file: string
    bytes: number
    rows: number
  } | null>(null)

  async function onExport() {
    setBusy(true)
    setError('')
    try {
      const snapshot = await exportBabyData(baby)
      const json = JSON.stringify(snapshot, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const slug = baby.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const file = `spt-${slug || 'baby'}-${stamp}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Defer revoke so iOS Safari has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      const totalRows =
        snapshot.counts.weights +
        snapshot.counts.feeds +
        snapshot.counts.diapers +
        snapshot.counts.pumps +
        snapshot.counts.supplements +
        snapshot.counts.sleeps
      setLastDownload({ file, bytes: blob.size, rows: totalRows })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1 dark:text-slate-400">
        Export data
      </h2>
      <p className="text-xs text-slate-500 mb-3 dark:text-slate-400">
        Downloads every weight, feed, diaper, pump, supplement, and sleep
        entry for <span className="font-medium">{baby.name}</span> as a single
        JSON file. Safe to AirDrop or stash in iCloud / Dropbox.
      </p>
      <button
        type="button"
        onClick={onExport}
        disabled={busy}
        className="btn-primary inline-flex items-center gap-2"
      >
        <Download className="h-4 w-4" />
        {busy ? 'Preparing…' : 'Download JSON snapshot'}
      </button>
      {error && (
        <p className="text-xs text-red-600 mt-2 break-words dark:text-red-400">{error}</p>
      )}
      {lastDownload && !error && (
        <p className="text-xs text-emerald-700 mt-2 dark:text-emerald-300">
          Saved <span className="font-medium">{lastDownload.file}</span> ·{' '}
          {lastDownload.rows.toLocaleString()} rows ·{' '}
          {formatBytes(lastDownload.bytes)}
        </p>
      )}
      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed dark:text-slate-500">
        For a full restorable SQL dump (including schema), run{' '}
        <code className="bg-slate-100 px-1 py-0.5 rounded dark:bg-slate-800 dark:text-slate-300">
          npm run backup
        </code>{' '}
        in the project repo on a computer with the Supabase CLI.
        Supabase also keeps automatic daily backups for 7 days on the free
        tier — see Database → Backups in the Supabase dashboard.
      </p>
    </section>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

const THEME_OPTIONS: {
  id: ThemeMode
  label: string
  sub: string
  icon: React.ReactNode
}[] = [
  { id: 'system', label: 'System', sub: 'match device', icon: <Monitor className="h-4 w-4" /> },
  { id: 'light', label: 'Light', sub: 'always light', icon: <Sun className="h-4 w-4" /> },
  { id: 'dark', label: 'Dark', sub: 'always dark', icon: <Moon className="h-4 w-4" /> },
]

// Per-device pref. 'System' tracks prefers-color-scheme and updates live
// (e.g. when iOS rolls over at sunset).
function AppearanceCard() {
  const { mode, setMode, resolved } = useTheme()
  const { enabled: papyrus, setEnabled: setPapyrus } = usePapyrus()
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1 dark:text-slate-400">
        Appearance
      </h2>
      <p className="text-xs text-slate-500 mb-3 dark:text-slate-400">
        Currently showing <span className="font-medium">{resolved}</span> mode.
        Saved on this device.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMode(opt.id)}
            aria-pressed={mode === opt.id}
            className={`p-3 rounded-2xl border text-left active:scale-[0.99] transition-transform ${
              mode === opt.id
                ? 'bg-brand-600 text-white border-brand-600 dark:bg-brand-500 dark:border-brand-500'
                : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
              {opt.icon}
              {opt.label}
            </div>
            <div
              className={`text-[11px] mt-0.5 ${
                mode === opt.id ? 'opacity-90' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {opt.sub}
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPapyrus(!papyrus)}
        aria-pressed={papyrus}
        className={`mt-2 w-full p-3 rounded-2xl border text-left flex items-center gap-3 active:scale-[0.99] transition-transform ${
          papyrus
            ? 'bg-amber-600 text-white border-amber-600 dark:bg-amber-600 dark:border-amber-500'
            : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
        }`}
      >
        <div
          className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${
            papyrus ? 'bg-white/20' : 'bg-slate-50 dark:bg-slate-950/40'
          }`}
        >
          <Feather className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold leading-tight">Papyrus mode</div>
            <div className={`text-[11px] ${papyrus ? 'opacity-90' : 'opacity-75'}`}>
              {papyrus ? 'on' : 'off'}
            </div>
          </div>
          <div className={`text-[11px] mt-0.5 ${papyrus ? 'opacity-90' : 'text-slate-500 dark:text-slate-400'}`}>
            Render the entire app in Papyrus. A crime against typography.
          </div>
        </div>
      </button>
    </section>
  )
}

// Per-baby thresholds for how long since the last feed / diaper / pump
// before the "Last X" cards on the Log page start pulsing amber.
// Stored on the baby row so both parents see the same nudges. 0 = off.
function NotificationsCard({
  baby,
  onUpdated,
}: {
  baby: Baby
  onUpdated: (b: Baby) => void
}) {
  const [feed, setFeed] = useState<string>(
    baby.stale_feed_hours?.toString() ?? DEFAULT_STALE_HOURS.feed.toString(),
  )
  const [diaper, setDiaper] = useState<string>(
    baby.stale_diaper_hours?.toString() ?? DEFAULT_STALE_HOURS.diaper.toString(),
  )
  const [pump, setPump] = useState<string>(
    baby.stale_pump_hours?.toString() ?? DEFAULT_STALE_HOURS.pump.toString(),
  )
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number>(0)
  const [error, setError] = useState<string>('')

  // Auto-clear the "Saved." badge so it doesn't linger if the user
  // tweaks values, glances away, then comes back.
  useEffect(() => {
    if (!savedAt) return
    const id = setTimeout(() => setSavedAt(0), 2500)
    return () => clearTimeout(id)
  }, [savedAt])

  function parseHours(s: string): number | null {
    if (s.trim() === '') return null
    const n = Number(s)
    if (!Number.isFinite(n) || n < 0) return null
    return n
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const updated = await updateBaby(baby.id, {
        stale_feed_hours: parseHours(feed),
        stale_diaper_hours: parseHours(diaper),
        stale_pump_hours: parseHours(pump),
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
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1 dark:text-slate-400 flex items-center gap-1.5">
        <Bell className="h-4 w-4" />
        Notifications
      </h2>
      <p className="text-xs text-slate-500 mb-4 dark:text-slate-400">
        Pulse the &ldquo;Last X&rdquo; cards on the Log page once an entry
        is older than this many hours. Per-baby, so both parents see the
        same nudges. Set to <span className="font-medium">0</span> to disable.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <StaleHoursField
          id="stale-feed"
          label="Feed"
          value={feed}
          onChange={setFeed}
          placeholder={DEFAULT_STALE_HOURS.feed}
        />
        <StaleHoursField
          id="stale-diaper"
          label="Diaper"
          value={diaper}
          onChange={setDiaper}
          placeholder={DEFAULT_STALE_HOURS.diaper}
        />
        <StaleHoursField
          id="stale-pump"
          label="Pump"
          value={pump}
          onChange={setPump}
          placeholder={DEFAULT_STALE_HOURS.pump}
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save thresholds'}
          </button>
          {savedAt > 0 && !saving && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              Saved.
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed dark:text-slate-500">
          Weight cards never pulse — those only update at most daily.
        </p>
      </form>
    </section>
  )
}

function StaleHoursField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: number
}) {
  const off = value.trim() === '0'
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
        {off && (
          <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-slate-400 dark:text-slate-500">
            off
          </span>
        )}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          min={0}
          max={48}
          step="0.25"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder.toString()}
          className="input pr-12"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
          hrs
        </span>
      </div>
    </div>
  )
}

// Per-device pref (stored in localStorage), so different folks in the
// household can pick whichever feels right on their phone.
function VocabularyCard() {
  const { mode, setMode } = useVocab()
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1 dark:text-slate-400">
        Vocabulary
      </h2>
      <p className="text-xs text-slate-500 mb-3 dark:text-slate-400">
        Choose which words the app uses for diaper contents. Saved on this
        device.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {VOCAB_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMode(opt.id)}
            aria-pressed={mode === opt.id}
            className={`p-3 rounded-2xl border text-left active:scale-[0.99] transition-transform ${
              mode === opt.id
                ? 'bg-brand-600 text-white border-brand-600 dark:bg-brand-500 dark:border-brand-500'
                : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
            }`}
          >
            <div className="text-sm font-semibold leading-tight">
              {mode === opt.id ? '✓ ' : ''}
              {opt.label}
            </div>
            <div
              className={`text-[11px] mt-0.5 ${
                mode === opt.id ? 'opacity-90' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {opt.sample}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
