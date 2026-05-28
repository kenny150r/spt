import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, TrendingDown, TrendingUp } from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
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
  expectedGramsPerDay,
  getReferencePercentiles,
  estimateZScore,
  weightAtZ,
  zToPercentile,
} from '../lib/who'
import type { Baby, WeightEntry } from '../lib/types'
import { formatDate, formatWeight, kgToLbOz, KG_TO_LB } from '../lib/format'
import { useChartTheme } from '../lib/chartTheme'

type Unit = 'kg' | 'lb'
type AgeMode = 'chronological' | 'corrected'
type Zoom = '1mo' | '3mo' | '6mo' | '12mo' | 'full'

const ZOOM_OPTIONS: { id: Zoom; label: string; max: number }[] = [
  { id: '1mo', label: '1m', max: 1 },
  { id: '3mo', label: '3m', max: 3 },
  { id: '6mo', label: '6m', max: 6 },
  { id: '12mo', label: '12m', max: 12 },
  { id: 'full', label: 'All', max: 36 },
]

export function GrowthView({ baby }: { baby: Baby }) {
  const t = useChartTheme()
  const preterm = daysPreterm(baby.gestational_age_weeks, baby.gestational_age_days)
  const isPreterm = preterm > 0

  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [unit, setUnit] = useState<Unit>('lb')
  const [zoom, setZoom] = useState<Zoom>('3mo')
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

  // For preterm babies in 1-month corrected view, label the x-axis with weeks
  // of gestational age (e.g. "34w 5d", "40w 0d") instead of months relative to
  // term — the standard NICU convention and easier to read at this zoom.
  const showAsGA = useCorrected && isPreterm && zoom === '1mo'

  // When showing GA, force ticks at every full week of GA so labels are clean
  // (e.g. 34w, 36w, 38w, 40w, 42w, 44w) rather than Recharts' auto-picked
  // sub-week intervals.
  const gaTicks = useMemo<number[] | undefined>(() => {
    if (!showAsGA) return undefined
    const startGaDays = xMin * DAYS_PER_MONTH + 40 * 7
    const endGaDays = xMax * DAYS_PER_MONTH + 40 * 7
    const startWeek = Math.ceil(startGaDays / 7)
    const endWeek = Math.floor(endGaDays / 7)
    const stepWeeks = endWeek - startWeek > 6 ? 2 : 1
    const ticks: number[] = []
    for (let w = startWeek; w <= endWeek; w += stepWeeks) {
      const daysFromTerm = w * 7 - 40 * 7
      ticks.push(daysFromTerm / DAYS_PER_MONTH)
    }
    return ticks
  }, [showAsGA, xMin, xMax])

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

  // Last-7-days growth rate.
  //
  // The display used to anchor on the latest measurement and a single
  // "closest to 7 days ago" measurement, which made the printed g/day
  // jerk around by ±10g every time a noisy weighing landed near either
  // anchor (e.g. weighing right before vs right after a feed).
  //
  // To stabilize it we fit a 1st-order Savitzky-Golay filter (i.e. an
  // ordinary least-squares line) through every measurement inside the
  // 7-day window. The slope of that line is the g/day rate. Because
  // every sample contributes, swapping one in or out barely moves the
  // number — which is the whole point.
  //
  // With < 3 samples in the window we fall back to the original
  // two-point comparison (search expanded to 14 days) so very-thin data
  // still reports *something*.
  const weeklyDelta = useMemo(() => {
    if (!latest || weights.length < 2) return null
    const DAY_MS = 24 * 3600 * 1000
    const WINDOW_DAYS = 7
    const latestT = new Date(latest.measured_at).getTime()
    const windowStart = latestT - WINDOW_DAYS * DAY_MS

    const inWindow = weights.filter((w) => {
      const t = new Date(w.measured_at).getTime()
      return t >= windowStart && t <= latestT
    })

    let days: number
    let deltaKg: number
    let gPerDay: number
    let thenWeightKg: number
    let thenT: number
    let nSamples: number
    let smoothed: boolean

    if (inWindow.length >= 3) {
      // OLS regression of weight (kg) on time (days, relative to latest).
      let sumT = 0
      let sumW = 0
      const ts: number[] = []
      const ws: number[] = []
      for (const w of inWindow) {
        const t = (new Date(w.measured_at).getTime() - latestT) / DAY_MS
        ts.push(t)
        ws.push(w.weight_kg)
        sumT += t
        sumW += w.weight_kg
      }
      const n = inWindow.length
      const meanT = sumT / n
      const meanW = sumW / n
      let num = 0
      let den = 0
      for (let i = 0; i < n; i++) {
        const dt = ts[i] - meanT
        num += dt * (ws[i] - meanW)
        den += dt * dt
      }
      if (den === 0) return null
      const slopeKgPerDay = num / den
      const intercept = meanW - slopeKgPerDay * meanT

      // Use the actual data span as the window length so we don't claim
      // 7 days of growth when we only have, say, 4 days of data.
      const oldestT = inWindow.reduce(
        (acc, w) => Math.min(acc, new Date(w.measured_at).getTime()),
        latestT,
      )
      days = (latestT - oldestT) / DAY_MS
      gPerDay = slopeKgPerDay * 1000
      deltaKg = slopeKgPerDay * days

      // Use the *fitted* weights at the endpoints for z-score comparison
      // rather than any single noisy sample.
      thenT = oldestT
      thenWeightKg = intercept + slopeKgPerDay * ((oldestT - latestT) / DAY_MS)
      nSamples = n
      smoothed = true
    } else {
      // Fallback: original behaviour — closest measurement to "7 days ago"
      // within a 14-day search window.
      const target = latestT - WINDOW_DAYS * DAY_MS
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
      const bestT = new Date(best.measured_at).getTime()
      days = (latestT - bestT) / DAY_MS
      if (days > 14) return null
      deltaKg = latest.weight_kg - best.weight_kg
      gPerDay = (deltaKg * 1000) / days
      thenT = bestT
      thenWeightKg = best.weight_kg
      nSamples = inWindow.length
      smoothed = false
    }

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
          new Date(thenT),
        )
      : ageInMonths(baby.birthday, new Date(thenT))

    const zNow = ageNow >= 0 ? estimateZScore(baby.sex, ageNow, latest.weight_kg) : null
    const zThen = ageThen >= 0 ? estimateZScore(baby.sex, ageThen, thenWeightKg) : null

    // "Typical" gain over the same window: the delta on the WHO curve
    // the baby is *currently sitting on*, not the 50th percentile.
    // Babies tracking below the median grow fewer g/day in absolute
    // terms, so benchmarking a <3rd-percentile baby against a P50 rate
    // unfairly makes them look like they're falling behind. Using
    // Sam's current z keeps the comparison apples-to-apples — the rate
    // shown is "what it takes to stay on his curve". Clamp to a sane
    // range so a wildly extrapolated z doesn't poison the slope.
    const refZ = zNow != null ? Math.max(-3.5, Math.min(3.5, zNow)) : 0
    let expectedGPerDay: number | null = null
    let expectedSource: 'whoCurve' | 'preterm' | null = null
    let expectedPercentile: number | null = null
    if (ageNow >= 0 && ageThen >= 0) {
      const wNow = weightAtZ(baby.sex, ageNow, refZ)
      const wThen = weightAtZ(baby.sex, ageThen, refZ)
      if (wNow != null && wThen != null) {
        expectedGPerDay = ((wNow - wThen) * 1000) / days
        expectedSource = 'whoCurve'
        expectedPercentile = zToPercentile(refZ)
      }
    }
    if (expectedGPerDay == null) {
      // Negative corrected age (pre-term) — WHO has no data here, so
      // fall back to the static preterm gain table.
      const fallback = expectedGramsPerDay(ageNow)
      if (fallback) {
        expectedGPerDay = (fallback.low + fallback.high) / 2
        expectedSource = 'preterm'
      }
    }

    return {
      days,
      deltaKg,
      gPerDay,
      zNow,
      zThen,
      expectedGPerDay,
      expectedSource,
      expectedPercentile,
      nSamples,
      smoothed,
    }
  }, [latest, weights, baby, isPreterm])

  return (
    <div className="space-y-5">
      <section className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">
              Latest weight
            </h2>
            {latest ? (
              <>
                <div className="text-2xl font-semibold mt-1">
                  {formatWeight(latest.weight_kg, unit === 'kg' ? 'metric' : 'imperial')}
                  <span className="text-base font-normal text-slate-500 ml-2 dark:text-slate-400">
                    ({Math.round(latest.weight_kg * 1000)} g)
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 dark:text-slate-400">
                  {formatDate(latest.measured_at)}
                  {latestStats?.z != null && (
                    <>
                      {' · '}
                      <span
                        className={
                          latestStats.z <= -2
                            ? 'text-amber-700 font-medium dark:text-amber-400'
                            : latestStats.z >= 2
                              ? 'text-emerald-700 font-medium dark:text-emerald-400'
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
              <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">No weight entries yet.</p>
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
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">
              Last {Math.round(weeklyDelta.days)} days
            </h2>
            <span
              className="text-[10px] text-slate-400 dark:text-slate-500"
              title={
                weeklyDelta.smoothed
                  ? 'Linear regression (1st-order Savitzky–Golay) over every weight in the window — robust to single-feed noise.'
                  : 'Two-point comparison (not enough samples in window to smooth).'
              }
            >
              {weeklyDelta.smoothed
                ? `smoothed · ${weeklyDelta.nSamples} samples`
                : '2-point'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <DeltaPill delta={weeklyDelta.deltaKg} />
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <div>
                <span className="font-medium">
                  {formatGramsDelta(weeklyDelta.deltaKg)}
                </span>
                {' · '}
                <span>{formatOzDelta(weeklyDelta.deltaKg)}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <span
                  className={
                    weeklyDelta.expectedGPerDay != null
                      ? weeklyDelta.gPerDay >= weeklyDelta.expectedGPerDay
                        ? 'text-emerald-700 font-medium dark:text-emerald-400'
                        : 'text-amber-700 font-medium dark:text-amber-400'
                      : ''
                  }
                >
                  {(weeklyDelta.gPerDay >= 0 ? '+' : '') +
                    weeklyDelta.gPerDay.toFixed(0)}{' '}
                  g/day
                </span>
                {weeklyDelta.expectedGPerDay != null && (
                  <span
                    className="text-slate-400 dark:text-slate-500"
                    title={
                      weeklyDelta.expectedSource === 'whoCurve'
                        ? "Slope of the WHO curve at the baby's current percentile — i.e. the g/day needed to stay on the same percentile."
                        : 'Static preterm reference (no WHO data for negative corrected age).'
                    }
                  >
                    {' '}· typical{' '}
                    {(weeklyDelta.expectedGPerDay >= 0 ? '+' : '') +
                      weeklyDelta.expectedGPerDay.toFixed(0)}{' '}
                    g/day
                    {weeklyDelta.expectedSource === 'whoCurve' &&
                    weeklyDelta.expectedPercentile != null
                      ? ` (WHO ${compactPercentile(
                          weeklyDelta.expectedPercentile,
                        )}${isPreterm ? ', corrected' : ''})`
                      : ' (preterm catch-up)'}
                  </span>
                )}
              </div>
            </div>
          </div>
          {weeklyDelta.zNow != null && weeklyDelta.zThen != null && (
            <p className="text-xs text-slate-500 mt-2 dark:text-slate-400">
              z-score: {weeklyDelta.zThen.toFixed(2)} →{' '}
              <span
                className={
                  weeklyDelta.zNow > weeklyDelta.zThen
                    ? 'text-emerald-700 font-medium dark:text-emerald-400'
                    : weeklyDelta.zNow < weeklyDelta.zThen
                      ? 'text-amber-700 font-medium dark:text-amber-400'
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
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">
            Weight-for-age
          </h2>
          <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs dark:border-slate-700">
            {(['lb', 'kg'] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`px-3 py-1.5 uppercase font-medium ${
                  unit === u
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
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
            className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs dark:border-slate-700"
          >
            {ZOOM_OPTIONS.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setZoom(z.id)}
                className={`px-3 py-1.5 font-medium ${
                  zoom === z.id
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
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
              className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs dark:border-slate-700"
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
                    ageMode === m.id
                      ? 'bg-brand-600 text-white dark:bg-brand-500'
                      : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
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
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
              <CartesianGrid stroke={t.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="ageMonths"
                type="number"
                domain={[xMin, xMax]}
                ticks={gaTicks}
                tickFormatter={(v) => formatXTick(Number(v), xMax, showAsGA)}
                tick={{ fontSize: 11, fill: t.axis }}
                stroke={t.axis}
                label={{
                  value: showAsGA
                    ? 'Gestational age'
                    : useCorrected && isPreterm
                      ? 'Corrected age (months)'
                      : 'Age (months)',
                  position: 'insideBottom',
                  offset: -8,
                  fontSize: 11,
                  fill: t.axis,
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: t.axis }}
                stroke={t.axis}
                label={{
                  value: unit === 'lb' ? 'Weight (lb)' : 'Weight (kg)',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 11,
                  offset: 10,
                  fill: t.axis,
                }}
              />
              <Legend
                verticalAlign="top"
                wrapperStyle={{ fontSize: 11, paddingBottom: 6, color: t.legend }}
              />
              {useCorrected && isPreterm && xMin < 0 && (
                <ReferenceLine
                  x={0}
                  stroke={t.bars.amber}
                  strokeDasharray="3 3"
                  label={{
                    value: showAsGA ? '40w (term)' : 'Term',
                    // `insideTop` keeps the marker visually attached to the
                    // line while staying within the plot area, so it can't
                    // collide with the top-aligned legend above.
                    position: 'insideTop',
                    fontSize: 10,
                    fill: t.bars.amber,
                  }}
                />
              )}
              {/* Lower SD bands first so percentile lines render on top. */}
              <Line type="monotone" dataKey="sd_neg3" name="-3 SD" stroke={t.who.neg3} strokeDasharray="2 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="sd_neg2" name="-2 SD" stroke={t.who.neg2} strokeDasharray="2 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="p3" name="3rd" stroke={t.who.p3} strokeDasharray="4 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="p15" name="15th" stroke={t.who.p15} strokeDasharray="4 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="p50" name="50th" stroke={t.who.p50} dot={false} connectNulls />
              <Line type="monotone" dataKey="p85" name="85th" stroke={t.who.p85} strokeDasharray="4 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="p97" name="97th" stroke={t.who.p97} strokeDasharray="4 4" dot={false} connectNulls />
              <Line
                type="monotone"
                dataKey="actual"
                name={baby.name}
                stroke={t.sam}
                strokeWidth={2}
                dot={{ r: 2.5, fill: t.sam, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-2 dark:text-slate-500">
          Reference: WHO Child Growth Standards, weight-for-age (0–36 mo).
          {' '}-2/-3 SD lines approximate WHO via log-normal extrapolation.
          {isPreterm &&
            ` ${baby.name} was born ${baby.gestational_age_weeks}w ${baby.gestational_age_days ?? 0}d ` +
              `(${Math.floor(preterm / 7)}w ${preterm % 7}d preterm).`}
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 dark:text-slate-400">
          Weight history
        </h2>
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center dark:text-slate-400">Loading…</p>
          ) : weights.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center dark:text-slate-400">
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
                        <span className="text-xs text-slate-400 ml-2 dark:text-slate-500">
                          {Math.round(w.weight_kg * 1000)} g
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(w.measured_at)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
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

function correctedMonthsToGA(v: number): { weeks: number; days: number } {
  const totalGaDays = 40 * 7 + v * DAYS_PER_MONTH
  const weeks = Math.floor(totalGaDays / 7)
  const days = Math.round(totalGaDays - weeks * 7)
  if (days === 7) return { weeks: weeks + 1, days: 0 }
  return { weeks, days }
}

function formatXTick(v: number, xMax: number, showAsGA: boolean): string {
  if (showAsGA) {
    const { weeks, days } = correctedMonthsToGA(v)
    return days === 0 ? `${weeks}w` : `${weeks}w${days}d`
  }
  if (xMax <= 1) {
    const weeks = v * (DAYS_PER_MONTH / 7)
    return `${weeks.toFixed(0)}w`
  }
  return v.toFixed(0)
}

// Compact percentile label for inline use, e.g. "<1st", "3rd", "15th".
// Keeps the typical-gain readout short so it doesn't wrap on phones.
function compactPercentile(p: number): string {
  if (p < 1) return '<1st'
  const rounded = p < 5 ? Math.max(1, Math.round(p)) : Math.round(p)
  const lastTwo = rounded % 100
  const lastOne = rounded % 10
  let suffix = 'th'
  if (lastTwo < 11 || lastTwo > 13) {
    if (lastOne === 1) suffix = 'st'
    else if (lastOne === 2) suffix = 'nd'
    else if (lastOne === 3) suffix = 'rd'
  }
  return `${rounded}${suffix}`
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
      <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-700 grid place-items-center dark:bg-emerald-900/30 dark:text-emerald-300">
        <TrendingUp className="h-6 w-6" />
      </div>
    )
  }
  return (
    <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-700 grid place-items-center dark:bg-amber-900/30 dark:text-amber-300">
      <TrendingDown className="h-6 w-6" />
    </div>
  )
}
