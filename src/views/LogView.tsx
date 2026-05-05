import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Baby as BabyIcon,
  Droplet,
  Milk,
  Pill,
  Scale,
  Trash2,
  Utensils,
  Wind,
} from 'lucide-react'
import { format, startOfDay } from 'date-fns'
import { Sheet } from '../components/Sheet'
import { AddFeedForm } from '../components/forms/AddFeedForm'
import { AddDiaperForm } from '../components/forms/AddDiaperForm'
import { AddWeightForm } from '../components/forms/AddWeightForm'
import { AddPumpForm } from '../components/forms/AddPumpForm'
import { AddSupplementForm } from '../components/forms/AddSupplementForm'
import {
  deleteEntry,
  listDiapers,
  listFeeds,
  listPumps,
  listSupplementsSince,
  listWeights,
} from '../lib/api'
import type {
  AnyEntry,
  Baby,
  DiaperEntry,
  FeedEntry,
  PumpEntry,
  SupplementEntry,
  WeightEntry,
} from '../lib/types'
import { formatDateTime, formatWeight, timeSince, timeSinceShort } from '../lib/format'

type SheetState =
  | { kind: 'closed' }
  | { kind: 'feed' }
  | { kind: 'diaper' }
  | { kind: 'weight' }
  | { kind: 'pump' }
  | { kind: 'supplement' }

