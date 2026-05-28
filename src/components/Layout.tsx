import {
  Activity,
  Droplet,
  LineChart,
  LogOut,
  Milk,
  Settings as SettingsIcon,
  Sparkles,
  Wind,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Baby } from '../lib/types'
import { ageString } from '../lib/format'
import { supabase } from '../lib/supabase'

export type View =
  | 'log'
  | 'feeding'
  | 'pumping'
  | 'diapers'
  | 'growth'
  | 'ask'
  | 'settings'

interface Props {
  baby: Baby
  view: View
  onChangeView: (v: View) => void
  children: ReactNode
}

export function Layout({ baby, view, onChangeView, children }: Props) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200 dark:bg-slate-950/80 dark:border-slate-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight truncate">{baby.name}</h1>
            <p className="text-xs text-slate-500 truncate dark:text-slate-400">
              {ageString(
                baby.birthday,
                new Date(),
                baby.gestational_age_weeks,
                baby.gestational_age_days,
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChangeView('settings')}
            className={`btn-ghost ${view === 'settings' ? 'text-brand-600 bg-brand-50 dark:text-brand-300 dark:bg-brand-900/30' : ''}`}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="btn-ghost"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 pb-28">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)] dark:bg-slate-950 dark:border-slate-800">
        <div className="max-w-2xl mx-auto px-1 py-2 grid grid-cols-6">
          <NavButton
            label="Log"
            active={view === 'log'}
            onClick={() => onChangeView('log')}
            icon={<Activity className="h-5 w-5" />}
          />
          <NavButton
            label="Feed"
            active={view === 'feeding'}
            onClick={() => onChangeView('feeding')}
            icon={<Milk className="h-5 w-5" />}
          />
          <NavButton
            label="Pump"
            active={view === 'pumping'}
            onClick={() => onChangeView('pumping')}
            icon={<Wind className="h-5 w-5" />}
          />
          <NavButton
            label="Diaper"
            active={view === 'diapers'}
            onClick={() => onChangeView('diapers')}
            icon={<Droplet className="h-5 w-5" />}
          />
          <NavButton
            label="Growth"
            active={view === 'growth'}
            onClick={() => onChangeView('growth')}
            icon={<LineChart className="h-5 w-5" />}
          />
          <NavButton
            label="Ask"
            active={view === 'ask'}
            onClick={() => onChangeView('ask')}
            icon={<Sparkles className="h-5 w-5" />}
          />
        </div>
      </nav>
    </div>
  )
}

function NavButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center py-2 rounded-xl transition-colors ${
        active
          ? 'text-brand-600 bg-brand-50 dark:text-brand-300 dark:bg-brand-900/30'
          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      {icon}
      <span className="text-xs mt-0.5 font-medium">{label}</span>
    </button>
  )
}
