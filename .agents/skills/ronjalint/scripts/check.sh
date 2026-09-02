#!/usr/bin/env bash
set -euo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_root="$(cd "$skill_dir/../../.." && pwd)"
rule="ronjalint"

if [[ -f "$package_root/package.json" ]] && grep -q '"name": "textlint-rule-ronjalint"' "$package_root/package.json"; then
    if [[ ! -f "$package_root/lib/index.js" ]]; then
        echo "RonjaLint is not built. Run npm run build first." >&2
        exit 2
    fi
    rule="$package_root/lib/index.js"
fi

if [[ $# -eq 0 ]]; then
    exec npx --no-install textlint --stdin --stdin-filename response.md --rule "$rule"
fi

if [[ $# -eq 1 ]]; then
    exec npx --no-install textlint --rule "$rule" "$1"
fi

echo "Usage: check.sh [file]" >&2
exit 2
