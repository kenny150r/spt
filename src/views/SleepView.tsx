import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, addHours, format, startOfDay, subDays } from 'date-fns'
import { Moon, Plus } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Sheet } from '../components/Sheet'
import { AddSleepForm } from '../components/forms/AddSleepForm'
import { listSleepsSince } from '../lib/api'
import type { Baby, SleepEntry } from '../lib/types'
import { formatDurationMin, timeSinceShort } from '../lib/format'
import { useChartTheme } from '../lib/chartTheme'
import { useIsDark } from '../lib/theme'

type Range = '7d' | '14d' | '30d'

const RANGE_OPTIONS: { id: Range; label: string; days: number }[] = [
  { id: '7d', label: '7 d', days: 7 },
  { id: '14d', label: '14 d', days: 14 },
  { id: '30d', label: '30 d', days: 30 },
]

// "Night" window for the day/night split. 7pm–7am is a reasonable default
// for an infant; everything else counts as daytime sleep (naps).
const NIGHT_START_HOUR = 19
const NIGHT_END_HOUR = 7

interface DayBucket {
  dateISO: string
  label: string
  totalMin: number
  dayMin: number
  nightMin: number
  sessions: number
}

function isNight(d: Date): boolean {
  const h = d.getHours()
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR
}

// Smallest day/night/midnight boundary strictly after `d`. Used to walk a
// sleep session in segments so its minutes land in the right calendar day
// AND the right day/night bucket, even when it crosses those lines.
function nextBoundary(d: Date): number {
  const c = d.getTime()
  const day0 = startOfDay(d)
  const candidates = [
    addHours(day0, NIGHT_END_HOUR).getTime(), // 07:00
    addHours(day0, NIGHT_START_HOUR).getTime(), // 19:00
    addDays(day0, 1).getTime(), // next midnight
  ].filter((t) => t > c)
  return Math.min(...candidates)
}