export function LogView({ baby }: { baby: Baby }) {
  const [sheet, setSheet] = useState<SheetState>({ kind: 'closed' })
  const [feeds, setFeeds] = useState<FeedEntry[]>([])
  const [diapers, setDiapers] = useState<DiaperEntry[]>([])
  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [pumps, setPumps] = useState<PumpEntry[]>([])
  const [supplements, setSupplements] = useState<SupplementEntry[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const since14d = startOfDay(new Date(Date.now() - 14 * 24 * 3600 * 1000)).toISOString()
    const [f, d, w, p, s] = await Promise.all([
      listFeeds(baby.id, 25),
      listDiapers(baby.id, 25),
      listWeights(baby.id),
      listPumps(baby.id, 25),
      listSupplementsSince(baby.id, since14d),
    ])
    setFeeds(f)
    setDiapers(d)
    setWeights(w.slice().reverse())
    setPumps(p)
    setSupplements(s.slice().reverse())
    setLoading(false)
  }, [baby.id])

  useEffect(() => {
    setLoading(true)
    reload().catch(() => setLoading(false))
  }, [reload])

  const merged: AnyEntry[] = useMemo(() => {
    const items: AnyEntry[] = [
      ...feeds.map((e) => ({ kind: 'feed' as const, ...e })),
      ...diapers.map((e) => ({ kind: 'diaper' as const, ...e })),
      ...weights.map((e) => ({ kind: 'weight' as const, ...e })),
      ...pumps.map((e) => ({ kind: 'pump' as const, ...e })),
      ...supplements.map((e) => ({ kind: 'supplement' as const, ...e })),
    ]
    items.sort((a, b) => entryTime(b).localeCompare(entryTime(a)))
    return items.slice(0, 30)
  }, [feeds, diapers, weights, pumps, supplements])

  const lastFeed = feeds[0]
  const lastDiaper = diapers[0]
  // `weights` is reversed in `reload()` so [0] is the most recently MEASURED weight.
  const lastWeight = weights[0]

  // Today's once-daily supplement status. Reads primarily from the dedicated
  // supplements table, but also folds in feeds.iron / feeds.multivitamin so
  // legacy entries (logged before the dedicated quick-log existed) still
  // count.
  const supplementsToday = useMemo(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    let multivitamin = false
    let iron = false
    for (const s of supplements) {
      if (format(new Date(s.given_at), 'yyyy-MM-dd') !== todayKey) continue
      if (s.multivitamin) multivitamin = true
      if (s.iron) iron = true
    }
    for (const f of feeds) {
      if (format(new Date(f.fed_at), 'yyyy-MM-dd') !== todayKey) continue
      if (f.multivitamin) multivitamin = true
      if (f.iron) iron = true
    }
    return { multivitamin, iron }
  }, [supplements, feeds])

  const close = () => setSheet({ kind: 'closed' })
  const onSaved = () => {
    close()
    reload()
  }

  async function onDelete(item: AnyEntry) {
    if (!confirm('Delete this entry?')) return
    const table =
      item.kind === 'feed'
        ? 'feeds'
        : item.kind === 'diaper'
          ? 'diapers'
          : item.kind === 'weight'
            ? 'weights'
            : item.kind === 'pump'
              ? 'pumps'
              : 'supplements'
    await deleteEntry(table, item.id)
    reload()
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Last feed"
          value={lastFeed ? timeSinceShort(lastFeed.fed_at) : '—'}
          icon={<Utensils className="h-4 w-4" />}
        />
        <SummaryCard
          label="Last diaper"
          value={lastDiaper ? timeSinceShort(lastDiaper.occurred_at) : '—'}
          icon={<Droplet className="h-4 w-4" />}
        />
        <SummaryCard
          label="Last weight"
          value={lastWeight ? formatWeight(lastWeight.weight_kg, 'imperial') : '—'}
          icon={<Scale className="h-4 w-4" />}
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Quick log
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <BigButton
            label="Feed"
            sub="bottle or breast"
            color="bg-amber-50 text-amber-900 border-amber-100"
            icon={<Milk className="h-5 w-5" />}
            onClick={() => setSheet({ kind: 'feed' })}
          />
          <BigButton
            label="Diaper"
            sub="pee, poop, or both"
            color="bg-sky-50 text-sky-900 border-sky-100"
            icon={<Droplet className="h-5 w-5" />}
            onClick={() => setSheet({ kind: 'diaper' })}
          />
          <BigButton
            label="Pump"
            sub="left / right output"
            color="bg-teal-50 text-teal-900 border-teal-100"
            icon={<Wind className="h-5 w-5" />}
            onClick={() => setSheet({ kind: 'pump' })}
          />
          <BigButton
            label="Weight"
            sub="growth check"
            color="bg-violet-50 text-violet-900 border-violet-100"
            icon={<Scale className="h-5 w-5" />}
            onClick={() => setSheet({ kind: 'weight' })}
          />
          <SupplementsButton
            given={supplementsToday}
            onClick={() => setSheet({ kind: 'supplement' })}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Recent activity
        </h2>
        <div className="card divide-y divide-slate-100">
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">Loading…</p>
          ) : merged.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">
              No entries yet. Tap a quick log button above to get started.
            </p>
          ) : (
            merged.map((item) => (
              <ActivityRow key={`${item.kind}:${item.id}`} item={item} onDelete={() => onDelete(item)} />
            ))
          )}
        </div>
      </section>

      <Sheet open={sheet.kind === 'feed'} onClose={close} title="Log a feed">
        <AddFeedForm babyId={baby.id} onSaved={onSaved} onCancel={close} />
      </Sheet>
      <Sheet open={sheet.kind === 'diaper'} onClose={close} title="Log a diaper">
        <AddDiaperForm babyId={baby.id} initialType="pee" onSaved={onSaved} onCancel={close} />
      </Sheet>
      <Sheet open={sheet.kind === 'weight'} onClose={close} title="Log a weight">
        <AddWeightForm babyId={baby.id} onSaved={onSaved} onCancel={close} />
      </Sheet>
      <Sheet open={sheet.kind === 'pump'} onClose={close} title="Log a pump">
        <AddPumpForm babyId={baby.id} onSaved={onSaved} onCancel={close} />
      </Sheet>
      <Sheet open={sheet.kind === 'supplement'} onClose={close} title="Mark supplements given">
        <AddSupplementForm
          babyId={baby.id}
          givenToday={supplementsToday}
          onSaved={onSaved}
          onCancel={close}
        />
      </Sheet>
    </div>
  )
}

function entryTime(item: AnyEntry): string {
  switch (item.kind) {
    case 'feed':
      return item.fed_at
    case 'diaper':
      return item.occurred_at
    case 'weight':
      return item.measured_at
    case 'pump':
      return item.pumped_at
    case 'supplement':
      return item.given_at
  }
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="card p-3">
      <div className="text-xs text-slate-500 flex items-center gap-1.5">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-base font-semibold mt-1 truncate">{value}</div>
    </div>
  )
}

