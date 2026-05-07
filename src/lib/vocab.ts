import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { DiaperType } from './types'

// "casual" uses pet-style language ("peepies"/"poopies"). "sophisticated"
// uses clinical terms ("urine"/"stool"). The toggle lives in Settings and
// persists per-device in localStorage.
export type VocabMode = 'casual' | 'sophisticated'

export interface DiaperVocab {
  /** Sentence-cased noun, e.g. "Peepies", "Urine". */
  pee: string
  poop: string
  /** Lowercase form for inline use ("...how often we tracked peepies..."). */
  peeLower: string
  poopLower: string
}

const VOCAB: Record<VocabMode, DiaperVocab> = {
  casual: {
    pee: 'Peepies',
    poop: 'Poopies',
    peeLower: 'peepies',
    poopLower: 'poopies',
  },
  sophisticated: {
    pee: 'Urine',
    poop: 'Stool',
    peeLower: 'urine',
    poopLower: 'stool',
  },
}

const STORAGE_KEY = 'spt-vocab-mode-v1'

export function loadVocabMode(): VocabMode {
  if (typeof localStorage === 'undefined') return 'casual'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'sophisticated' ? 'sophisticated' : 'casual'
  } catch {
    return 'casual'
  }
}

export function saveVocabMode(mode: VocabMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore quota / private mode */
  }
}

/** Sentence-cased label for a diaper type, e.g. "Peepies", "Urine + stool". */
export function diaperTypeLabel(type: DiaperType, vocab: DiaperVocab): string {
  if (type === 'pee') return vocab.pee
  if (type === 'poop') return vocab.poop
  return `${vocab.pee} + ${vocab.poopLower}`
}

interface VocabContextValue {
  mode: VocabMode
  setMode: (next: VocabMode) => void
  diaper: DiaperVocab
}

const VocabContext = createContext<VocabContextValue | null>(null)

export function VocabProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<VocabMode>(() => loadVocabMode())

  // Sync changes from other tabs/windows so flipping the toggle on the
  // phone updates the laptop too.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const v = e.newValue === 'sophisticated' ? 'sophisticated' : 'casual'
      setModeState(v)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo<VocabContextValue>(
    () => ({
      mode,
      setMode: (next) => {
        setModeState(next)
        saveVocabMode(next)
      },
      diaper: VOCAB[mode],
    }),
    [mode],
  )

  return createElement(VocabContext.Provider, { value }, children)
}

export function useVocab(): VocabContextValue {
  const v = useContext(VocabContext)
  if (!v) throw new Error('useVocab must be used inside a VocabProvider')
  return v
}