export function SleepView({ baby }: { baby: Baby }) {
  const t = useChartTheme()
  const isDark = useIsDark()
  const [range, setRange] = useState<Range>('14d')
  const [sleeps, setSleeps] = useState<SleepEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sheet, setSheet] = useState<{ open: boolean; entry?: SleepEntry }>({
    open: false,
  })
  // Minute tick so an ongoing sleep's "so far" duration keeps advancing.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const days = RANGE_OPTIONS.find((r) => r.id === range)!.days

  // Indigo shades for the night/day stacked bars (chartTheme has no indigo).
  const nightFill = isDark ? '#6366f1' : '#4f46e5' // indigo-500 / indigo-600
  const dayFill = isDark ? '#818cf8' : '#a5b4fc' // indigo-400 / indigo-300

  const reload = useCallback(async () => {
    setLoading(true)
    const since = startOfDay(subDays(new Date(), days - 1)).toISOString()
    const data = await listSleepsSince(baby.id, since)
    setSleeps(data)
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
        totalMin: 0,
        dayMin: 0,
        nightMin: 0,
        sessions: 0,
      })
    }
    const now = Date.now()
    for (const s of sleeps) {
      const start = new Date(s.started_at)
      const end = s.ended_at ? new Date(s.ended_at) : new Date(now)
      // Count the session on the day it started.
      const startBucket = buckets.get(format(start, 'yyyy-MM-dd'))
      if (startBucket) startBucket.sessions += 1
      // Distribute minutes across calendar days + day/night windows.
      let cursor = start.getTime()
      const endMs = end.getTime()
      let guard = 0
      while (cursor < endMs && guard++ < 400) {
        const segEnd = Math.min(endMs, nextBoundary(new Date(cursor)))
        const minutes = (segEnd - cursor) / 60000
        const b = buckets.get(format(new Date(cursor), 'yyyy-MM-dd'))
        if (b) {
          b.totalMin += minutes
          if (isNight(new Date(cursor))) b.nightMin += minutes
          else b.dayMin += minutes
        }
        cursor = segEnd
      }
    }
    return Array.from(buckets.values())
  }, [sleeps, days])

  const chartData = useMemo(
    () =>
      dailyData.map((d) => ({
        label: d.label,
        dateISO: d.dateISO,
        nightH: +(d.nightMin / 60).toFixed(2),
        dayH: +(d.dayMin / 60).toFixed(2),
        totalH: +(d.totalMin / 60).toFixed(2),
        sessions: d.sessions,
      })),
    [dailyData],
  )

  const today = dailyData[dailyData.length - 1]
  // Average per completed day (exclude today, which is partial) so the
  // number isn't dragged down by a day still in progress.
  const completed = dailyData.slice(0, -1)
  const avgMin = completed.length
    ? completed.reduce((a, d) => a + d.totalMin, 0) / completed.length
    : 0
  const avgSessions = completed.length
    ? completed.reduce((a, d) => a + d.sessions, 0) / completed.length
    : 0

  const activeSleep = useMemo(
    () => sleeps.find((s) => s.ended_at == null) ?? null,
    [sleeps],
  )
  const lastEnded = useMemo(() => {
    for (let i = sleeps.length - 1; i >= 0; i--) {
      if (sleeps[i].ended_at != null) return sleeps[i]
    }
    return null
  }, [sleeps])

  // Longest single stretch in the fetched range (ongoing counts up to now).
  const longestStretchMin = useMemo(() => {
    let max = 0
    const now = Date.now()
    for (const s of sleeps) {
      const start = new Date(s.started_at).getTime()
      const end = s.ended_at ? new Date(s.ended_at).getTime() : now
      max = Math.max(max, (end - start) / 60000)
    }
    return max
  }, [sleeps])

  const close = () => setSheet({ open: false })

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3">
        <SummaryCard
          label={activeSleep ? 'Asleep now' : 'Last slept'}
          value={
            activeSleep
              ? formatDurationMin(
                  (Date.now() - new Date(activeSleep.started_at).getTime()) / 60000,
                )
              : lastEnded?.ended_at
                ? timeSinceShort(lastEnded.ended_at)
                : '—'
          }
          tone={activeSleep ? 'indigo' : 'default'}
        />
        <SummaryCard
          label="Today total"
          value={today ? formatDurationMin(today.totalMin) : '—'}
          sub={`avg ${formatDurationMin(avgMin)}/d`}
        />
        <SummaryCard
          label="Longest stretch"
          value={longestStretchMin > 0 ? formatDurationMin(longestStretchMin) : '—'}
          sub="in range"
        />
        <SummaryCard
          label="Sessions today"
          value={today?.sessions ?? 0}
          sub={`avg ${avgSessions.toFixed(1)}/d`}
        />
      </section>

      <section className="card p-3 flex items-center justify-between text-sm">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {activeSleep ? 'Currently' : 'Status'}
          </div>
          <div className="font-medium">
            {activeSleep
              ? `Asleep since ${format(new Date(activeSleep.started_at), 'h:mm a')}`
              : 'Awake'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSheet({ open: true, entry: activeSleep ?? undefined })}
          className={activeSleep ? 'btn-primary' : 'btn-secondary'}
        >
          {activeSleep ? <Moon className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {activeSleep ? 'Wake up' : 'Log sleep'}
        </button>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400">
            Sleep per day
          </h2>
          <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs dark:border-slate-700">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 font-medium ${
                  range === r.id
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="card p-6 text-sm text-slate-500 text-center dark:text-slate-400">Loading…</div>
        ) : sleeps.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500 text-center dark:text-slate-400">
            No sleep logged in this range.
          </div>
        ) : (
          <div className="space-y-4">
            <ChartCard title="Hours asleep per day (night / day)">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: t.axis }} stroke={t.axis} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: t.axis }} stroke={t.axis} allowDecimals />
                <Tooltip
                  contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, color: t.tooltipText }}
                  labelStyle={{ color: t.tooltipText }}
                  formatter={(v, name) => [`${Number(v).toFixed(1)} h`, name]}
                  labelFormatter={(l, payload) => payload?.[0]?.payload?.dateISO ?? l}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: t.legend }} />
                <Bar dataKey="nightH" name="Night" stackId="s" fill={nightFill} />
                <Bar dataKey="dayH" name="Day" stackId="s" fill={dayFill} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Sleep sessions per day">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: t.axis }} stroke={t.axis} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: t.axis }} stroke={t.axis} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, color: t.tooltipText }}
                  labelStyle={{ color: t.tooltipText }}
                  formatter={(v) => [`${v}`, 'Sessions']}
                  labelFormatter={(l, payload) => payload?.[0]?.payload?.dateISO ?? l}
                />
                <Bar dataKey="sessions" radius={[4, 4, 0, 0]} fill={nightFill} />
              </BarChart>
            </ChartCard>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 dark:text-slate-400">
          Daily breakdown
        </h2>
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {dailyData
            .slice()
            .reverse()
            .map((d) => {
              const total = d.totalMin
              return (
                <div key={d.dateISO} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{d.dateISO}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {total > 0 ? formatDurationMin(total) : '—'}
                      {d.sessions > 0 ? ` · ${d.sessions} session${d.sessions === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden flex dark:bg-slate-800">
                      {d.nightMin > 0 && (
                        <div style={{ width: `${(d.nightMin / total) * 100}%`, background: nightFill }} />
                      )}
                      {d.dayMin > 0 && (
                        <div style={{ width: `${(d.dayMin / total) * 100}%`, background: dayFill }} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </section>

      <Sheet
        open={sheet.open}
        onClose={close}
        title={
          sheet.entry
            ? sheet.entry.ended_at == null
              ? 'End sleep'
              : 'Edit sleep'
            : 'Log sleep'
        }
      >
        {sheet.open && (
          <AddSleepForm
            key={sheet.entry?.id ?? 'new-sleep'}
            babyId={baby.id}
            entry={sheet.entry}
            onSaved={() => {
              close()
              reload()
            }}
            onCancel={close}
          />
        )}
      </Sheet>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: number | string
  sub?: string
  tone?: 'default' | 'indigo'
}) {
  return (
    <div
      className={`card p-3 ${
        tone === 'indigo'
          ? 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-800/40 dark:bg-indigo-900/20'
          : ''
      }`}
    >
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={`text-base font-semibold mt-0.5 ${
          tone === 'indigo' ? 'text-indigo-800 dark:text-indigo-300' : ''
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5 dark:text-slate-500">{sub}</div>}
    </div>
  )
}

function ChartCard({
  title,
  children,
}: {
  title: string
  children: React.ReactElement
}) {
  return (
    <div className="card p-4">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 dark:text-slate-400">
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
