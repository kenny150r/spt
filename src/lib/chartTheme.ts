import { useIsDark } from './theme'

// Recharts doesn't pick up Tailwind classes — strokes and fills are
// inline hex strings — so we centralize the palette here and have each
// chart pull from it via `useChartTheme()`. Returns a stable shape for
// both themes; charts can reach into the relevant sub-object.
export interface ChartTheme {
  /** CartesianGrid stroke colour. */
  grid: string
  /** XAxis / YAxis tick + axis stroke colour. */
  axis: string
  /** Tooltip cursor (the hover crosshair). */
  cursor: string
  /** Tooltip popover background / border / text. */
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  /** Legend text colour. */
  legend: string

  /** Data colours used across views. */
  bars: {
    blue: string
    sky: string
    teal: string
    tealDeep: string
    amber: string
    emerald: string
    /** Neutral grey used for the breastfeeding overlay on pump/feed charts. */
    gray: string
  }

  /** WHO percentile / ±SD line colours for the growth chart. */
  who: {
    neg3: string
    neg2: string
    p3: string
    p15: string
    p50: string
    p85: string
    p97: string
  }

  /** Reference-line colours (target wet count, expected weight, …). */
  ref: {
    stroke: string
    label: string
  }

  /** Default colour for "Sam's actual data" line. */
  sam: string
}

const LIGHT: ChartTheme = {
  grid: '#eef2f7',         // slate-100
  axis: '#475569',         // slate-600
  cursor: '#cbd5e1',       // slate-300
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e8f0', // slate-200
  tooltipText: '#0f172a',  // slate-900
  legend: '#475569',       // slate-600
  bars: {
    blue: '#2563eb',       // brand-600
    sky: '#0ea5e9',
    teal: '#14b8a6',
    tealDeep: '#0d9488',
    amber: '#f59e0b',
    emerald: '#10b981',
    gray: '#cbd5e1',       // slate-300
  },
  who: {
    neg3: '#fca5a5',       // red-300
    neg2: '#fcd34d',       // amber-300
    p3: '#cbd5e1',         // slate-300
    p15: '#94a3b8',        // slate-400
    p50: '#475569',        // slate-600
    p85: '#94a3b8',
    p97: '#cbd5e1',
  },
  ref: {
    stroke: '#10b981',     // emerald-500
    label: '#047857',      // emerald-700
  },
  sam: '#2563eb',          // brand-600
}

const DARK: ChartTheme = {
  grid: '#1e293b',         // slate-800 — visible without being shouty
  axis: '#94a3b8',         // slate-400 — light text on dark
  cursor: '#475569',       // slate-600
  tooltipBg: '#0f172a',    // slate-900
  tooltipBorder: '#334155', // slate-700
  tooltipText: '#e2e8f0',  // slate-200
  legend: '#cbd5e1',       // slate-300
  bars: {
    // Bump saturation a touch so bars pop against the dark background.
    blue: '#3b82f6',       // brand-500
    sky: '#38bdf8',
    teal: '#2dd4bf',
    tealDeep: '#14b8a6',
    amber: '#fbbf24',
    emerald: '#34d399',
    gray: '#475569',       // slate-600 — neutral overlay against dark
  },
  who: {
    // WHO bands swap orientation: light percentile rings need to be
    // BRIGHTER than the dark background, but the slate-greys we used on
    // light backgrounds disappear here. Use lighter slates with reduced
    // opacity feel via lower contrast tones.
    neg3: '#7f1d1d',       // red-900 — kept as warning hue
    neg2: '#92400e',       // amber-800
    p3: '#334155',         // slate-700
    p15: '#475569',        // slate-600
    p50: '#94a3b8',        // slate-400 — median line stays prominent
    p85: '#475569',
    p97: '#334155',
  },
  ref: {
    stroke: '#10b981',     // emerald reads fine on dark
    label: '#34d399',      // emerald-400
  },
  sam: '#60a5fa',          // brand-400 — brighter blue on dark
}

export function chartTheme(isDark: boolean): ChartTheme {
  return isDark ? DARK : LIGHT
}

/** Returns the chart palette for the current resolved theme. */
export function useChartTheme(): ChartTheme {
  return chartTheme(useIsDark())
}
