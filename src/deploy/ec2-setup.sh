#!/usr/bin/env bash
#
# One-time setup of a fresh Ubuntu EC2 box for Reditoe.
#
# Run once. It installs what is missing, puts the service files in place and
# asks certbot for certificates. Running it twice is harmless: every step
# checks before it acts.
#
#   sudo bash ec2-setup.sh
#
# Before running, point these DNS records at this machine's Elastic IP:
#
#   reditoe.com          A   <elastic-ip>
#   www.reditoe.com      A   <elastic-ip>
#   admin.reditoe.com    A   <elastic-ip>
#   api.reditoe.com      A   <elastic-ip>
#
# Certbot cannot issue a certificate until those resolve, so DNS first.

set -euo pipefail

ROOT=/srv/reditoe
WEB=/var/www/reditoe
DEPLOY_USER=ubuntu
DOMAINS=(reditoe.com www.reditoe.com admin.reditoe.com api.reditoe.com)
EMAIL=info@reditoe.com

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }

say "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx ca-certificates gnupg rsync

say "Node 20"
# Ubuntu ships something older; Next 16 and the API both want 20.
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

say "Swap"
# The console's build is the heaviest thing this machine ever does, and on a
# 2GB instance it is killed part way through with no useful message. Swap is
# slow and that is fine: a build that takes a minute longer beats one that
# dies. Skipped where somebody has already set some up.
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "2G swap added"
else
  echo "swap already present, left alone"
fi

say "Directories"
mkdir -p "$ROOT" "$WEB"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$ROOT" "$WEB"

say "nginx"
cp nginx-reditoe.conf /etc/nginx/sites-available/reditoe
ln -sf /etc/nginx/sites-available/reditoe /etc/nginx/sites-enabled/reditoe
# The stock welcome page answers for any name that has no server block of its
# own, which on a box with four names is confusing rather than helpful.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

say "Services"
cp reditoe-api.service reditoe-admin.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable reditoe-api reditoe-admin >/dev/null

say "Certificates"
# Snap's certbot is the one upstream supports; the apt package lags.
if ! command -v certbot >/dev/null; then
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
fi

ARGS=()
for d in "${DOMAINS[@]}"; do ARGS+=(-d "$d"); done

if certbot --nginx "${ARGS[@]}" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
  echo "Certificates issued. Renewal is automatic."
else
  cat <<'NOTE'

Certbot could not issue certificates. Almost always one of:
  - the DNS records above do not yet point at this machine
  - the security group does not allow inbound 80 and 443

The site still works over plain http meanwhile. Fix the cause and run:
  sudo certbot --nginx -d reditoe.com -d www.reditoe.com \
       -d admin.reditoe.com -d api.reditoe.com --redirect

NOTE
fi

say "Done"
cat <<NOTE

The machine is ready. It has no code on it yet - run deploy.sh from your own
computer to send it:

  ./deploy/deploy.sh <this-machine-ip>

NOTE
