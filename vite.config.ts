import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        }
      }
    }
  },

  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    strictPort: !process.env.PORT, // Flexibel zijn als Vercel/Process een poort toewijst
    host: true,       // Maakt de server bereikbaar voor externe verbindingen
    
    // Sta specifiek het sandbox domein toe om security blocks te voorkomen
    allowedHosts: [
      'localhost',
      '.csb.app',
      'ffqznh-3000.csb.app'
    ],

    hmr: {
      clientPort: 443, // Noodzakelijk voor Hot Module Replacement over HTTPS
    },
  },

  define: {
    // Injecteert de appId in de globale scope van de applicatie
    __app_id: JSON.stringify('fittings-app-v1'),
  },
});