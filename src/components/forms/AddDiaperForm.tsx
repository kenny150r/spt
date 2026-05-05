import { useState } from 'react'
import { addDiaper } from '../../lib/api'
import { toDatetimeLocal } from '../../lib/format'
import type { DiaperType } from '../../lib/types'

export function AddDiaperForm({
  babyId,
  initialType,
  onSaved,
  onCancel,
}: {
  babyId: string
  initialType: DiaperType
  onSaved: () => void
  onCancel: () => void
}) {
  const [type, setType] = useState<DiaperType>(initialType)
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocal(new Date()))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await addDiaper({
        baby_id: babyId,
        occurred_at: new Date(occurredAt).toISOString(),
        type,
        notes: notes.trim() || null,
      })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSubmitting(false)
    }
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
              } capitalize`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
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
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
