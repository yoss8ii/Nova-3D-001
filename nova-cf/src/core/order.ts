/**
 * src/core/order.ts - POST /api/order
 *
 * Receives { customer: {name,email,phone,address}, items: [{id,q}] } from the cart page.
 *   1. refuse unless online orders are enabled (ORDERS_ENABLED="true") -> 503
 *      (the cart page then offers to send the order by WhatsApp instead)
 *   2. anti-abuse: honeypot field, then a limit per IP and per e-mail address -> 429
 *   3. validate customer + items. Names and prices are re-read from the database:
 *      the prices sent by the browser are never trusted.
 *   4. build the invoice PDF, then repo.placeOrder(): take the stock, save the order AND its PDF in ONE
 *      transaction (409 if not enough stock; a new invoice number is drawn if the number is already taken)
 *   5. e-mail the order confirmation + invoice to the customer (a failure does not cancel the order) and, if OWNER_EMAIL is set,
 *      a short "Nouvelle commande à préparer" notice (no invoice, no PDF) to the shop owner
 * Optional body.promo = promo code (see core/promo.ts): the discount (% of the products subtotal) is computed here, unknown/inactive code = 400 promo_invalid.
 * Response: { ok, invoice: "NOVA-YYYYMMDD-123456", emailSent, date, lines, delivery, total, cur, pdf (base64), promo?, discount? }
 */
import type { Repo, OrderLine } from "../repo/types.ts"
import { json, esc } from "./http.ts"
import { sendInvoiceEmail, type MailConfig } from "./mail.ts"
import { hasPush, pushNewOrder, type PushConfig } from "./notify.ts"
import { cleanFee } from "./catalog.ts"
import { buildInvoicePdf, toBase64, type InvoiceLogo } from "./pdf.ts"
import { clientIp } from "./auth.ts"
import { cleanColor, colorName, colorLabel } from "./colors.ts"
import { dayKey } from "./stats.ts"
import { cleanCode, discountOf } from "./promo.ts"

// Anti-abuse limits (adjust here): orders per IP per 30 minutes, orders per e-mail address per hour
const MAX_PER_IP = 6, IP_WINDOW = 30 * 60
const MAX_PER_EMAIL = 3, EMAIL_WINDOW = 60 * 60
const MAX_QTY_PER_LINE = 50

const money = (n: number) => Math.round(n * 100) / 100

// Short e-mail for the shop owner: only what is needed to prepare the order (no price, no customer data, no PDF)
export function ownerNoticeHtml(no: string, lines: OrderLine[], when: Date, tz: string) {
  const d = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(when)
  const t = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(when)
  const rows = lines.map((l) => `<tr><td style="border:1px solid #ddd">${esc(l.n)}${l.c ? `<br><small style="color:#666">Couleur : ${esc(colorLabel(l.c, l.cn))}</small>` : ""}</td><td align="center" style="border:1px solid #ddd"><b>${l.q}</b></td></tr>`).join("")
  return `<div style="font-family:Arial,sans-serif;max-width:560px;font-size:15px">
<p style="font-size:17px"><b>Vous avez une commande à préparer.</b></p>
<p>Commande n° <b>${esc(no)}</b><br>Passée le <b>${d}</b> à <b>${t}</b></p>
<table width="100%" cellpadding="8" style="border-collapse:collapse"><tr style="background:#f3f4f6"><th align="left" style="border:1px solid #ddd">Produit</th><th style="border:1px solid #ddd">Quantité</th></tr>${rows}</table></div>`
}

