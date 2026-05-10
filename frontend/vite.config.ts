import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'BASELINE FieldPro',
        short_name: 'FieldPro',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
      },
    }),
  ],
  server: {
    host: true,
    allowedHosts: ['host.docker.internal'],
    proxy: {
      '/api': 'http://localhost:4000'
    }
  }
})
