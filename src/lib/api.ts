import { supabase } from './supabase'
import type {
  Baby,
  DiaperEntry,
  DiaperType,
  FeedEntry,
  FeedSide,
  FeedType,
  PumpEntry,
  PumpSide,
  Sex,
  SupplementEntry,
  WeightEntry,
} from './types'

export async function listBabies(): Promise<Baby[]> {
  const { data, error } = await supabase
    .from('babies')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createBaby(input: {
  name: string
  sex: Sex
  birthday: string
  gestational_age_weeks?: number | null
  gestational_age_days?: number | null
}): Promise<Baby> {
  const { data, error } = await supabase
    .from('babies')
    .insert({
      name: input.name,
      sex: input.sex,
      birthday: input.birthday,
      gestational_age_weeks: input.gestational_age_weeks ?? null,
      gestational_age_days: input.gestational_age_days ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Baby
}

export async function updateBaby(
  id: string,
  patch: Partial<
    Pick<
      Baby,
      | 'name'
      | 'sex'
      | 'birthday'
      | 'gestational_age_weeks'
      | 'gestational_age_days'
      | 'breast_ml_per_min'
    >
  >,
): Promise<Baby> {
  const { data, error } = await supabase
    .from('babies')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Baby
}

// ---- Weights ----
export async function listWeights(babyId: string): Promise<WeightEntry[]> {
  const { data, error } = await supabase
    .from('weights')
    .select('*')
    .eq('baby_id', babyId)
    .order('measured_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addWeight(input: {
  baby_id: string
  measured_at: string
  weight_kg: number
  notes?: string | null
}): Promise<WeightEntry> {
  const { data, error } = await supabase
    .from('weights')
    .insert({ ...input, notes: input.notes ?? null })
    .select()
    .single()
  if (error) throw error
  return data as WeightEntry
}

export async function updateWeight(
  id: string,
  patch: {
    measured_at?: string
    weight_kg?: number
    notes?: string | null
  },
): Promise<WeightEntry> {
  const { data, error } = await supabase
    .from('weights')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as WeightEntry
}

// ---- Feeds ----
export async function listFeeds(
  babyId: string,
  limit = 50,
): Promise<FeedEntry[]> {
  const { data, error } = await supabase
    .from('feeds')
    .select('*')
    .eq('baby_id', babyId)
    .order('fed_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function listFeedsSince(
  babyId: string,
  sinceISO: string,
): Promise<FeedEntry[]> {
  const { data, error } = await supabase
    .from('feeds')
    .select('*')
    .eq('baby_id', babyId)
    .gte('fed_at', sinceISO)
    .order('fed_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addFeed(input: {
  baby_id: string
  fed_at: string
  type: FeedType
  amount_ml?: number | null
  duration_min?: number | null
  side?: FeedSide | null
  iron?: boolean
  multivitamin?: boolean
  notes?: string | null
}): Promise<FeedEntry> {
  const { data, error } = await supabase
    .from('feeds')
    .insert({
      baby_id: input.baby_id,
      fed_at: input.fed_at,
      type: input.type,
      amount_ml: input.amount_ml ?? null,
      duration_min: input.duration_min ?? null,
      side: input.side ?? null,
      iron: input.iron ?? false,
      multivitamin: input.multivitamin ?? false,
      notes: input.notes ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as FeedEntry
}

export async function updateFeed(
  id: string,
  patch: {
    fed_at?: string
    type?: FeedType
    amount_ml?: number | null
    duration_min?: number | null
    side?: FeedSide | null
    iron?: boolean
    multivitamin?: boolean
    notes?: string | null
  },
): Promise<FeedEntry> {
  const { data, error } = await supabase
    .from('feeds')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as FeedEntry
}

// ---- Diapers ----
export async function listDiapers(
  babyId: string,
  limit = 50,
): Promise<DiaperEntry[]> {
  const { data, error } = await supabase
    .from('diapers')
    .select('*')
    .eq('baby_id', babyId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function listDiapersSince(
  babyId: string,
  sinceISO: string,
): Promise<DiaperEntry[]> {
  const { data, error } = await supabase
    .from('diapers')
    .select('*')
    .eq('baby_id', babyId)
    .gte('occurred_at', sinceISO)
    .order('occurred_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addDiaper(input: {
  baby_id: string
  occurred_at: string
  type: DiaperType
  notes?: string | null
}): Promise<DiaperEntry> {
  const { data, error } = await supabase
    .from('diapers')
    .insert({
      baby_id: input.baby_id,
      occurred_at: input.occurred_at,
      type: input.type,
      notes: input.notes ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as DiaperEntry
}

export async function updateDiaper(
  id: string,
  patch: {
    occurred_at?: string
    type?: DiaperType
    notes?: string | null
  },
): Promise<DiaperEntry> {
  const { data, error } = await supabase
    .from('diapers')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as DiaperEntry
}

// ---- Pumps ----
export async function listPumps(
  babyId: string,
  limit = 50,
): Promise<PumpEntry[]> {
  const { data, error } = await supabase
    .from('pumps')
    .select('*')
    .eq('baby_id', babyId)
    .order('pumped_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function listPumpsSince(
  babyId: string,
  sinceISO: string,
): Promise<PumpEntry[]> {
  const { data, error } = await supabase
    .from('pumps')
    .select('*')
    .eq('baby_id', babyId)
    .gte('pumped_at', sinceISO)
    .order('pumped_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addPump(input: {
  baby_id: string
  pumped_at: string
  side: PumpSide
  amount_ml?: number | null
  left_ml?: number | null
  right_ml?: number | null
  duration_min?: number | null
  notes?: string | null
}): Promise<PumpEntry> {
  const { data, error } = await supabase
    .from('pumps')
    .insert({
      baby_id: input.baby_id,
      pumped_at: input.pumped_at,
      side: input.side,
      amount_ml: input.amount_ml ?? null,
      left_ml: input.left_ml ?? null,
      right_ml: input.right_ml ?? null,
      duration_min: input.duration_min ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as PumpEntry
}

export async function updatePump(
  id: string,
  patch: {
    pumped_at?: string
    side?: PumpSide
    amount_ml?: number | null
    left_ml?: number | null
    right_ml?: number | null
    duration_min?: number | null
    notes?: string | null
  },
): Promise<PumpEntry> {
  const { data, error } = await supabase
    .from('pumps')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as PumpEntry
}

// ---- Supplements ----
export async function listSupplements(
  babyId: string,
  limit = 50,
): Promise<SupplementEntry[]> {
  const { data, error } = await supabase
    .from('supplements')
    .select('*')
    .eq('baby_id', babyId)
    .order('given_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function listSupplementsSince(
  babyId: string,
  sinceISO: string,
): Promise<SupplementEntry[]> {
  const { data, error } = await supabase
    .from('supplements')
    .select('*')
    .eq('baby_id', babyId)
    .gte('given_at', sinceISO)
    .order('given_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addSupplement(input: {
  baby_id: string
  given_at: string
  multivitamin: boolean
  iron: boolean
  notes?: string | null
}): Promise<SupplementEntry> {
  const { data, error } = await supabase
    .from('supplements')
    .insert({
      baby_id: input.baby_id,
      given_at: input.given_at,
      multivitamin: input.multivitamin,
      iron: input.iron,
      notes: input.notes ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as SupplementEntry
}

export async function updateSupplement(
  id: string,
  patch: {
    given_at?: string
    multivitamin?: boolean
    iron?: boolean
    notes?: string | null
  },
): Promise<SupplementEntry> {
  const { data, error } = await supabase
    .from('supplements')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as SupplementEntry
}

// ---- Generic delete ----
export async function deleteEntry(
  table: 'weights' | 'feeds' | 'diapers' | 'pumps' | 'supplements',
  id: string,
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}
