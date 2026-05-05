import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, startOfDay, subDays } from 'date-fns'
import { Plus } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Sheet } from '../components/Sheet'
import { AddDiaperForm } from '../components/forms/AddDiaperForm'
import { listDiapersSince } from '../lib/api'
import type { Baby, DiaperEntry, DiaperType } from '../lib/types'
import { timeSinceShort } from '../lib/format'

type Range = '7d' | '14d' | '30d'

const RANGE_OPTIONS: { id: Range; label: string; days: number }[] = [
  { id: '7d', label: '7 d', days: 7 },
  { id: '14d', label: '14 d', days: 14 },
  { id: '30d', label: '30 d', days: 30 },
]

// Pediatric guideline: roughly 6+ wet diapers per day after the first week
// is the rule of thumb for adequate hydration. Configurable target line.
const WET_TARGET = 6

interface DayBucket {
  dateISO: string
  label: string
  pee: number
  poop: number
  both: number
  wet: number // counts pee + both
  dirty: number // counts poop + both
}

export function DiapersView({ baby }: { baby: Baby }) {
  const [range, setRange] = useState<Range>('14d')
  const [diapers, setDiapers] = useState<DiaperEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sheet, setSheet] = useState<{ open: boolean; type: DiaperType }>({
    open: false,
    type: 'pee',
  })

  const days = RANGE_OPTIONS.find((r) => r.id === range)!.days

  const reload = useCallback(async () => {
    setLoading(true)
    const since = startOfDay(subDays(new Date(), days - 1)).toISOString()
    const data = await listDiapersSince(baby.id, since)
    setDiapers(data)
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
        pee: 0,
        poop: 0,
        both: 0,
        wet: 0,
        dirty: 0,
      })
    }
    for (const e of diapers) {
      const dateISO = format(new Date(e.occurred_at), 'yyyy-MM-dd')
      const b = buckets.get(dateISO)
      if (!b) continue
      if (e.type === 'pee') {
        b.pee += 1
        b.wet += 1
      } else if (e.type === 'poop') {
        b.poop += 1
        b.dirty += 1
      } else {
        b.both += 1
        b.wet += 1
        b.dirty += 1
      }
    }
    return Array.from(buckets.values())
  }, [diapers, days])

  const today = dailyData[dailyData.length - 1]
  const last7 = dailyData.slice(-7)
  const avg7 = useMemo(() => {
    const totals = last7.reduce(
      (acc, d) => {
        acc.wet += d.wet
        acc.dirty += d.dirty
        return acc
      },
      { wet: 0, dirty: 0 },
    )
    return {
      wet: totals.wet / Math.max(last7.length, 1),
      dirty: totals.dirty / Math.max(last7.length, 1),
    }
  }, [last7])

  // "Last wet" / "Last dirty" use the most recent matching diaper across the
  // entire fetched range.
  const lastWet = useMemo(() => {
    for (let i = diapers.length - 1; i >= 0; i--) {
      if (diapers[i].type === 'pee' || diapers[i].type === 'both')
        return diapers[i]
    }
    return null
  }, [diapers])
  const lastDirty = useMemo(() => {
    for (let i = diapers.length - 1; i >= 0; i--) {
      if (diapers[i].type === 'poop' || diapers[i].type === 'both')
        return diapers[i]
    }
    return null
  }, [diapers])

  // Longest gap between wet diapers in the visible range (a hydration proxy).
  const longestDryGapHours = useMemo(() => {
    const wetTimes = diapers
      .filter((d) => d.type === 'pee' || d.type === 'both')
      .map((d) => new Date(d.occurred_at).getTime())
    if (wetTimes.length < 2) return null
    let max = 0
    for (let i = 1; i < wetTimes.length; i++) {
      const gap = wetTimes[i] - wetTimes[i - 1]
      if (gap > max) max = gap
    }
    return max / (1000 * 60 * 60)
  }, [diapers])

  const close = () => setSheet({ open: false, type: 'pee' })

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3">
        <SummaryCard
          label="Last wet"
          value={lastWet ? timeSinceShort(lastWet.occurred_at) : '—'}
          tone={
            lastWet && hoursSince(lastWet.occurred_at) > 6 ? 'amber' : 'default'
          }
        />
        <SummaryCard
          label="Last dirty"
          value={lastDirty ? timeSinceShort(lastDirty.occurred_at) : '—'}
        />
        <SummaryCard
          label="Today wet"
          value={today?.wet ?? 0}
          sub={`avg ${avg7.wet.toFixed(1)}/d`}
          tone={
            today && today.wet > 0 && today.wet < WET_TARGET ? 'amber' : 'default'
          }
        />
        <SummaryCard
          label="Today dirty"
          value={today?.dirty ?? 0}
          sub={`avg ${avg7.dirty.toFixed(1)}/d`}
        />
      </section>

      <section className="card p-3 flex items-center justify-between text-sm">
        <div>
          <div className="text-xs text-slate-500">Longest dry gap (in range)</div>
          <div className="font-medium">
            {longestDryGapHours != null
              ? `${longestDryGapHours.toFixed(1)} h`
              : '—'}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSheet({ open: true, type: 'pee' })}
            className="btn-secondary"
          >
            <Plus className="h-4 w-4" />
            Pee
          </button>
          <button
            type="button"
            onClick={() => setSheet({ open: true, type: 'poop' })}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Poop
          </button>
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
        ) : diapers.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500 text-center">
            No diapers in this range.
          </div>
        ) : (
          <div className="space-y-4">
            <ChartCard title="Wet diapers per day">
              <BarChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v) => [`${v}`, 'Wet']}
                  labelFormatter={(l, payload) =>
                    payload?.[0]?.payload?.dateISO ?? l
                  }
                />
                <ReferenceLine
                  y={WET_TARGET}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  label={{
                    value: `target ${WET_TARGET}`,
                    position: 'right',
                    fontSize: 10,
                    fill: '#047857',
                  }}
                />
                <Bar dataKey="wet" radius={[4, 4, 0, 0]} fill="#0ea5e9" />
              </BarChart>
            </ChartCard>

            <ChartCard title="Diaper mix per day">
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
                <Bar dataKey="pee" name="Pee" stackId="d" fill="#0ea5e9" />
                <Bar dataKey="poop" name="Poop" stackId="d" fill="#10b981" />
                <Bar dataKey="both" name="Both" stackId="d" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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
              const total = d.pee + d.poop + d.both
              const wetTone =
                total > 0 && d.wet < WET_TARGET ? 'text-amber-700' : 'text-slate-500'
              return (
                <div key={d.dateISO} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{d.dateISO}</div>
                    <div className={`text-xs ${wetTone}`}>
                      {d.wet} wet · {d.dirty} dirty
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
                      {d.pee > 0 && (
                        <div className="bg-sky-500" style={{ width: `${(d.pee / total) * 100}%` }} />
                      )}
                      {d.both > 0 && (
                        <div className="bg-amber-500" style={{ width: `${(d.both / total) * 100}%` }} />
                      )}
                      {d.poop > 0 && (
                        <div className="bg-emerald-500" style={{ width: `${(d.poop / total) * 100}%` }} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </section>

      <Sheet open={sheet.open} onClose={close} title="Log a diaper">
        {sheet.open && (
          <AddDiaperForm
            babyId={baby.id}
            initialType={sheet.type}
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

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
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
  tone?: 'default' | 'amber'
}) {
  return (
    <div
      className={`card p-3 ${
        tone === 'amber' ? 'border-amber-200 bg-amber-50/40' : ''
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`text-base font-semibold mt-0.5 ${
          tone === 'amber' ? 'text-amber-800' : ''
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
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
