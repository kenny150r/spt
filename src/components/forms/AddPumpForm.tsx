import { useState } from 'react'
import { addPump, updatePump } from '../../lib/api'
import { toDatetimeLocal } from '../../lib/format'
import type { PumpEntry, PumpSide } from '../../lib/types'

export function AddPumpForm({
  babyId,
  entry,
  onSaved,
  onCancel,
}: {
  babyId: string
  entry?: PumpEntry
  onSaved: () => void
  onCancel: () => void
}) {
  const isEdit = entry != null
  const [pumpedAt, setPumpedAt] = useState(
    entry ? toDatetimeLocal(new Date(entry.pumped_at)) : toDatetimeLocal(new Date()),
  )
  const [side, setSide] = useState<PumpSide>(entry?.side ?? 'both')
  // For 'both' edits we prefer the per-side breakdown if present;
  // otherwise fall back to splitting the total 50/50 like the importer
  // historically did, so the user has reasonable starting numbers.
  const [leftMl, setLeftMl] = useState(
    entry?.left_ml != null
      ? String(entry.left_ml)
      : entry?.side === 'both' && entry.amount_ml != null
        ? String(Math.round((entry.amount_ml / 2) * 10) / 10)
        : '',
  )
  const [rightMl, setRightMl] = useState(
    entry?.right_ml != null
      ? String(entry.right_ml)
      : entry?.side === 'both' && entry.amount_ml != null
        ? String(Math.round((entry.amount_ml / 2) * 10) / 10)
        : '',
  )
  const [singleMl, setSingleMl] = useState(
    entry?.side !== 'both' && entry?.amount_ml != null ? String(entry.amount_ml) : '',
  )
  const [durationMin, setDurationMin] = useState(
    entry?.duration_min != null ? String(entry.duration_min) : '',
  )
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      let amountMl: number | null = null
      let leftVal: number | null = null
      let rightVal: number | null = null
      if (side === 'both') {
        const l = leftMl ? Number(leftMl) : null
        const r = rightMl ? Number(rightMl) : null
        leftVal = l
        rightVal = r
        if (l != null || r != null) {
          amountMl = (l ?? 0) + (r ?? 0)
        }
      } else {
        amountMl = singleMl ? Number(singleMl) : null
      }
      const payload = {
        pumped_at: new Date(pumpedAt).toISOString(),
        side,
        amount_ml: amountMl,
        left_ml: leftVal,
        right_ml: rightVal,
        duration_min: durationMin ? Number(durationMin) : null,
        notes: notes.trim() || null,
      }
      if (isEdit && entry) {
        await updatePump(entry.id, payload)
      } else {
        await addPump({ baby_id: babyId, ...payload })
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save pump')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="pumped_at">Time</label>
        <input
          id="pumped_at"
          type="datetime-local"
          required
          value={pumpedAt}
          onChange={(e) => setPumpedAt(e.target.value)}
          className="input"
        />
      </div>

      <div>
        <label className="label">Side</label>
        <div className="grid grid-cols-3 gap-2">
          {(['left', 'right', 'both'] as PumpSide[]).map((s) => (
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
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="left_ml">Left (mL)</label>
            <input
              id="left_ml"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={leftMl}
              onChange={(e) => setLeftMl(e.target.value)}
              className="input"
              placeholder="e.g. 40"
            />
          </div>
          <div>
            <label className="label" htmlFor="right_ml">Right (mL)</label>
            <input
              id="right_ml"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={rightMl}
              onChange={(e) => setRightMl(e.target.value)}
              className="input"
              placeholder="e.g. 50"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="single_ml">Amount (mL)</label>
          <input
            id="single_ml"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={singleMl}
            onChange={(e) => setSingleMl(e.target.value)}
            className="input"
            placeholder="e.g. 80"
          />
        </div>
      )}

      <div>
        <label className="label" htmlFor="duration_min">Duration (min)</label>
        <input
          id="duration_min"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.5"
          value={durationMin}
          onChange={(e) => setDurationMin(e.target.value)}
          className="input"
          placeholder="e.g. 20"
        />
      </div>

      <div>
        <label className="label" htmlFor="pump_notes">Notes</label>
        <input
          id="pump_notes"
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
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save pump'}
        </button>
      </div>
    </form>
  )
}
