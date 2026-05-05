import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, TrendingDown, TrendingUp } from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Sheet } from '../components/Sheet'
import { AddWeightForm } from '../components/forms/AddWeightForm'
import { listWeights } from '../lib/api'
import {
  ageInMonths,
  correctedAgeMonths,
  daysPreterm,
  DAYS_PER_MONTH,
  getReferencePercentiles,
  estimateZScore,
  weightAtZ,
  zToPercentile,
} from '../lib/who'
import type { Baby, WeightEntry } from '../lib/types'
import { formatDate, formatWeight, kgToLbOz, KG_TO_LB } from '../lib/format'

type Unit = 'kg' | 'lb'
type AgeMode = 'chronological' | 'corrected'
type Zoom = '1mo' | '3mo' | '6mo' | '12mo' | 'full'

const ZOOM_OPTIONS: { id: Zoom; label: string; max: number }[] = [
  { id: '1mo', label: '1 mo', max: 1 },
  { id: '3mo', label: '3 mo', max: 3 },
  { id: '6mo', label: '6 mo', max: 6 },
  { id: '12mo', label: '12 mo', max: 12 },
  { id: 'full', label: 'All', max: 36 },
]

export function GrowthView({ baby }: { baby: Baby }) {
  const preterm = daysPreterm(baby.gestational_age_weeks, baby.gestational_age_days)
  const isPreterm = preterm > 0

  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [unit, setUnit] = useState<Unit>('lb')
  const [zoom, setZoom] = useState<Zoom>('full')
  const [ageMode, setAgeMode] = useState<AgeMode>(
    isPreterm ? 'corrected' : 'chronological',
  )
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (isPreterm) setAgeMode('corrected')
    else setAgeMode('chronological')
  }, [isPreterm])

  const reload = useCallback(async () => {
    setLoading(true)
    const data = await listWeights(baby.id)
    setWeights(data)
    setLoading(false)
  }, [baby.id])

  useEffect(() => {
    reload().catch(() => setLoading(false))
  }, [reload])

  const ref = useMemo(() => getReferencePercentiles(baby.sex), [baby.sex])

  const xMax = useMemo(
    () => ZOOM_OPTIONS.find((z) => z.id === zoom)?.max ?? 36,
    [zoom],
  )
  const useCorrected = ageMode === 'corrected'
  const xMin = useCorrected ? Math.min(0, -preterm / DAYS_PER_MONTH) : 0

  const ageFor = useCallback(
    (date: Date): number =>
      useCorrected
        ? correctedAgeMonths(
            baby.birthday,
            baby.gestational_age_weeks,
            baby.gestational_age_days,
            date,
          )
        : ageInMonths(baby.birthday, date),
    [
      useCorrected,
      baby.birthday,
      baby.gestational_age_weeks,
      baby.gestational_age_days,
    ],
  )

  // Build the chart dataset: percentile reference rows (one per WHO month) +
  // -2 SD / -3 SD reference rows + actual weight points, all on the same x.
  const chartData = useMemo(() => {
    const factor = unit === 'lb' ? KG_TO_LB : 1
    const rows: Record<string, number | null>[] = []

    for (const r of ref) {
      if (r.ageMonths > xMax) break
      const negTwo = weightAtZ(baby.sex, r.ageMonths, -2)
      const negThree = weightAtZ(baby.sex, r.ageMonths, -3)
      rows.push({
        ageMonths: r.ageMonths,
        sd_neg3: negThree != null ? +(negThree * factor).toFixed(2) : null,
        sd_neg2: negTwo != null ? +(negTwo * factor).toFixed(2) : null,
        p3: +(r.p3 * factor).toFixed(2),
        p15: +(r.p15 * factor).toFixed(2),
        p50: +(r.p50 * factor).toFixed(2),
        p85: +(r.p85 * factor).toFixed(2),
        p97: +(r.p97 * factor).toFixed(2),
        actual: null,
      })
    }

    for (const w of weights) {
      const am = ageFor(new Date(w.measured_at))
      if (am < xMin || am > xMax) continue
      rows.push({
        ageMonths: +am.toFixed(3),
        sd_neg3: null,
        sd_neg2: null,
        p3: null,
        p15: null,
        p50: null,
        p85: null,
        p97: null,
        actual: +(w.weight_kg * factor).toFixed(2),
      })
    }

    rows.sort((a, b) => (a.ageMonths as number) - (b.ageMonths as number))
    return rows
  }, [ref, weights, ageFor, unit, xMin, xMax, baby.sex])

  const latest = weights[weights.length - 1]
  const latestStats = useMemo(() => {
    if (!latest) return null
    const am = isPreterm
      ? correctedAgeMonths(
          baby.birthday,
          baby.gestational_age_weeks,
          baby.gestational_age_days,
          new Date(latest.measured_at),
        )
      : ageInMonths(baby.birthday, new Date(latest.measured_at))
    if (am < 0) return { am, z: null, pct: null }
    const z = estimateZScore(baby.sex, am, latest.weight_kg)
    if (z == null) return { am, z: null, pct: null }
    return { am, z, pct: zToPercentile(z) }
  }, [latest, baby, isPreterm])

  // Last-7-days growth: compare latest weight to the weight closest to
  // (latest.measured_at - 7 days). Only show if a prior weight exists within
  // a 14-day window.
  const weeklyDelta = useMemo(() => {
    if (!latest || weights.length < 2) return null
    const latestT = new Date(latest.measured_at).getTime()
    const target = latestT - 7 * 24 * 3600 * 1000
    let best: WeightEntry | null = null
    let bestDist = Infinity
    for (const w of weights) {
      if (w.id === latest.id) continue
      const t = new Date(w.measured_at).getTime()
      if (t >= latestT) continue
      const dist = Math.abs(t - target)
      if (dist < bestDist) {
        bestDist = dist
        best = w
      }
    }
    if (!best) return null
    const days = (latestT - new Date(best.measured_at).getTime()) / (24 * 3600 * 1000)
    if (days > 14) return null
    const deltaKg = latest.weight_kg - best.weight_kg
    const gPerDay = (deltaKg * 1000) / days

    const ageNow = isPreterm
      ? correctedAgeMonths(
          baby.birthday,
          baby.gestational_age_weeks,
          baby.gestational_age_days,
          new Date(latest.measured_at),
        )
      : ageInMonths(baby.birthday, new Date(latest.measured_at))
    const ageThen = isPreterm
      ? correctedAgeMonths(
          baby.birthday,
          baby.gestational_age_weeks,
          baby.gestational_age_days,
          new Date(best.measured_at),
        )
      : ageInMonths(baby.birthday, new Date(best.measured_at))

    const zNow = ageNow >= 0 ? estimateZScore(baby.sex, ageNow, latest.weight_kg) : null
    const zThen =
      ageThen >= 0 ? estimateZScore(baby.sex, ageThen, best.weight_kg) : null

    return { days, deltaKg, gPerDay, zNow, zThen }
  }, [latest, weights, baby, isPreterm])

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Latest weight
            </h2>
            {latest ? (
              <>
                <div className="text-2xl font-semibold mt-1">
                  {formatWeight(latest.weight_kg, unit === 'kg' ? 'metric' : 'imperial')}
                  <span className="text-base font-normal text-slate-500 ml-2">
                    ({Math.round(latest.weight_kg * 1000)} g)
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {formatDate(latest.measured_at)}
                  {latestStats?.z != null && (
                    <>
                      {' · '}
                      <span
                        className={
                          latestStats.z <= -2
                            ? 'text-amber-700 font-medium'
                            : latestStats.z >= 2
                              ? 'text-emerald-700 font-medium'
                              : ''
                        }
                      >
                        z = {latestStats.z.toFixed(2)}
                      </span>
                      {' (≈ '}
                      {formatPercentile(latestStats.pct!)}
                      {isPreterm ? ', corrected)' : ')'}
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 mt-1">No weight entries yet.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Weight
          </button>
        </div>
      </section>

      {weeklyDelta && (
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Last {Math.round(weeklyDelta.days)} days
          </h2>
          <div className="mt-2 flex items-center gap-3">
            <DeltaPill delta={weeklyDelta.deltaKg} />
            <div className="text-sm text-slate-600">
              <div>
                <span className="font-medium">
                  {formatGramsDelta(weeklyDelta.deltaKg)}
                </span>
                {' · '}
                <span>{formatOzDelta(weeklyDelta.deltaKg)}</span>
              </div>
              <div className="text-xs text-slate-500">
                {(weeklyDelta.gPerDay >= 0 ? '+' : '') +
                  weeklyDelta.gPerDay.toFixed(0)}{' '}
                g/day average
              </div>
            </div>
          </div>
          {weeklyDelta.zNow != null && weeklyDelta.zThen != null && (
            <p className="text-xs text-slate-500 mt-2">
              z-score: {weeklyDelta.zThen.toFixed(2)} →{' '}
              <span
                className={
                  weeklyDelta.zNow > weeklyDelta.zThen
                    ? 'text-emerald-700 font-medium'
                    : weeklyDelta.zNow < weeklyDelta.zThen
                      ? 'text-amber-700 font-medium'
                      : ''
                }
              >
                {weeklyDelta.zNow.toFixed(2)}
              </span>
              {weeklyDelta.zNow > weeklyDelta.zThen
                ? ' — moving up'
                : weeklyDelta.zNow < weeklyDelta.zThen
                  ? ' — moving down'
                  : ' — steady'}
            </p>
          )}
        </section>
      )}

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Weight-for-age
          </h2>
          <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs">
            {(['lb', 'kg'] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`px-3 py-1.5 uppercase font-medium ${
                  unit === u ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div
            role="group"
            aria-label="Zoom range"
            className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs"
          >
            {ZOOM_OPTIONS.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setZoom(z.id)}
                className={`px-3 py-1.5 font-medium ${
                  zoom === z.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
          {isPreterm && (
            <div
              role="group"
              aria-label="Age mode"
              className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs"
              title={`Corrected for ${Math.floor(preterm / 7)}w ${preterm % 7}d preterm`}
            >
              {(
                [
                  { id: 'corrected', label: 'Corrected' },
                  { id: 'chronological', label: 'Chrono' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAgeMode(m.id)}
                  className={`px-3 py-1.5 font-medium ${
                    ageMode === m.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-[360px] -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
              <XAxis
                dataKey="ageMonths"
                type="number"
                domain={[xMin, xMax]}
                tickFormatter={(v) => formatXTick(Number(v), xMax)}
                tick={{ fontSize: 11 }}
                label={{
                  value:
                    useCorrected && isPreterm
                      ? 'Corrected age (months)'
                      : 'Age (months)',
                  position: 'insideBottom',
                  dy: 12,
                  fontSize: 11,
                }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{
                  value: unit === 'lb' ? 'Weight (lb)' : 'Weight (kg)',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 11,
                  offset: 10,
                }}
              />
              <Tooltip
                formatter={(v, name) => {
                  const num = typeof v === 'number' ? v : Number(v)
                  if (!Number.isFinite(num)) return ['—', name as string]
                  return [
                    unit === 'lb' ? `${num.toFixed(1)} lb` : `${num.toFixed(2)} kg`,
                    name as string,
                  ]
                }}
                labelFormatter={(v) => formatXLabel(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {useCorrected && isPreterm && xMin < 0 && (
                <ReferenceLine
                  x={0}
                  stroke="#f59e0b"
                  strokeDasharray="3 3"
                  label={{ value: 'Term', position: 'top', fontSize: 10, fill: '#b45309' }}
                />
              )}
              {/* Lower SD bands first so percentile lines render on top. */}
              <Line type="monotone" dataKey="sd_neg3" name="-3 SD" stroke="#fca5a5" strokeDasharray="2 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="sd_neg2" name="-2 SD" stroke="#fcd34d" strokeDasharray="2 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="p3" name="3rd" stroke="#cbd5e1" strokeDasharray="4 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="p15" name="15th" stroke="#94a3b8" strokeDasharray="4 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="p50" name="50th" stroke="#475569" dot={false} connectNulls />
              <Line type="monotone" dataKey="p85" name="85th" stroke="#94a3b8" strokeDasharray="4 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="p97" name="97th" stroke="#cbd5e1" strokeDasharray="4 4" dot={false} connectNulls />
              <Line
                type="monotone"
                dataKey="actual"
                name={baby.name}
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#2563eb' }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-2">
          Reference: WHO Child Growth Standards, weight-for-age (0–36 mo).
          {' '}-2/-3 SD lines approximate WHO via log-normal extrapolation.
          {isPreterm &&
            ` ${baby.name} was born ${baby.gestational_age_weeks}w ${baby.gestational_age_days ?? 0}d ` +
              `(${Math.floor(preterm / 7)}w ${preterm % 7}d preterm).`}
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Weight history
        </h2>
        <div className="card divide-y divide-slate-100">
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">Loading…</p>
          ) : weights.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">
              No measurements yet.
            </p>
          ) : (
            weights
              .slice()
              .reverse()
              .map((w) => {
                const lb = kgToLbOz(w.weight_kg)
                const am = ageFor(new Date(w.measured_at))
                return (
                  <div key={w.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {unit === 'lb' ? `${lb.lb} lb ${lb.oz} oz` : `${w.weight_kg.toFixed(2)} kg`}
                        <span className="text-xs text-slate-400 ml-2">
                          {Math.round(w.weight_kg * 1000)} g
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatDate(w.measured_at)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">
                      {am.toFixed(2)} mo{useCorrected && isPreterm ? ' (cor)' : ''}
                    </div>
                  </div>
                )
              })
          )}
        </div>
      </section>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Log a weight">
        <AddWeightForm
          babyId={baby.id}
          onSaved={() => {
            setAdding(false)
            reload()
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </div>
  )
}

function formatXTick(v: number, xMax: number): string {
  if (xMax <= 1) {
    const weeks = v * (DAYS_PER_MONTH / 7)
    return `${weeks.toFixed(0)}w`
  }
  return v.toFixed(0)
}

function formatXLabel(v: number): string {
  if (Math.abs(v) < 1) {
    const days = Math.round(v * DAYS_PER_MONTH)
    return `${days} d`
  }
  return `${v.toFixed(1)} mo`
}

function formatPercentile(p: number): string {
  if (p < 1) return `<1st percentile`
  if (p < 5) return `${p.toFixed(1)}th percentile`
  return `${Math.round(p)}th percentile`
}

function formatGramsDelta(deltaKg: number): string {
  const g = Math.round(deltaKg * 1000)
  return `${g >= 0 ? '+' : ''}${g} g`
}

function formatOzDelta(deltaKg: number): string {
  const oz = deltaKg * 35.27396
  return `${oz >= 0 ? '+' : ''}${oz.toFixed(1)} oz`
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta >= 0) {
    return (
      <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-700 grid place-items-center">
        <TrendingUp className="h-6 w-6" />
      </div>
    )
  }
  return (
    <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-700 grid place-items-center">
      <TrendingDown className="h-6 w-6" />
    </div>
  )
}
