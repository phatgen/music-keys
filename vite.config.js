import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path for GitHub Pages: github.com/phatgen/music-keys → phatgen.github.io/music-keys
  base: '/music-keys/',
})
