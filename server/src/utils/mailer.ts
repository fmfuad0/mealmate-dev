import dns from 'dns';
import nodemailer, { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { env } from '../config/env';
import { logger } from '../config/logger';

let transporter: Transporter | null = null;

const RENDER_PORT_HINT =
  'Render free/shared tiers often block outbound SMTP ports 465/587. ' +
  'If timeouts persist, switch to an HTTP-based email API (Resend, SendGrid, Mailgun) on port 443, ' +
  'or upgrade to a Render paid plan with static outbound IPs.';

async function resolveHostIPv4(host: string): Promise<string> {
  try {
    const { address } = await dns.promises.lookup(host, { family: 4 });
    logger.debug({ host, address }, 'SMTP host DNS resolved to IPv4');
    return address;
  } catch (err) {
    logger.warn({ host, err }, 'SMTP host IPv4 DNS lookup failed — falling back to hostname');
    return host;
  }
}

function buildOptions(port: number, resolvedHost?: string): SMTPTransport.Options & { family?: number } {
  const secure = port === 465;
  return {
    host: resolvedHost ?? env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    family: 4,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      servername: env.SMTP_HOST,
    },
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    connectionTimeout: 30_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  };
}

const ALTERNATIVE_PORTS: ReadonlyArray<number> = [587, 465];

function getTransporter(port: number, resolvedHost?: string): Transporter {
  const options = buildOptions(port, resolvedHost);
  return nodemailer.createTransport(options);
}

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email via Google SMTP. If SMTP is not configured (e.g. local dev),
 * the email content is logged instead of sent so flows remain testable.
 */
export async function sendMail({ to, subject, html, text }: MailOptions): Promise<void> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    if (env.isProd) {
      const message = 'SMTP is not configured for production email delivery. Set SMTP_USER and SMTP_PASS in the hosted environment.';
      logger.error({ to, subject }, message);
      throw new Error(message);
    }

    logger.warn({ to, subject }, '📧 SMTP not configured — email not sent (logging instead)');
    logger.info({ to, subject, text: text ?? html }, 'Email content');
    return;
  }

  if (!transporter) {
    const primaryPort = Number(env.SMTP_PORT) || 587;
    const resolvedHost = await resolveHostIPv4(env.SMTP_HOST);
    logger.info(
      { host: env.SMTP_HOST, resolvedHost, port: primaryPort, secure: primaryPort === 465, user: env.SMTP_USER },
      'Creating primary SMTP transporter',
    );
    transporter = getTransporter(primaryPort, resolvedHost);
  }

  let lastErr: unknown = null;
  for (const port of ALTERNATIVE_PORTS) {
    try {
      const tx = transporter ?? getTransporter(port);
      await tx.sendMail({ from: env.MAIL_FROM, to, subject, html, text });
      logger.info({ to, subject, port }, '📧 Email sent successfully');
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string }).code;
      logger.warn({ err, to, subject, port, code }, '📧 Send failed on this port — trying alternatives if available');
      transporter = null;
      if (code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'ECONNREFUSED') {
        continue;
      }
      break;
    }
  }

  logger.error({ err: lastErr, to, subject }, '📧 Failed to send email on all SMTP ports. ' + RENDER_PORT_HINT);
  throw lastErr instanceof Error ? lastErr : new Error('Failed to send email');
}

// ─── Shared email template wrapper ──────────────────────────────────────────

export async function verifyMailer(): Promise<void> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn('SMTP not configured — skipping mailer verification');
    return;
  }

  const resolvedHost = await resolveHostIPv4(env.SMTP_HOST);
  let lastErr: unknown = null;
  let successOnPort: number | null = null;

  for (const port of ALTERNATIVE_PORTS) {
    logger.info({ host: env.SMTP_HOST, resolvedHost, port }, 'Verifying SMTP connectivity');
    const tx = getTransporter(port, resolvedHost);
    try {
      await tx.verify();
      successOnPort = port;
      transporter = tx;
      break;
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string }).code;
      logger.warn({ err, port, code }, 'SMTP verify failed on this port — trying next');
      try { tx.close(); } catch { /* ignore */ }
    }
  }

  if (successOnPort !== null) {
    logger.info({ port: successOnPort }, '✅ SMTP mailer verified successfully');
  } else {
    logger.error({ err: lastErr }, '❌ SMTP mailer verification FAILED on all ports. ' + RENDER_PORT_HINT);
    transporter = null;
  }
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MealMate</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f7f4;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#16a34a,#15803d);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">🍽️ MealMate</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:6px;">Meal &amp; Expense Management</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              ${content}
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;" />
              <p style="font-size:12px;color:#9ca3af;margin:0;text-align:center;">
                This email was sent by MealMate. If you did not request this, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Verification Email ──────────────────────────────────────────────────────
export function verificationEmail(name: string, link: string): { subject: string; html: string; text: string } {
  return {
    subject: '✅ Verify your MealMate account',
    text: `Hi ${name},\n\nWelcome to MealMate! Please verify your email address by visiting:\n${link}\n\nThis link expires in 24 hours.\n\nIf you didn't create an account, you can safely ignore this email.`,
    html: emailWrapper(`
      <h2 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Welcome, ${name}! 🎉</h2>
      <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">
        Thanks for joining MealMate. Please verify your email address to activate your account and start tracking meals and expenses with your household.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">
          Verify Email Address
        </a>
      </div>
      <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.5;">
        Or copy and paste this link into your browser:<br/>
        <a href="${link}" style="color:#16a34a;word-break:break-all;">${link}</a>
      </p>
      <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">⏳ This link expires in <strong>24 hours</strong>.</p>
    `),
  };
}

// ─── Password Reset Email ────────────────────────────────────────────────────
export function passwordResetEmail(name: string, link: string): { subject: string; html: string; text: string } {
  return {
    subject: '🔐 Reset your MealMate password',
    text: `Hi ${name},\n\nWe received a request to reset your MealMate password. Click the link below to set a new password:\n${link}\n\nThis link expires in 1 hour.\n\nIf you didn't request a password reset, please ignore this email — your password will remain unchanged.`,
    html: emailWrapper(`
      <h2 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Reset your password</h2>
      <p style="font-size:15px;color:#374151;margin:0 0 8px;line-height:1.6;">
        Hi <strong>${name}</strong>,
      </p>
      <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">
        We received a request to reset the password for your MealMate account. Click the button below to create a new password.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">
          Reset Password
        </a>
      </div>
      <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.5;">
        Or copy and paste this link into your browser:<br/>
        <a href="${link}" style="color:#16a34a;word-break:break-all;">${link}</a>
      </p>
      <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">⏳ This link expires in <strong>1 hour</strong>.</p>
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-top:20px;">
        <p style="font-size:13px;color:#92400e;margin:0;">
          ⚠️ If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
        </p>
      </div>
    `),
  };
}
