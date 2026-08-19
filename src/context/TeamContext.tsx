import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { TeamMember } from '../lib/types'

interface TeamValue {
  members: TeamMember[]
  byId: (id: string) => TeamMember | undefined
  reload: () => void
}

const TeamContext = createContext<TeamValue | undefined>(undefined)

export function TeamProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])

  async function reload() {
    const { data } = await supabase.from('team_members').select('*').order('created_at')
    setMembers((data ?? []) as TeamMember[])
  }

  useEffect(() => {
    if (!session) {
      setMembers([])
      return
    }
    reload()
    const ch = supabase
      .channel('team-members')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  const map = new Map(members.map((m) => [m.id, m]))
  return (
    <TeamContext.Provider value={{ members, byId: (id) => map.get(id), reload }}>
      {children}
    </TeamContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTeam() {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeam muss innerhalb von <TeamProvider> genutzt werden')
  return ctx
}
