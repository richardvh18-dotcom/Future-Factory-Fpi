import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Vite Configuratie V2.6 - Vercel Deployment Fix
 * + SPA routing support
 * + Optimized build configuration
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Zorgt ervoor dat we @ kunnen gebruiken als kortere weg naar de src map
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom', 'react-i18next', 'i18next'],
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
          'xlsx-vendor': ['xlsx'],
          'jspdf-vendor': ['jspdf', 'jspdf-autotable'],
          'pdfjs-vendor': ['pdfjs-dist'],
          'date-vendor': ['date-fns'],
          'icons-vendor': ['lucide-react']
        }
      }
    }
  },

  server: {
    port: 3000,
    strictPort: true,
    host: true,
    allowedHosts: [
      'localhost',
      '.csb.app',
      'ffqznh-3000.csb.app'
    ],
    // hmr: {
    //   clientPort: 443, 
    // },
  },

  define: {
    // Injecteert de appId in de globale scope van de applicatie
    __app_id: JSON.stringify('fittings-app-v1'),
  },
});