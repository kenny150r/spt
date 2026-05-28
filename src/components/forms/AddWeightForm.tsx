import { useState } from 'react'
import { addWeight, updateWeight } from '../../lib/api'
import { kgToLbOz, lbOzToKg, toDatetimeLocal } from '../../lib/format'
import type { WeightEntry } from '../../lib/types'

type Unit = 'kg' | 'lb'

export function AddWeightForm({
  babyId,
  entry,
  defaultUnit = 'lb',
  onSaved,
  onCancel,
}: {
  babyId: string
  entry?: WeightEntry
  defaultUnit?: Unit
  onSaved: () => void
  onCancel: () => void
}) {
  const isEdit = entry != null
  // Pre-fill the unit-specific inputs from the existing weight when editing
  // (so the parent can re-tap "Edit" multiple times without losing
  // precision).
  const seed = entry ? kgToLbOz(entry.weight_kg) : null
  const [unit, setUnit] = useState<Unit>(defaultUnit)
  const [kg, setKg] = useState(entry ? entry.weight_kg.toFixed(3) : '')
  const [lb, setLb] = useState(seed ? String(seed.lb) : '')
  const [oz, setOz] = useState(seed ? String(seed.oz) : '')
  const [measuredAt, setMeasuredAt] = useState(
    entry
      ? toDatetimeLocal(new Date(entry.measured_at))
      : toDatetimeLocal(new Date()),
  )
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      let weightKg: number
      if (unit === 'kg') {
        weightKg = Number(kg)
      } else {
        weightKg = lbOzToKg(Number(lb || 0), Number(oz || 0))
      }
      if (!Number.isFinite(weightKg) || weightKg <= 0) {
        setError('Please enter a valid weight')
        setSubmitting(false)
        return
      }
      const payload = {
        measured_at: new Date(measuredAt).toISOString(),
        weight_kg: Number(weightKg.toFixed(3)),
        notes: notes.trim() || null,
      }
      if (isEdit && entry) {
        await updateWeight(entry.id, payload)
      } else {
        await addWeight({ baby_id: babyId, ...payload })
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save weight')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Units</label>
        <div className="grid grid-cols-2 gap-2">
          {(['lb', 'kg'] as Unit[]).map((u) => (
            <button
              type="button"
              key={u}
              onClick={() => setUnit(u)}
              className={`btn ${
                unit === u
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'bg-white border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
              } uppercase`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {unit === 'kg' ? (
        <div>
          <label className="label" htmlFor="kg">Weight (kg)</label>
          <input
            id="kg"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            required
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            className="input"
            placeholder="e.g. 4.250"
            autoFocus
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="lb">Pounds</label>
            <input
              id="lb"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              required
              value={lb}
              onChange={(e) => setLb(e.target.value)}
              className="input"
              placeholder="e.g. 9"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="oz">Ounces</label>
            <input
              id="oz"
              type="number"
              inputMode="decimal"
              min="0"
              max="15.99"
              step="0.1"
              value={oz}
              onChange={(e) => setOz(e.target.value)}
              className="input"
              placeholder="e.g. 6"
            />
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="measured_at">Measured at</label>
        <input
          id="measured_at"
          type="datetime-local"
          required
          value={measuredAt}
          onChange={(e) => setMeasuredAt(e.target.value)}
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
          placeholder="e.g. doctor visit"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn-primary flex-1">
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save weight'}
        </button>
      </div>
    </form>
  )
}
