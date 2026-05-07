import { useState } from 'react'
import { addDiaper, updateDiaper } from '../../lib/api'
import { toDatetimeLocal } from '../../lib/format'
import type { DiaperEntry, DiaperSize, DiaperType } from '../../lib/types'
import { useVocab } from '../../lib/vocab'

const SIZES: DiaperSize[] = ['small', 'medium', 'large']

export function AddDiaperForm({
  babyId,
  entry,
  initialType = 'pee',
  onSaved,
  onCancel,
}: {
  babyId: string
  entry?: DiaperEntry
  initialType?: DiaperType
  onSaved: () => void
  onCancel: () => void
}) {
  const isEdit = entry != null
  const { diaper: vocab } = useVocab()
  const [type, setType] = useState<DiaperType>(entry?.type ?? initialType)
  const [size, setSize] = useState<DiaperSize | null>(entry?.size ?? null)
  const [occurredAt, setOccurredAt] = useState(
    entry ? toDatetimeLocal(new Date(entry.occurred_at)) : toDatetimeLocal(new Date()),
  )
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  // Size only applies to entries that contain stool. If the user flips
  // back to a pee-only entry, drop the size silently on save.
  const sizeApplies = type === 'poop' || type === 'both'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const payload = {
        occurred_at: new Date(occurredAt).toISOString(),
        type,
        size: sizeApplies ? size : null,
        notes: notes.trim() || null,
      }
      if (isEdit && entry) {
        await updateDiaper(entry.id, payload)
      } else {
        await addDiaper({ baby_id: babyId, ...payload })
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSubmitting(false)
    }
  }

  const typeLabels: Record<DiaperType, string> = {
    pee: vocab.pee,
    poop: vocab.poop,
    both: 'Both',
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Type</label>
        <div className="grid grid-cols-3 gap-2">
          {(['pee', 'poop', 'both'] as DiaperType[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={`btn ${
                type === t
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {typeLabels[t]}
            </button>
          ))}
        </div>
      </div>

      {sizeApplies && (
        <div>
          <label className="label">Size</label>
          <div className="grid grid-cols-3 gap-2">
            {SIZES.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSize((cur) => (cur === s ? null : s))}
                aria-pressed={size === s}
                className={`btn ${
                  size === s
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700'
                } capitalize`}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Optional. Tap a selected size again to clear it.
          </p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="occurred_at">Time</label>
        <input
          id="occurred_at"
          type="datetime-local"
          required
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="input"
        />
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn-primary flex-1">
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
        </button>
      </div>
    </form>
  )
}
