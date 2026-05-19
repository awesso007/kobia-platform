/**
 * Email sending helper backed by Resend.
 *
 * Reads RESEND_API_KEY and EMAIL_FROM from env. If RESEND_API_KEY is not set,
 * we log the message and return a stub success so dev environments don't fail.
 */
import { Resend } from "resend";

let cachedClient: Resend | null = null;
function client(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!cachedClient) cachedClient = new Resend(process.env.RESEND_API_KEY);
  return cachedClient;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** true when no API key configured — message was logged only */
  stubbed?: boolean;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from =
    process.env.EMAIL_FROM ?? "KOBIA Accounting <noreply@kobia.ai>";

  const c = client();
  if (!c) {
    // eslint-disable-next-line no-console
    console.log("[email:stub]", {
      to: input.to,
      subject: input.subject,
      from,
    });
    return { ok: true, stubbed: true };
  }

  try {
    const result = await c.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
