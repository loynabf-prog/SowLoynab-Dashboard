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
})
