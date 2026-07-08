import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the same build works on GitHub Pages (served under
  // /<repo>/), behind the Cloudflare tunnel, and from server.mjs.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    // In `npm run dev`, forward the field-request API to the local Node server
    // (run `npm run serve` alongside dev to exercise it). In production the Node
    // server handles /api itself, so this only matters during development.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
