/**
 * The posters the app shows, as the admin has set them.
 *
 * The home screen carried four promotional images compiled into the app, so
 * changing one meant shipping a new build to every phone. Banners have been
 * administrable for a while; nothing was reading them.
 */
import fs from 'fs';
import path from 'path';
import Banner from '../../models/Banner.js';

/**
 * Whether a poster's picture can still be fetched, where we are able to tell.
 *
 * The admin console stores posters on this server's own disk unless cloud
 * storage is configured, and a host that rebuilds or restarts on a fresh disk
 * loses them: the banner row survives and points at a file that is gone, so
 * every phone drew an empty box. Anything stored elsewhere (S3, a CDN) is not
 * ours to check and is passed through.
 */
const isOwnHost = (host, req) => {
  const wanted = String(host || '').toLowerCase();
  if (!wanted) return false;
  const own = new Set(['localhost', '127.0.0.1']);
  const requestHost = String(req.get?.('host') || '').toLowerCase();
  if (requestHost) own.add(requestHost);
  try {
    if (process.env.PUBLIC_API_URL) own.add(new URL(process.env.PUBLIC_API_URL).host.toLowerCase());
  } catch {
    // Not a URL; ignore it.
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) own.add(process.env.RAILWAY_PUBLIC_DOMAIN.toLowerCase());
  return own.has(wanted) || own.has(wanted.split(':')[0]) || wanted.endsWith('.up.railway.app');
};

export const posterImageExists = (mediaUrl, req) => {
  const raw = String(mediaUrl ?? '').trim();
  if (!raw) return false;
  if (raw.startsWith('data:')) return true;

  let pathname;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (!isOwnHost(parsed.host, req)) return true;
      pathname = parsed.pathname;
    } catch {
      return true;
    }
  } else if (raw.startsWith('//')) {
    return true;
  } else {
    pathname = raw.startsWith('/') ? raw : `/${raw}`;
  }

  if (!pathname.startsWith('/uploads/')) return true;

  const root = path.resolve(process.cwd(), 'uploads');
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice('/uploads/'.length));
  } catch {
    return false;
  }
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) return false;
  return fs.existsSync(target);
};

/**
 * GET /api/banners?position=homepage
 *
 * Only what is live now. The admin screen already lets a banner be scheduled,
 * but the existing reader ignored the dates, so a finished campaign kept
 * running and one queued for next week was already showing.
 */
export const getPublicBanners = async (req, res) => {
  try {
    const position = String(req.query?.position ?? 'homepage').trim();
    const now = new Date();

    const banners = await Banner.find({
      isActive: true,
      position,
      $and: [
        { $or: [{ startDate: { $lte: now } }, { startDate: null }, { startDate: { $exists: false } }] },
        { $or: [{ endDate: { $gte: now } }, { endDate: null }, { endDate: { $exists: false } }] },
      ],
    })
      .sort({ displayOrder: 1, createdAt: -1 })
      // A safety ceiling, not a design limit: the home carousel shows every
      // live banner, so a cap of ten silently hid the eleventh upload.
      .limit(20)
      .lean();

    // A poster whose picture has gone is left out rather than sent: the app
    // then draws its own offers instead of an empty box.
    const showable = banners.filter((banner) => posterImageExists(banner.mediaUrl, req));

    return res.status(200).json({
      status: 'success',
      data: {
        banners: showable.map((banner) => ({
          id: banner._id,
          title: banner.title,
          description: banner.description ?? null,
          imageUrl: banner.mediaUrl,
          mediaType: banner.mediaType ?? 'image',
          altText: banner.altText ?? banner.title,
          buttonText: banner.buttonText ?? null,
          /*
           * Where tapping it goes. The type says how to read the value, so
           * the app can open a restaurant or a category without guessing at
           * a URL.
           */
          actionType: banner.actionType ?? null,
          actionValue: banner.actionValue ?? null,
          actionUrl: banner.actionUrl ?? null,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export default { getPublicBanners };
