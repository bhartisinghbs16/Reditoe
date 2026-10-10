import './preload-env.js'; // Must run first so JWT_SECRET etc. are set before jwt.js/middleware load
import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import net from 'net';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';

import apiRoutes from './routes/index.js';
import websocketService from './services/websocketService.js';
import liveTrackingService from './services/liveTrackingService.js';
import pushNotificationService from './services/pushNotificationService.js';
import fileUploadService from './services/fileUploadService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Environment configuration
const isDevelopment = process.env.NODE_ENV !== 'production';

const app = express();
const DEFAULT_PORT = parseInt(process.env.PORT || '5000', 10);

/**
 * Behind a proxy, believe the proxy about who the caller is.
 *
 * This was set for Render only. On the EC2 box every request arrives through
 * nginx, so without it Express saw one client - nginx - for the whole
 * internet, and the rate limiter counted every visitor into the same bucket:
 * one person hammering the login could lock everybody out of it.
 *
 * One hop is exactly right for both. Trusting further would let a caller
 * spoof their own address by sending an X-Forwarded-For header.
 */
const isRenderDeployment = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID);
if (isRenderDeployment || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  console.log('🔧 trust proxy: 1 (behind a reverse proxy)');
}

// Default to local MongoDB for reliable local development; override with MONGODB_URI in .env
const MONGODB_URI = (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta').trim();

if (MONGODB_URI.startsWith('mongodb+srv://')) {
  // Some environments in this workspace cannot resolve Atlas SRV records via the
  // default DNS path, so we pin public resolvers before Mongoose connects.
  dns.setServers(['1.1.1.1', '8.8.8.8']);
}

// Validate MongoDB URI
if (!MONGODB_URI.startsWith('mongodb://') && !MONGODB_URI.startsWith('mongodb+srv://')) {
  console.error('❌ Invalid MongoDB URI format. It must start with "mongodb://" or "mongodb+srv://"');
  console.error('   Current MONGODB_URI:', MONGODB_URI);
  console.error('   For local dev use: mongodb://127.0.0.1:27017/vinsta');
  process.exit(1);
}

/**
 * Rebuilds an Atlas connection string as a direct seedlist.
 *
 * Only used when the ordinary mongodb+srv:// connection has already failed,
 * which happens where the network cannot resolve SRV records. Running it on
 * every Atlas connection - as this used to - broke every one of them: the
 * seedlist has three hosts separated by commas, `new URL` rejects that as an
 * invalid port, and the server exited with "Invalid URL" before it had tried
 * the perfectly good string it was given.
 *
 * Assembled as text for the same reason: a multi-host seedlist is a MongoDB
 * connection string, not a WHATWG URL, and no URL parser will accept one.
 */
const buildDirectMongoUri = async (uri) => {
  const parsed = new URL(uri);
  const srvHost = parsed.hostname;
  const dbName = parsed.pathname.replace(/^\//, '');

  const srvRecords = await dns.promises.resolveSrv(`_mongodb._tcp.${srvHost}`);
  const txtRecords = await dns.promises.resolveTxt(srvHost).catch(() => []);

  const hosts = srvRecords.map((record) => `${record.name}:${record.port}`).join(',');

  // The options Atlas publishes in TXT, then the ones from the string itself,
  // which win because somebody chose them deliberately.
  const params = new URLSearchParams(txtRecords.flat().join('&'));
  for (const [key, value] of parsed.searchParams.entries()) {
    params.set(key, value);
  }
  if (!params.has('authSource')) params.set('authSource', 'admin');
  if (!params.has('retryWrites')) params.set('retryWrites', 'true');
  // srv implies TLS; spelling it out is what makes the direct form equivalent.
  params.set('tls', 'true');

  // Percent-encoding is kept exactly as given: a password with an @ or a %
  // in it is only correct while it stays encoded.
  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? ':' + parsed.password : ''}@`
    : '';

  return `mongodb://${auth}${hosts}/${dbName}?${params.toString()}`;
};

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [];

if (isDevelopment) {
  app.use(cors({
    origin: true,
    credentials: true,
  }));
} else {
  // Production: Allow all origins for mobile app compatibility
  // Mobile apps don't send Origin headers, so we need to be permissive
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.length > 0) {
        if (allowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
        }
      } else {
        // No allowed origins set - allow all for mobile app support
        return callback(null, true);
      }
      
      /**
       * Refused, but not as a server error.
       *
       * Handing an Error to the cors middleware makes it throw, and the error
       * handler turns that into a 500 reading "An error occurred. Please try
       * again later." - which says nothing about the origin, so a console
       * deployed to a new address looks like a broken server rather than one
       * that has not been told about it yet. Answering without the header is
       * what a refusal is; the browser blocks the response itself.
       */
      console.warn(
        `[CORS] refused ${origin} - add it to ALLOWED_ORIGINS, or unset ` +
          'ALLOWED_ORIGINS to allow every origin.'
      );
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    /*
     * ngrok-skip-browser-warning is sent by all three apps on every request —
     * it was needed when the API lived behind an ngrok tunnel, and it is
     * harmless here. Leaving it out of this list failed the preflight, so
     * every call from a browser was blocked: the web builds of the customer,
     * vendor and rider apps could list nothing and could not even sign in.
     * Native builds were unaffected, which is why it only showed on the links.
     */
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'ngrok-skip-browser-warning',
    ],
  }));
  
  if (allowedOrigins.length > 0) {
    console.log(`🔒 CORS configured: Restricted to ${allowedOrigins.length} origin(s)`);
  } else {
    console.log('🔓 CORS configured: All origins allowed (mobile app support)');
  }
}

