#!/bin/bash
#
# Starts the whole platform on one origin.
#
#   ./run-demo.sh            everything, no tunnel
#   ./run-demo.sh --tunnel   everything, plus a public ngrok URL
#
# Four pieces: the API on 5000, the vendor console on 3001, and the admin
# console on 3000 — which proxies /api and /uploads through to the API, serves
# the vendor console under /store, and serves the three exported mobile apps
# under /app, /partner and /merchant. One origin, so one tunnel covers the lot.
#
# Ctrl-C stops all of them.

set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS="$ROOT/.run-logs"
mkdir -p "$LOGS"

# Next 16 needs Node >= 20.9. nvm is used if it is installed and the default
# node is older, so this works without changing the machine's default.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  nvm use 20 >/dev/null 2>&1 || true
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node 20+ is required (found $(node -v 2>/dev/null || echo 'none'))." >&2
  exit 1
fi

# Google Fonts is fetched at build time and some networks only route IPv4 to
# it; without this Next falls back to a system font mid-render.
export NODE_OPTIONS="--dns-result-order=ipv4first"

pids=()
stop() {
  echo
  echo "stopping…"
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null; done
  wait 2>/dev/null
  exit 0
}
trap stop INT TERM

wait_for() { # url, seconds, label
  local waited=0
  until curl -s -o /dev/null -m 5 "$1" 2>/dev/null; do
    sleep 2
    waited=$((waited + 2))
    if [ "$waited" -ge "$2" ]; then
      echo "  $3 did not come up — see $LOGS" >&2
      return 1
    fi
  done
  echo "  $3 ready"
}

echo "starting the API…"
( cd "$ROOT/backend" && npm run dev:local > "$LOGS/backend.log" 2>&1 ) &
pids+=($!)

echo "starting the vendor console…"
( cd "$ROOT/vendor-web" && node node_modules/next/dist/bin/next dev --webpack -p 3001 \
    > "$LOGS/vendor-web.log" 2>&1 ) &
pids+=($!)

echo "starting the admin console…"
( cd "$ROOT/admin" && VENDOR_WEB_ORIGIN=http://localhost:3001 \
    node node_modules/next/dist/bin/next dev --webpack > "$LOGS/admin.log" 2>&1 ) &
pids+=($!)

# The API seeds on first boot and that takes a while; the consoles compile a
# page on first request, so give them room too.
wait_for http://localhost:5000/api/health 180 "API"
wait_for http://localhost:3000/login 180 "admin console"
wait_for http://localhost:3001/store/login 180 "vendor console"

BASE="http://localhost:3000"

if [ "${1:-}" = "--tunnel" ]; then
  if ! command -v ngrok >/dev/null 2>&1 && [ ! -x "$ROOT/ngrok" ]; then
    echo "ngrok is not installed. Download it from https://ngrok.com/download," >&2
    echo "run 'ngrok config add-authtoken <token>', and try again." >&2
  else
    NGROK="$(command -v ngrok || echo "$ROOT/ngrok")"
    echo "opening a tunnel…"
    # A free ngrok account includes one address that stays the same. Without
    # asking for it by name every restart hands out a new one, which breaks
    # every link already sent to somebody and every app built against the old
    # address. Set NGROK_DOMAIN to the one on your ngrok dashboard.
    NGROK_ARGS=(http 3000 --log stdout)
    if [ -n "${NGROK_DOMAIN:-}" ]; then
      NGROK_ARGS+=(--domain "$NGROK_DOMAIN")
    else
      echo "  (no NGROK_DOMAIN set — this URL will be different next time.)"
      echo "   Your reserved address is on dashboard.ngrok.com under Domains;"
      echo "   run: NGROK_DOMAIN=<that> ./run-demo.sh --tunnel"
    fi
    ( "$NGROK" "${NGROK_ARGS[@]}" > "$LOGS/ngrok.log" 2>&1 ) &
    pids+=($!)
    sleep 6
    PUBLIC=$(curl -s -m 10 http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c '
import json,sys
try:
    ts=json.load(sys.stdin)["tunnels"]
    print(next((t["public_url"] for t in ts if t["public_url"].startswith("https")), ""))
except Exception:
    print("")' 2>/dev/null)
    if [ -n "$PUBLIC" ]; then
      BASE="$PUBLIC"
      # Vendor invitation emails link to the set-password page, which is served
      # by the console rather than the API. Without this they point at
      # localhost and are useless to the person who receives them.
      echo "  tunnel: $PUBLIC"
      echo "  (set PUBLIC_APP_URL=$PUBLIC in backend/.env so emailed"
      echo "   set-password links point somewhere the vendor can open)"
    else
      echo "  tunnel did not open — see $LOGS/ngrok.log" >&2
    fi
  fi
fi

cat <<EOF

  Admin panel      $BASE/login
  Vendor console   $BASE/store/login
  Customer app     $BASE/app
  Rider app        $BASE/partner
  Vendor app       $BASE/merchant

  admin     admin@reditoe.com     Admin@12345
  vendor    vendor@reditoe.com    vendor123
  rider     rider@reditoe.com     Rider@12345
  customer  customer@reditoe.com  Customer@123

  Logs in $LOGS. Ctrl-C to stop.

EOF

wait
