import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

// 'system' tracks the OS preference (light/dark) and switches live when
// the user toggles their OS theme. 'light'/'dark' force a specific
// appearance regardless of OS pref.
export type ThemeMode = 'system' | 'light' | 'dark'

/** The actually-applied theme after resolving 'system'. */
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'spt-theme-mode-v1'
const DEFAULT_MODE: ThemeMode = 'dark'

function loadMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return DEFAULT_MODE
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

function saveMode(mode: ThemeMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore quota / private mode */
  }
}

function readSystemPref(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyDarkClass(isDark: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', isDark)
  // Keep the mobile browser chrome (Safari/Chrome address bar) tinted to
  // match. Color values are picked to align with bg-slate-50 and
  // bg-slate-950 used by the body in light/dark respectively.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = isDark ? '#020617' : '#f8fafc'
}

interface ThemeContextValue {
  /** The user's chosen mode ('system' | 'light' | 'dark'). */
  mode: ThemeMode
  /** What actually got applied ('light' | 'dark'). */
  resolved: ResolvedTheme
  /** True when resolved === 'dark'. Convenience for chart code. */
  isDark: boolean
  setMode: (next: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => loadMode())
  const [systemPref, setSystemPref] = useState<ResolvedTheme>(() =>
    readSystemPref(),
  )

  // Live-update when the OS theme flips while the app is open
  // (matters for users who have an automatic day/night schedule).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      setSystemPref(e.matches ? 'dark' : 'light')
    }
    // Safari < 14 only supports the legacy addListener; everyone else
    // gets addEventListener. Try the modern API first.
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  // Sync changes from other tabs (e.g. parent flips dark mode on laptop
  // while phone is open).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const v = e.newValue
      setModeState(v === 'light' || v === 'dark' ? v : 'system')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const resolved: ResolvedTheme = mode === 'system' ? systemPref : mode

  // Reflect the resolved theme on <html> so Tailwind `dark:` variants
  // (and any plain-CSS dark selectors) take effect.
  useEffect(() => {
    applyDarkClass(resolved === 'dark')
  }, [resolved])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    saveMode(next)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, isDark: resolved === 'dark', setMode }),
    [mode, resolved, setMode],
  )

  return createElement(ThemeContext.Provider, { value }, children)
}

export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeContext)
  if (!v) throw new Error('useTheme must be used inside a ThemeProvider')
  return v
}

/** Convenience hook for code paths that only need the resolved boolean. */
export function useIsDark(): boolean {
  return useTheme().isDark
}
