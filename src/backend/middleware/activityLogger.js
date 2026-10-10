import ActivityLog from '../models/ActivityLog.js';

/**
 * Recording what the admin team actually did.
 *
 * The ActivityLog model and the page that lists it both existed, but nothing
 * in the codebase ever created a record — so the Activity Logs screen could
 * only ever be empty, which is the reported fault.
 *
 * This records writes rather than reads: a GET is someone looking, and a log
 * of every page view would bury the thing an audit is for. Reads are cheap to
 * add later; what matters is that a change to an order, a refund, a menu or a
 * user leaves a trace of who made it and when.
 *
 * It records after the response, and only when the response succeeded. A
 * rejected request did not change anything, and logging it as though it had
 * would make the trail lie in the direction that matters most.
 */

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The action a request represents.
 *
 * Matched on the path so the common cases carry their real name in the list;
 * anything else is recorded as a generic admin action rather than dropped,
 * because an unnamed change is still a change somebody may need to find.
 */
const ACTION_BY_PATTERN = [
  [/\/refunds?\/.*\/(approve|process)/i, 'admin_refund_approved', 'high'],
  [/\/refunds?\/.*\/reject/i, 'admin_refund_rejected', 'high'],
  [/\/campaigns/i, 'admin_campaign_created', 'medium'],
  [/\/settings/i, 'admin_settings_updated', 'high'],
  [/\/(users|customers)\/.*\/block/i, 'admin_user_blocked', 'high'],
  [/\/(users|customers)\/.*\/unblock/i, 'admin_user_unblocked', 'medium'],
  [/\/(users|customers)/i, 'admin_user_updated', 'medium'],
  [/\/orders\/.*\/assign/i, 'admin_order_assigned', 'medium'],
];

function describe(req) {
  for (const [pattern, actionType, severity] of ACTION_BY_PATTERN) {
    if (pattern.test(req.originalUrl)) return { actionType, severity };
  }
  return { actionType: 'admin_action', severity: 'low' };
}

/** The address the request came from, through however many proxies. */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

export function recordAdminActivity(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();

  res.on('finish', () => {
    // Only what actually happened.
    if (res.statusCode >= 400) return;

    const actor = req.user?._id || req.user?.id || req.adminId;
    if (!actor) return;

    const { actionType, severity } = describe(req);

    void ActivityLog.create({
      userId: actor,
      actionType,
      description: `${req.method} ${req.originalUrl.split('?')[0]}`,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'] || '',
      severity,
      status: 'success',
      metadata: {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        statusCode: res.statusCode,
      },
    }).catch((error) => {
      // An audit trail must never be the reason a request fails; the write has
      // already happened and the response has already gone.
      console.error('[ActivityLog]', error?.message || error);
    });
  });

  next();
}

/**
 * One deliberate entry, for the things no route pattern describes — a sign-in,
 * or an action worth naming precisely.
 */
export async function logActivity({
  userId,
  actionType,
  description,
  req,
  severity = 'low',
  status = 'success',
  metadata = {},
}) {
  if (!userId || !actionType) return null;
  try {
    return await ActivityLog.create({
      userId,
      actionType,
      description,
      ipAddress: req ? clientIp(req) : '',
      userAgent: req?.headers?.['user-agent'] || '',
      severity,
      status,
      metadata,
    });
  } catch (error) {
    console.error('[ActivityLog]', error?.message || error);
    return null;
  }
}