// Order confirmation + invoice e-mail as an HTML string (table of lines, total). Also used to re-send the e-mail from the admin page.
export function invoiceHtml(no: string, c: any, lines: OrderLine[], delivery: number, total: number, cur: string, intro = "", logoUrl = "", discount = 0, promo = "") {
  const rows = lines
    .map((l) => `<tr><td>${esc(l.n)}<br><small style="color:#666">${l.c ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(l.c)};border:1px solid #999;vertical-align:middle"></span> Couleur : ${esc(colorLabel(l.c, l.cn))}` : "Pièce identique à la photo"}</small></td><td align="right">${l.q}</td><td align="right">${l.p} ${esc(cur)}</td><td align="right">${money(l.q * l.p)} ${esc(cur)}</td></tr>`)
    .join("")
  return `<div style="font-family:Arial,sans-serif;max-width:600px">
${logoUrl ? `<img src="${esc(logoUrl)}" alt="NOVA 3D" width="150" style="display:block;margin-bottom:10px">` : ""}<h2>NOVA 3D - Facture ${esc(no)}</h2>${intro}
<p>${esc(c.name)}<br>${esc(c.email)} - ${esc(c.phone)}<br>${esc(c.address)}</p>
<table width="100%" cellpadding="6" style="border-collapse:collapse" border="1">
<tr><th align="left">Produit</th><th>Qté</th><th>Prix</th><th>Total</th></tr>${rows}</table>
${discount > 0 ? `<p align="right">Code promo ${esc(promo)} : - ${discount} ${esc(cur)}</p>` : ""}<p align="right">Livraison : ${delivery > 0 ? delivery + " " + esc(cur) : "Gratuite"}</p>
<h3 align="right">Total : ${total} ${esc(cur)}</h3><p>Merci pour votre commande !</p></div>`
}

// Short confirmation text placed above the invoice in the customer's e-mail
export const confirmationIntro = (name: string) =>
  `<p>Bonjour ${esc(name)},</p><p><b>Votre commande est bien confirmée.</b> Nous la préparons et nous vous contacterons pour la livraison. Votre facture est jointe à cet e-mail (PDF) et rappelée ci-dessous.</p>`

export interface OrderDeps {
  ordersEnabled: boolean
  mail?: MailConfig
  push?: PushConfig                                  // instant phone notification (ntfy / Telegram), see core/notify.ts
  siteCurrency: (req: Request) => Promise<string>
  invoiceLogo?: (req: Request) => Promise<InvoiceLogo | undefined>
  siteContacts?: (req: Request) => Promise<{ phone?: string; facebook?: string; instagram?: string }>
  defer?: (p: Promise<unknown>) => void
  timezone?: string                                  // shop time zone: the invoice date and number use the LOCAL day, not the UTC day
}

// Invoice number: NOVA-<local day>-<6 random digits>  (day = "YYYY-MM-DD" in the shop time zone)
const newNumber = (day: string) => {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000
  return "NOVA-" + day.replace(/-/g, "") + "-" + n
}

export async function handleOrder(req: Request, repo: Repo, deps: OrderDeps) {
  if (req.method !== "POST") return json({ message: "Méthode non autorisée" }, 405)
  if (!deps.ordersEnabled) return json({ error: "orders_disabled", message: "Les commandes en ligne ne sont pas encore ouvertes." }, 503)

  const body: any = await req.json().catch(() => null)
  // Honeypot: the cart page never fills this hidden field, bots do
  if (body?.website) return json({ message: "Merci de vérifier vos informations." }, 400)
  const raw = body?.customer || {}
  // Clean the customer data (trim + max lengths)
  const customer = {
    name: String(raw.name || "").trim().slice(0, 80),
    email: String(raw.email || "").trim().slice(0, 120),
    phone: String(raw.phone || "").trim().slice(0, 25),
    address: String(raw.address || "").trim().slice(0, 250),
  }
  // Basic validation: name, e-mail format, phone (6+ digits), address
  if (customer.name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || customer.phone.replace(/\D/g, "").length < 6 || customer.address.length < 5)
    return json({ message: "Merci de vérifier vos informations." }, 400)
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) return json({ message: "Panier vide." }, 400)

  // Anti-abuse: too many orders from the same IP or for the same e-mail address.
  // Only SUCCESSFUL orders count (see below): a customer retrying after "stock insuffisant" is never blocked.
  const tooMany = json({ message: "Trop de commandes en peu de temps. Réessayez dans quelques minutes." }, 429)
  const ipKey = "order-ip:" + clientIp(req), mailKey = "order-mail:" + customer.email.toLowerCase()
  if ((await repo.peekHits(ipKey, IP_WINDOW)).n >= MAX_PER_IP) return tooMany
  if ((await repo.peekHits(mailKey, EMAIL_WINDOW)).n >= MAX_PER_EMAIL) return tooMany

  // Trusted names / prices / stock come from the database
  const catalog = await repo.readCatalog()
  const lines: OrderLine[] = []
  for (const it of body.items) {
    const p = catalog.products.find((x) => x.id === it.id)
    const q = Math.floor(Number(it.q))
    if (!p || !(q >= 1) || q > MAX_QTY_PER_LINE) return json({ message: "Produit introuvable." }, 400)
    const c = cleanColor(it.color)         // optional: colour chosen by the customer; anything invalid = identical to the photo
    // The same product sent twice (same colour) is merged into one line; the stock check covers ALL lines of the product
    const same = lines.find((l) => l.id === p.id && l.c === (c || undefined))
    const asked = lines.filter((l) => l.id === p.id).reduce((s, l) => s + l.q, 0) + q
    if (asked > p.q) return json({ message: `Stock insuffisant pour « ${p.n} » (${p.q} disponible).` }, 409)
    if (same) { if (same.q + q > MAX_QTY_PER_LINE) return json({ message: "Quantité trop élevée." }, 400); same.q += q; continue }
    lines.push({ id: p.id, n: p.n, p: p.p, q, ...(c ? { c, cn: colorName(c) } : {}) })
  }
  // Delivery fee: set by the admin (settings key "delivery"), added once to every order
  const delivery = cleanFee(await repo.getSetting("delivery"))
  const subtotal = money(lines.reduce((s, l) => s + l.p * l.q, 0))
  // Promo code (optional): re-checked here, the percentage is taken from the database and applies to the products only
  let promo = "", discount = 0
  if (body.promo) {
    const pc = await repo.getPromo(cleanCode(body.promo))
    if (!pc || !pc.active) return json({ error: "promo_invalid", message: "Ce code promo n'est plus valide." }, 400)
    promo = pc.code; discount = discountOf(subtotal, pc.percent)
  }
  const total = money(subtotal - discount + delivery)
  const cur = await deps.siteCurrency(req)
  // Logo + shop contacts for the PDF (a missing logo never blocks an order: the PDF then shows the "NOVA 3D" text)
  const logo = await deps.invoiceLogo?.(req).catch((e) => { console.error("Invoice logo could not be loaded", e); return undefined })
  const contacts = await deps.siteContacts?.(req).catch(() => undefined)
  const today = dayKey(new Date(), deps.timezone || "Africa/Tunis")      // local shop day (YYYY-MM-DD)
  const date = today.split("-").reverse().join("/")

  // Atomic: stock taken + order and its invoice PDF saved, or nothing. A taken invoice number is simply redrawn.
  let no = "", pdfBytes: Uint8Array = new Uint8Array(0), res: Awaited<ReturnType<Repo["placeOrder"]>> = { ok: false, dup: true }
  for (let i = 0; i < 5 && !res.ok && res.dup; i++) {
    no = newNumber(today)
    pdfBytes = buildInvoicePdf({ no, date, cur, customer, lines, delivery, total, discount, promo, logo, contacts })
    res = await repo.placeOrder({ no, customer, lines, delivery, total, cur, pdf: pdfBytes, ...(promo ? { promo, discount } : {}) })
  }
  if (!res.ok) return res.dup ? json({ message: "Erreur temporaire, réessayez." }, 503) : json({ message: `Stock insuffisant pour « ${res.name} ».` }, 409)

  // The order is saved: now it counts against the anti-abuse limits
  await repo.hit(ipKey, IP_WINDOW); await repo.hit(mailKey, EMAIL_WINDOW)

  // Invoice PDF: attached to the e-mail AND returned (base64) so the cart page can preview / download it
  const pdf = toBase64(pdfBytes)
  const logoUrl = new URL("/images/NOVA_3D_logo_invoice.png", req.url).href
  const attach = { filename: `facture-${no}.pdf`, base64: pdf }
  let emailSent = false
  try {
    await sendInvoiceEmail(deps.mail, customer.email, `Confirmation de commande NOVA 3D ${no} - votre facture`, invoiceHtml(no, customer, lines, delivery, total, cur, confirmationIntro(customer.name), logoUrl, discount, promo), attach)
    emailSent = true
    await repo.setOrderEmailSent(no, true)
  } catch (e) {
    console.error("Invoice email failed", e)
  }
  // Instant push notification (phone), independent of the e-mail setup; best effort, never blocks the order
  if (hasPush(deps.push)) {
    const push = pushNewOrder(deps.push, { no, total, cur, name: customer.name, lines }).catch((e) => console.error("Push failed", e))
    if (deps.defer) deps.defer(push); else await push
  }
  // Notice to the shop owner (best effort, in the background when the platform allows it)
  if (deps.mail?.notify) {
    // Short notice only: product(s), quantity, order number, date and time. No invoice, no PDF, no customer data
    const owner = sendInvoiceEmail(deps.mail, deps.mail.notify, "Nouvelle commande à préparer",
      ownerNoticeHtml(no, lines, new Date(), deps.timezone || "Africa/Tunis")).catch((e) => console.error("Owner notice failed", e))
    if (deps.defer) deps.defer(owner); else await owner
  }
  return json({ ok: true, invoice: no, emailSent, date, lines, delivery, total, cur, pdf, ...(promo ? { promo, discount } : {}) })
}
