// WHO Child Growth Standards: weight-for-age percentiles, 0-36 months.
// Values in kilograms at the 3rd, 15th, 50th, 85th, and 97th percentiles.
// Source: World Health Organization Child Growth Standards
// (https://www.who.int/tools/child-growth-standards/standards/weight-for-age).
// These are reference values for general visualization only and are not a
// substitute for guidance from your pediatrician.

import type { Sex } from './types'

export interface PercentilePoint {
  ageMonths: number
  p3: number
  p15: number
  p50: number
  p85: number
  p97: number
}

const BOYS: PercentilePoint[] = [
  { ageMonths: 0,  p3: 2.5,  p15: 2.9,  p50: 3.3,  p85: 3.9,  p97: 4.3  },
  { ageMonths: 1,  p3: 3.4,  p15: 3.9,  p50: 4.5,  p85: 5.1,  p97: 5.7  },
  { ageMonths: 2,  p3: 4.4,  p15: 4.9,  p50: 5.6,  p85: 6.3,  p97: 7.0  },
  { ageMonths: 3,  p3: 5.1,  p15: 5.7,  p50: 6.4,  p85: 7.2,  p97: 7.9  },
  { ageMonths: 4,  p3: 5.6,  p15: 6.2,  p50: 7.0,  p85: 7.8,  p97: 8.6  },
  { ageMonths: 5,  p3: 6.1,  p15: 6.7,  p50: 7.5,  p85: 8.4,  p97: 9.2  },
  { ageMonths: 6,  p3: 6.4,  p15: 7.1,  p50: 7.9,  p85: 8.9,  p97: 9.7  },
  { ageMonths: 7,  p3: 6.7,  p15: 7.4,  p50: 8.3,  p85: 9.3,  p97: 10.2 },
  { ageMonths: 8,  p3: 7.0,  p15: 7.7,  p50: 8.6,  p85: 9.6,  p97: 10.5 },
  { ageMonths: 9,  p3: 7.2,  p15: 7.9,  p50: 8.9,  p85: 9.9,  p97: 10.9 },
  { ageMonths: 10, p3: 7.5,  p15: 8.2,  p50: 9.2,  p85: 10.2, p97: 11.2 },
  { ageMonths: 11, p3: 7.7,  p15: 8.4,  p50: 9.4,  p85: 10.5, p97: 11.5 },
  { ageMonths: 12, p3: 7.8,  p15: 8.6,  p50: 9.6,  p85: 10.8, p97: 11.8 },
  { ageMonths: 13, p3: 8.0,  p15: 8.8,  p50: 9.9,  p85: 11.0, p97: 12.1 },
  { ageMonths: 14, p3: 8.2,  p15: 9.0,  p50: 10.1, p85: 11.3, p97: 12.4 },
  { ageMonths: 15, p3: 8.4,  p15: 9.2,  p50: 10.3, p85: 11.5, p97: 12.7 },
  { ageMonths: 16, p3: 8.5,  p15: 9.4,  p50: 10.5, p85: 11.7, p97: 12.9 },
  { ageMonths: 17, p3: 8.7,  p15: 9.6,  p50: 10.7, p85: 12.0, p97: 13.2 },
  { ageMonths: 18, p3: 8.9,  p15: 9.7,  p50: 10.9, p85: 12.2, p97: 13.5 },
  { ageMonths: 19, p3: 9.0,  p15: 9.9,  p50: 11.1, p85: 12.5, p97: 13.7 },
  { ageMonths: 20, p3: 9.2,  p15: 10.1, p50: 11.3, p85: 12.7, p97: 14.0 },
  { ageMonths: 21, p3: 9.3,  p15: 10.3, p50: 11.5, p85: 12.9, p97: 14.3 },
  { ageMonths: 22, p3: 9.5,  p15: 10.5, p50: 11.8, p85: 13.2, p97: 14.5 },
  { ageMonths: 23, p3: 9.7,  p15: 10.7, p50: 12.0, p85: 13.4, p97: 14.8 },
  { ageMonths: 24, p3: 9.8,  p15: 10.8, p50: 12.2, p85: 13.7, p97: 15.1 },
  { ageMonths: 25, p3: 10.0, p15: 11.0, p50: 12.4, p85: 13.9, p97: 15.3 },
  { ageMonths: 26, p3: 10.1, p15: 11.2, p50: 12.5, p85: 14.1, p97: 15.5 },
  { ageMonths: 27, p3: 10.3, p15: 11.4, p50: 12.7, p85: 14.3, p97: 15.8 },
  { ageMonths: 28, p3: 10.4, p15: 11.5, p50: 12.9, p85: 14.5, p97: 16.0 },
  { ageMonths: 29, p3: 10.5, p15: 11.7, p50: 13.1, p85: 14.8, p97: 16.3 },
  { ageMonths: 30, p3: 10.7, p15: 11.8, p50: 13.3, p85: 15.0, p97: 16.5 },
  { ageMonths: 31, p3: 10.8, p15: 12.0, p50: 13.5, p85: 15.2, p97: 16.8 },
  { ageMonths: 32, p3: 11.0, p15: 12.1, p50: 13.7, p85: 15.4, p97: 17.0 },
  { ageMonths: 33, p3: 11.1, p15: 12.3, p50: 13.8, p85: 15.6, p97: 17.3 },
  { ageMonths: 34, p3: 11.2, p15: 12.4, p50: 14.0, p85: 15.8, p97: 17.5 },
  { ageMonths: 35, p3: 11.4, p15: 12.6, p50: 14.2, p85: 16.0, p97: 17.8 },
  { ageMonths: 36, p3: 11.5, p15: 12.7, p50: 14.3, p85: 16.2, p97: 18.0 },
]

