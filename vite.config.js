import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Read version from public/version.json
const versionPath = path.resolve(__dirname, 'public/version.json');
let version = 'dev';
try {
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
    version = versionData.version;
}
catch (e) {
    console.warn('Could not read public/version.json');
}
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
                manualChunks(id) {
                    if (!id.includes('node_modules'))
                        return;
                    if (id.includes('/node_modules/@firebase/firestore') || id.includes('/node_modules/firebase/firestore')) {
                        return 'firebase-firestore';
                    }
                    if (id.includes('/node_modules/@firebase/auth') || id.includes('/node_modules/firebase/auth')) {
                        return 'firebase-auth';
                    }
                    if (id.includes('/node_modules/@firebase/storage') || id.includes('/node_modules/firebase/storage')) {
                        return 'firebase-storage';
                    }
                    if (id.includes('/node_modules/@firebase/functions') || id.includes('/node_modules/firebase/functions')) {
                        return 'firebase-functions';
                    }
                    if (id.includes('/node_modules/@firebase/app') || id.includes('/node_modules/firebase/app')) {
                        return 'firebase-core';
                    }
                    if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router-dom/') || id.includes('/node_modules/react-i18next/') || id.includes('/node_modules/i18next/')) {
                        return 'react-vendor';
                    }
                    if (id.includes('/node_modules/xlsx/')) {
                        return 'xlsx-vendor';
                    }
                    if (id.includes('/node_modules/jspdf/') || id.includes('/node_modules/jspdf-autotable/')) {
                        return 'jspdf-vendor';
                    }
                    if (id.includes('/node_modules/pdfjs-dist/')) {
                        return 'pdfjs-vendor';
                    }
                    if (id.includes('/node_modules/date-fns/')) {
                        return 'date-vendor';
                    }
                    if (id.includes('/node_modules/lucide-react/')) {
                        return 'icons-vendor';
                    }
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
            '.app.github.dev',
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
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.VITE_APP_VERSION || version),
    },
});
