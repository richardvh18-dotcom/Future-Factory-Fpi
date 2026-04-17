#!/bin/bash

# Vercel Dual Deployment Setup Script
# Setup voor twee parallel deployments: Production (Pilot) en Preview (Development)

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════╗"
echo "║   🚀 Vercel Dual Deployment Setup                 ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI niet gevonden. Installeer eerst:"
    echo "   npm install -g vercel"
    exit 1
fi

echo "✅ Vercel CLI gevonden"
echo ""

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Huidige branch: $CURRENT_BRANCH"
echo ""

# Step 1: Link project (if not already linked)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Stap 1: Project Linken"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -d ".vercel" ]; then
    echo "✅ Project is al gelinkt aan Vercel"
    echo "   (/.vercel directory bestaat)"
else
    echo "🔗 Linking project naar Vercel..."
    echo ""
    echo "Beantwoord de vragen als volgt:"
    echo "  - Set up and deploy? N (we doen dit handmatig)"
    echo "  - Which scope? richardvh18-dotcom"
    echo "  - Link to existing project? N"
    echo "  - Project name: fpiff-pilot-ready"
    echo ""
    read -p "Druk op Enter om te starten..."
    
    vercel link
    echo ""
fi

# Step 2: Deploy Pilot (Production)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏭 Stap 2: Deploy Pilot Branch (Production)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Deploy Pilot branch naar Production? (y/n): " DEPLOY_PILOT

if [ "$DEPLOY_PILOT" = "y" ] || [ "$DEPLOY_PILOT" = "Y" ]; then
    echo "🔄 Schakel naar FpiFF-Pilot-Ready..."
    git checkout FpiFF-Pilot-Ready
    
    echo "⬆️  Pull laatste changes..."
    git pull origin FpiFF-Pilot-Ready || true
    
    echo "🚀 Deploying naar Vercel Production..."
    vercel --prod
    
    echo ""
    echo "✅ Pilot branch gedeployed als PRODUCTION"
    PILOT_URL=$(vercel inspect --token=$VERCEL_TOKEN 2>/dev/null | grep "URL:" | awk '{print $2}' || echo "fpiff-pilot-ready.vercel.app")
    echo "   URL: https://$PILOT_URL"
else
    echo "⏭️  Overgeslagen"
fi

echo ""

# Step 3: Deploy Preview
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔬 Stap 3: Deploy Preview Branch"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Deploy Preview-v2 branch? (y/n): " DEPLOY_PREVIEW

if [ "$DEPLOY_PREVIEW" = "y" ] || [ "$DEPLOY_PREVIEW" = "Y" ]; then
    echo "🔄 Schakel naar preview-v2..."
    git checkout preview-v2
    
    echo "⬆️  Pull laatste changes..."
    git pull origin preview-v2 || true
    
    echo "🚀 Deploying naar Vercel Preview..."
    vercel
    
    echo ""
    echo "✅ Preview-v2 branch gedeployed als PREVIEW"
    echo "   URL: Zie output hierboven"
else
    echo "⏭️  Overgeslagen"
fi

echo ""

# Step 4: Return to original branch
if [ "$CURRENT_BRANCH" != "$(git branch --show-current)" ]; then
    echo "🔄 Terugkeren naar originele branch: $CURRENT_BRANCH"
    git checkout "$CURRENT_BRANCH"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Compleet!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Volgende stappen:"
echo ""
echo "1. Configureer Production Branch in Vercel Dashboard:"
echo "   → https://vercel.com/richardvh18-dotcom/fpiff-pilot-ready/settings/git"
echo "   → Set Production Branch: FpiFF-Pilot-Ready"
echo ""
echo "2. Voeg Environment Variables toe:"
echo "   → Settings → Environment Variables"
echo "   → Kopieer van .env.example"
echo ""
echo "3. Test de deployments:"
echo "   → Production: https://fpiff-pilot-ready.vercel.app"
echo "   → Preview: https://fpiff-pilot-ready-git-preview-v2-*.vercel.app"
echo ""
echo "4. Auto-deploy is nu actief!"
echo "   → Push naar FpiFF-Pilot-Ready = Production deploy"
echo "   → Push naar preview-v2 = Preview deploy"
echo ""
echo "📖 Zie VERCEL_DEPLOYMENT_GUIDE.md voor meer info"
echo ""
