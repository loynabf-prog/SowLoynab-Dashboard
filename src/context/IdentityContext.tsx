import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const KEY = 'sl-identity-member'

interface IdentityValue {
  memberId: string | null
  setMemberId: (id: string | null) => void
}

const IdentityContext = createContext<IdentityValue | undefined>(undefined)

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberIdState] = useState<string | null>(() => localStorage.getItem(KEY))

  useEffect(() => {
    if (memberId) localStorage.setItem(KEY, memberId)
    else localStorage.removeItem(KEY)
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
