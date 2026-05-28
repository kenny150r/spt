import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Baby as BabyIcon,
  ChevronDown,
  Droplet,
  LayoutGrid,
  Milk,
  Pencil,
  Pill,
  Rows3,
  Scale,
  Trash2,
  Utensils,
  Wind,
} from 'lucide-react'
import { format } from 'date-fns'
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
  listSupplements,
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
import { diaperTypeLabel, useVocab } from '../lib/vocab'
import type { DiaperVocab } from '../lib/vocab'

type SheetState =
  | { kind: 'closed' }
  | { kind: 'feed'; entry?: FeedEntry }
  | { kind: 'diaper'; entry?: DiaperEntry }
  | { kind: 'weight'; entry?: WeightEntry }
  | { kind: 'pump'; entry?: PumpEntry }
  | { kind: 'supplement'; entry?: SupplementEntry }

type ViewMode = 'cards' | 'table'

const PAGE_SIZE = 30

export function LogView({ baby }: { baby: Baby }) {
  const { diaper: vocab } = useVocab()
  const [sheet, setSheet] = useState<SheetState>({ kind: 'closed' })
  const [feeds, setFeeds] = useState<FeedEntry[]>([])
  const [diapers, setDiapers] = useState<DiaperEntry[]>([])
  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [pumps, setPumps] = useState<PumpEntry[]>([])
  const [supplements, setSupplements] = useState<SupplementEntry[]>([])
  const [loading, setLoading] = useState(true)
  // We grow this in `PAGE_SIZE` increments via "See more". Each bump
  // refetches with bigger LIMITs, then the merged list is sliced down to
  // `displayLimit` for actual rendering.
  const [fetchLimit, setFetchLimit] = useState(50)
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode())
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem('spt-log-view-mode', viewMode)
    } catch {
      /* ignore quota / private mode */
    }
  }, [viewMode])

  const reload = useCallback(
    async (limit: number) => {
      const [f, d, w, p, s] = await Promise.all([
        listFeeds(baby.id, limit),
        listDiapers(baby.id, limit),
        listWeights(baby.id),
        listPumps(baby.id, limit),
        listSupplements(baby.id, limit),
      ])
      setFeeds(f)
      setDiapers(d)
      setWeights(w.slice().reverse())
      setPumps(p)
      setSupplements(s)
      setLoading(false)
    },
    [baby.id],
  )

  // Only flash the full-page "Loading…" placeholder when the active baby
  // changes; fetch-limit bumps from "See more" should keep the existing
  // list visible while the bigger response is in flight.
  useEffect(() => {
    setLoading(true)
  }, [baby.id])

  useEffect(() => {
    reload(fetchLimit).finally(() => setLoading(false))
  }, [reload, fetchLimit])

  const merged: AnyEntry[] = useMemo(() => {
    const items: AnyEntry[] = [
      ...feeds.map((e) => ({ kind: 'feed' as const, ...e })),
      ...diapers.map((e) => ({ kind: 'diaper' as const, ...e })),
      ...weights.map((e) => ({ kind: 'weight' as const, ...e })),
      ...pumps.map((e) => ({ kind: 'pump' as const, ...e })),
      ...supplements.map((e) => ({ kind: 'supplement' as const, ...e })),
    ]
    items.sort((a, b) => entryTime(b).localeCompare(entryTime(a)))
    return items
  }, [feeds, diapers, weights, pumps, supplements])

  const visible = useMemo(() => merged.slice(0, displayLimit), [merged, displayLimit])

  const lastFeed = feeds[0]
  const lastDiaper = diapers[0]
  const lastWeight = weights[0]
  const lastPump = pumps[0]

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
    reload(fetchLimit)
  }

  function startEdit(item: AnyEntry) {
    switch (item.kind) {
      case 'feed':
        setSheet({ kind: 'feed', entry: item })
        break
      case 'diaper':
        setSheet({ kind: 'diaper', entry: item })
        break
      case 'weight':
        setSheet({ kind: 'weight', entry: item })
        break
      case 'pump':
        setSheet({ kind: 'pump', entry: item })
        break
      case 'supplement':
        setSheet({ kind: 'supplement', entry: item })
        break
    }
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
    setExpandedId((id) => (id === item.id ? null : id))
    reload(fetchLimit)
  }

  async function onSeeMore() {
    setLoadingMore(true)
    const nextDisplay = displayLimit + PAGE_SIZE
    setDisplayLimit(nextDisplay)
    // If we're approaching the bottom of what we've fetched, top up. We
    // intentionally fetch a bit ahead of the display so the next "See
    // more" is instant.
    if (nextDisplay + PAGE_SIZE > fetchLimit) {
      const nextFetch = fetchLimit + PAGE_SIZE * 2
      setFetchLimit(nextFetch)
      try {
        await reload(nextFetch)
      } finally {
        setLoadingMore(false)
      }
    } else {
      setLoadingMore(false)
    }
  }

  // True only if there might be older entries on the server we haven't shown
  // yet. We compare per-type: when each typed list returned exactly the
  // limit, there could be more rows beyond it. (Weights are always fully
  // loaded, so they don't gate the button.)
  const moreLikely =
    feeds.length >= fetchLimit ||
    diapers.length >= fetchLimit ||
    pumps.length >= fetchLimit ||
    supplements.length >= fetchLimit
  const hasMoreToShow = displayLimit < merged.length || moreLikely

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          label="Last pump"
          value={lastPump ? timeSinceShort(lastPump.pumped_at) : '—'}
          icon={<Wind className="h-4 w-4" />}
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
            sub={`${vocab.peeLower}, ${vocab.poopLower}, or both`}
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Recent activity
          </h2>
          <div
            className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-xs"
            role="tablist"
            aria-label="Recent activity layout"
          >
            <ViewToggleButton
              active={viewMode === 'cards'}
              onClick={() => setViewMode('cards')}
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
              label="Cards"
            />
            <ViewToggleButton
              active={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              icon={<Rows3 className="h-3.5 w-3.5" />}
              label="Table"
            />
          </div>
        </div>

        {loading ? (
          <div className="card px-4 py-6 text-sm text-slate-500 text-center">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="card px-4 py-6 text-sm text-slate-500 text-center">
            No entries yet. Tap a quick log button above to get started.
          </div>
        ) : viewMode === 'cards' ? (
          <CardList
            items={visible}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
            onEdit={startEdit}
            onDelete={onDelete}
          />
        ) : (
          <TableList
            items={visible}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
            onEdit={startEdit}
            onDelete={onDelete}
          />
        )}

        {!loading && visible.length > 0 && hasMoreToShow && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={onSeeMore}
              disabled={loadingMore}
              className="text-sm px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingMore ? 'Loading…' : `See more (${visible.length} shown)`}
            </button>
          </div>
        )}
      </section>

      <Sheet
        open={sheet.kind === 'feed'}
        onClose={close}
        title={sheet.kind === 'feed' && sheet.entry ? 'Edit feed' : 'Log a feed'}
      >
        {sheet.kind === 'feed' && (
          <AddFeedForm
            key={sheet.entry?.id ?? 'new-feed'}
            babyId={baby.id}
            entry={sheet.entry}
            onSaved={onSaved}
            onCancel={close}
          />
        )}
      </Sheet>
      <Sheet
        open={sheet.kind === 'diaper'}
        onClose={close}
        title={sheet.kind === 'diaper' && sheet.entry ? 'Edit diaper' : 'Log a diaper'}
      >
        {sheet.kind === 'diaper' && (
          <AddDiaperForm
            key={sheet.entry?.id ?? 'new-diaper'}
            babyId={baby.id}
            entry={sheet.entry}
            initialType="pee"
            onSaved={onSaved}
            onCancel={close}
          />
        )}
      </Sheet>
      <Sheet
        open={sheet.kind === 'weight'}
        onClose={close}
        title={sheet.kind === 'weight' && sheet.entry ? 'Edit weight' : 'Log a weight'}
      >
        {sheet.kind === 'weight' && (
          <AddWeightForm
            key={sheet.entry?.id ?? 'new-weight'}
            babyId={baby.id}
            entry={sheet.entry}
            onSaved={onSaved}
            onCancel={close}
          />
        )}
      </Sheet>
      <Sheet
        open={sheet.kind === 'pump'}
        onClose={close}
        title={sheet.kind === 'pump' && sheet.entry ? 'Edit pump' : 'Log a pump'}
      >
        {sheet.kind === 'pump' && (
          <AddPumpForm
            key={sheet.entry?.id ?? 'new-pump'}
            babyId={baby.id}
            entry={sheet.entry}
            onSaved={onSaved}
            onCancel={close}
          />
        )}
      </Sheet>
      <Sheet
        open={sheet.kind === 'supplement'}
        onClose={close}
        title={
          sheet.kind === 'supplement' && sheet.entry
            ? 'Edit supplement'
            : 'Mark supplements given'
        }
      >
        {sheet.kind === 'supplement' && (
          <AddSupplementForm
            key={sheet.entry?.id ?? 'new-supp'}
            babyId={baby.id}
            entry={sheet.entry}
            givenToday={supplementsToday}
            onSaved={onSaved}
            onCancel={close}
          />
        )}
      </Sheet>
    </div>
  )
}

