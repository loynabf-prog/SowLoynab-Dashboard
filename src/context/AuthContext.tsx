import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Schickt den Zurücksetzen-Link an diese Adresse. */
  passwortVergessen: (email: string) => Promise<{ error: string | null }>
  /** Neues Passwort setzen — im Zurücksetzen-Fall oder ganz normal angemeldet. */
  passwortSetzen: (passwort: string) => Promise<{ error: string | null }>
  /**
   * Wir sind gerade über einen Zurücksetzen-Link hereingekommen und sollen
   * ein neues Passwort abfragen, statt die App zu zeigen.
   */
  zuruecksetzen: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [zuruecksetzen, setZuruecksetzen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      // Supabase meldet sich mit diesem Ereignis, wenn jemand ueber den Link
      // aus der Mail kommt. Die Sitzung ist dann gueltig -- wir zeigen aber
      // nicht die App, sondern fragen zuerst das neue Passwort ab.
      if (event === 'PASSWORD_RECOVERY') setZuruecksetzen(true)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    setZuruecksetzen(false)
    await supabase.auth.signOut()
  }

  async function passwortVergessen(email: string) {
    // Bewusst OHNE redirectTo: dann nimmt Supabase die im Projekt
    // hinterlegte Adresse, die ohnehin erlaubt ist. Ein eigenes Ziel muesste
    // erst in die Freigabeliste eingetragen werden -- ein Handgriff mehr,
    // der nur Fehlerquellen schafft.
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    return { error: error ? error.message : null }
  }

  async function passwortSetzen(passwort: string) {
    const { error } = await supabase.auth.updateUser({ password: passwort })
    if (!error) setZuruecksetzen(false)
    return { error: error ? error.message : null }
  }

  return (
    <AuthContext.Provider
      value={{
        session, user: session?.user ?? null, loading,
        signIn, signOut, passwortVergessen, passwortSetzen, zuruecksetzen,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> genutzt werden')
  return ctx
}
