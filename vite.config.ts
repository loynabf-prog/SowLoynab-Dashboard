/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// base wird beim GitHub-Pages-Build auf den Repo-Unterpfad gesetzt
// (via VITE_BASE im Workflow). Lokal und bei eigener Domain bleibt es "/".

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
  // Die Tests pruefen reine Rechenlogik, reden also nie mit Supabase. Der
  // Zugang wird trotzdem beim Import geprueft -- deshalb hier Platzhalter,
  // damit "npm test" ohne eingerichtete .env.local laeuft.
  test: {
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