function loadViewMode(): ViewMode {
  if (typeof localStorage === 'undefined') return 'cards'
  try {
    const v = localStorage.getItem('spt-log-view-mode')
    return v === 'table' ? 'table' : 'cards'
  } catch {
    return 'cards'
  }
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

// ---------- presentation helpers ----------

interface RowVisuals {
  icon: React.ReactNode
  /** "Bottle · 90 ml · +Vit+Fe" */
  title: string
  /** ISO time of the event. */
  time: string
  /** Short label for the table-view "Type" column. */
  typeLabel: string
}

function rowVisuals(item: AnyEntry, vocab: DiaperVocab): RowVisuals {
  if (item.kind === 'feed') {
    const supps = [item.multivitamin && 'Vit', item.iron && 'Fe'].filter(Boolean) as string[]
    const suppStr = supps.length > 0 ? ` · +${supps.join('+')}` : ''
    const title =
      item.type === 'bottle'
        ? `Bottle${item.amount_ml ? ` · ${item.amount_ml} ml` : ''}${suppStr}`
        : `Breast${item.duration_min ? ` · ${item.duration_min} min` : ''}${
            item.side ? ` (${item.side})` : ''
          }${suppStr}`
    return {
      icon: <Milk className="h-4 w-4 text-amber-700" />,
      title,
      time: item.fed_at,
      typeLabel: item.type === 'bottle' ? 'Bottle' : 'Breast',
    }
  }
  if (item.kind === 'diaper') {
    const icon =
      item.type === 'pee' ? (
        <Droplet className="h-4 w-4 text-sky-700" />
      ) : item.type === 'poop' ? (
        <BabyIcon className="h-4 w-4 text-emerald-700" />
      ) : (
        <Droplet className="h-4 w-4 text-emerald-700" />
      )
    const baseLabel = diaperTypeLabel(item.type, vocab)
    const sizeStr = item.size ? ` · ${item.size}` : ''
    return {
      icon,
      title: `${baseLabel}${sizeStr}`,
      time: item.occurred_at,
      typeLabel: 'Diaper',
    }
  }
  if (item.kind === 'pump') {
    const ml = item.amount_ml != null ? ` · ${Math.round(item.amount_ml)} ml` : ''
    const dur = item.duration_min ? ` · ${item.duration_min} min` : ''
    const split =
      item.side === 'both' && (item.left_ml != null || item.right_ml != null)
        ? ` (L ${Math.round(item.left_ml ?? 0)} / R ${Math.round(item.right_ml ?? 0)})`
        : ''
    return {
      icon: <Wind className="h-4 w-4 text-teal-700" />,
      title: `Pump (${item.side})${ml}${split}${dur}`,
      time: item.pumped_at,
      typeLabel: 'Pump',
    }
  }
  if (item.kind === 'supplement') {
    const parts = [item.multivitamin && 'Multivitamin', item.iron && 'Iron'].filter(
      Boolean,
    ) as string[]
    return {
      icon: <Pill className="h-4 w-4 text-rose-700" />,
      title: `Supplement · ${parts.join(' + ')}`,
      time: item.given_at,
      typeLabel: 'Supplement',
    }
  }
  return {
    icon: <Scale className="h-4 w-4 text-violet-700" />,
    title: `Weight · ${formatWeight(item.weight_kg, 'imperial')}`,
    time: item.measured_at,
    typeLabel: 'Weight',
  }
}

// Detail rows shown when an entry is expanded. Keep this exhaustive so the
// expanded panel always reveals everything stored on the row.
function entryDetails(
  item: AnyEntry,
  vocab: DiaperVocab,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  if (item.kind === 'feed') {
    out.push({ label: 'Type', value: item.type === 'bottle' ? 'Bottle' : 'Breast' })
    if (item.amount_ml != null) out.push({ label: 'Amount', value: `${item.amount_ml} mL` })
    if (item.duration_min != null)
      out.push({ label: 'Duration', value: `${item.duration_min} min` })
    if (item.side) out.push({ label: 'Side', value: item.side })
    if (item.multivitamin || item.iron) {
      out.push({
        label: 'Supplements',
        value: [item.multivitamin && 'Multivitamin', item.iron && 'Iron']
          .filter(Boolean)
          .join(' + '),
      })
    }
  } else if (item.kind === 'diaper') {
    out.push({ label: 'Type', value: diaperTypeLabel(item.type, vocab) })
    if (item.size) out.push({ label: 'Size', value: item.size })
  } else if (item.kind === 'pump') {
    out.push({ label: 'Side', value: item.side })
    if (item.amount_ml != null)
      out.push({ label: 'Total', value: `${Math.round(item.amount_ml)} mL` })
    if (item.left_ml != null) out.push({ label: 'Left', value: `${Math.round(item.left_ml)} mL` })
    if (item.right_ml != null)
      out.push({ label: 'Right', value: `${Math.round(item.right_ml)} mL` })
    if (item.duration_min != null)
      out.push({ label: 'Duration', value: `${item.duration_min} min` })
  } else if (item.kind === 'supplement') {
    const parts = [item.multivitamin && 'Multivitamin', item.iron && 'Iron'].filter(
      Boolean,
    ) as string[]
    out.push({ label: 'Given', value: parts.join(' + ') || '—' })
  } else {
    out.push({
      label: 'Weight',
      value: `${formatWeight(item.weight_kg, 'imperial')} (${item.weight_kg.toFixed(3)} kg)`,
    })
  }
  return out
}

function entryNotes(item: AnyEntry): string | null {
  return item.notes
}

// ---------- card view ----------

function CardList({
  items,
  expandedId,
  onToggle,
  onEdit,
  onDelete,
}: {
  items: AnyEntry[]
  expandedId: string | null
  onToggle: (id: string) => void
  onEdit: (item: AnyEntry) => void
  onDelete: (item: AnyEntry) => void
}) {
  return (
    <div className="card divide-y divide-slate-100">
      {items.map((item) => (
        <ActivityRow
          key={`${item.kind}:${item.id}`}
          item={item}
          expanded={expandedId === item.id}
          onToggle={() => onToggle(item.id)}
          onEdit={() => onEdit(item)}
          onDelete={() => onDelete(item)}
        />
      ))}
    </div>
  )
}

function ActivityRow({
  item,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: AnyEntry
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { diaper: vocab } = useVocab()
  const v = rowVisuals(item, vocab)
  const notes = entryNotes(item)

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
      >
        <div className="h-8 w-8 rounded-lg bg-slate-50 grid place-items-center shrink-0">
          {v.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{v.title}</div>
          <div className="text-xs text-slate-500 truncate">
            {formatDateTime(v.time)} · {timeSince(v.time)}
            {notes ? ` · ${notes}` : ''}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <ExpandedDetails
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          notes={notes}
        />
      )}
    </div>
  )
}

