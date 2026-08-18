import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Supabase-Zugang fehlt. Lege eine .env.local mit VITE_SUPABASE_URL und ' +
      'VITE_SUPABASE_ANON_KEY an (Vorlage: .env.example).',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
