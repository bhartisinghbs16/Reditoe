import crypto from 'crypto';

/**
 * ID documents (Aadhaar, PAN, licence, bank proof) are kept off the public
 * web. The files still live under /uploads, but these folders are only
 * served to a request carrying a short-lived signature.
 *
 * Signing happens automatically: `signPrivateUrlsInResponses` rewrites every
 * document link in a response to a signed-in API caller, so the admin
 * console, the vendor app and anything else that already reads those URLs
 * keeps working without changes, and a link copied out of a response stops
 * working after LINK_TTL_SECONDS. The bare URL, which used to be handed to
 * anyone, now gets a 403.
 */
export const PRIVATE_FOLDERS = ['rider-documents', 'vendor-documents'];
const LINK_TTL_SECONDS = 15 * 60;

const PRIVATE_URL = new RegExp(
  '^((?:https?:\\/\\/[^/]+)?\\/uploads\\/(?:' + PRIVATE_FOLDERS.join('|') + ')\\/[^?#\\s]+)(?:\\?.*)?$'
);

const secret = () => {
  const value = process.env.FILE_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error('FILE_SIGNING_SECRET or JWT_SECRET must be set in production');
  }
  return value || 'DEV-ONLY-INSECURE-SECRET-DO-NOT-USE-IN-PRODUCTION';
};

const signatureFor = (relativePath, exp) =>
  crypto.createHmac('sha256', secret()).update(relativePath + '|' + exp).digest('hex');

/** The path under /uploads, e.g. rider-documents/abc.png */
const relativeOf = (urlOrPath) => {
  const match = String(urlOrPath).match(/\/uploads\/(.+?)(?:\?.*)?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

export const signPrivateUrl = (url, ttlSeconds = LINK_TTL_SECONDS) => {
  const rel = relativeOf(url);
  if (!rel) return url;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const base = String(url).replace(/\?.*$/, '');
  return base + '?exp=' + exp + '&sig=' + signatureFor(rel, exp);
};

export const isPrivateRequestPath = (relativePath) => {
  const first = String(relativePath || '').replace(/^\/+/, '').split('/')[0];
  return PRIVATE_FOLDERS.includes(first);
};

const refuse = (res) =>
  res.status(403).json({ success: false, message: 'This document link is private or has expired.' });

/** Guard mounted in front of the static /uploads handler. */
export const guardPrivateUploads = (req, res, next) => {
  let rel;
  try {
    rel = decodeURIComponent(req.path.replace(/^\/+/, ''));
  } catch {
    return res.status(400).end();
  }
  if (rel.split('/').some((part) => part === '..')) return res.status(400).end();
  if (!isPrivateRequestPath(rel)) return next();

  const exp = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000) || !sig) return refuse(res);

  const a = Buffer.from(signatureFor(rel, exp));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return refuse(res);

  res.setHeader('Cache-Control', 'private, no-store');
  return next();
};

const walk = (value, transform, depth = 0) => {
  if (depth > 12 || value == null) return value;
  if (typeof value === 'string') return transform(value);
  if (Array.isArray(value)) return value.map((item) => walk(item, transform, depth + 1));
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      value[key] = walk(value[key], transform, depth + 1);
    }
  }
  return value;
};

/**
 * Responses to a caller who is signed in get fresh signed links; responses to
 * anonymous callers are left alone, so a public endpoint can never mint one.
 * The registration upload replies (sent before an account exists) are the one
 * exception, so the person who just uploaded a document can still preview it.
 */
export const signPrivateUrlsInResponses = (req, res, next) => {
  const original = res.json.bind(res);
  res.json = (body) => {
    try {
      const text = JSON.stringify(body);
      const mentionsPrivate =
        typeof text === 'string' &&
        PRIVATE_FOLDERS.some((folder) => text.includes('/uploads/' + folder + '/'));
      if (!mentionsPrivate) return original(body);

      const canSign =
        Boolean(req.headers.authorization) || /upload-document|upload-doc/i.test(req.path);
      if (!canSign) return original(body);

      const copy = JSON.parse(text);
      return original(
        walk(copy, (s) => (PRIVATE_URL.test(s) ? signPrivateUrl(s.replace(/\?.*$/, '')) : s))
      );
    } catch {
      return original(body);
    }
  };
  next();
};

/**
 * A signed link a client sends back (for example when finishing a
 * registration) must be stored as the plain path, not as a link that expires.
 */
export const stripSignaturesFromRequests = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = walk(req.body, (s) =>
      PRIVATE_URL.test(s) && /[?&]sig=/.test(s) ? s.replace(/\?.*$/, '') : s
    );
  }
  next();
};
