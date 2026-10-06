#!/usr/bin/env bash
# Manual deploy to Cloudflare Pages. Stamps the current commit SHA into the
# build so what's live is always traceable to a commit. CI (.github/workflows/
# deploy.yml) does the same thing automatically on push to main.
set -euo pipefail
cd "$(dirname "$0")"

SHA="$(git rev-parse --short HEAD)"
DATE="$(date -u +%Y-%m-%d)"
DIRTY=""
git diff --quiet || DIRTY="+dirty"

STAGE="$(mktemp -d)"
cp -R public/. "$STAGE"/
# stamp version into the staged copy only (never touch the source file)
sed -i.bak "s/window.TDS_BUILD = '[^']*'/window.TDS_BUILD = '${SHA}${DIRTY} · ${DATE}'/" "$STAGE/index.html"
sed -i.bak "s/build v4/build ${SHA}${DIRTY}/" "$STAGE/index.html"
rm -f "$STAGE/index.html.bak"

# The client's own key check runs in the browser, long after the bytes are on
# the wire. Fail the deploy before a secret can be published. CI runs the same
# gate in .github/workflows/deploy.yml.
if grep -rE 'sb_secret_|"role"[[:space:]]*:[[:space:]]*"service_role"|SUPABASE_SERVICE_ROLE|SUPABASE_DB_PASSWORD|postgres(ql)?://' "$STAGE"; then
  echo "ABORT: staged build contains a Supabase secret or database credential." >&2
  rm -rf "$STAGE"
  exit 1
fi

# Optional integration. Absent config ships a playable game with the leaderboard
# off, which is a valid state, but say so out loud instead of failing silently.
if [ ! -f "$STAGE/supabase-config.js" ]; then
  echo "Note: public/supabase-config.js is absent, so run records ship disabled."
fi

echo "Deploying build ${SHA}${DIRTY} (${DATE})…"
npx wrangler pages deploy "$STAGE" --project-name=torres-del-sisal --branch=main --commit-dirty=true
rm -rf "$STAGE"
echo "Done. Live at https://torres-del-sisal.pages.dev/ and any attached custom domain."
