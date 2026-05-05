export type Sex = 'male' | 'female'

export interface Baby {
  id: string
  name: string
  sex: Sex
  birthday: string // ISO date YYYY-MM-DD
  gestational_age_weeks: number | null
  gestational_age_days: number | null
  // Conversion factor used when computing volume-equivalent breastfeeding totals.
  // Configurable in Settings; null = use a sensible default (~20 mL/min).
  breast_ml_per_min: number | null
  created_at: string
}

export interface WeightEntry {
  id: string
  baby_id: string
  measured_at: string // ISO timestamp
  weight_kg: number
  notes: string | null
  created_at: string
}

export type FeedType = 'breast' | 'bottle'
export type FeedSide = 'left' | 'right' | 'both'

export interface FeedEntry {
  id: string
  baby_id: string
  fed_at: string
  type: FeedType
  amount_ml: number | null
  duration_min: number | null
  side: FeedSide | null
  notes: string | null
  created_at: string
}

export type DiaperType = 'pee' | 'poop' | 'both'

export interface DiaperEntry {
  id: string
  baby_id: string
  occurred_at: string
  type: DiaperType
  notes: string | null
  created_at: string
}

export type AnyEntry =
  | ({ kind: 'weight' } & WeightEntry)
  | ({ kind: 'feed' } & FeedEntry)
  | ({ kind: 'diaper' } & DiaperEntry)
