#!/usr/bin/env bash
# Create a new release: bump version, update CHANGELOG, create git tag.
# Usage:
#   bash scripts/release.sh patch   # 1.0.0 → 1.0.1
#   bash scripts/release.sh minor   # 1.0.0 → 1.1.0
#   bash scripts/release.sh major   # 1.0.0 → 2.0.0
#
# Conventional commit message prefixes that matter for CHANGELOG:
#   feat:     new feature   (→ minor bump if using semver auto)
#   fix:      bug fix       (→ patch)
#   feat!:    breaking change (→ major)
#   docs:     documentation changes (listed under "Other")
#   chore:    maintenance
set -euo pipefail

BUMP="${1:-patch}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

log()  { echo -e "\033[1;34m[release]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ok]\033[0m $*"; }
err()  { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

command -v node >/dev/null || err "node not found"
[[ "$BUMP" =~ ^(patch|minor|major)$ ]] || err "Usage: $0 [patch|minor|major]"

# Ensure working tree is clean
[[ -z "$(git status --porcelain)" ]] || err "Working tree has uncommitted changes. Commit or stash first."

# Read current version
CURRENT_VERSION="$(node -p "require('./package.json').version")"
log "Current version: $CURRENT_VERSION"

# Compute next version via npm semver (no dependency, pure arithmetic)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case "$BUMP" in
  major) MAJOR=$((MAJOR+1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR+1)); PATCH=0 ;;
  patch) PATCH=$((PATCH+1)) ;;
esac
NEXT_VERSION="$MAJOR.$MINOR.$PATCH"
log "Next version: $NEXT_VERSION"

# Bump version in package.json files
node -e "
  const fs = require('fs');
  const files = ['package.json', 'apps/web/package.json', 'apps/api/package.json'];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const pkg = JSON.parse(fs.readFileSync(f, 'utf8'));
    pkg.version = '$NEXT_VERSION';
    fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n');
  }
"
ok "Bumped version in package.json files"

# Generate CHANGELOG entry from git log since last tag
LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo "")"
DATE="$(date +%Y-%m-%d)"
CHANGELOG_ENTRY="## [$NEXT_VERSION] — $DATE\n\n"

if [[ -n "$LAST_TAG" ]]; then
  RANGE="$LAST_TAG..HEAD"
else
  RANGE="HEAD"
fi

# Group commits by type
FEATURES="$(git log "$RANGE" --pretty=format:'- %s' --grep='^feat' 2>/dev/null || true)"
FIXES="$(git log "$RANGE" --pretty=format:'- %s' --grep='^fix' 2>/dev/null || true)"
OTHER="$(git log "$RANGE" --pretty=format:'- %s' | grep -vE '^- (feat|fix):' | grep -v 'Co-Authored' || true)"

[[ -n "$FEATURES" ]] && CHANGELOG_ENTRY+="### Features\n$FEATURES\n\n"
[[ -n "$FIXES" ]]    && CHANGELOG_ENTRY+="### Bug Fixes\n$FIXES\n\n"
[[ -n "$OTHER" ]]    && CHANGELOG_ENTRY+="### Other\n$OTHER\n\n"

# Prepend to CHANGELOG.md
EXISTING=""
[[ -f CHANGELOG.md ]] && EXISTING="$(cat CHANGELOG.md)"
printf "# Changelog\n\n%b%s" "$CHANGELOG_ENTRY" "${EXISTING#*$'\n\n'}" > CHANGELOG.md

ok "Updated CHANGELOG.md"

# Commit and tag
git add package.json apps/web/package.json apps/api/package.json CHANGELOG.md
git commit -m "chore(release): v$NEXT_VERSION"
git tag -a "v$NEXT_VERSION" -m "Release v$NEXT_VERSION"

ok "Tagged v$NEXT_VERSION"
log "Push with: git push && git push --tags"
