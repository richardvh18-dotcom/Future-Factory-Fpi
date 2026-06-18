#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Gebruik:
  scripts/promote-to-production.sh [--target <branch>] [--push] <commit> [<commit> ...]

Voorbeelden:
  scripts/promote-to-production.sh a1b2c3d
  scripts/promote-to-production.sh --target pilot-dev a1b2c3d e4f5g6h
  scripts/promote-to-production.sh --push a1b2c3d

Standaard doelbranch:
  pilot-dev
EOF
}

TARGET_BRANCH="pilot-dev"
DO_PUSH="false"
COMMITS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      [[ $# -lt 2 ]] && { echo "Fout: --target vereist een branch naam." >&2; exit 1; }
      TARGET_BRANCH="$2"
      shift 2
      ;;
    --push)
      DO_PUSH="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      COMMITS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#COMMITS[@]} -eq 0 ]]; then
  usage
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Fout: werkboom is niet schoon. Commit of stash eerst je wijzigingen." >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"

cleanup() {
  git checkout "$CURRENT_BRANCH" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Ophalen van remote refs..."
git fetch origin

echo "Switch naar doelbranch: $TARGET_BRANCH"
git checkout "$TARGET_BRANCH"
git pull --ff-only origin "$TARGET_BRANCH"

for commit in "${COMMITS[@]}"; do
  echo "Cherry-pick: $commit"
  git cherry-pick -x "$commit"
done

if [[ "$DO_PUSH" == "true" ]]; then
  echo "Push naar origin/$TARGET_BRANCH"
  git push origin "$TARGET_BRANCH"
else
  echo "Geen push uitgevoerd. Controleer en push handmatig indien akkoord:"
  echo "  git push origin $TARGET_BRANCH"
fi

echo "Klaar. Geimporteerde commits in $TARGET_BRANCH: ${COMMITS[*]}"
