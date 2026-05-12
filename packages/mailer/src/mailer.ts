import { Resend } from 'resend';

let _resend: Resend | null = null;

export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  _resend ??= new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? 'CAP Assessments <noreply@sabitkadli.com>';
