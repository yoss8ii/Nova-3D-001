/**
 * src/core/mail.ts - sends e-mails (customer invoice + new-order notification for the shop owner)
 *
 * Three providers (Gmail first if GMAIL_SCRIPT_URL is set), all a plain HTTPS call that works on Cloudflare Workers (no SMTP):
 *   - Gmail  (Google Apps Script, scripts/gmail-sender.gs): FREE, ~100 e-mails/day, sent from YOUR Gmail account, no domain.
 *                                  Secrets: GMAIL_SCRIPT_URL + GMAIL_SCRIPT_SECRET (+ MAIL_FROM optional, only its name is used)
 *   - Brevo  (https://brevo.com)  FREE: 300 e-mails/day. Works WITHOUT your own domain (you validate one sender address).
 *                                  Secrets: BREVO_API_KEY + MAIL_FROM   -> chosen automatically when BREVO_API_KEY is set
 *   - Resend (https://resend.com)  free plan too, but needs a verified domain you own (workers.dev does not work).
 *                                  Secrets: RESEND_API_KEY + MAIL_FROM
 * MAIL_FROM looks like  "NOVA 3D <contact@yourdomain.com>"  or just  "contact@yourdomain.com".
 * OWNER_EMAIL (optional): the address that receives a short "Nouvelle commande à préparer" e-mail (no invoice, no customer data).
 * If the keys are missing the function throws, the order is still saved (and visible in the admin history, "Non envoyée").
 */
export interface MailConfig { provider: "gmail" | "brevo" | "resend"; apiKey: string; from: string; notify?: string; url?: string }

// "NOVA 3D <a@b.com>" -> { name: "NOVA 3D", email: "a@b.com" }
export function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  return m ? { name: m[1].trim() || "NOVA 3D", email: m[2].trim() } : { name: "NOVA 3D", email: from.trim() }
}

export async function sendInvoiceEmail(cfg: MailConfig | undefined, to: string, subject: string, html: string, pdf?: { filename: string; base64: string }) {
  if (!cfg) throw new Error("E-mail sending is not configured (BREVO_API_KEY or RESEND_API_KEY, and MAIL_FROM)")
  if (cfg.provider === "gmail") {
    // The Apps Script web app answers a redirect (302) that fetch follows; the answer is JSON { ok: true } or { ok: false, error }
    const r = await fetch(cfg.url!, {
      method: "POST", redirect: "follow",
      headers: { "content-type": "text/plain;charset=utf-8" },      // text/plain: no CORS preflight, Apps Script reads the raw body
      signal: AbortSignal.timeout(20000),                           // never hang an order on a slow provider
      body: JSON.stringify({ secret: cfg.apiKey, to, subject, html, fromName: parseFrom(cfg.from).name, ...(pdf ? { attachment: { name: pdf.filename, content: pdf.base64 } } : {}) }),
    })
    const j: any = await r.json().catch(() => null)
    if (!r.ok || !j?.ok) throw new Error("Gmail script answered " + r.status + " " + String(j?.error || "").slice(0, 300))
    return
  }
  if (cfg.provider === "brevo") {
    const sender = parseFrom(cfg.from)
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "content-type": "application/json", accept: "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ sender, replyTo: { email: sender.email, name: sender.name }, to: [{ email: to }], subject, htmlContent: html, ...(pdf ? { attachment: [{ name: pdf.filename, content: pdf.base64 }] } : {}) }),
    })
    if (!r.ok) throw new Error("Brevo answered " + r.status + " " + (await r.text().catch(() => "")).slice(0, 300))
    return
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + cfg.apiKey, "content-type": "application/json" },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ from: cfg.from, to: [to], subject, html, ...(pdf ? { attachments: [{ filename: pdf.filename, content: pdf.base64 }] } : {}) }),
  })
  if (!r.ok) throw new Error("Resend answered " + r.status + " " + (await r.text().catch(() => "")).slice(0, 300))
}
