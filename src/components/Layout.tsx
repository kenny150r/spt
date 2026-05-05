import { Activity, Droplet, LineChart, LogOut, Milk, Settings as SettingsIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Baby } from '../lib/types'
import { ageString } from '../lib/format'
import { supabase } from '../lib/supabase'

export type View = 'log' | 'feeding' | 'diapers' | 'growth' | 'settings'

interface Props {
  baby: Baby
  view: View
  onChangeView: (v: View) => void
  children: ReactNode
}

export function Layout({ baby, view, onChangeView, children }: Props) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight truncate">{baby.name}</h1>
            <p className="text-xs text-slate-500 truncate">
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

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto px-1 py-2 grid grid-cols-5">
          <NavButton
            label="Log"
            active={view === 'log'}
            onClick={() => onChangeView('log')}
            icon={<Activity className="h-5 w-5" />}
          />
          <NavButton
            label="Feeding"
            active={view === 'feeding'}
            onClick={() => onChangeView('feeding')}
            icon={<Milk className="h-5 w-5" />}
          />
          <NavButton
            label="Diapers"
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
            label="Settings"
            active={view === 'settings'}
            onClick={() => onChangeView('settings')}
            icon={<SettingsIcon className="h-5 w-5" />}
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
        active ? 'text-brand-600 bg-brand-50' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      <span className="text-xs mt-0.5 font-medium">{label}</span>
    </button>
  )
}
