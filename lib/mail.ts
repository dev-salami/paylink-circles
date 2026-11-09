import { createConsoleMailer, createResendMailer, type Mailer } from "./vendor/paylink-core";
import { nimiqPayOpenUrl } from "./open-link";

let mailer: Mailer | null = null;

function getMailer(): Mailer | null {
  if (mailer) return mailer;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (apiKey && from) {
    mailer = createResendMailer({ apiKey, from });
    return mailer;
  }
  if (process.env.NODE_ENV !== "production") {
    mailer = createConsoleMailer((entry) => console.info(`[mail:console] subject=${entry.subject}`));
    return mailer;
  }
  return null;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export async function sendReminderEmail(input: {
  to: string;
  groupTitle: string;
  memberName: string;
  amountLabel: string;
  dueDate: string;
  payUrl: string;
  overdue: boolean;
}): Promise<boolean> {
  const active = getMailer();
  if (!active) return false;
  const subject = `${input.overdue ? "Overdue" : "Reminder"}: ${input.amountLabel} for ${input.groupTitle}`;
  const openUrl = nimiqPayOpenUrl(input.payUrl);
  const href = openUrl ?? input.payUrl;
  const fallback = openUrl
    ? `Open in Nimiq Pay: ${openUrl}\n\nIf that opens a browser or the store, paste this into Mini Apps → Custom URL:\n${input.payUrl}`
    : `In Nimiq Pay, open Mini Apps → Custom URL and paste:\n${input.payUrl}`;
  const text = `Hi ${input.memberName},\n\nYour share of ${input.amountLabel} for "${input.groupTitle}" ${input.overdue ? "was" : "is"} due on ${input.dueDate}.\n\n${fallback}\n\nPayLink Circles`;
  const html = `<div style="font-family:system-ui,sans-serif;color:#181c25;max-width:480px">
<p style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#6b6f78">PayLink Circles</p>
<p>Hi ${escapeHtml(input.memberName)},</p>
<p style="font-size:32px;margin:8px 0">${escapeHtml(input.amountLabel)}</p>
<p>Your share for <b>${escapeHtml(input.groupTitle)}</b> ${input.overdue ? "was" : "is"} due on ${escapeHtml(input.dueDate)}.</p>
<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#181c25;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none">Open in Nimiq Pay</a></p>
<p style="color:#6b6f78;font-size:13px">If that doesn't open the wallet, paste this into Mini Apps → Custom URL:<br>${escapeHtml(input.payUrl)}</p>
</div>`;
  try {
    await active.send({ to: input.to, subject, text, html });
    return true;
  } catch (error) {
    console.error("reminder email failed", error instanceof Error ? error.message : error);
    return false;
  }
}
