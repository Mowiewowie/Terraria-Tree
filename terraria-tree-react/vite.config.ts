import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Cache core app assets (JS, CSS, HTML) with network-first strategy
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css|html)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'terraria-app-core',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
            },
          },
          {
            // Terraria wiki images: cache-first with 7-day expiry
            urlPattern: /^https:\/\/terraria\.wiki\.gg\/.*(images|Special:FilePath)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'terraria-wiki-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // JSON data files: network-first
            urlPattern: /\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'terraria-data',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      manifest: {
        name: 'TerrariTree - Crafting Tree & Tool',
        short_name: 'TerrariTree',
        description: 'Interactive crafting tree, recipe explorer, and discover tool for Terraria.',
        theme_color: '#0b101e',
        background_color: '#0b101e',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
