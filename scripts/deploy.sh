#!/bin/bash

# Git Deploy Helper
# Dit script pusht automatisch naar preview EN main

echo "🚀 Deploying changes..."

# Zorg dat we op main branch zijn
if [ "$(git branch --show-current)" != "main" ]; then
  echo "⚠️  Switching to main branch..."
  git checkout main
fi

# Check of er uncommitted changes zijn
if [ -n "$(git status --porcelain)" ]; then
  echo "📝 Uncommitted changes detected. Committing..."
  git add -A
  read -p "Enter commit message: " commit_msg
  git commit --no-gpg-sign -m "$commit_msg"
fi

# Push naar main
echo "📦 Pushing to main..."
git push origin main

# Sync naar preview
echo "🔄 Syncing to preview..."
git checkout preview
git merge main --no-edit --no-gpg-sign
git push origin preview
git checkout main

echo "✅ Deployment complete!"
echo "🌐 Production: main branch"
echo "👀 Preview: preview branch"
