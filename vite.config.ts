import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const brandIcon = '/icons/image_76ec5c90%20(1)%20(1)%20(1).png';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'push-sw.js'],
      manifest: {
        name: 'CenPaya — Buy, Sell, Grow',
        short_name: 'CenPaya',
        description: 'The Pan-African commerce platform for CEMAC. Buy, sell, and grow safely with escrow protection.',
        theme_color: '#0F5132',
        background_color: '#F5F7F5',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['shopping', 'finance', 'business'],
        // Use the existing square brand asset and declare its real dimensions.
        icons: [
          { src: brandIcon, sizes: '1024x1024', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        importScripts: ['/push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        // Never cache authenticated API responses. D1 owns non-financial
        // application data; Supabase is reserved for financial operations.
        // Both require live authorization and must be reached over the network.
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cenpaya-public-images-v2',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
