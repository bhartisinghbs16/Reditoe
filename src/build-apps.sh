#!/bin/bash
#
# Builds the three phone apps.
#
#   ./build-apps.sh apk     installable files, for testing on a phone
#   ./build-apps.sh aab     app bundles, for uploading to the Play Store
#
# Both go through EAS, which builds on Expo's servers - nothing to install
# locally beyond the CLI. Each build takes 15-20 minutes and they queue on the
# free plan, so expect an hour or so for all three. When one finishes EAS
# emails a link, and the file is also on expo.dev under the project's Builds
# tab.
#
# Before the first run:
#
#   npm i -g eas-cli
#   eas login                 (free account, expo.dev)
#
# And set API_URL below to wherever the API is deployed. It is compiled into
# the apps, so a tunnel address means the apps stop working the moment the
# machine that opened the tunnel sleeps.

set -eu

# ─────────────────────────────────────────────────────────────────────────────
# The API the apps talk to. Change this one line, run the script, done.
API_URL="${API_URL:-https://cushy-trapeze-catnip.ngrok-free.dev/api}"
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")" && pwd)"
APPS=(user vendor delivery)

case "${1:-}" in
  apk) PROFILE=preview ;;
  aab) PROFILE=production ;;
  *) echo "usage: $0 apk|aab" >&2; exit 1 ;;
esac

if ! command -v eas >/dev/null 2>&1; then
  echo "eas-cli is not installed. Run: npm i -g eas-cli && eas login" >&2
  exit 1
fi

case "$API_URL" in
  *ngrok*|*localhost*|*127.0.0.1*)
    echo "warning: API_URL is $API_URL"
    echo "  That address only answers while your machine is running, so the"
    echo "  apps will not work on anybody else's phone. Deploy the API first"
    echo "  (see render.yaml) and set API_URL to its address."
    echo
    read -r -p "  Build anyway? [y/N] " reply
    [ "$reply" = "y" ] || exit 1
    ;;
esac

# EAS builds on Expo's servers, so a variable exported here never reaches the
# build. The address has to be written into each app's eas.json, which is what
# the build actually reads.
echo "pointing the apps at $API_URL"
for app in "${APPS[@]}"; do
  python3 "$ROOT/scripts/set-api-url.py" "$ROOT/$app/eas.json" "$API_URL"
  echo "  $app"
done

# An app has to be registered against your Expo account before it can be
# built, which writes a project id into its app.json. That step asks
# questions, so it cannot run inside the non-interactive build below - it is
# done here instead, once, and skipped ever after.
for app in "${APPS[@]}"; do
  if ! grep -q '"projectId"' "$ROOT/$app/app.json"; then
    echo
    echo "registering $app with your Expo account…"
    ( cd "$ROOT/$app" && eas init )
  fi
done

for app in "${APPS[@]}"; do
  echo
  echo "── $app ($PROFILE) ────────────────────────────────────────────────"
  # The first build for an app has no signing key and EAS offers to generate
  # one. That question cannot be answered non-interactively, so the first run
  # is interactive and later ones are not.
  if [ -n "${CI:-}" ]; then
    ( cd "$ROOT/$app" && eas build --platform android --profile "$PROFILE" --non-interactive )
  else
    ( cd "$ROOT/$app" && eas build --platform android --profile "$PROFILE" )
  fi
done

echo
echo "All three queued. Watch them at https://expo.dev, under each project's"
echo "Builds tab, and download from there when they finish."
