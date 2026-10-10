import type { NextConfig } from "next";

/**
 * The API runs as a separate service on port 5000. Calling it at an absolute
 * localhost URL works on this machine and nowhere else: a browser resolves
 * `localhost` against whichever machine is running it, so a visitor reaching
 * this console remotely would send every request to their own laptop.
 *
 * Proxying it under this app's own origin fixes that for every visitor at once
 * and removes the cross-origin request along with it — no CORS to configure,
 * and the auth token travels same-origin.
 */
const API_ORIGIN = process.env.API_PROXY_TARGET ?? "http://localhost:5000";

/** The vendor console, proxied under /store so one origin serves everything. */
const VENDOR_WEB_ORIGIN =
  process.env.VENDOR_WEB_ORIGIN ?? "http://localhost:3002";

/**
 * Hosts allowed to load dev assets. A tunnel serves this app under a hostname
 * the dev server has never seen, which it otherwise refuses.
 */
const devOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins.length > 0 ? devOrigins : undefined,

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },

      /**
       * Uploaded photos live on the backend under /uploads. They are stored
       * as relative URLs so they resolve against whichever origin serves the
       * page; without this rewrite that origin is this console, which does
       * not have them, and every vendor photo would 404 for visitors.
       */
      {
        source: "/uploads/:path*",
        destination: `${API_ORIGIN}/uploads/:path*`,
      },
      /**
       * The three mobile apps ship as static web exports under `public/`, so
       * one origin serves the whole platform — which also means one tunnel
       * covers everything rather than needing one per app.
       *
       * Expo writes a file per route (`cart.html`, `account.html`) and expects
       * a host that resolves an extensionless path to its `.html`; this folder
       * does not, so `/app/cart` would 404 and the router would strip the base
       * path off `/app/index.html` and fail to match. Each pair maps the clean
       * paths onto the exported files. Asset folders are excluded so `_expo`
       * and `assets` keep serving verbatim.
       *
       * Each export is built with its own `experiments.baseUrl` — /app,
       * /partner, /merchant — so their asset URLs already carry the prefix and
       * cannot collide with the console's own `_next`.
       */
      ...["app", "partner", "merchant"].flatMap((base) => [
        { source: `/${base}`, destination: `/${base}/index.html` },
        {
          source: `/${base}/:path((?!_expo|assets).*)`,
          destination: `/${base}/:path.html`,
        },
      ]),

      /**
       * The vendor console is a Next app of its own, so it cannot be exported
       * to static files like the three above — it runs on its own port and is
       * proxied here. It is built with basePath "/store", so the URLs it emits
       * already carry the prefix and its `_next` assets cannot be mistaken for
       * this app's.
       */
      {
        source: "/store/:path*",
        destination: `${VENDOR_WEB_ORIGIN}/store/:path*`,
      },
    ];
  },
};

export default nextConfig;
