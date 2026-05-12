import { getResend, EMAIL_FROM } from './mailer';
import {
  createEmailLogEntry,
  createEmailLogEntryOnce,
  markEmailFailed,
  markEmailSending,
} from './emailLog';

const STAGE_LABELS: Record<string, string> = {
  A: 'Screening assessment (Stage A)',
  B: 'Technical assessment (Stage B)',
  AB: 'Full assessment pipeline (Stage A -> Stage B)',
};

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3_000;

export interface InviteEmailArgs {
  to: string;
  inviteUrl: string;
  stage: 'A' | 'B' | 'AB';
  expiresAt: Date;
  roleName?: string;
  sessionId?: string;
  purpose?: string;
  oncePerSessionPurpose?: boolean;
}

export interface InviteEmailResult {
  sent: boolean;
  skipped: boolean;
  logId: string | null;
  resendId: string | null;
}

export async function sendInviteEmail(args: InviteEmailArgs): Promise<InviteEmailResult> {
  const { to, inviteUrl, stage, expiresAt, roleName, sessionId } = args;
  const purpose = args.purpose ?? 'invite';
  const resend = getResend();

  let logId: string | null = null;
  if (sessionId && args.oncePerSessionPurpose) {
    const log = await createEmailLogEntryOnce(sessionId, to, purpose);
    logId = log.id;
    if (!log.created) {
      return { sent: false, skipped: true, logId, resendId: log.resend_id };
    }
  } else {
    logId = await createEmailLogEntry(sessionId ?? null, to, purpose).catch(() => null);
  }

  if (!resend) {
    console.info('[mailer] RESEND_API_KEY not set. Invite link:', inviteUrl);
    return { sent: false, skipped: false, logId, resendId: null };
  }

  const stageLabel = STAGE_LABELS[stage] ?? stage;
  const expiry = expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const payload = {
    from: EMAIL_FROM,
    to,
    subject: `You've been invited to complete an assessment`,
    text: buildText({ inviteUrl, stageLabel, expiry, roleName }),
    html: buildHtml({ inviteUrl, stageLabel, expiry, roleName }),
  };

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await resend.emails.send(payload);

    if (!error && data?.id) {
      if (logId) await markEmailSending(logId, data.id).catch(() => {});
      return { sent: true, skipped: false, logId, resendId: data.id };
    }

    lastError = error ? `${error.name}: ${error.message}` : 'unknown error';
    console.warn(`[mailer] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`);

    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }

  if (logId) await markEmailFailed(logId, lastError).catch(() => {});
  console.error(`[mailer] gave up after ${MAX_ATTEMPTS} attempts: ${lastError}`);
  return { sent: false, skipped: false, logId, resendId: null };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TemplateArgs = {
  inviteUrl: string;
  stageLabel: string;
  expiry: string;
  roleName?: string;
};

function buildText({ inviteUrl, stageLabel, expiry, roleName }: TemplateArgs) {
  return [
    `You've been invited to complete a candidate assessment.`,
    ``,
    roleName ? `Role: ${roleName}` : null,
    `Assessment: ${stageLabel}`,
    `Link expires: ${expiry}`,
    ``,
    `Start your assessment:`,
    inviteUrl,
    ``,
    `This link is personal - do not share it. The timer starts when you open it.`,
    `If you did not expect this message, you can safely ignore it.`,
  ].filter((line) => line !== null).join('\n');
}

function buildHtml({ inviteUrl, stageLabel, expiry, roleName }: TemplateArgs) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Assessment invitation</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">
          <tr>
            <td style="background:#1c1917;border-radius:12px 12px 0 0;padding:28px 36px;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#a8a29e;letter-spacing:0.08em;text-transform:uppercase;">
                Assessment invitation
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #e7e5e4;border-right:1px solid #e7e5e4;">
              <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1c1917;">
                You've been invited to complete a candidate assessment.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;">
                ${roleName ? `
                <tr>
                  <td style="padding:10px 14px;font-size:12px;color:#78716c;font-weight:500;background:#fafaf9;border-bottom:1px solid #e7e5e4;width:120px;">Role</td>
                  <td style="padding:10px 14px;font-size:13px;color:#1c1917;background:#fafaf9;border-bottom:1px solid #e7e5e4;">${escHtml(roleName)}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:10px 14px;font-size:12px;color:#78716c;font-weight:500;background:#fafaf9;border-bottom:1px solid #e7e5e4;width:120px;">Assessment</td>
                  <td style="padding:10px 14px;font-size:13px;color:#1c1917;background:#fafaf9;border-bottom:1px solid #e7e5e4;">${escHtml(stageLabel)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;font-size:12px;color:#78716c;font-weight:500;background:#fafaf9;width:120px;">Link expires</td>
                  <td style="padding:10px 14px;font-size:13px;color:#1c1917;background:#fafaf9;">${escHtml(expiry)}</td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#0d9488;border-radius:8px;">
                    <a href="${escHtml(inviteUrl)}"
                       style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                      Start assessment -&gt;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px;font-size:12px;color:#a8a29e;">Or copy this link:</p>
              <p style="margin:0 0 24px;font-size:11px;font-family:'Courier New',monospace;color:#57534e;word-break:break-all;background:#fafaf9;border:1px solid #e7e5e4;border-radius:6px;padding:10px 12px;">
                ${escHtml(inviteUrl)}
              </p>
              <p style="margin:0;font-size:12px;color:#a8a29e;line-height:1.6;">
                This link is personal - do not share it. The timer starts when you open it.
                If you did not expect this message, you can safely ignore it.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#fafaf9;border:1px solid #e7e5e4;border-top:none;border-radius:0 0 12px 12px;padding:16px 36px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#a8a29e;">Sent via CAP - sabitkadli.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
