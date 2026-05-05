import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, startOfDay, subDays } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { listFeedsSince, listPumpsSince } from '../lib/api'
import type { Baby, FeedEntry, PumpEntry, PumpSide } from '../lib/types'

const DEFAULT_BREAST_ML_PER_MIN = 8

type Range = '7d' | '14d' | '30d'

const RANGE_OPTIONS: { id: Range; label: string; days: number }[] = [
  { id: '7d', label: '7 d', days: 7 },
  { id: '14d', label: '14 d', days: 14 },
  { id: '30d', label: '30 d', days: 30 },
]

interface DayBucket {
  dateISO: string
  label: string
  sessions: number
  totalMl: number
  // Split helps spot supply asymmetry. When the user only logs a single
  // amount for a left/right session, the whole amount goes to that side; for
  // 'both' sessions where the user only logged a combined total, we split it
  // 50/50 so the chart still surfaces lateralized days.
  leftMl: number
  rightMl: number
  totalMin: number
  // Breastfeeding mL equivalent for the day, derived from logged breast feeds:
  //   Σ duration_min × baby.breast_ml_per_min (default 8 mL/min).
  // Stacked on top of the L/R pump bars so we can see total milk output
  // (pumped + nursed) at a glance.
  breastMl: number
  breastMin: number
  breastSessions: number
}

