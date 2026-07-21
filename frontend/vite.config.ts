import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg}',
          // Latin subsets of the brand fonts (Inter + IBM Plex Mono): the field
          // surface is offline-first, so typography must not depend on having
          // fetched fonts while online. Other unicode subsets load on demand.
          'assets/*-latin-{400,500,600,700,800}-normal-*.woff2',
        ],
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
  },

})
