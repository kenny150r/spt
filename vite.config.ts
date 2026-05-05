import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // For GitHub Pages project sites, set VITE_BASE_PATH=/your-repo-name/.
  // For user/organization sites or custom domains, leave it as '/'.
  const base = env.VITE_BASE_PATH || '/'
  return {
    base,
    plugins: [react()],
  }
})