export function PumpingView({ baby }: { baby: Baby }) {
  const [range, setRange] = useState<Range>('14d')
  const [pumps, setPumps] = useState<PumpEntry[]>([])
  const [feeds, setFeeds] = useState<FeedEntry[]>([])
  const [loading, setLoading] = useState(true)

  const days = RANGE_OPTIONS.find((r) => r.id === range)!.days
  const breastFactor = baby.breast_ml_per_min ?? DEFAULT_BREAST_ML_PER_MIN

  const reload = useCallback(async () => {
    setLoading(true)
    const since = startOfDay(subDays(new Date(), days - 1)).toISOString()
    const [pumpRows, feedRows] = await Promise.all([
      listPumpsSince(baby.id, since),
      listFeedsSince(baby.id, since),
    ])
    setPumps(pumpRows)
    setFeeds(feedRows)
    setLoading(false)
  }, [baby.id, days])

  useEffect(() => {
    reload().catch(() => setLoading(false))
  }, [reload])

  const dailyData = useMemo<DayBucket[]>(() => {
    const buckets = new Map<string, DayBucket>()
    for (let i = days - 1; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i))
      const dateISO = format(d, 'yyyy-MM-dd')
      buckets.set(dateISO, {
        dateISO,
        label: format(d, days <= 7 ? 'EEE' : 'M/d'),
        sessions: 0,
        totalMl: 0,
        leftMl: 0,
        rightMl: 0,
        totalMin: 0,
        breastMl: 0,
        breastMin: 0,
        breastSessions: 0,
      })
    }
    for (const p of pumps) {
      const dateISO = format(new Date(p.pumped_at), 'yyyy-MM-dd')
      const b = buckets.get(dateISO)
      if (!b) continue
      b.sessions += 1
      const ml = p.amount_ml ?? 0
      b.totalMl += ml
      b.totalMin += p.duration_min ?? 0
      if (p.side === 'left') {
        b.leftMl += ml
      } else if (p.side === 'right') {
        b.rightMl += ml
      } else if (p.left_ml != null || p.right_ml != null) {
        // Both, with per-side amounts logged: use them as-is so the chart
        // reflects the actual asymmetry rather than a 50/50 estimate.
        b.leftMl += p.left_ml ?? 0
        b.rightMl += p.right_ml ?? 0
      } else {
        // Both, no per-side detail: split the combined amount 50/50 just so
        // the bar still renders.
        b.leftMl += ml / 2
        b.rightMl += ml / 2
      }
    }
    for (const f of feeds) {
      if (f.type !== 'breast') continue
      const dateISO = format(new Date(f.fed_at), 'yyyy-MM-dd')
      const b = buckets.get(dateISO)
      if (!b) continue
      const min = f.duration_min ?? 0
      b.breastMin += min
      b.breastMl += min * breastFactor
      b.breastSessions += 1
    }
    return Array.from(buckets.values())
  }, [pumps, feeds, days, breastFactor])

  const today = dailyData[dailyData.length - 1]

  // Averages cover the selected chart range, excluding today (still in
  // progress) so a half-finished day doesn't deflate the running average.
  const avg = useMemo(() => {
    const prior = dailyData.slice(0, -1)
    const totals = prior.reduce(
      (acc, d) => {
        acc.sessions += d.sessions
        acc.totalMl += d.totalMl
        acc.totalMin += d.totalMin
        return acc
      },
      { sessions: 0, totalMl: 0, totalMin: 0 },
    )
    const n = Math.max(prior.length, 1)
    return {
      sessions: totals.sessions / n,
      totalMl: totals.totalMl / n,
      totalMin: totals.totalMin / n,
      days: prior.length,
    }
  }, [dailyData])

  // Past 24h timeline scatter
  const last24h = useMemo(() => {
    const now = Date.now()
    const cutoff = now - 24 * 3600 * 1000
    const out: PumpEvent[] = []
    for (const p of pumps) {
      const t = new Date(p.pumped_at).getTime()
      if (t < cutoff || t > now) continue
      out.push({
        id: p.id,
        hoursAgo: (t - now) / (3600 * 1000),
        iso: p.pumped_at,
        side: p.side,
        amountMl: p.amount_ml,
        durationMin: p.duration_min,
        y: 0,
      })
    }
    return out
  }, [pumps])

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Sessions today"
          value={today?.sessions ?? 0}
          sub={`${avg.sessions.toFixed(1)}/d · ${avg.days}d avg`}
        />
        <SummaryCard
          label="Output today"
          value={`${Math.round(today?.totalMl ?? 0)} mL`}
          sub={`${Math.round(avg.totalMl)} mL/d · ${avg.days}d avg`}
        />
        <SummaryCard
          label="Time today"
          value={`${Math.round(today?.totalMin ?? 0)} m`}
          sub={`${Math.round(avg.totalMin)} m/d · ${avg.days}d avg`}
        />
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Daily output
          </h2>
          <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 font-medium ${
                  range === r.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="card p-6 text-sm text-slate-500 text-center">Loading…</div>
        ) : pumps.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500 text-center">
            No pumps logged in this range.
          </div>
        ) : (
          <div className="space-y-4">
            <ChartCard
              title="Volume per day (mL · L vs R)"
              subtitle={`Grey = breastfed (est. @ ${breastFactor} mL/min)`}
            >
              <BarChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} unit=" mL" width={56} />
                <Tooltip
                  formatter={(v, n) => [`${Math.round(Number(v))} mL`, n]}
                  labelFormatter={(_l, payload) =>
                    payload?.[0]?.payload?.dateISO ?? ''
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="leftMl" name="Left" stackId="lr" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                <Bar dataKey="rightMl" name="Right" stackId="lr" fill="#14b8a6" radius={[0, 0, 0, 0]} />
                <Bar
                  dataKey="breastMl"
                  name="Breast (est)"
                  stackId="lr"
                  fill="#cbd5e1"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartCard>

            <ChartCard title="Sessions per day" subtitle="Grey = breastfeeds">
              <BarChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(_l, payload) =>
                    payload?.[0]?.payload?.dateISO ?? ''
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="sessions"
                  name="Pumps"
                  stackId="s"
                  fill="#14b8a6"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="breastSessions"
                  name="Breastfeeds"
                  stackId="s"
                  fill="#cbd5e1"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartCard>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Past 24 hours · pump timeline
        </h2>
        <div className="card p-4">
          <div className="h-[120px] -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  dataKey="hoursAgo"
                  domain={[-24, 0]}
                  ticks={[-24, -18, -12, -6, 0]}
                  tickFormatter={(h) => formatTickFromHoursAgo(Number(h))}
                  tick={{ fontSize: 11 }}
                  allowDataOverflow
                />
                <YAxis type="number" dataKey="y" hide domain={[-1, 1]} />
                <Tooltip
                  cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
                  content={<PumpEventTooltip />}
                />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 4 }} />
                <Scatter
                  name="Left"
                  data={last24h.filter((e) => e.side === 'left')}
                  shape={(props: object) => (
                    <PumpDot {...(props as DotProps)} color="#0ea5e9" />
                  )}
                />
                <Scatter
                  name="Right"
                  data={last24h.filter((e) => e.side === 'right')}
                  shape={(props: object) => (
                    <PumpDot {...(props as DotProps)} color="#14b8a6" />
                  )}
                />
                <Scatter
                  name="Both"
                  data={last24h.filter((e) => e.side === 'both')}
                  shape={(props: object) => (
                    <PumpDot {...(props as DotProps)} color="#0d9488" />
                  )}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-400 text-center mt-1">
            {last24h.length === 0
              ? 'No pumps in the past 24 hours.'
              : `${last24h.length} session${last24h.length === 1 ? '' : 's'} · larger / darker = more volume`}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Daily breakdown
        </h2>
        <div className="card divide-y divide-slate-100">
          {dailyData
            .slice()
            .reverse()
            .map((d) => {
              const total = d.totalMl
              const lPct = total > 0 ? (d.leftMl / total) * 100 : 0
              const rPct = total > 0 ? (d.rightMl / total) * 100 : 0
              return (
                <div key={d.dateISO} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{d.dateISO}</div>
                    <div className="text-xs text-slate-500 shrink-0">
                      {d.sessions} session{d.sessions === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {Math.round(d.totalMl)} mL · {Math.round(d.totalMin)} min
                    {total > 0 &&
                      ` · L ${Math.round(d.leftMl)} / R ${Math.round(d.rightMl)} mL`}
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
                      <div className="bg-sky-500" style={{ width: `${lPct}%` }} />
                      <div className="bg-teal-500" style={{ width: `${rPct}%` }} />
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string
  value: number | string
  sub?: string
}) {
  return (
    <div className="card p-3">
      <div className="text-xs text-slate-500 truncate">{label}</div>
      <div className="text-base font-semibold mt-0.5 truncate">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactElement
}) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {title}
        </h3>
        {subtitle && (
          <span className="text-[10px] text-slate-400 truncate">{subtitle}</span>
        )}
      </div>
      <div className="h-[180px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface PumpEvent {
  id: string
  hoursAgo: number
  iso: string
  side: PumpSide
  amountMl: number | null
  durationMin: number | null
  y: number
}

interface DotProps {
  cx?: number
  cy?: number
  payload?: PumpEvent
}

const MAX_REF_ML = 150

function PumpDot({ cx, cy, payload, color }: DotProps & { color: string }) {
  if (cx == null || cy == null || !payload) return null
  const v = Math.max(0, Math.min(payload.amountMl ?? 0, MAX_REF_ML))
  const t = MAX_REF_ML > 0 ? v / MAX_REF_ML : 0
  const r = 4 + t * 6
  const fillOpacity = 0.4 + t * 0.55
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      fillOpacity={fillOpacity}
      stroke={color}
      strokeOpacity={0.9}
      strokeWidth={0.75}
    />
  )
}

function PumpEventTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload?: PumpEvent }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  if (!p) return null
  const when = new Date(p.iso)
  const clock = format(when, 'h:mm a')
  return (
    <div className="rounded-md bg-white shadow-md border border-slate-200 px-2.5 py-1.5 text-xs">
      <div className="font-medium capitalize">{p.side} · {clock}</div>
      {p.amountMl != null && (
        <div className="text-slate-500">{Math.round(p.amountMl)} mL</div>
      )}
      {p.durationMin != null && (
        <div className="text-slate-500">{p.durationMin} min</div>
      )}
    </div>
  )
}

function formatTickFromHoursAgo(h: number): string {
  if (h === 0) return 'now'
  const t = new Date(Date.now() + h * 3600 * 1000)
  const hour = t.getHours()
  if (hour === 0) return '12a'
  if (hour === 12) return '12p'
  if (hour < 12) return `${hour}a`
  return `${hour - 12}p`
}
