import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, startOfDay, subDays } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { listFeedsSince } from '../lib/api'
import type { Baby, FeedEntry } from '../lib/types'

type Range = '7d' | '14d' | '30d'

const RANGE_OPTIONS: { id: Range; label: string; days: number }[] = [
  { id: '7d', label: '7 d', days: 7 },
  { id: '14d', label: '14 d', days: 14 },
  { id: '30d', label: '30 d', days: 30 },
]

interface DayBucket {
  dateISO: string
  label: string
  bottleCount: number
  breastCount: number
  bottleMl: number
  breastMin: number
}

interface HourBucket {
  hour: number
  label: string
  todayFeeds: number
  avgFeeds: number
}

export function FeedingView({ baby }: { baby: Baby }) {
  const [range, setRange] = useState<Range>('14d')
  const [feeds, setFeeds] = useState<FeedEntry[]>([])
  const [loading, setLoading] = useState(true)

  const days = RANGE_OPTIONS.find((r) => r.id === range)!.days

  const reload = useCallback(async () => {
    setLoading(true)
    const since = startOfDay(subDays(new Date(), days - 1)).toISOString()
    const data = await listFeedsSince(baby.id, since)
    setFeeds(data)
    setLoading(false)
  }, [baby.id, days])

  useEffect(() => {
    reload().catch(() => setLoading(false))
  }, [reload])

  // Group feeds by local-day so charts always show one bar per calendar day
  // even on days with zero feeds (helps visualize gaps).
  const dailyData = useMemo<DayBucket[]>(() => {
    const buckets = new Map<string, DayBucket>()
    for (let i = days - 1; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i))
      const dateISO = format(d, 'yyyy-MM-dd')
      buckets.set(dateISO, {
        dateISO,
        label: format(d, days <= 7 ? 'EEE' : 'M/d'),
        bottleCount: 0,
        breastCount: 0,
        bottleMl: 0,
        breastMin: 0,
      })
    }
    for (const f of feeds) {
      const dateISO = format(new Date(f.fed_at), 'yyyy-MM-dd')
      const b = buckets.get(dateISO)
      if (!b) continue
      if (f.type === 'bottle') {
        b.bottleCount += 1
        b.bottleMl += f.amount_ml ?? 0
      } else {
        b.breastCount += 1
        b.breastMin += f.duration_min ?? 0
      }
    }
    return Array.from(buckets.values())
  }, [feeds, days])

  // Today is the last bucket.
  const today = dailyData[dailyData.length - 1]
  const last7 = dailyData.slice(-7)

  // Hour-of-day pattern: today's feed count per hour vs the 7-day average per
  // hour (excluding today). Useful for spotting cluster-feeding windows.
  const hourlyData = useMemo<HourBucket[]>(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    // Bucket all fetched feeds by date+hour.
    const byDayHour = new Map<string, number[]>()
    for (const f of feeds) {
      const d = new Date(f.fed_at)
      const k = format(d, 'yyyy-MM-dd')
      if (!byDayHour.has(k)) byDayHour.set(k, new Array(24).fill(0))
      byDayHour.get(k)![d.getHours()] += 1
    }
    const todayHours = byDayHour.get(todayKey) ?? new Array(24).fill(0)
    const otherDays = Array.from(byDayHour.entries())
      .filter(([k]) => k !== todayKey)
      .slice(-7) // most recent 7 prior days within the fetched range
    const avgHours = new Array(24).fill(0)
    if (otherDays.length > 0) {
      for (const [, hrs] of otherDays) {
        for (let h = 0; h < 24; h++) avgHours[h] += hrs[h]
      }
      for (let h = 0; h < 24; h++) avgHours[h] /= otherDays.length
    }
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: formatHour(h),
      todayFeeds: todayHours[h],
      avgFeeds: +avgHours[h].toFixed(2),
    }))
  }, [feeds])
  const avg = useMemo(() => {
    const totals = last7.reduce(
      (acc, d) => {
        acc.feeds += d.bottleCount + d.breastCount
        acc.bottleMl += d.bottleMl
        acc.breastMin += d.breastMin
        return acc
      },
      { feeds: 0, bottleMl: 0, breastMin: 0 },
    )
    return {
      feeds: totals.feeds / Math.max(last7.length, 1),
      bottleMl: totals.bottleMl / Math.max(last7.length, 1),
      breastMin: totals.breastMin / Math.max(last7.length, 1),
    }
  }, [last7])

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Feeds today"
          value={today ? today.bottleCount + today.breastCount : 0}
          sub={`avg ${avg.feeds.toFixed(1)}/d`}
        />
        <SummaryCard
          label="Bottle today"
          value={`${Math.round(today?.bottleMl ?? 0)} mL`}
          sub={`avg ${Math.round(avg.bottleMl)} mL/d`}
        />
        <SummaryCard
          label="Breast today"
          value={`${Math.round(today?.breastMin ?? 0)} m`}
          sub={`avg ${Math.round(avg.breastMin)} m/d`}
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Hourly pattern · today vs 7-day avg
        </h2>
        <div className="card p-4">
          <div className="h-[200px] -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourlyData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="hour"
                  type="number"
                  domain={[0, 23]}
                  ticks={[0, 4, 8, 12, 16, 20]}
                  tickFormatter={(v) => formatHour(Number(v))}
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v, n) => [
                    typeof v === 'number' ? v.toFixed(v < 1 ? 2 : 1) : v,
                    n,
                  ]}
                  labelFormatter={(l) => formatHour(Number(l))}
                />
                <Legend
                  verticalAlign="top"
                  wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
                />
                <Bar
                  dataKey="todayFeeds"
                  name="Today"
                  fill="#2563eb"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="avgFeeds"
                  name="7-day avg"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-400 text-center mt-1">
            Bars: feeds in each hour today. Line: typical count for that hour
            over the past 7 days.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Daily totals
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
        ) : feeds.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500 text-center">
            No feeds in this range.
          </div>
        ) : (
          <div className="space-y-4">
            <ChartCard title="Bottle intake (mL/day)">
              <BarChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${Math.round(Number(v))} mL`, 'Bottle']}
                  labelFormatter={(l, payload) =>
                    payload?.[0]?.payload?.dateISO ?? l
                  }
                />
                <Bar dataKey="bottleMl" radius={[4, 4, 0, 0]} fill="#2563eb" />
              </BarChart>
            </ChartCard>

            <ChartCard title="Feed mix (count per day)">
              <BarChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(l, payload) =>
                    payload?.[0]?.payload?.dateISO ?? l
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="bottleCount" name="Bottle" stackId="m" fill="#2563eb" radius={[0, 0, 0, 0]} />
                <Bar dataKey="breastCount" name="Breast" stackId="m" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Breast time (min/day)">
              <BarChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [`${Math.round(Number(v))} min`, 'Breast']}
                  labelFormatter={(l, payload) =>
                    payload?.[0]?.payload?.dateISO ?? l
                  }
                />
                <Bar dataKey="breastMin" radius={[4, 4, 0, 0]}>
                  {dailyData.map((d) => (
                    <Cell key={d.dateISO} fill="#f59e0b" />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>
          </div>
        )}
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
              const total = d.bottleCount + d.breastCount
              const breastPct = total > 0 ? (d.breastCount / total) * 100 : 0
              return (
                <div key={d.dateISO} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{d.dateISO}</div>
                    <div className="text-xs text-slate-500">
                      {total} feed{total === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {Math.round(d.bottleMl)} mL bottle · {Math.round(d.breastMin)} min breast
                    {total > 0 && ` · ${Math.round(breastPct)}% breast`}
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
                      <div
                        className="bg-blue-500"
                        style={{
                          width: `${(d.bottleCount / total) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-amber-500"
                        style={{ width: `${breastPct}%` }}
                      />
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
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function formatHour(h: number): string {
  if (h === 0) return '12a'
  if (h === 12) return '12p'
  if (h < 12) return `${h}a`
  return `${h - 12}p`
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        {title}
      </h3>
      <div className="h-[180px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
