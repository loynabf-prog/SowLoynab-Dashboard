import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const KEY = 'sl-identity-member'

interface IdentityValue {
  memberId: string | null
  setMemberId: (id: string | null) => void
}

const IdentityContext = createContext<IdentityValue | undefined>(undefined)

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, val: string | null) {
  try {
    if (val) localStorage.setItem(key, val)
    else localStorage.removeItem(key)
  } catch { /* iOS Privatmodus / Speicher gesperrt -> ignorieren */ }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberIdState] = useState<string | null>(() => safeGet(KEY))

  useEffect(() => {
    safeSet(KEY, memberId)
  }, [memberId])

  return (
    <IdentityContext.Provider value={{ memberId, setMemberId: setMemberIdState }}>
      {children}
    </IdentityContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIdentity() {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity muss innerhalb von <IdentityProvider> genutzt werden')
  return ctx
}
