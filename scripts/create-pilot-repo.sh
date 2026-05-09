#!/bin/bash

# Script om een nieuwe Future-Factory-Pilot-Ready repository aan te maken
# en de huidige code daarheen te kopiëren

echo "🚀 Future Factory - Pilot Ready Repository Setup"
echo "=================================================="
echo ""

# Controleer of we in de juiste directory zitten
if [ ! -f "package.json" ]; then
    echo "❌ Error: Niet in de project root directory"
    exit 1
fi

echo "📋 Stap 1: Maak een nieuwe repository aan op GitHub"
echo ""
echo "Ga naar: https://github.com/new"
echo "Repository naam: Future-Factory-Pilot-Ready"
echo "Beschrijving: Pilot-ready versie van het Future Factory MES systeem"
echo "Visibility: Public (of Private naar voorkeur)"
echo "❌ NIET initialiseren met README, .gitignore of license"
echo ""
read -p "Druk op Enter als je de repository hebt aangemaakt..."

echo ""
read -p "Voer de GitHub username in (bijv. richardvh18-dotcom): " GITHUB_USER

# Bevestiging
echo ""
echo "📦 We gaan de code pushen naar:"
echo "   https://github.com/$GITHUB_USER/Future-Factory-Pilot-Ready"
echo ""
read -p "Is dit correct? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "❌ Geannuleerd"
    exit 1
fi

# Voeg nieuwe remote toe
echo ""
echo "📡 Voeg nieuwe remote toe..."
git remote add pilot-ready "https://github.com/$GITHUB_USER/Future-Factory-Pilot-Ready.git"

# Check of we op de juiste branch zitten
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "FpiFF-Pilot-Ready" ]; then
    echo "⚠️  Je zit op branch '$CURRENT_BRANCH', schakel over naar FpiFF-Pilot-Ready..."
    git checkout FpiFF-Pilot-Ready
fi

# Push naar nieuwe repository
echo ""
echo "⬆️  Push code naar nieuwe repository..."
git push pilot-ready FpiFF-Pilot-Ready:main

echo ""
echo "✅ Klaar! Je nieuwe repository is beschikbaar op:"
echo "   https://github.com/$GITHUB_USER/Future-Factory-Pilot-Ready"
echo ""
echo "🔗 Volgende stappen:"
echo "   1. Ga naar je repository op GitHub"
echo "   2. Update de repository settings indien nodig"
echo "   3. Voeg collaborators toe"
echo "   4. Configureer branch protection rules"
echo ""
