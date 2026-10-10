# Putting Reditoe on the client's EC2

Everything currently runs on a laptop behind an ngrok tunnel, which answers
only while that laptop is awake. This moves it somewhere that stays put.

## What ends up where

| Address | What it serves | How |
| --- | --- | --- |
| `reditoe.com`, `www.reditoe.com` | the public site | static files under `/var/www/reditoe` |
| `admin.reditoe.com` | the console | Next.js on :3000, behind nginx |
| `api.reditoe.com` | the API | Node on :5000, behind nginx |

Subdomains rather than paths: the console is a Next app that owns its routing
from the root, and putting it under `/admin` would mean rebuilding it with a
basePath and re-pointing every link inside it.

## What is needed before starting

1. **The machine's Elastic IP.** A plain public IP changes when the instance
   stops, and the DNS records below would then point at nothing.
2. **The SSH key** (`.pem`) and the login user — `ubuntu` on an Ubuntu AMI.
3. **Security group** allowing inbound `22`, `80` and `443`.
4. **A MongoDB connection string.** See below.
5. **DNS**, pointing all four names at the Elastic IP:

   ```
   reditoe.com         A   <elastic-ip>
   www.reditoe.com     A   <elastic-ip>
   admin.reditoe.com   A   <elastic-ip>
   api.reditoe.com     A   <elastic-ip>
   ```

   Do this first — certbot cannot issue a certificate for a name that does not
   yet resolve to the machine.

## About the database

The API needs a real MongoDB. `npm run dev:local` starts a temporary in-memory
one for development; it keeps nothing and must not be used here.

**Atlas Flex is the one to pick if backups matter**, and for a business taking
real payments they do. Checked against MongoDB's own documentation rather than
assumed:

| Option | Cost | Backups |
| --- | --- | --- |
| Atlas M0 (free) | free, 512MB | **none.** `mongodump` by hand only |
| **Atlas Flex** | **~$8–30/mo by usage** | **daily snapshots, on by default, cannot be turned off** |
| Atlas M10 | ~$57/mo | continuous, point-in-time |
| mongod on the EC2 | free | none, unless somebody builds and watches a cron job |

The free tier has no automated backup of any kind - MongoDB's documentation is
explicit that Atlas backups are not available on M0 and that `mongodump` is the
only route. It is fine for trying things out and wrong for live orders.

M10 is more machine than this needs for a long while. Flex is the cheapest tier
that takes a snapshot every day without anyone remembering to.

Whichever is chosen: create the cluster, allow the EC2's IP in Network Access,
and take the connection string for `MONGODB_URI`.

## DNS at Hostinger

The domain is registered with Hostinger, so the records go in **hPanel →
Domains → reditoe.com → DNS / Nameservers**. Four A records, all pointing at
the EC2's Elastic IP:

| Type | Name | Points to | TTL |
| --- | --- | --- | --- |
| A | `@` | `<elastic-ip>` | 3600 |
| A | `www` | `<elastic-ip>` | 3600 |
| A | `admin` | `<elastic-ip>` | 3600 |
| A | `api` | `<elastic-ip>` | 3600 |

Delete any existing `A` or `CNAME` on `@` and `www` first - Hostinger points
them at its own parking page by default, and two records for one name is a
coin toss over which answers.

Changes take a few minutes to an hour. Check before running the setup script,
which cannot get a certificate for a name that does not resolve yet:

```bash
dig +short reditoe.com api.reditoe.com admin.reditoe.com
```

All four must come back with the Elastic IP.

## Setting the machine up — once

```bash
scp -r deploy ubuntu@<ip>:~/
ssh ubuntu@<ip> 'sudo bash ~/deploy/ec2-setup.sh'
```

That installs Node 20, nginx and certbot, puts the service files in place and
asks for certificates.

## The two secrets files — once

Neither is ever copied from a laptop, so they are written on the server by
hand. `deploy.sh` deliberately skips both: they hold the live keys, and
overwriting them from a working tree would take the site off payments.

**`/srv/reditoe/backend/.env`** — copy the local `backend/.env` and change
the values that still point at a laptop:

```
NODE_ENV=production
MONGODB_URI=<the Atlas connection string>

FRONTEND_URL=https://www.reditoe.com
ADMIN_DASHBOARD_URL=https://admin.reditoe.com
BASE_URL=https://api.reditoe.com
PUBLIC_APP_URL=https://www.reditoe.com

# Which origins the browser may call the API from. The console and the site;
# the apps are not browsers and are unaffected. Left unset, every origin is
# allowed - which works, and is worth not doing on a machine taking payments.
ALLOWED_ORIGINS=https://admin.reditoe.com,https://www.reditoe.com,https://reditoe.com
```

`BASE_URL` and `PUBLIC_APP_URL` still hold the ngrok address; leaving them
sends password-reset and invite links to a tunnel that will not be running.

Everything else — the Razorpay live keys, Brevo, MSG91 — stays as it is.

**`/srv/reditoe/admin/.env.local`**:

```
NEXT_PUBLIC_API_URL=https://api.reditoe.com/api
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<the same key as locally>
```

This one is read at build time, so `deploy.sh` must run after it exists or the
console will look for the API on localhost.

## Deploying — every time after that

```bash
./deploy/deploy.sh <ip> ~/.ssh/reditoe.pem
```

Copies the site, API and console, installs from the lockfiles on the server,
builds the console, restarts both services and checks they came back.

## Seeding, once

A new database has no accounts at all, so there is nothing to sign in with:

```bash
ssh ubuntu@<ip> 'cd /srv/reditoe/backend && npm run seed:demo'
```

Safe to run again later; it updates rather than duplicates.

## Pointing the apps at it

The apps have the API address compiled in, so they need rebuilding once the
API has a permanent home. In each of `user/eas.json`, `vendor/eas.json` and
`delivery/eas.json`, replace the ngrok address:

```json
"EXPO_PUBLIC_API_URL": "https://api.reditoe.com/api"
```

Then rebuild all three. **Until that is done the installed APKs still point at
the tunnel**, so the tunnel has to keep running for whoever is holding one.

## When something is wrong

```bash
sudo journalctl -u reditoe-api -f        # the API's log, live
sudo journalctl -u reditoe-admin -f      # the console's log
sudo systemctl status reditoe-api
sudo nginx -t && sudo systemctl reload nginx
```

A service that will not start almost always says why in the last twenty lines
of its journal — usually a missing value in `.env` or a database it cannot
reach.
