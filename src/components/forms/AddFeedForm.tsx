import { useState } from 'react'
import { addFeed, updateFeed } from '../../lib/api'
import { toDatetimeLocal } from '../../lib/format'
import type { FeedEntry, FeedSide, FeedType } from '../../lib/types'

export function AddFeedForm({
  babyId,
  entry,
  onSaved,
  onCancel,
}: {
  babyId: string
  // When provided, the form is in "edit" mode and will UPDATE this row
  // instead of inserting a new one.
  entry?: FeedEntry
  onSaved: () => void
  onCancel: () => void
}) {
  const isEdit = entry != null
  const [type, setType] = useState<FeedType>(entry?.type ?? 'bottle')
  const [fedAt, setFedAt] = useState(
    entry ? toDatetimeLocal(new Date(entry.fed_at)) : toDatetimeLocal(new Date()),
  )
  const [amountMl, setAmountMl] = useState(
    entry?.amount_ml != null ? String(entry.amount_ml) : '',
  )
  const [durationMin, setDurationMin] = useState(
    entry?.side !== 'both' && entry?.duration_min != null
      ? String(entry.duration_min)
      : '',
  )
  const [side, setSide] = useState<FeedSide>(entry?.side ?? 'left')
  // For 'both' edits we prefer the per-side breakdown if present; otherwise
  // fall back to splitting the total 50/50 so the user has sane starting
  // numbers, mirroring how AddPumpForm handles left_ml/right_ml.
  const [leftMin, setLeftMin] = useState(
    entry?.left_min != null
      ? String(entry.left_min)
      : entry?.side === 'both' && entry.duration_min != null
        ? String(Math.round((entry.duration_min / 2) * 10) / 10)
        : '',
  )
  const [rightMin, setRightMin] = useState(
    entry?.right_min != null
      ? String(entry.right_min)
      : entry?.side === 'both' && entry.duration_min != null
        ? String(Math.round((entry.duration_min / 2) * 10) / 10)
        : '',
  )
  const [iron, setIron] = useState<boolean>(entry?.iron ?? false)
  const [multivitamin, setMultivitamin] = useState<boolean>(entry?.multivitamin ?? false)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      let durationVal: number | null = null
      let leftVal: number | null = null
      let rightVal: number | null = null
      if (type === 'breast') {
        if (side === 'both') {
          const l = leftMin ? Number(leftMin) : null
          const r = rightMin ? Number(rightMin) : null
          leftVal = l
          rightVal = r
          if (l != null || r != null) durationVal = (l ?? 0) + (r ?? 0)
        } else {
          durationVal = durationMin ? Number(durationMin) : null
        }
      }
      const payload = {
        fed_at: new Date(fedAt).toISOString(),
        type,
        amount_ml: type === 'bottle' && amountMl ? Number(amountMl) : null,
        duration_min: durationVal,
        side: type === 'breast' ? side : null,
        left_min: leftVal,
        right_min: rightVal,
        iron,
        multivitamin,
        notes: notes.trim() || null,
      }
      if (isEdit && entry) {
        await updateFeed(entry.id, payload)
      } else {
        await addFeed({ baby_id: babyId, ...payload })
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save feed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(['bottle', 'breast'] as FeedType[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={`btn ${
                type === t
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'bg-white border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              {t === 'bottle' ? 'Bottle' : 'Breast'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="fed_at">Time</label>
        <input
          id="fed_at"
          type="datetime-local"
          required
          value={fedAt}
          onChange={(e) => setFedAt(e.target.value)}
          className="input"
        />
      </div>

      {type === 'bottle' ? (
        <div>
          <label className="label" htmlFor="amount">Amount (ml)</label>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={amountMl}
            onChange={(e) => setAmountMl(e.target.value)}
            className="input"
            placeholder="e.g. 90"
          />
        </div>
      ) : (
        <>
          <div>
            <label className="label">Side</label>
            <div className="grid grid-cols-3 gap-2">
              {(['left', 'right', 'both'] as FeedSide[]).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSide(s)}
                  className={`btn ${
                    side === s
                      ? 'bg-brand-600 text-white dark:bg-brand-500'
                      : 'bg-white border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                  } capitalize`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {side === 'both' ? (
            <div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="left_min">Left (min)</label>
                  <input
                    id="left_min"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    value={leftMin}
                    onChange={(e) => setLeftMin(e.target.value)}
                    className="input"
                    placeholder="e.g. 10"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="right_min">Right (min)</label>
                  <input
                    id="right_min"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    value={rightMin}
                    onChange={(e) => setRightMin(e.target.value)}
                    className="input"
                    placeholder="e.g. 8"
                  />
                </div>
              </div>
              {(leftMin || rightMin) && (
                <p className="text-xs text-slate-500 mt-1.5 dark:text-slate-400">
                  Total {(Number(leftMin || 0) + Number(rightMin || 0))
                    .toString()
                    .replace(/\.0$/, '')}{' '}
                  min
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="duration">Duration (min)</label>
              <input
                id="duration"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className="input"
                placeholder="e.g. 15"
              />
            </div>
          )}
        </>
      )}

      <div>
        <label className="label">Supplements given with this feed</label>
        <div className="grid grid-cols-2 gap-2">
          <SupplementToggle
            label="Multivitamin"
            checked={multivitamin}
            onChange={setMultivitamin}
          />
          <SupplementToggle
            label="Iron"
            checked={iron}
            onChange={setIron}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <input
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input"
          placeholder="Optional"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn-primary flex-1">
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save feed'}
        </button>
      </div>
    </form>
  )
}

function SupplementToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`btn ${
        checked
          ? 'bg-emerald-600 text-white dark:bg-emerald-500'
          : 'bg-white border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
      }`}
    >
      {checked ? '✓ ' : ''}
      {label}
    </button>
  )
}