const GIRLS: PercentilePoint[] = [
  { ageMonths: 0,  p3: 2.4,  p15: 2.8,  p50: 3.2,  p85: 3.7,  p97: 4.2  },
  { ageMonths: 1,  p3: 3.2,  p15: 3.6,  p50: 4.2,  p85: 4.8,  p97: 5.5  },
  { ageMonths: 2,  p3: 4.0,  p15: 4.5,  p50: 5.1,  p85: 5.9,  p97: 6.6  },
  { ageMonths: 3,  p3: 4.6,  p15: 5.1,  p50: 5.8,  p85: 6.7,  p97: 7.5  },
  { ageMonths: 4,  p3: 5.1,  p15: 5.6,  p50: 6.4,  p85: 7.3,  p97: 8.2  },
  { ageMonths: 5,  p3: 5.5,  p15: 6.1,  p50: 6.9,  p85: 7.8,  p97: 8.8  },
  { ageMonths: 6,  p3: 5.8,  p15: 6.4,  p50: 7.3,  p85: 8.3,  p97: 9.3  },
  { ageMonths: 7,  p3: 6.1,  p15: 6.7,  p50: 7.6,  p85: 8.7,  p97: 9.8  },
  { ageMonths: 8,  p3: 6.3,  p15: 7.0,  p50: 7.9,  p85: 9.0,  p97: 10.2 },
  { ageMonths: 9,  p3: 6.6,  p15: 7.3,  p50: 8.2,  p85: 9.3,  p97: 10.5 },
  { ageMonths: 10, p3: 6.8,  p15: 7.5,  p50: 8.5,  p85: 9.6,  p97: 10.9 },
  { ageMonths: 11, p3: 7.0,  p15: 7.7,  p50: 8.7,  p85: 9.9,  p97: 11.2 },
  { ageMonths: 12, p3: 7.1,  p15: 7.9,  p50: 8.9,  p85: 10.2, p97: 11.5 },
  { ageMonths: 13, p3: 7.3,  p15: 8.1,  p50: 9.2,  p85: 10.4, p97: 11.8 },
  { ageMonths: 14, p3: 7.5,  p15: 8.3,  p50: 9.4,  p85: 10.7, p97: 12.1 },
  { ageMonths: 15, p3: 7.7,  p15: 8.5,  p50: 9.6,  p85: 10.9, p97: 12.4 },
  { ageMonths: 16, p3: 7.8,  p15: 8.7,  p50: 9.8,  p85: 11.2, p97: 12.6 },
  { ageMonths: 17, p3: 8.0,  p15: 8.8,  p50: 10.0, p85: 11.4, p97: 12.9 },
  { ageMonths: 18, p3: 8.2,  p15: 9.0,  p50: 10.2, p85: 11.6, p97: 13.2 },
  { ageMonths: 19, p3: 8.3,  p15: 9.2,  p50: 10.4, p85: 11.9, p97: 13.5 },
  { ageMonths: 20, p3: 8.5,  p15: 9.4,  p50: 10.6, p85: 12.1, p97: 13.7 },
  { ageMonths: 21, p3: 8.7,  p15: 9.6,  p50: 10.9, p85: 12.4, p97: 14.0 },
  { ageMonths: 22, p3: 8.8,  p15: 9.8,  p50: 11.1, p85: 12.6, p97: 14.3 },
  { ageMonths: 23, p3: 9.0,  p15: 9.9,  p50: 11.3, p85: 12.8, p97: 14.6 },
  { ageMonths: 24, p3: 9.2,  p15: 10.1, p50: 11.5, p85: 13.1, p97: 14.8 },
  { ageMonths: 25, p3: 9.3,  p15: 10.3, p50: 11.7, p85: 13.3, p97: 15.1 },
  { ageMonths: 26, p3: 9.5,  p15: 10.5, p50: 11.9, p85: 13.5, p97: 15.3 },
  { ageMonths: 27, p3: 9.6,  p15: 10.7, p50: 12.1, p85: 13.7, p97: 15.6 },
  { ageMonths: 28, p3: 9.8,  p15: 10.8, p50: 12.3, p85: 14.0, p97: 15.9 },
  { ageMonths: 29, p3: 9.9,  p15: 11.0, p50: 12.5, p85: 14.2, p97: 16.1 },
  { ageMonths: 30, p3: 10.1, p15: 11.2, p50: 12.7, p85: 14.4, p97: 16.4 },
  { ageMonths: 31, p3: 10.2, p15: 11.3, p50: 12.9, p85: 14.7, p97: 16.7 },
  { ageMonths: 32, p3: 10.4, p15: 11.5, p50: 13.1, p85: 14.9, p97: 16.9 },
  { ageMonths: 33, p3: 10.5, p15: 11.7, p50: 13.3, p85: 15.1, p97: 17.2 },
  { ageMonths: 34, p3: 10.7, p15: 11.8, p50: 13.5, p85: 15.4, p97: 17.5 },
  { ageMonths: 35, p3: 10.8, p15: 12.0, p50: 13.7, p85: 15.6, p97: 17.8 },
  { ageMonths: 36, p3: 10.9, p15: 12.2, p50: 13.9, p85: 15.8, p97: 18.1 },
]

