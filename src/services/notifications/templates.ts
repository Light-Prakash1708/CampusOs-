import type { EmailMessage } from './providers';

/**
 * Email templates. Plain, accessible HTML with a text alternative — no remote
 * images, no tracking pixels. Every interpolated value is HTML-escaped.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Layout {
  institutionName: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footer?: string;
}

/**
 * Email-safe CampusOS wordmark: live text, no image (many clients block
 * images and SVG). Deeper shades of the logo's lavender and green keep the
 * letters readable on white without the web logo's outline.
 */
const WORDMARK_HTML =
  '<span style="font-weight:800;color:#1E1B4B;letter-spacing:-0.02em">Campus<span style="color:#7C3AED">O</span><span style="color:#15803D">S</span></span>';

function render({ institutionName, heading, paragraphs, action, footer }: Layout): { html: string; text: string } {
  const e = escapeHtml;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px;font-size:13px;color:#6b7280">${e(institutionName)} · ${WORDMARK_HTML}</td></tr>
<tr><td style="padding:0 28px"><h1 style="font-size:20px;line-height:1.3;margin:8px 0 16px">${e(heading)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${e(p)}</p>`).join('\n')}
${action ? `<p style="margin:22px 0"><a href="${e(action.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:15px">${e(action.label)}</a></p>
<p style="font-size:12px;color:#6b7280;line-height:1.5;margin:0 0 14px">If the button does not work, copy this link into your browser:<br>${e(action.url)}</p>` : ''}
</td></tr>
<tr><td style="padding:12px 28px 26px;font-size:12px;color:#6b7280;line-height:1.5">${e(footer ?? 'You received this because you have an account with your institution on CampusOS.')}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${institutionName} · CampusOS`,
    '',
    heading,
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    ...(action ? [`${action.label}: ${action.url}`, ''] : []),
    footer ?? 'You received this because you have an account with your institution on CampusOS.',
  ].join('\n');

  return { html, text };
}

export function passwordResetEmail(p: {
  to: string;
  firstName: string;
  institutionName: string;
  url: string;
  expiresMinutes: number;
}): EmailMessage {
  const { html, text } = render({
    institutionName: p.institutionName,
    heading: 'Reset your password',
    paragraphs: [
      `Hi ${p.firstName},`,
      `Someone asked to reset the password for your CampusOS account. If that was you, choose a new password using the link below. It works once and expires in ${p.expiresMinutes} minutes.`,
      'If you did not ask for this, you can ignore this email — your password will not change.',
    ],
    action: { label: 'Choose a new password', url: p.url },
  });
  return { to: p.to, subject: 'Reset your CampusOS password', html, text, tag: 'password_reset' };
}

export function passwordChangedEmail(p: { to: string; firstName: string; institutionName: string }): EmailMessage {
  const { html, text } = render({
    institutionName: p.institutionName,
    heading: 'Your password was changed',
    paragraphs: [
      `Hi ${p.firstName},`,
      'The password for your CampusOS account was just changed, and every device was signed out.',
      'If this was not you, reset your password immediately and tell your institution’s IT support.',
    ],
  });
  return { to: p.to, subject: 'Your CampusOS password was changed', html, text, tag: 'password_changed' };
}

export function verifyEmailEmail(p: {
  to: string;
  firstName: string;
  institutionName: string;
  url: string;
  expiresHours: number;
}): EmailMessage {
  const { html, text } = render({
    institutionName: p.institutionName,
    heading: 'Confirm your email address',
    paragraphs: [
      `Hi ${p.firstName},`,
      `Confirm that this is your email address to finish setting up CampusOS. The link expires in ${p.expiresHours} hours.`,
    ],
    action: { label: 'Confirm email address', url: p.url },
    footer: 'If you did not create a CampusOS account, you can ignore this email.',
  });
  return { to: p.to, subject: 'Confirm your email for CampusOS', html, text, tag: 'email_verify' };
}

export function inviteEmail(p: {
  to: string;
  firstName: string;
  institutionName: string;
  inviterName: string;
  roleLabel: string;
  url: string;
  expiresDays: number;
}): EmailMessage {
  const { html, text } = render({
    institutionName: p.institutionName,
    heading: `You're invited to ${p.institutionName} on CampusOS`,
    paragraphs: [
      `Hi ${p.firstName},`,
      `${p.inviterName} has invited you to join ${p.institutionName} on CampusOS as ${p.roleLabel}.`,
      `Set your password to activate your account. The invitation expires in ${p.expiresDays} days.`,
    ],
    action: { label: 'Accept invitation', url: p.url },
  });
  return { to: p.to, subject: `Your CampusOS invitation from ${p.institutionName}`, html, text, tag: 'invite' };
}

export function notificationEmail(p: {
  to: string;
  institutionName: string;
  title: string;
  body: string | null;
  url: string | null;
  priority: string;
}): EmailMessage {
  const { html, text } = render({
    institutionName: p.institutionName,
    heading: p.title,
    paragraphs: p.body ? p.body.split(/\n{2,}/).slice(0, 8) : [],
    action: p.url ? { label: 'Open in CampusOS', url: p.url } : undefined,
    footer:
      p.priority === 'CRITICAL'
        ? 'This is a critical notice from your institution.'
        : 'Change which notices reach your inbox in CampusOS → Settings → Notifications.',
  });
  const prefix = p.priority === 'CRITICAL' ? '[Urgent] ' : '';
  return { to: p.to, subject: `${prefix}${p.title}`.slice(0, 180), html, text, tag: 'notification' };
}