// Raw body middleware for webhook (must be before express.json)
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const defaultRateLimitMax = isDevelopment ? '5000' : '500';
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || defaultRateLimitMax, 10);
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes default

// CORS preflight for all routes
app.options('*', cors());

// Rate limiting - exempt health, version, and auth endpoints
const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and auth endpoints
    const path = req.path || '';
    const originalUrl = req.originalUrl || '';
    return path === '/health' ||
           path === '/version' ||
           path.startsWith('/auth/') ||
           originalUrl === '/api/health' ||
           originalUrl === '/api/version' ||
           originalUrl.startsWith('/api/auth/');
  }
});

app.use('/api', limiter);

if (isDevelopment) {
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`📥 [${timestamp}] ${req.method} ${req.path}`);
    
    // Log request body (sanitized) for POST/PUT requests
    if ((req.method === 'POST' || req.method === 'PUT') && req.body && Object.keys(req.body).length > 0) {
      const sanitizedBody = JSON.stringify(req.body).replace(/password|otp|token/gi, '***');
      console.log(`📦 Request body: ${sanitizedBody}`);
    }
    
    // Log response when it's sent
    const originalSend = res.send;
    res.send = function(data) {
      console.log(`📤 [${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode}`);
      return originalSend.call(this, data);
    };
    
    next();
  });
}

mongoose.connection.once('open', async () => {
  try {
    await mongoose.connection.collection('users')
      .dropIndex('email_1');
    console.log('[DB] Dropped old email_1 index');
  } catch (e) {
    console.log('[DB] email_1 index drop skipped:', e.message);
  }
});

try {
  const options = {
    serverSelectionTimeoutMS: 10000, // 10 second timeout for local/Atlas
    socketTimeoutMS: 45000,
  };

  /**
   * The string as given, first. The seedlist rebuild below is a fallback for
   * networks that cannot resolve SRV records, not a step every connection
   * should be put through.
   */
  try {
    await mongoose.connect(MONGODB_URI, options);
  } catch (firstAttempt) {
    if (!MONGODB_URI.startsWith('mongodb+srv://')) throw firstAttempt;

    console.warn('[DB] srv connection failed (' + firstAttempt.message + ')');
    console.warn('[DB] retrying as a direct Atlas seedlist');
    await mongoose.connect(await buildDirectMongoUri(MONGODB_URI), options);
    console.log('[DB] connected via direct seedlist');
  }
  console.log('✅ MongoDB connected');
  startServer();
} catch (error) {
  const msg = error.message || String(error);
  const refused = error.code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED');
  const notFound = error.code === 'ENOTFOUND' || msg.includes('ENOTFOUND');
  const unreachable = error.name === 'MongoServerSelectionError' || refused;

  console.error('❌ MongoDB connection failed:', msg);
  if (unreachable) {
    console.error('   → MongoDB is not running or not reachable.');
    console.error('   → Local: start MongoDB (e.g. run mongod or start MongoDB service).');
    console.error('   → Atlas: set MONGODB_URI=mongodb+srv://... in .env and check network.');
  }
  if (notFound) {
    console.error('   → DNS/host not found. Use mongodb://127.0.0.1:27017/vinsta for local.');
  }
  console.error('   → Local dev: ensure MongoDB is running, then run npm start again.');
  process.exit(1);
}

const isPortAvailable = (port) => {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, '0.0.0.0');
  });
};

const findAvailablePort = async () => {
  const candidates = [DEFAULT_PORT, DEFAULT_PORT + 1, DEFAULT_PORT + 2];
  for (const port of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(port);
    if (available) return port;
  }
  return null;
};