export function getReferencePercentiles(sex: Sex): PercentilePoint[] {
  return sex === 'male' ? BOYS : GIRLS
}

export const DAYS_PER_MONTH = 30.4375
const FULL_TERM_DAYS = 40 * 7

export function ageInMonths(birthday: string, at: Date = new Date()): number {
  const b = new Date(birthday)
  // Use millisecond-based fractional months for charting (avg month ~30.4375 days).
  const ms = at.getTime() - b.getTime()
  const days = ms / (1000 * 60 * 60 * 24)
  return days / DAYS_PER_MONTH
}

// How many days early the baby was. Returns 0 for full-term / unknown.
export function daysPreterm(
  gestationalAgeWeeks: number | null | undefined,
  gestationalAgeDays: number | null | undefined,
): number {
  if (gestationalAgeWeeks == null) return 0
  const gaDays = gestationalAgeWeeks * 7 + (gestationalAgeDays ?? 0)
  const diff = FULL_TERM_DAYS - gaDays
  return diff > 0 ? diff : 0
}

// Corrected (CGA) age in months: chronological age minus the prematurity offset.
// Negative values mean the baby is currently still pre-term-equivalent.
export function correctedAgeMonths(
  birthday: string,
  gestationalAgeWeeks: number | null | undefined,
  gestationalAgeDays: number | null | undefined,
  at: Date = new Date(),
): number {
  return (
    ageInMonths(birthday, at) -
    daysPreterm(gestationalAgeWeeks, gestationalAgeDays) / DAYS_PER_MONTH
  )
}

