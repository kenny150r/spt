import { useState } from 'react'
import { addSupplement, updateSupplement } from '../../lib/api'
import { toDatetimeLocal } from '../../lib/format'
import type { SupplementEntry } from '../../lib/types'

export function AddSupplementForm({
  babyId,
  entry,
  givenToday,
  onSaved,
  onCancel,
}: {
  babyId: string
  entry?: SupplementEntry
  givenToday: { multivitamin: boolean; iron: boolean }
  onSaved: () => void
  onCancel: () => void
}) {
  const isEdit = entry != null
  // Pre-select whichever supplement is still pending today, so the most
  // common flow ("I just gave the one we hadn't done yet") is one tap +
  // save. For edits, restore exactly what was saved.
  const [multivitamin, setMultivitamin] = useState(
    entry ? entry.multivitamin : !givenToday.multivitamin,
  )
  const [iron, setIron] = useState(entry ? entry.iron : !givenToday.iron)
  const [givenAt, setGivenAt] = useState(
    entry ? toDatetimeLocal(new Date(entry.given_at)) : toDatetimeLocal(new Date()),
  )
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!multivitamin && !iron) {
      setError('Select at least one supplement.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const payload = {
        given_at: new Date(givenAt).toISOString(),
        multivitamin,
        iron,
        notes: notes.trim() || null,
      }
      if (isEdit && entry) {
        await updateSupplement(entry.id, payload)
      } else {
        await addSupplement({ baby_id: babyId, ...payload })
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">Which supplements were given?</label>
        <div className="grid grid-cols-2 gap-2">
          <BigToggle
            label="Multivitamin"
            sub={givenToday.multivitamin ? 'already done today' : 'pending today'}
            checked={multivitamin}
            onChange={setMultivitamin}
          />
          <BigToggle
            label="Iron"
            sub={givenToday.iron ? 'already done today' : 'pending today'}
            checked={iron}
            onChange={setIron}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="given_at">Time given</label>
        <input
          id="given_at"
          type="datetime-local"
          required
          value={givenAt}
          onChange={(e) => setGivenAt(e.target.value)}
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="supp_notes">Notes</label>
        <input
          id="supp_notes"
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
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Mark given'}
        </button>
      </div>
    </form>
  )
}

function BigToggle({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string
  sub: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`p-3 rounded-2xl border text-left active:scale-[0.99] transition-transform ${
        checked
          ? 'bg-emerald-600 text-white border-emerald-600'
          : 'bg-white border-slate-200 text-slate-700'
      }`}
    >
      <div className="text-sm font-semibold leading-tight">
        {checked ? '✓ ' : ''}
        {label}
      </div>
      <div
        className={`text-[11px] mt-0.5 ${
          checked ? 'opacity-90' : 'text-slate-500'
        }`}
      >
        {sub}
      </div>
    </button>
  )
}
