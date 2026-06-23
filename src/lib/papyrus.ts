import { useCallback, useEffect, useState } from 'react'

// A purely-for-fun per-device toggle that swaps the app's primary font to
// Papyrus. Persisted in localStorage and applied as a `papyrus` class on
// <html> (see the matching rule in index.css and the FOUC script in
// index.html). Intentionally tiny — no provider/context needed since CSS
// does the cascading once the class is on the root.
const STORAGE_KEY = 'spt-papyrus-v1'

export function loadPapyrus(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function savePapyrus(on: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}

export function applyPapyrusClass(on: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('papyrus', on)
}

/** Reads/sets the Papyrus pref and keeps the <html> class in sync. */
export function usePapyrus(): { enabled: boolean; setEnabled: (on: boolean) => void } {
  const [enabled, setEnabledState] = useState<boolean>(() => loadPapyrus())

  // Apply on mount and whenever the value changes.
  useEffect(() => {
    applyPapyrusClass(enabled)
  }, [enabled])

  // Sync across tabs / other devices viewing the same browser profile.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      setEnabledState(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on)
    savePapyrus(on)
  }, [])

  return { enabled, setEnabled }
}
