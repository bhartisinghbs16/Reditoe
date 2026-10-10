import type { NextConfig } from "next";

/**
 * The API runs as a separate service on port 5000. Calling it at an absolute
 * localhost URL works on this machine and nowhere else — a browser resolves
 * `localhost` against whichever machine is running it, so a visitor reaching
 * this console remotely would send every request to their own laptop.
 *
 * Proxying it under this app's own origin fixes that for every visitor at once
 * and removes the cross-origin request along with it: no CORS to configure, and
 * the auth token travels same-origin.
 *
 * This previously pointed at the admin console's public tunnel instead, which
 * reaches the same backend but only via a rewrite inside the admin app — so
 * rebuilding admin took the vendor console's API down with it. Each front end
 * now reaches the backend on its own.
 */
const API_ORIGIN = process.env.API_PROXY_TARGET ?? "http://localhost:5000";

/** Hosts allowed to load dev assets, e.g. when served over a tunnel. */
const devOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Served under /store on the shared origin, so one tunnel covers the whole
  // platform. Next needs to know the prefix or every asset and link it emits
  // points at the root, where the admin console answers instead.
  basePath: "/store",
  assetPrefix: "/store",

  allowedDevOrigins: devOrigins.length > 0 ? devOrigins : undefined,

  images: {
    // Menu thumbnails and top-seller rows use the same Unsplash catalogue as
    // the customer app. Point this at your own CDN when the real one lands.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
