import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { getCategories, type Category } from '../lib/categories'

interface CategoryValue {
  categories: Category[]
  byId: (id: string | null | undefined) => Category | undefined
  reload: () => void
}

const CategoryContext = createContext<CategoryValue | undefined>(undefined)

export function CategoryProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])

  async function reload() {
    try { setCategories(await getCategories()) } catch { /* Tabelle evtl. noch nicht da */ }
  }

  useEffect(() => {
    if (!session) { setCategories([]); return }
    reload()
    const ch = supabase
      .channel('app-settings-cats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => reload())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  const map = new Map(categories.map((c) => [c.id, c]))
  return (
    <CategoryContext.Provider value={{ categories, byId: (id) => (id ? map.get(id) : undefined), reload }}>
      {children}
    </CategoryContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCategories() {
  const ctx = useContext(CategoryContext)
  if (!ctx) throw new Error('useCategories muss innerhalb von <CategoryProvider> genutzt werden')
  return ctx
}