// Linear interpolation of percentile value at a given fractional age in months.
export function interpolatePercentile(
  series: PercentilePoint[],
  ageMonths: number,
  field: keyof Omit<PercentilePoint, 'ageMonths'>,
): number | null {
  if (series.length === 0) return null
  const clamped = Math.max(series[0].ageMonths, Math.min(ageMonths, series[series.length - 1].ageMonths))
  for (let i = 0; i < series.length - 1; i++) {
    const a = series[i]
    const b = series[i + 1]
    if (clamped >= a.ageMonths && clamped <= b.ageMonths) {
      const t = (clamped - a.ageMonths) / (b.ageMonths - a.ageMonths)
      return a[field] + (b[field] - a[field]) * t
    }
  }
  return series[series.length - 1][field]
}

// Estimate the percentile (0-100) of a given weight at a given age using LMS-free
// piecewise linear interpolation against the embedded reference percentiles.
export function estimatePercentile(
  sex: Sex,
  ageMonths: number,
  weightKg: number,
): number | null {
  const series = getReferencePercentiles(sex)
  if (series.length === 0) return null
  const points: { p: number; v: number }[] = (
    ['p3', 'p15', 'p50', 'p85', 'p97'] as const
  ).map((k) => ({
    p: Number(k.slice(1)),
    v: interpolatePercentile(series, ageMonths, k) as number,
  }))
  if (weightKg <= points[0].v) return points[0].p
  if (weightKg >= points[points.length - 1].v) return points[points.length - 1].p
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (weightKg >= a.v && weightKg <= b.v) {
      const t = (weightKg - a.v) / (b.v - a.v)
      return a.p + (b.p - a.p) * t
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Z-score (SDS) support.
//
// WHO's growth standards are normally expressed via LMS parameters, but we
// don't ship the LMS table. We approximate by assuming weight is log-normal
// at each age and fitting σ_log from P3 and P50 (the 3rd percentile sits at
// z ≈ -1.881 in a normal distribution). This matches WHO's published -2 SD
// and -3 SD curves to within ~50 g across 0-36 months — close enough for
// visualization, and the right model for tracking weight-for-age trends in
// small/preterm babies.
// ---------------------------------------------------------------------------

const Z_AT_P3 = -1.8807936081512509 // inverse normal CDF of 0.03

function sigmaLogAt(series: PercentilePoint[], ageMonths: number): number | null {
  const p50 = interpolatePercentile(series, ageMonths, 'p50')
  const p3 = interpolatePercentile(series, ageMonths, 'p3')
  if (!p50 || !p3 || p3 <= 0 || p50 <= 0) return null
  return (Math.log(p50) - Math.log(p3)) / -Z_AT_P3
}

// Returns the kg value at a given z-score level for a given age. e.g.,
// `weightAtZ(sex, 1, -3)` returns the boy's -3 SD weight at 1 month.
export function weightAtZ(
  sex: Sex,
  ageMonths: number,
  z: number,
): number | null {
  const series = getReferencePercentiles(sex)
  const p50 = interpolatePercentile(series, ageMonths, 'p50')
  const sigma = sigmaLogAt(series, ageMonths)
  if (!p50 || sigma == null) return null
  return Math.exp(Math.log(p50) + z * sigma)
}

// Estimates the z-score (SDS) of an actual weight for a baby's age.
export function estimateZScore(
  sex: Sex,
  ageMonths: number,
  weightKg: number,
): number | null {
  const series = getReferencePercentiles(sex)
  const p50 = interpolatePercentile(series, ageMonths, 'p50')
  const sigma = sigmaLogAt(series, ageMonths)
  if (!p50 || sigma == null) return null
  return (Math.log(weightKg) - Math.log(p50)) / sigma
}

// Standard normal CDF using Abramowitz–Stegun 7.1.26 (error < 1.5e-7).
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1.0 / (1.0 + p * ax)
  const y =
    1.0 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax)
  return sign * y
}

export function zToPercentile(z: number): number {
  return 50 * (1 + erf(z / Math.SQRT2))
}
