#!/bin/bash
#
# Puts the three phone apps on somebody's phone without building anything.
#
#   ./preview-apps.sh
#
# Each app is served over a public address and opened in Expo Go - the tester
# installs that one app from the Play Store, opens a link, and the app runs.
# No APK, no Play Store, and they do not have to be on this network.
#
# The links only answer while this script is running. Leave it open for as
# long as the tester needs, and expect to send fresh links next time: the
# addresses are new on every run.
#
# The API has to be reachable too. Start it first with ./run-demo.sh --tunnel
# and put the address it prints into API_URL below.

set -u

# ─────────────────────────────────────────────────────────────────────────────
# Where the apps look for the API. Without this they look for it on the phone
# itself, which is where localhost points once the app is off this machine -
# the app opens and then nothing loads.
API_URL="${API_URL:-https://cushy-trapeze-catnip.ngrok-free.dev/api}"
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.run-logs"
mkdir -p "$LOGS"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  nvm use 20 >/dev/null 2>&1 || true
fi

pids=()
stop() {
  echo
  echo "stopping…"
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null; done
  wait 2>/dev/null
  exit 0
}
trap stop INT TERM

if ! curl -s -o /dev/null -m 10 "$API_URL/health"; then
  echo "warning: $API_URL is not answering."
  echo "  Start it with ./run-demo.sh --tunnel first, or the apps will open"
  echo "  and show nothing. Carrying on anyway."
  echo
fi

start() { # folder, port, label
  echo "starting $3…"
  ( cd "$ROOT/$1" && EXPO_PUBLIC_API_URL="$API_URL" \
      node node_modules/expo/bin/cli start --tunnel --port "$2" \
      > "$LOGS/preview-$1.log" 2>&1 ) &
  pids+=($!)
}

start user     8081 "the customer app"
start vendor   8082 "the vendor app"
start delivery 8083 "the rider app"

echo
echo "opening tunnels — this takes a minute…"

link_for() { # folder
  local waited=0
  while [ "$waited" -lt 150 ]; do
    local found
    found=$(grep -o 'exp://[a-zA-Z0-9._:-]*' "$LOGS/preview-$1.log" 2>/dev/null | head -1)
    if [ -n "$found" ]; then echo "$found"; return 0; fi
    sleep 5
    waited=$((waited + 5))
  done
  echo "(no link yet — see $LOGS/preview-$1.log)"
}

CUSTOMER=$(link_for user)
VENDOR=$(link_for vendor)
RIDER=$(link_for delivery)

cat <<EOF

  Send these to whoever is testing. They install "Expo Go" from the Play
  Store first, then open the links.

  Customer app   $CUSTOMER
  Vendor app     $VENDOR
  Rider app      $RIDER

  admin     admin@reditoe.com     Admin@12345
  vendor    vendor@reditoe.com    vendor123
  rider     rider@reditoe.com     Rider@12345
  customer  customer@reditoe.com  Customer@123

  Keep this running while they test. Ctrl-C stops it.

EOF

wait
