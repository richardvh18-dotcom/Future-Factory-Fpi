#!/bin/bash

echo "🔥 Firebase Project Configuratie Wizard 🔥"
echo "=========================================="
echo ""
echo "Project: future-factory-377ef"
echo "Project Number: 180452063401"
echo ""
echo "📋 Volg deze stappen:"
echo ""
echo "1️⃣  Open Firebase Console:"
echo "    https://console.firebase.google.com/project/future-factory-377ef/settings/general"
echo ""
echo "2️⃣  Scroll naar 'Your apps' sectie"
echo ""
echo "3️⃣  Als je GEEN web app ziet:"
echo "    - Klik op '</>' (Web icon)"
echo "    - Geef een naam (bijv: 'FPI Web App')"
echo "    - Klik 'Register app'"
echo ""
echo "4️⃣  Kopieer de firebaseConfig code"
echo ""
echo "5️⃣  Voer hieronder de waarden in:"
echo ""

read -p "📌 API Key (begint met AIzaSy...): " API_KEY
read -p "📌 App ID (format: 1:xxx:web:xxx): " APP_ID

echo ""
echo "⚙️  Genereren van .env file..."

cat > .env << EOF
# Firebase Configuratie - future-factory-377ef
VITE_FIREBASE_API_KEY=$API_KEY
VITE_FIREBASE_AUTH_DOMAIN=future-factory-377ef.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=future-factory-377ef
VITE_FIREBASE_STORAGE_BUCKET=future-factory-377ef.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=180452063401
VITE_FIREBASE_APP_ID=$APP_ID

# AI & Other Services
VITE_GEMINI_API_KEY=REDACTED

# Master Admin UID
VITE_MASTER_ADMIN_UID=pzxPfiwQhnQdEQJcXU77ZgT2Jo32
EOF

echo ""
echo "✅ .env file aangemaakt!"
echo ""
echo "🚀 Volgende stap:"
echo "   Herstart de dev server met: pnpm run dev"
echo ""
