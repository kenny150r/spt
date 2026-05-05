import { useCallback, useEffect, useMemo, useState } from 'react'
import { Baby as BabyIcon, Droplet, Milk, Scale, Trash2, Utensils } from 'lucide-react'
import { Sheet } from '../components/Sheet'
import { AddFeedForm } from '../components/forms/AddFeedForm'
import { AddDiaperForm } from '../components/forms/AddDiaperForm'
import { AddWeightForm } from '../components/forms/AddWeightForm'
import { deleteEntry, listDiapers, listFeeds, listWeights } from '../lib/api'
import type { AnyEntry, Baby, DiaperEntry, FeedEntry, WeightEntry, DiaperType } from '../lib/types'
import { formatDateTime, formatWeight, timeSince } from '../lib/format'

type SheetState =
  | { kind: 'closed' }
  | { kind: 'feed' }
  | { kind: 'diaper'; type: DiaperType }
  | { kind: 'weight' }

export function LogView({ baby }: { baby: Baby }) {
  const [sheet, setSheet] = useState<SheetState>({ kind: 'closed' })
  const [feeds, setFeeds] = useState<FeedEntry[]>([])
  const [diapers, setDiapers] = useState<DiaperEntry[]>([])
  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [f, d, w] = await Promise.all([
      listFeeds(baby.id, 25),
      listDiapers(baby.id, 25),
      listWeights(baby.id),
    ])
    setFeeds(f)
    setDiapers(d)
    setWeights(w.slice().reverse())
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
    ]
    items.sort((a, b) => entryTime(b).localeCompare(entryTime(a)))
    return items.slice(0, 30)
  }, [feeds, diapers, weights])

  const lastFeed = feeds[0]
  const lastDiaper = diapers[0]
  const lastWeight = weights[weights.length - 1]

  const close = () => setSheet({ kind: 'closed' })
  const onSaved = () => {
    close()
    reload()
  }

  async function onDelete(item: AnyEntry) {
    if (!confirm('Delete this entry?')) return
    const table = item.kind === 'feed' ? 'feeds' : item.kind === 'diaper' ? 'diapers' : 'weights'
    await deleteEntry(table, item.id)
    reload()
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Last feed"
          value={lastFeed ? timeSince(lastFeed.fed_at) : '—'}
          icon={<Utensils className="h-4 w-4" />}
        />
        <SummaryCard
          label="Last diaper"
          value={lastDiaper ? timeSince(lastDiaper.occurred_at) : '—'}
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
            label="Weight"
            sub="growth check"
            color="bg-violet-50 text-violet-900 border-violet-100"
            icon={<Scale className="h-5 w-5" />}
            onClick={() => setSheet({ kind: 'weight' })}
          />
          <BigButton
            label="Pee"
            sub="wet diaper"
            color="bg-sky-50 text-sky-900 border-sky-100"
            icon={<Droplet className="h-5 w-5" />}
            onClick={() => setSheet({ kind: 'diaper', type: 'pee' })}
          />
          <BigButton
            label="Poop"
            sub="dirty diaper"
            color="bg-emerald-50 text-emerald-900 border-emerald-100"
            icon={<BabyIcon className="h-5 w-5" />}
            onClick={() => setSheet({ kind: 'diaper', type: 'poop' })}
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
        {sheet.kind === 'diaper' && (
          <AddDiaperForm
            babyId={baby.id}
            initialType={sheet.type}
            onSaved={onSaved}
            onCancel={close}
          />
        )}
      </Sheet>
      <Sheet open={sheet.kind === 'weight'} onClose={close} title="Log a weight">
        <AddWeightForm babyId={baby.id} onSaved={onSaved} onCancel={close} />
      </Sheet>
    </div>
  )
}

function entryTime(item: AnyEntry): string {
  if (item.kind === 'feed') return item.fed_at
  if (item.kind === 'diaper') return item.occurred_at
  return item.measured_at
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
        {label}
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

function ActivityRow({ item, onDelete }: { item: AnyEntry; onDelete: () => void }) {
  let icon: React.ReactNode
  let title: string
  let subtitle: string
  let time: string

  if (item.kind === 'feed') {
    icon = <Milk className="h-4 w-4 text-amber-700" />
    title = item.type === 'bottle'
      ? `Bottle${item.amount_ml ? ` · ${item.amount_ml} ml` : ''}`
      : `Breast${item.duration_min ? ` · ${item.duration_min} min` : ''}${item.side ? ` (${item.side})` : ''}`
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
