import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './lib/supabase'
import { listBabies } from './lib/api'
import type { Baby } from './lib/types'
import { SignIn } from './components/SignIn'
import { SetupBaby } from './components/SetupBaby'
import { Layout } from './components/Layout'
import type { View } from './components/Layout'
import { LogView } from './views/LogView'
import { FeedingView } from './views/FeedingView'
import { PumpingView } from './views/PumpingView'
import { DiapersView } from './views/DiapersView'
import { GrowthView } from './views/GrowthView'
import { AskView } from './views/AskView'
import { SettingsView } from './views/SettingsView'
import { MissingConfig } from './components/MissingConfig'

function App() {
  const [bootstrapped, setBootstrapped] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [baby, setBaby] = useState<Baby | null>(null)
  const [loadingBaby, setLoadingBaby] = useState(false)
  const [view, setView] = useState<View>('log')

  useEffect(() => {
    if (!supabaseConfigured) {
      setBootstrapped(true)
      return
    }
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setBootstrapped(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setBaby(null)
      return
    }
    setLoadingBaby(true)
    listBabies()
      .then((rows) => {
        setBaby(rows[0] ?? null)
      })
      .finally(() => setLoadingBaby(false))
  }, [session])

  if (!supabaseConfigured) return <MissingConfig />
  if (!bootstrapped) return <Splash />
  if (!session) return <SignIn />
  if (loadingBaby) return <Splash />
  if (!baby) return <SetupBaby onCreated={setBaby} />

  return (
    <Layout baby={baby} view={view} onChangeView={setView}>
      {view === 'log' && <LogView baby={baby} />}
      {view === 'feeding' && <FeedingView baby={baby} />}
      {view === 'pumping' && <PumpingView baby={baby} />}
      {view === 'diapers' && <DiapersView baby={baby} />}
      {view === 'growth' && <GrowthView baby={baby} />}
      {view === 'ask' && <AskView baby={baby} />}
      {view === 'settings' && <SettingsView baby={baby} onUpdated={setBaby} />}
    </Layout>
  )
}

function Splash() {
  return (
    <div className="min-h-dvh grid place-items-center text-slate-400 text-sm">
      Loading…
    </div>
  )
}

export default App
