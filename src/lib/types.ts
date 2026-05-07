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
  iron: boolean
  multivitamin: boolean
  notes: string | null
  created_at: string
}

export type DiaperType = 'pee' | 'poop' | 'both'
export type DiaperSize = 'small' | 'medium' | 'large'

export interface DiaperEntry {
  id: string
  baby_id: string
  occurred_at: string
  type: DiaperType
  // Stool size; only meaningful when type is 'poop' or 'both'. Null
  // otherwise (and for older entries logged before size tracking
  // existed).
  size: DiaperSize | null
  notes: string | null
  created_at: string
}

export type PumpSide = 'left' | 'right' | 'both'

export interface PumpEntry {
  id: string
  baby_id: string
  pumped_at: string
  side: PumpSide
  amount_ml: number | null
  // Per-side amounts; only populated for side='both' sessions where the user
  // (or importer) recorded each breast separately. When null on a 'both' row,
  // chart code falls back to a 50/50 split of amount_ml.
  left_ml: number | null
  right_ml: number | null
  duration_min: number | null
  notes: string | null
  created_at: string
}

export interface SupplementEntry {
  id: string
  baby_id: string
  given_at: string
  multivitamin: boolean
  iron: boolean
  notes: string | null
  created_at: string
}

export type AnyEntry =
  | ({ kind: 'weight' } & WeightEntry)
  | ({ kind: 'feed' } & FeedEntry)
  | ({ kind: 'diaper' } & DiaperEntry)
  | ({ kind: 'pump' } & PumpEntry)
  | ({ kind: 'supplement' } & SupplementEntry)
