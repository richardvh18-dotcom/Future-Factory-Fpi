#!/bin/bash

# FPi Future Factory Cleanup Script
# Gebaseerd op Code Audit bevindingen van 26 februari 2026

echo "🧹 Starten van project opschoning..."

# 1. Verwijder bestand met typo in bestandsnaam (AiCenterView,jsx)
FILE_TYPO="src/components/ai/AiCenterView,jsx"
if [ -f "$FILE_TYPO" ]; then
    rm "$FILE_TYPO"
    echo "✅ Verwijderd: $FILE_TYPO (Typo in bestandsnaam)"
else
    echo "ℹ️  Niet gevonden: $FILE_TYPO"
fi

# 2. Verwijder dubbele AI Assistant (oude locatie in root components map)
# De correcte versie staat in src/components/ai/AiAssistantView.jsx
FILE_OLD_AI="src/components/AiAssistantView.jsx"
if [ -f "$FILE_OLD_AI" ]; then
    rm "$FILE_OLD_AI"
    echo "✅ Verwijderd: $FILE_OLD_AI (Duplicaat, nieuwe versie in /ai/)"
else
    echo "ℹ️  Niet gevonden: $FILE_OLD_AI"
fi

# 3. Verwijder dubbele Admin Drilling View (oude locatie)
# De correcte versie staat in src/components/admin/matrixmanager/AdminDrillingView.jsx
FILE_OLD_DRILL="src/components/admin/AdminDrillingView.jsx"
if [ -f "$FILE_OLD_DRILL" ]; then
    rm "$FILE_OLD_DRILL"
    echo "✅ Verwijderd: $FILE_OLD_DRILL (Duplicaat, nieuwe versie in /matrixmanager/)"
else
    echo "ℹ️  Niet gevonden: $FILE_OLD_DRILL"
fi

# 4. Vite Config Consolidatie
# We behouden vite.config.ts omdat deze de Vercel fixes en alias configuratie bevat
if [ -f "vite.config.js" ] && [ -f "vite.config.ts" ]; then
    rm "vite.config.js"
    echo "✅ Verwijderd: vite.config.js (vite.config.ts is leidend)"
fi

# 5. Redundante AI Test Scripts
# We behouden alleen de stabiele aiService.js
if [ -f "src/services/aiServiceTest.js" ]; then
    rm "src/services/aiServiceTest.js"
    echo "✅ Verwijderd: src/services/aiServiceTest.js"
fi

if [ -f "testGemini.js" ]; then
    rm "testGemini.js"
    echo "✅ Verwijderd: testGemini.js"
fi

# 6. Consolidatie Lot Logica
# Functionaliteit is gemerged in src/utils/lotLogic.jsx
FILE_LOT_PLACEHOLDER="src/utils/lotPlaceholder.jsx"
if [ -f "$FILE_LOT_PLACEHOLDER" ]; then
    rm "$FILE_LOT_PLACEHOLDER"
    echo "✅ Verwijderd: $FILE_LOT_PLACEHOLDER (Gemerged in lotLogic.jsx)"
fi

# 7. Backend Structuur Fix (functions/functions nesteling)
if [ -d "functions/functions" ]; then
    echo "🔧 Herstellen van geneste functions map..."
    # Kopieer inhoud van geneste map naar bovenliggende map
    cp -r functions/functions/. functions/
    # Verwijder de geneste map
    rm -rf functions/functions
    echo "✅ Opgelost: functions/functions is samengevoegd in functions/"
fi

# 8. Firebase Config Validation
if [ -f "firebase.json" ]; then
    if grep -q '"rules": "firestore.rules"' firebase.json; then
        echo "✅ Validatie: firebase.json verwijst correct naar firestore.rules."
    else
        echo "⚠️ WAARSCHUWING: firebase.json lijkt NIET naar firestore.rules te verwijzen. Controleer dit handmatig!"
    fi
else
    echo "ℹ️  Niet gevonden: firebase.json. Kan niet valideren."
fi

# 9. Consolidate .env.example files
echo "🧹 Opschonen van oude .env.example bestanden..."
find . -type f -name ".env.example" -not -path "./.env.example" -delete
echo "✅ Oude .env.example bestanden verwijderd. Het nieuwe .env.example in de root is nu leidend."


echo "✨ Opschoning voltooid. Vergeet niet je imports in App.jsx te controleren!"