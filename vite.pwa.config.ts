import { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaConfig: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'firestore-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'storage-cache',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dagen
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
  manifest: {
    name: 'FPi Future Factory Hub',
    short_name: 'FPi Factory',
    description: 'Manufacturing Execution System voor FPi Future Factory',
    theme_color: '#ffffff',
    background_color: '#ffffff',
    display: 'standalone',
    orientation: 'any',
    scope: '/',
    start_url: '/',
    icons: [
      { src: 'favicon.ico', sizes: '64x64 32x32 24x24 16x16', type: 'image/x-icon' },
      { src: 'logo192.png', type: 'image/png', sizes: '192x192' },
      { src: 'logo512.png', type: 'image/png', sizes: '512x512', purpose: 'any maskable' }
    ],
  },
};