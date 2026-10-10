/**
 * Load .env before any other app code. Must be first import in server.js
 * so JWT_SECRET and other vars are available when utils/jwt.js and middleware load.
 * Does not throw if .env is missing (dotenv.config() is safe).
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '.env');
const result = dotenv.config({ path: envPath });
if (result.error && process.env.NODE_ENV !== 'production') {
  console.warn('⚠️  No .env file found at', envPath, '- using defaults and process env');
}

// Force IPv4 DNS resolution to prevent MongoDB Atlas 'querySrv ETIMEOUT' on broken IPv6 networks
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['1.1.1.1', '8.8.8.8']);
