import { differenceInDays, differenceInHours, differenceInMinutes, format, formatDistanceToNow } from 'date-fns'

export const KG_TO_LB = 2.20462262

export function kgToLbOz(kg: number): { lb: number; oz: number; lbDecimal: number } {
  const lbDecimal = kg * KG_TO_LB
  const lb = Math.floor(lbDecimal)
  const oz = Math.round((lbDecimal - lb) * 16)
  if (oz === 16) return { lb: lb + 1, oz: 0, lbDecimal }
  return { lb, oz, lbDecimal }
}

export function lbOzToKg(lb: number, oz: number): number {
  return (lb + oz / 16) / KG_TO_LB
}

export function formatWeight(kg: number, units: 'metric' | 'imperial'): string {
  if (units === 'imperial') {
    const { lb, oz } = kgToLbOz(kg)
    return `${lb} lb ${oz} oz`
  }
  return `${kg.toFixed(2)} kg`
}

export function relativeTime(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), 'MMM d, h:mm a')
}

export function formatDate(iso: string): string {
  return format(new Date(iso), 'MMM d, yyyy')
}

function formatAgeFromDays(days: number, suffix = ' old'): string {
  if (days < 0) {
    // Pre-term-equivalent (negative corrected age): show as "-Nw Nd".
    const abs = -days
    const weeks = Math.floor(abs / 7)
    const remDays = abs - weeks * 7
    if (weeks === 0) return `-${abs} d${suffix}`
    return `-${weeks} wk${remDays ? ` ${remDays} d` : ''}${suffix}`
  }
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}${suffix}`
  if (days < 60) {
    const weeks = Math.floor(days / 7)
    const remDays = days - weeks * 7
    return `${weeks} wk${weeks === 1 ? '' : 's'}${remDays ? ` ${remDays} d` : ''}${suffix}`
  }
  const totalMonths = Math.floor(days / 30.4375)
  const monthStartDays = Math.floor(totalMonths * 30.4375)
  const remDays = days - monthStartDays
  const weeks = Math.floor(remDays / 7)
  return `${totalMonths} mo${weeks ? ` ${weeks} wk` : ''}${suffix}`
}

// Days early the baby was (0 if full-term/unknown). Centralized so format.ts
// doesn't need to import from who.ts.
function daysEarly(
  gestationalAgeWeeks: number | null | undefined,
  gestationalAgeDays: number | null | undefined,
): number {
  if (gestationalAgeWeeks == null) return 0
  const ga = gestationalAgeWeeks * 7 + (gestationalAgeDays ?? 0)
  const diff = 40 * 7 - ga
  return diff > 0 ? diff : 0
}

// "1 mo 2 wk old" style age string. If the baby was preterm and we know GA,
// also appends a corrected age — e.g. "5 wks old · corrected: -2 d".
export function ageString(
  birthday: string,
  at: Date = new Date(),
  gestationalAgeWeeks?: number | null,
  gestationalAgeDays?: number | null,
): string {
  const bd = new Date(birthday)
  const chronoDays = differenceInDays(at, bd)
  if (chronoDays < 0) return 'not born yet'

  const chronoStr = formatAgeFromDays(chronoDays)
  const early = daysEarly(gestationalAgeWeeks, gestationalAgeDays)
  if (early === 0) return chronoStr

  const correctedDays = chronoDays - early
  const correctedStr = formatAgeFromDays(correctedDays, '')
  return `${chronoStr} · corrected: ${correctedStr}`
}

export function timeSince(iso: string): string {
  const s = timeSinceShort(iso)
  return s === 'now' ? 'just now' : `${s} ago`
}

// Same as timeSince() but without the trailing "ago" — useful in tight UI
// (summary cards) where the surrounding label already implies "ago".
// "now", "42m", "3h 17m", "2d 5h"
export function timeSinceShort(iso: string): string {
  const then = new Date(iso)
  const now = new Date()
  const mins = differenceInMinutes(now, then)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = differenceInHours(now, then)
  if (hours < 24) {
    const remMins = mins - hours * 60
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
  }
  const days = differenceInDays(now, then)
  const remHours = hours - days * 24
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

// Returns a value usable as the value of a <input type="datetime-local">.
export function toDatetimeLocal(d: Date): string {
  const tzOffset = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
}

// Returns a value usable as the value of a <input type="date">.
export function toDateInput(d: Date): string {
  const tzOffset = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10)
}
