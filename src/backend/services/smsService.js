import axios from 'axios';
import twilio from 'twilio';

/**
 * Sending a text message.
 *
 * Two providers, chosen by SMS_PROVIDER: MSG91, which is what an Indian
 * platform normally uses and what this one is set up with, and Twilio, which
 * was here first and still works.
 *
 * The one-time codes themselves are this platform's - generated here, stored
 * hashed, expired, throttled and counted against a limited number of guesses.
 * MSG91 also offers to run all of that itself; using it that way would move
 * the throttling and the attempt limit onto somebody else's rules, and the
 * email codes would follow a different set again. So MSG91 is asked only to
 * carry a message this server wrote.
 */

const PROVIDER = (process.env.SMS_PROVIDER || 'msg91').trim().toLowerCase();

/* ── MSG91 ─────────────────────────────────────────────────────────────── */

const MSG91_AUTH_KEY = (process.env.MSG91_AUTH_KEY || '').trim();
const MSG91_SENDER_ID = (process.env.MSG91_SENDER_ID || '').trim();
const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow/';

/**
 * The variable the approved template puts the code in.
 *
 * DLT templates name their own placeholders and the operator approves the
 * wording as written, so this cannot be assumed: these read "...is ##num##",
 * not "##OTP##". Send it under the wrong name and MSG91 delivers a message
 * with an empty gap where the code should be - which is worse than not
 * sending, because the customer gets a text and still cannot sign in.
 */
const MSG91_OTP_VAR = (process.env.MSG91_OTP_VAR || 'num').trim();

/**
 * A template per audience, because each was registered separately.
 *
 * The wording differs - "Delivery Partner", "Reditoe Vendor" - and DLT
 * approves exact wording, so one template cannot serve both. Whichever is
 * missing falls back to the general one.
 */
const MSG91_TEMPLATES = {
  rider: (process.env.MSG91_TEMPLATE_ID_RIDER || '').trim(),
  vendor: (process.env.MSG91_TEMPLATE_ID_VENDOR || '').trim(),
  default: (process.env.MSG91_TEMPLATE_ID || '').trim(),
};

const templateFor = (role) =>
  MSG91_TEMPLATES[String(role || '').toLowerCase()] || MSG91_TEMPLATES.default;

/** Default country code for bare ten-digit numbers. India, here. */
const DEFAULT_CC = (process.env.SMS_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');

/**
 * MSG91 wants digits only, with the country code and no leading plus.
 *
 * Numbers reach this from three apps and a seed script, so they arrive as
 * "+919800112233", "9800112233", and with spaces in them.
 */
export const msg91Number = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `${DEFAULT_CC}${digits}`;
  // Already carries a country code, or is a number this cannot improve.
  return digits;
};

const isMsg91Configured = () =>
  !!MSG91_AUTH_KEY && Object.values(MSG91_TEMPLATES).some(Boolean);

/**
 * MSG91 answers 200 with a body saying it failed, so the body has to be read
 * rather than trusting the status code.
 */
const sendViaMsg91 = async ({ to, otp, message, role }) => {
  const mobiles = msg91Number(to);
  if (!mobiles) throw new Error('No usable mobile number');

  const templateId = templateFor(role);
  if (!templateId) throw new Error(`No MSG91 template for ${role || 'default'}`);

  const recipient = { mobiles };
  if (otp) recipient[MSG91_OTP_VAR] = String(otp);
  // Templates that carry the whole message rather than just a code.
  if (message && !otp) recipient.MESSAGE = message;

  const body = {
    template_id: templateId,
    short_url: '0',
    recipients: [recipient],
    ...(MSG91_SENDER_ID ? { sender: MSG91_SENDER_ID } : {}),
  };

  const response = await axios.post(MSG91_FLOW_URL, body, {
    headers: { authkey: MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
    /**
     * Shorter than the apps are willing to wait for the whole request.
     * MSG91 taking its time must not turn into the customer's phone giving
     * up on a sign-in that had otherwise succeeded - the code is already
     * stored by this point, and sending it is delivery, not the operation.
     */
    timeout: 7000,
  });

  const payload = response?.data;
  if (payload?.type && String(payload.type).toLowerCase() === 'error') {
    throw new Error(payload.message || 'MSG91 refused the message');
  }
  return true;
};

/* ── Twilio ────────────────────────────────────────────────────────────── */

const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const TWILIO_PHONE_NUMBER = (process.env.TWILIO_PHONE_NUMBER || '').trim();

let twilioClient = null;
try {
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
} catch {
  // Bad credentials must not stop the server booting.
  twilioClient = null;
}

const isTwilioConfigured = () =>
  !!twilioClient && !!TWILIO_ACCOUNT_SID && !!TWILIO_AUTH_TOKEN && !!TWILIO_PHONE_NUMBER;

const sendViaTwilio = async ({ to, message }) => {
  await twilioClient.messages.create({
    body: message,
    from: TWILIO_PHONE_NUMBER,
    to,
  });
  return true;
};

/* ── What the rest of the server uses ──────────────────────────────────── */

/** Whether texts can actually be delivered right now. */
export const isSmsConfigured = () =>
  PROVIDER === 'twilio' ? isTwilioConfigured() : isMsg91Configured();

/** Which provider is carrying them, for the status endpoint. */
export const smsProvider = () => PROVIDER;

/**
 * Sends one message. Returns false rather than throwing, because every caller
 * has the same fallback - show the code on screen - and none of them can do
 * anything more useful with the reason.
 */
export const sendSms = async ({ to, message, otp, role }) => {
  if (!to || !isSmsConfigured()) return false;

  try {
    if (PROVIDER === 'twilio') {
      await sendViaTwilio({ to, message });
    } else {
      await sendViaMsg91({ to, otp, message, role });
    }
    return true;
  } catch (error) {
    console.error(`[sms] ${PROVIDER} send failed:`, error?.message || error);
    return false;
  }
};

export default { sendSms, isSmsConfigured, smsProvider, msg91Number };
