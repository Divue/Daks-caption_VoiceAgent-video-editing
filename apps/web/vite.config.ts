import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // The repo-root .env holds VITE_API_URL. Vite reads env from its own root by default,
  // which is apps/web, so without this it never sees that file and VITE_API_URL is undefined.
  // Only VITE_-prefixed vars are exposed to client code; never add a secret under that prefix.
  envDir: '../..',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
