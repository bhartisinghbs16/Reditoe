#!/usr/bin/env bash
#
# Sends the current working tree to the EC2 box and restarts what changed.
#
#   ./deploy/deploy.sh <host> [ssh-key]
#
# e.g.  ./deploy/deploy.sh 13.234.56.78 ~/.ssh/reditoe.pem
#
# Safe to run as often as you like. It copies, builds on the server, and
# restarts; it never touches the server's .env, which holds the live keys and
# is the one file that must not be overwritten from a laptop.

set -euo pipefail

HOST="${1:-}"
KEY="${2:-}"
USER=ubuntu
ROOT=/srv/reditoe
WEB=/var/www/reditoe

[ -n "$HOST" ] || { echo "Usage: ./deploy/deploy.sh <host> [ssh-key]"; exit 1; }

SSH=(ssh -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -o StrictHostKeyChecking=accept-new"
if [ -n "$KEY" ]; then
  SSH+=(-i "$KEY")
  RSYNC_SSH="$RSYNC_SSH -i $KEY"
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

say "Checking the machine is ready"
"${SSH[@]}" "$USER@$HOST" "test -d $ROOT" || {
  echo "Not set up yet. Copy this folder over and run ec2-setup.sh there first:"
  echo "  scp -r deploy $USER@$HOST:~/ && ssh $USER@$HOST 'sudo bash ~/deploy/ec2-setup.sh'"
  exit 1
}

# node_modules is rebuilt on the server from the lockfile; sending a laptop's
# copy over a home connection is slow and can carry the wrong native builds.
COMMON=(--archive --compress --delete --human-readable
        --exclude .git --exclude node_modules --exclude .next
        --exclude .mongo-data --exclude '*.log')

say "Public site"
rsync "${COMMON[@]}" -e "$RSYNC_SSH" "$HERE/website/" "$USER@$HOST:$WEB/"

say "API"
# .env stays as it is on the server: it holds the live Razorpay and Brevo
# keys, and overwriting it from here would take the site off payments.
rsync "${COMMON[@]}" --exclude .env -e "$RSYNC_SSH" "$HERE/backend/" "$USER@$HOST:$ROOT/backend/"

say "Admin console"
rsync "${COMMON[@]}" --exclude .env.local -e "$RSYNC_SSH" "$HERE/admin/" "$USER@$HOST:$ROOT/admin/"

say "Installing and building on the server"
"${SSH[@]}" "$USER@$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /srv/reditoe/backend
npm ci --omit=dev --silent

cd /srv/reditoe/admin
npm ci --silent
npm run build

sudo systemctl restart reditoe-api
# The console caches its public directory at startup, so newly copied web-app
# files are served as 404 until it is restarted - the page loads and appears
# unstyled, which looks like a broken deploy rather than a stale process.
sudo systemctl restart reditoe-admin
REMOTE

say "Checking it came back up"
sleep 4
for name in reditoe-api reditoe-admin; do
  state=$("${SSH[@]}" "$USER@$HOST" "systemctl is-active $name" || true)
  printf '  %-16s %s\n' "$name" "$state"
  [ "$state" = "active" ] || {
    echo
    echo "$name did not start. Its last words:"
    "${SSH[@]}" "$USER@$HOST" "sudo journalctl -u $name -n 30 --no-pager"
    exit 1
  }
done

say "Health"
# Written as a plain if rather than a chain of && and ||: in that chain the
# second `&& echo` runs whenever the http check succeeds *or* the https one
# did, so a working site could report itself as having no certificate.
if curl -fsS --max-time 15 "https://api.reditoe.com/api/health" >/dev/null 2>&1; then
  echo "  api.reditoe.com answering over https"
elif curl -fsS --max-time 15 "http://api.reditoe.com/api/health" >/dev/null 2>&1; then
  echo "  api.reditoe.com answering over http - no certificate yet"
  echo "  run: sudo certbot --nginx -d api.reditoe.com --redirect"
else
  echo "  api.reditoe.com is not answering."
  echo "  Check in this order: DNS points at this machine, the security group"
  echo "  allows 80 and 443, then: sudo journalctl -u reditoe-api -n 30"
fi

say "Done"