function ExpandedDetails({
  item,
  onEdit,
  onDelete,
  notes,
}: {
  item: AnyEntry
  onEdit: () => void
  onDelete: () => void
  notes: string | null
}) {
  const { diaper: vocab } = useVocab()
  const v = rowVisuals(item, vocab)
  const details = entryDetails(item, vocab)
  return (
    <div className="px-4 pb-4 -mt-1 space-y-3 bg-slate-50/60">
      <div className="text-xs text-slate-500">
        {formatDateTime(v.time)} · {timeSince(v.time)}
      </div>
      {details.length > 0 && (
        <dl className="space-y-1 text-sm">
          {details.map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-500 shrink-0">{d.label}</dt>
              <dd className="text-slate-800 font-medium text-right capitalize">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div>
        <div className="text-xs text-slate-500 mb-0.5">Notes</div>
        {notes ? (
          <div className="text-sm whitespace-pre-wrap break-words text-slate-800">{notes}</div>
        ) : (
          <div className="text-sm italic text-slate-400">No notes</div>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onEdit}
          className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5"
        >
          <Pencil className="h-4 w-4" /> Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5 text-red-600 hover:bg-red-50 hover:border-red-200"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>
    </div>
  )
}

// ---------- table view ----------

function TableList({
  items,
  expandedId,
  onToggle,
  onEdit,
  onDelete,
}: {
  items: AnyEntry[]
  expandedId: string | null
  onToggle: (id: string) => void
  onEdit: (item: AnyEntry) => void
  onDelete: (item: AnyEntry) => void
}) {
  const { diaper: vocab } = useVocab()
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-3 py-2 w-[36%]">When</th>
              <th className="text-left font-medium px-3 py-2 w-[22%]">Type</th>
              <th className="text-left font-medium px-3 py-2">Detail</th>
              <th className="px-2 py-2 w-8" aria-label="Expand"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const v = rowVisuals(item, vocab)
              const notes = entryNotes(item)
              const isExpanded = expandedId === item.id
              return (
                <FragmentRow
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  visuals={v}
                  notes={notes}
                  expanded={isExpanded}
                  onToggle={() => onToggle(item.id)}
                  onEdit={() => onEdit(item)}
                  onDelete={() => onDelete(item)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FragmentRow({
  item,
  visuals,
  notes,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: AnyEntry
  visuals: RowVisuals
  notes: string | null
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-slate-50 active:bg-slate-100"
      >
        <td className="px-3 py-2 align-top">
          <div className="text-slate-800">{formatDateTime(visuals.time)}</div>
          <div className="text-[11px] text-slate-500">{timeSince(visuals.time)}</div>
        </td>
        <td className="px-3 py-2 align-top">
          <div className="inline-flex items-center gap-1.5">
            <span className="h-5 w-5 rounded bg-slate-50 grid place-items-center">
              {visuals.icon}
            </span>
            <span className="text-slate-700">{visuals.typeLabel}</span>
          </div>
        </td>
        <td className="px-3 py-2 align-top text-slate-700">
          <div className="line-clamp-2 break-words">{visuals.title.replace(/^[^·]+· /, '')}</div>
          {notes && (
            <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{notes}</div>
          )}
        </td>
        <td className="px-2 py-2 align-top text-slate-400">
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/60">
          <td colSpan={4} className="px-3 py-3">
            <ExpandedDetails
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
              notes={notes}
            />
          </td>
        </tr>
      )}
    </>
  )
}

// ---------- small helpers ----------

function ViewToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`px-2.5 py-1 font-medium inline-flex items-center gap-1.5 ${
        active ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'
      }`}
    >
      {icon}
      {label}
    </button>
  )
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
