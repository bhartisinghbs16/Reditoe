/**
 * Account invitations.
 *
 * An admin creating a vendor used to also mint that vendor's password, which
 * meant the password had to be shown to the admin and carried to the vendor by
 * some channel nobody controls. A password an admin has read is not the
 * vendor's alone, and a password sent over WhatsApp is not a secret.
 *
 * The account is instead created with no usable password and a one-time link
 * is emailed to the address that will be the login. Only a hash of the token is
 * stored, so the raw value lives in the vendor's inbox and nowhere else.
 */

import crypto from 'crypto';
import { sendEmail } from './emailService.js';

/** Long enough that guessing is not a strategy. */
const TOKEN_BYTES = 32;

/** A week: long enough to survive a weekend, short enough to expire. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

/**
 * Where the vendor lands to choose a password.
 *
 * PUBLIC_APP_URL is the platform's own origin. It is one setting because every
 * front end is served from the same origin — see the admin console's rewrites.
 */
const setPasswordUrl = (token) => {
  /**
   * BASE_URL is deliberately not consulted: it is the API's own origin, and
   * the set-password page is served by the console in front of it. Falling
   * back to it produced links to port 5000, which serves no such page — the
   * vendor followed the link and found nothing.
   */
  const base = (
    process.env.PUBLIC_APP_URL ||
    process.env.ADMIN_DASHBOARD_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
  return `${base}/set-password?token=${token}`;
};

/**
 * Stamps a fresh invitation onto a user document. The caller saves it — this
 * returns the raw token so it can be emailed, and never stores it.
 */
export function issueSetupToken(user) {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  user.passwordSetupToken = hashToken(raw);
  user.passwordSetupExpires = new Date(Date.now() + INVITE_TTL_MS);
  user.mustSetPassword = true;
  return raw;
}

const inviteHtml = ({ name, businessName, link, days }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #E63946; margin-bottom: 4px;">Your Reditoe vendor account is ready</h2>
    <p style="color: #444;">Hello ${name || 'there'},</p>
    <p style="color: #444;">
      An account has been created for
      <strong>${businessName || 'your restaurant'}</strong> on Reditoe.
      Choose a password to finish setting it up.
    </p>
    <p style="text-align: center; margin: 28px 0;">
      <a href="${link}"
         style="background: #E63946; color: #fff; text-decoration: none;
                padding: 13px 26px; border-radius: 8px; font-weight: bold;
                display: inline-block;">
        Set your password
      </a>
    </p>
    <p style="color: #666; font-size: 13px;">
      This link works once and expires in ${days} days. If it has expired, ask
      your Reditoe contact to send a new one.
    </p>
    <p style="color: #666; font-size: 13px;">
      If the button does not work, paste this into your browser:<br />
      <span style="word-break: break-all;">${link}</span>
    </p>
    <p style="color: #999; font-size: 12px; margin-top: 24px;">
      You will sign in with this email address.
    </p>
  </div>
`;

/**
 * Sends the invitation.
 *
 * Returns what happened rather than throwing: a vendor whose account was
 * created but whose email bounced is a real situation an admin has to be told
 * about, not a reason to fail the creation and lose the restaurant record.
 * When no mail provider is configured the link is returned so a developer can
 * still walk the flow — never in production.
 */
export async function sendSetupInvite({ user, businessName, subject }) {
  const raw = issueSetupToken(user);
  await user.save({ validateBeforeSave: false });

  const link = setPasswordUrl(raw);
  const sent = await sendEmail(
    user.email,
    subject || 'Set your Reditoe vendor password',
    inviteHtml({
      name: user.name,
      businessName,
      link,
      days: Math.round(INVITE_TTL_MS / (24 * 60 * 60 * 1000)),
    })
  );

  if (!sent) {
    console.warn(`[invite] No email provider configured — set-password link for ${user.email}: ${link}`);
  }

  return {
    sent,
    expiresAt: user.passwordSetupExpires,
    ...(!sent && process.env.NODE_ENV !== 'production' ? { devSetupLink: link } : {}),
  };
}
