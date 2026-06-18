#!/bin/bash

echo "🧹 Start Kritieke Opschoning voor Pilot..."

# 1. Verwijder bestand met illegale komma in naam
if [ -f "src/components/ai/AiCenterView,jsx" ]; then
    rm "src/components/ai/AiCenterView,jsx"
    echo "✅ Verwijderd: src/components/ai/AiCenterView,jsx"
fi

# 2. Verwijder verouderde JS config (TS is leidend)
if [ -f "vite.config.js" ]; then
    rm "vite.config.js"
    echo "✅ Verwijderd: vite.config.js"
fi

# 3. Verwijder duplicaat component
if [ -f "src/components/AiAssistantView.jsx" ]; then
    rm "src/components/AiAssistantView.jsx"
    echo "✅ Verwijderd: src/components/AiAssistantView.jsx (Duplicaat)"
fi

echo "🎉 Opschoning compleet. Klaar voor build!"