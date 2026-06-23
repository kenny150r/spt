import { useState } from 'react'
import { addSleep, updateSleep } from '../../lib/api'
import { formatDurationMin, toDatetimeLocal } from '../../lib/format'
import type { SleepEntry } from '../../lib/types'

export function AddSleepForm({
  babyId,
  entry,
  onSaved,
  onCancel,
}: {
  babyId: string
  // When provided, the form is in "edit" mode and will UPDATE this row
  // instead of inserting a new one.
  entry?: SleepEntry
  onSaved: () => void
  onCancel: () => void
}) {
  const isEdit = entry != null
  const [startedAt, setStartedAt] = useState(
    entry ? toDatetimeLocal(new Date(entry.started_at)) : toDatetimeLocal(new Date()),
  )
  // "Ongoing" = baby still asleep (ended_at null). New sleeps default to
  // ongoing so the common "tap when they fall asleep" flow is one step.
  const [ongoing, setOngoing] = useState<boolean>(
    entry ? entry.ended_at == null : true,
  )
  const [endedAt, setEndedAt] = useState(
    entry?.ended_at
      ? toDatetimeLocal(new Date(entry.ended_at))
      : toDatetimeLocal(new Date()),
  )
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  const startMs = new Date(startedAt).getTime()
  const endMs = new Date(endedAt).getTime()
  const durationMin =
    !ongoing && Number.isFinite(startMs) && Number.isFinite(endMs)
      ? (endMs - startMs) / 60000
      : null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ongoing && endMs < startMs) {
      setError('Wake time must be after sleep time.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const payload = {
        started_at: new Date(startedAt).toISOString(),
        ended_at: ongoing ? null : new Date(endedAt).toISOString(),
        notes: notes.trim() || null,
      }
      if (isEdit && entry) {
        await updateSleep(entry.id, payload)
      } else {
        await addSleep({ baby_id: babyId, ...payload })
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save sleep')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="started_at">Fell asleep</label>
        <input
          id="started_at"
          type="datetime-local"
          required
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
          className="input"
        />
      </div>

      <div>
        <label className="label">Status</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setOngoing(true)}
            aria-pressed={ongoing}
            className={`btn ${
              ongoing
                ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                : 'bg-white border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
            }`}
          >
            Still asleep
          </button>
          <button
            type="button"
            onClick={() => setOngoing(false)}
            aria-pressed={!ongoing}
            className={`btn ${
              !ongoing
                ? 'bg-brand-600 text-white dark:bg-brand-500'
                : 'bg-white border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
            }`}
          >
            Woke up
          </button>
        </div>
      </div>

      {!ongoing && (
        <div>
          <label className="label" htmlFor="ended_at">Woke up at</label>
          <input
            id="ended_at"
            type="datetime-local"
            required
            value={endedAt}
            onChange={(e) => setEndedAt(e.target.value)}
            className="input"
          />
          {durationMin != null && durationMin >= 0 && (
            <p className="text-xs text-slate-500 mt-1.5 dark:text-slate-400">
              Slept {formatDurationMin(durationMin)}.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="label" htmlFor="sleep_notes">Notes</label>
        <input
          id="sleep_notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input"
          placeholder="Optional (e.g. crib, contact nap)"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn-primary flex-1">
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save sleep'}
        </button>
      </div>
    </form>
  )
}