function BigButton({
  label,
  sub,
  color,
  icon,
  onClick,
}: {
  label: string
  sub: string
  color: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-2xl border text-left flex items-start gap-3 active:scale-[0.99] transition-transform ${color}`}
    >
      <div className="h-10 w-10 rounded-xl bg-white/70 grid place-items-center">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-semibold leading-tight">{label}</div>
        <div className="text-xs opacity-75">{sub}</div>
      </div>
    </button>
  )
}

// Special-case Quick-Log button for daily supplements: shows the two
// once-daily supplements with their current status (✓ given today / pending),
// each on its own clearly-labeled line so the abbreviations are unambiguous.
function SupplementsButton({
  given,
  onClick,
}: {
  given: { multivitamin: boolean; iron: boolean }
  onClick: () => void
}) {
  const allDone = given.multivitamin && given.iron
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-2xl border text-left flex items-start gap-3 active:scale-[0.99] transition-transform col-span-2 ${
        allDone
          ? 'bg-emerald-50 text-emerald-900 border-emerald-100'
          : 'bg-rose-50 text-rose-900 border-rose-100'
      }`}
      aria-label="Log supplements"
    >
      <div className="h-10 w-10 rounded-xl bg-white/70 grid place-items-center">
        <Pill className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold leading-tight">Supplements</div>
          <div className="text-[11px] opacity-75">
            {allDone ? 'all done today' : 'tap to log'}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5 text-xs">
          <SupplementLine name="Multivitamin" given={given.multivitamin} />
          <SupplementLine name="Iron" given={given.iron} />
        </div>
      </div>
    </button>
  )
}

function SupplementLine({ name, given }: { name: string; given: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
        given ? 'bg-emerald-100 text-emerald-800' : 'bg-white/70 text-slate-600'
      }`}
    >
      <span
        className={`h-3.5 w-3.5 rounded-full grid place-items-center text-[10px] leading-none font-bold ${
          given ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-400'
        }`}
      >
        {given ? '✓' : ''}
      </span>
      <span className="font-medium truncate">{name}</span>
    </div>
  )
}

function ActivityRow({ item, onDelete }: { item: AnyEntry; onDelete: () => void }) {
  let icon: React.ReactNode
  let title: string
  let subtitle: string
  let time: string

  if (item.kind === 'feed') {
    icon = <Milk className="h-4 w-4 text-amber-700" />
    const supps = [item.multivitamin && 'Vit', item.iron && 'Fe'].filter(Boolean) as string[]
    const suppStr = supps.length > 0 ? ` · +${supps.join('+')}` : ''
    title = item.type === 'bottle'
      ? `Bottle${item.amount_ml ? ` · ${item.amount_ml} ml` : ''}${suppStr}`
      : `Breast${item.duration_min ? ` · ${item.duration_min} min` : ''}${item.side ? ` (${item.side})` : ''}${suppStr}`
    subtitle = item.notes ?? ''
    time = item.fed_at
  } else if (item.kind === 'diaper') {
    icon =
      item.type === 'pee' ? (
        <Droplet className="h-4 w-4 text-sky-700" />
      ) : item.type === 'poop' ? (
        <BabyIcon className="h-4 w-4 text-emerald-700" />
      ) : (
        <Droplet className="h-4 w-4 text-emerald-700" />
      )
    title = item.type === 'both' ? 'Pee + poop' : item.type[0].toUpperCase() + item.type.slice(1)
    subtitle = item.notes ?? ''
    time = item.occurred_at
  } else if (item.kind === 'pump') {
    icon = <Wind className="h-4 w-4 text-teal-700" />
    const ml = item.amount_ml != null ? ` · ${Math.round(item.amount_ml)} ml` : ''
    const dur = item.duration_min ? ` · ${item.duration_min} min` : ''
    const split =
      item.side === 'both' && (item.left_ml != null || item.right_ml != null)
        ? ` (L ${Math.round(item.left_ml ?? 0)} / R ${Math.round(item.right_ml ?? 0)})`
        : ''
    title = `Pump (${item.side})${ml}${split}${dur}`
    subtitle = item.notes ?? ''
    time = item.pumped_at
  } else if (item.kind === 'supplement') {
    icon = <Pill className="h-4 w-4 text-rose-700" />
    const parts = [item.multivitamin && 'Multivitamin', item.iron && 'Iron'].filter(Boolean) as string[]
    title = `Supplement · ${parts.join(' + ')}`
    subtitle = item.notes ?? ''
    time = item.given_at
  } else {
    icon = <Scale className="h-4 w-4 text-violet-700" />
    title = `Weight · ${formatWeight(item.weight_kg, 'imperial')}`
    subtitle = item.notes ?? ''
    time = item.measured_at
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-8 w-8 rounded-lg bg-slate-50 grid place-items-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-slate-500 truncate">
          {formatDateTime(time)} · {timeSince(time)}
          {subtitle ? ` · ${subtitle}` : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-slate-400 hover:text-red-600 p-1.5"
        aria-label="Delete entry"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
