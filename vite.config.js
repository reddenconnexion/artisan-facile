import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Mode « prompt » : la nouvelle version ne s'active PAS silencieusement.
      // Le service worker reste en attente et déclenche needRefresh, ce qui
      // affiche un bandeau « Nouvelle version disponible — Recharger » (cf.
      // ReloadPrompt). Sans cela (autoUpdate + skipWaiting), les onglets/apps
      // gardés ouverts (desktop, PWA macOS) restaient bloqués sur l'ancien
      // cache sans aucune invite.
      registerType: 'prompt',
      devOptions: {
        enabled: true
      },
      includeAssets: ['favicon.ico', 'offline.html', 'pwa-192x192.svg', 'pwa-512x512.svg', 'push-handler.js'],
      manifest: {
        name: 'Artisan Facile',
        short_name: 'ArtisanFacile',
        description: 'Logiciel de gestion gratuit pour artisans : devis, facturation, agenda, CRM et comptabilité.',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'fr-FR',
        categories: ['business', 'productivity', 'finance'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        importScripts: ['push-handler.js'],
        // Pas de skipWaiting : en mode « prompt », le nouveau service worker
        // attend le clic de l'utilisateur (updateServiceWorker) avant de
        // s'activer. clientsClaim prend alors effet à ce moment-là.
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5000000,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /supabase/],
        runtimeCaching: [
          // Assets statiques Supabase (Storage public : logos, PDF, images).
          // On peut les mettre en cache longtemps sans risquer d'afficher de
          // données métier obsolètes.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // API métier Supabase (REST, RPC, Auth, Realtime, Functions) :
          // toujours réseau pour éviter d'afficher des chiffres périmés sur
          // les devis/factures. Le fallback hors-ligne est géré côté React
          // Query via `withOfflineCache` (localStorage) dans useDataCache.js.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|auth|realtime|functions)\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // camera/microphone=(self) : la visite technique enregistre le client
      // et photographie depuis la page — aligné sur vercel.json (production).
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
      'Content-Security-Policy': [
        "default-src 'self'",
        // Scripts : self + wasm pour pdf.js
        "script-src 'self' 'wasm-unsafe-eval'",
        // Styles : unsafe-inline requis par Tailwind CSS
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        // Fonts
        "font-src 'self' https://fonts.gstatic.com",
        // Images : data: pour les aperçus base64, blob: pour les PDF, https: pour Supabase Storage
        "img-src 'self' data: blob: https:",
        // Workers : blob: pour pdf.js worker
        "worker-src 'self' blob:",
        // Connexions API : Supabase + OpenStreetMap (géocodage + routage OSRM) + OpenProductsFacts (EAN)
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://router.project-osrm.org https://world.openproductsfacts.org https://ntfy.sh",
        // Frames : autorise l'ouverture des PDFs Supabase Storage dans iframe
        "frame-src 'self' blob: https://*.supabase.co",
        // Médias : blob: pour les aperçus audio (notes vocales)
        "media-src 'self' blob:",
        // Objets PDF embarqués
        "object-src 'none'",
        // Upgrade HTTP → HTTPS
        "upgrade-insecure-requests"
      ].join('; ')
    }
  },
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(process.env.npm_package_version),
    // Horodatage du build, affiché dans Paramètres : permet de vérifier en un
    // coup d'œil quelle version tourne sur un appareil (diagnostic PWA/cache).
    'import.meta.env.BUILD_DATE': JSON.stringify(new Date().toISOString())
  },
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  build: {
    target: ['es2020', 'safari14'],
    rollupOptions: {
      output: {
        // Forme fonction (et non objet) : la forme objet range aussi dans le
        // chunk manuel les dépendances partagées (react-dom, helpers CommonJS…),
        // si bien que l'entrée principale importait « charts », « pdfgen » et
        // « pdfjs » (~1,7 Mo) dès le démarrage, même sur la page d'accueil.
        manualChunks(id) {
          // Modules virtuels (helpers CommonJS de Rollup, preload-helper de
          // Vite) : partagés par tout le monde.
          if (id.startsWith('\0commonjsHelpers') || id.startsWith('\0vite/')) return 'vendor';
          if (!id.includes('/node_modules/')) return undefined;
          const pkg = id.split('/node_modules/').pop();
          const is = (...names) => names.some((n) => pkg.startsWith(n + '/'));
          // Socle partagé, assigné explicitement : sans ça Rollup le range dans
          // le premier chunk manuel qui en dépend (react-dom se retrouvait
          // dans « charts »).
          if (is('react', 'react-dom', 'scheduler', 'react-is', 'use-sync-external-store',
            'tslib', '@babel/runtime')) return 'vendor';
          // Bibliothèques PDF (très lourdes)
          if (is('pdfjs-dist')) return 'pdfjs';
          if (is('jspdf', 'jspdf-autotable', 'pdf-lib', '@pdf-lib')) return 'pdfgen';
          if (is('mammoth')) return 'mammoth';
          // Graphiques
          if (is('recharts', 'victory-vendor', 'd3-scale', 'd3-shape', 'd3-array', 'd3-interpolate',
            'd3-time', 'd3-time-format', 'd3-format', 'd3-color', 'd3-path')) return 'charts';
          // Utilitaires
          if (is('date-fns')) return 'dateFns';
          // React Query
          if (is('@tanstack/react-query', '@tanstack/query-core')) return 'query';
          // Autres
          if (is('read-excel-file')) return 'excelReader';
          return undefined;
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    globals: false,
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/utils/**/*.{js,jsx}', 'src/hooks/**/*.{js,jsx}']
    }
  }
})
// Forced Update: Mon Feb  9 08:51:43 PM CET 2026