async function startServer() {
  const envPort = parseInt(process.env.PORT || '', 10);
  const PORT = Number.isFinite(envPort) && envPort > 0 ? envPort : await findAvailablePort();
  if (!PORT) {
    console.error('❌ Unable to find an available port (checked 5000-5002).');
    console.error('   Close the process using those ports or set PORT to a free value.');
    process.exit(1);
  }

  if (PORT !== DEFAULT_PORT) {
    console.warn(`⚠️  Default port ${DEFAULT_PORT} in use. Starting backend on ${PORT} instead.`);
    console.warn('   Update frontend env or proxies if they assume port 5000.');
  }

  app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Backend running', timestamp: new Date().toISOString() });
  });

  app.use('/uploads', express.static(join(__dirname, 'uploads')));
  app.use('/api', apiRoutes);

  // Global error handler for unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error(' [CRITICAL] Unhandled Promise Rejection:', reason);
    console.error('Promise:', promise);
    // Don't exit - let the server continue running
  });

  process.on('uncaughtException', (error) => {
    console.error(' [CRITICAL] Uncaught Exception:', error);
    // Don't exit - let the server continue running
  });

  // Error handling middleware (must be after routes)
  app.use((err, req, res, next) => {
    // Always log errors (but sanitize in production)
    if (isDevelopment) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(' [ERROR HANDLER] Error occurred');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Method:', req.method);
      console.error('Path:', req.path);
      console.error('Error Message:', err.message);
      console.error('Error Stack:', err.stack);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
      // Production: Log minimal error info (no stack traces, no sensitive data)
      console.error(`[ERROR] ${req.method} ${req.path} - ${err.status || 500}: ${err.message || 'Internal server error'}`);
    }
    
    // Ensure response is sent (prevent hanging)
    if (!res.headersSent) {
      res.status(err.status || 500).json({ 
        status: 'error', 
        message: isDevelopment
          ? (err.message || 'Something went wrong!')
          : 'An error occurred. Please try again later.',
        ...(isDevelopment && {
          stack: err.stack
        })
      });
    }
  });

  // 404 handler – non-API routes
  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      message: 'Route not found',
      path: req.originalUrl || req.path,
    });
  });

  // Create HTTP server and initialize WebSocket BEFORE listening
  const server = http.createServer(app);
  websocketService.initialize(server);
  console.log(' WebSocket service initialized');

  // Start server with WebSocket support (only after MongoDB connected)
  server.listen(PORT, '0.0.0.0', () => {
    console.log(` Server running on http://localhost:${PORT}`);
    console.log(` API: http://localhost:${PORT}/api`);
    console.log(` Environment: ${isDevelopment ? 'Development' : 'Production'}`);
  
  if (isDevelopment) {
    console.log(`   Admin API: http://localhost:${PORT}/api/admin`);
    console.log(` WebSocket: ws://localhost:${PORT} (Order Control)`);
  } else {
    const productionUrl = process.env.PRODUCTION_URL || process.env.RENDER_EXTERNAL_URL || '';
    console.log(` Production API endpoint: ${productionUrl}/api`);
    console.log(` WebSocket: ${productionUrl.replace('http', 'ws')} (Order Control)`);
    if (allowedOrigins.length > 0) {
      console.log(` CORS configured: Restricted to ${allowedOrigins.length} origin(s)`);
    } else {
      console.log(` CORS configured: All origins allowed (mobile app support)`);
      console.log(`   Consider setting ALLOWED_ORIGINS for better security`);
    }
    
    // Production startup checks
    if (!process.env.JWT_SECRET) {
      console.error(' [CRITICAL] JWT_SECRET not set in production!');
    }
    if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('localhost')) {
      console.warn(' [WARNING] MONGODB_URI appears to be using localhost in production!');
    }
  }

  // Initialize Live Tracking service
  liveTrackingService.initialize();
  console.log(' Live tracking service initialized');

  // Initialize Push Notification service
  pushNotificationService.initialize().then(() => {
    console.log(' Push notification service initialized');
  }).catch(error => {
    console.error(' Failed to initialize push notification service:', error);
  });

  // Initialize File Upload service
  fileUploadService.initialize().then(() => {
    console.log(' File upload service initialized');
  }).catch(error => {
    console.error(' Failed to initialize file upload service:', error);
  });

  // Persistent Auto-Wakeup Mechanism (Prevent Render Sleep Mode)
  // Optimized: 5-8 minute interval with silent error handling
  // Only run in production to prevent Render free tier from sleeping
  if (!isDevelopment) {
    const PRODUCTION_URL = process.env.PRODUCTION_URL || process.env.RENDER_EXTERNAL_URL || '';
    // Fixed interval: Exactly 5 minutes for reliable wakeup
    const WARMUP_INTERVAL_MS = 5 * 60 * 1000; // Exactly 5 minutes

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' [Backend Auto-Wakeup] Persistent wakeup mechanism activated');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   URL: ${PRODUCTION_URL}/api/health`);
    console.log(`   Interval: Exactly 5 minutes (fixed)`);
    console.log(`   Purpose: Permanently prevent Render free tier sleep mode`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Silent ping function using axios - no error logging in production
    const pingSelf = async () => {
      try {
        const response = await axios.get(`${PRODUCTION_URL}/api/health`, {
          timeout: 8000, // 8 second timeout
          validateStatus: () => true, // Accept any status code
        });
        
        // Silent success - only log in development
        if (isDevelopment) {
          console.log(` [Backend Auto-Wakeup] Ping successful: ${JSON.stringify(response.data)}`);
        }
        
        return response.data;
      } catch (error) {
        // Silent error handling - no logging in production
        // Just return null to prevent unhandled promise rejection
        return null;
      }
    };

    // Ping immediately on startup (after a short delay to ensure server is ready)
    setTimeout(() => {
      pingSelf();
    }, 3000); // Wait 3 seconds after server starts (faster)

    // Persistent ping with fixed 5-minute interval
    setInterval(() => {
      pingSelf();
    }, WARMUP_INTERVAL_MS);

    console.log(' [Backend Auto-Wakeup] Persistent timer started - Server will stay awake');
  }
});
} // end startServer()
