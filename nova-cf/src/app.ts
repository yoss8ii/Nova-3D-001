/**
 * src/app.ts - THE API (platform independent)
 *
 * createApp(deps) returns a function  (Request) => Promise<Response>  that serves every /api/ route.
 * It uses only web standards (Request, Response, fetch, crypto), so the same code runs on
 * Cloudflare Workers, Node, Deno, Bun, Vercel... Everything platform-specific is injected through
 * `deps` by a small adapter (today: src/worker.ts for Cloudflare).
 *
 *   GET  /api/catalog      public   catalogue JSON (cached 10 s; ?fresh=1 = never cached, used by the admin page)
 *   POST /api/catalog      admin    {} = login check | {newPassword} = change the password
 *   PUT  /api/catalog      admin    save the whole catalogue (+ "delivery" fee)
 *   GET  /api/photos/:id   public   a product photo
 *   POST /api/photos       admin    upload a photo (jpeg/png/webp, max 3 MB) -> { url }
 *   POST /api/order        public   place an order (503 until ORDERS_ENABLED=true)
 *   GET  /api/reviews      public   { reviews: [{ id, url }] }  review screenshots, in display order
 *   GET  /api/reviews/:id  public   one review screenshot
 *   POST /api/reviews      admin    upload a screenshot (jpeg/png/webp, max 3 MB) -> { id, url }
 *   DELETE /api/reviews/:id admin   delete a screenshot
 *   GET  /api/feedback     public   { count, avg, items: [{ id, name, stars, comment, at }] }  service ratings, newest first
 *   POST /api/feedback     public   { name?, stars: 1-5, comment? } leave a rating (anonymous when no name; 3 per hour per IP)
 *   DELETE /api/feedback/:id admin  delete a rating
 *   POST /api/custom       public   { name?, phone?, description, color?, budget? } saves a "sur mesure" request (5 per hour per IP)
 *   GET  /api/custom       admin    the saved "sur mesure" requests, newest first
 *   PATCH /api/custom/:id  admin    { status: "new" | "quoted" | "done" }
 *   DELETE /api/custom/:id admin    delete a request
 *   POST /api/promo        public   { code } checks a promo code typed in the cart -> { ok, code, percent } (20 tries per 10 min per IP)
 *   GET/POST /api/promos, PATCH/DELETE /api/promos/:code   admin   promo codes: { code, percent } creates or changes one, { active } switches it
 *   POST /api/track        public   { no, phone } order tracking by invoice number + phone -> status and lines (nothing personal)
 *   GET  /api/achievements public   success panel: { on, title, sub, cards, stats: [{k, l, n}] }; each n is a BRACKET (99, 250...), never an exact count
 *   PUT  /api/achievements admin    { on, title, sub, cards: [{t, d}] } texts of the success panel
 *   GET  /api/orders?limit=&offset=   admin   order history { orders, total }
 *   GET  /api/orders/:no/pdf          admin   the saved invoice PDF of an order
 *   PATCH /api/orders/:no             admin   { status: "new" | "done" }
 *   POST /api/orders/:no/email        admin   send the confirmation + invoice e-mail again (e.g. it failed the first time)
 *   GET  /api/orders/pdfs             admin   { count, bytes } of the saved invoice PDFs
 *   DELETE /api/orders/pdfs?days=N    admin   delete the saved PDFs of orders older than N days (0 = all); the orders are kept
 *   GET  /api/orders/export.pdf?from=&to=   admin   one PDF listing every order (optional YYYY-MM-DD period)
 *   GET  /api/dashboard    admin    dashboard numbers (per day / month, products, customers, stock)
 * Admin = the request carries the right "x-admin-password" header (see core/auth.ts).
 * While the factory password "admin" is still in use, every admin route answers 403 "change_password"
 * except POST /api/catalog {newPassword} (the admin page forces the change at first login).
 */
import type { Repo } from "./repo/types.ts"
import { json } from "./core/http.ts"
import { checkAdmin, setPassword, MIN_PASSWORD } from "./core/auth.ts"
import { buildDashboard, dayKey } from "./core/stats.ts"
import { buildOrdersReportPdf } from "./core/report-pdf.ts"
import { buildInvoicePdf, toBase64, type InvoiceLogo } from "./core/pdf.ts"
import { clean, cleanFee, toPublic } from "./core/catalog.ts"
import { handleOrder, invoiceHtml, confirmationIntro } from "./core/order.ts"
import { sendInvoiceEmail } from "./core/mail.ts"
import { cleanAch, readAch, publicStats, type Totals } from "./core/achievements.ts"
import { handleFeedback } from "./core/feedback.ts"
import { handleCustom, CUSTOM_STATUSES } from "./core/custom.ts"
import { handleTrack } from "./core/track.ts"
import { handlePromoCheck, handlePromoAdmin } from "./core/promo.ts"
import type { MailConfig } from "./core/mail.ts"
import type { PushConfig } from "./core/notify.ts"

export interface AppDeps {
  repo: () => Repo                                   // creates the database access for ONE request
  adminPassword?: string                             // optional ADMIN_PASSWORD secret (overrides the saved one)
  ordersEnabled: boolean                             // ORDERS_ENABLED === "true"
  mail?: MailConfig                                  // Gmail script, Brevo or Resend (see core/mail.ts)
  push?: PushConfig                                  // ntfy / Telegram notification for each new order (see core/notify.ts)
  siteCurrency: (req: Request) => Promise<string>    // currency from public/data/site.json
  timezone?: string                                  // shop time zone for the dashboard days (default Africa/Tunis)
  defer?: (p: Promise<unknown>) => void              // ctx.waitUntil on Workers (optional)
  invoiceLogo?: (req: Request) => Promise<InvoiceLogo | undefined> // decoded NOVA logo (small PNG, cached)
  siteContacts?: (req: Request) => Promise<{ phone?: string; facebook?: string; instagram?: string }> // from public/data/site.json
}

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"]
const UUID_ANY = /^[0-9a-f-]{36}$/

export function createApp(deps: AppDeps) {
  return async function handle(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/\/+$/, "")
    // The database connection is only opened when a route really needs it
    let repo: Repo | null = null
    const db = () => (repo ||= deps.repo())
    try {
      if (path === "/api/catalog") return await catalogRoute(req, db(), deps)
      if (path === "/api/photos" || path.startsWith("/api/photos/")) return await photosRoute(req, path, db(), deps)
      if (path === "/api/reviews" || path.startsWith("/api/reviews/")) return await reviewsRoute(req, path, db(), deps)
      if (path === "/api/feedback" || path.startsWith("/api/feedback/")) return await feedbackRoute(req, path, db(), deps)
      if (path === "/api/custom" || path.startsWith("/api/custom/")) return await customRoute(req, path, db(), deps)
      if (path === "/api/promo") return await handlePromoCheck(req, db())
      if (path === "/api/promos" || path.startsWith("/api/promos/")) return await promosRoute(req, path, db(), deps)
      if (path === "/api/track") return await handleTrack(req, db())
      if (path === "/api/order") return await handleOrder(req, db(), deps)
      if (path === "/api/orders" || path.startsWith("/api/orders/")) return await ordersRoute(req, path, db(), deps)
      if (path === "/api/dashboard") return await dashboardRoute(req, db(), deps)
      if (path === "/api/achievements") return await achievementsRoute(req, db(), deps)
      return json({ error: "Not found" }, 404)
    } catch (e) {
      console.error("API error", path, e)
      return json({ error: "server_error" }, 500)
    } finally {
      // Always release the connection (in the background when the platform allows it)
      if (repo) {
        const closing = (repo as Repo).close().catch(() => {})
        if (deps.defer) deps.defer(closing); else await closing
      }
    }
  }
}

// Admin check shared by every admin route. Returns null when the request may continue, else the error response.
// allowDefault = true only for the password-change route (the factory password may be used just to replace itself).
async function guard(req: Request, repo: Repo, deps: AppDeps, allowDefault = false): Promise<{ res: Response | null; isDefault: boolean }> {
  const a = await checkAdmin(req, deps.adminPassword, repo)
  if (a.locked) return { res: json({ error: "Too many attempts" }, 429, { "retry-after": String(a.locked) }), isDefault: false }
  if (!a.ok) return { res: json({ error: "Unauthorized" }, 401), isDefault: false }
  if (a.isDefault && !allowDefault) return { res: json({ error: "change_password" }, 403), isDefault: true }
  return { res: null, isDefault: a.isDefault }
}

async function catalogRoute(req: Request, repo: Repo, deps: AppDeps) {
  if (req.method === "GET") {
    try {
      // "delivery" = delivery fee set in the admin page (settings table, key "delivery")
      const delivery = cleanFee(await repo.getSetting("delivery"))
      // Short cache (browsers + CDN): fewer Worker/database hits. Orders re-read prices and stock from the database anyway.
      // The admin page asks with ?fresh=1 to always see the live stock.
      const fresh = new URL(req.url).searchParams.has("fresh")
      return json({ ...toPublic(await repo.readCatalog()), delivery }, 200, fresh ? {} : { "cache-control": "public, max-age=10, s-maxage=10" })
    } catch (e) {
      console.error("Catalog read failed", e)
      return json({ error: "database_unavailable" }, 500)
    }
  }
  // Everything below needs the admin password (POST also works with the factory password, to replace it)
  const g = await guard(req, repo, deps, req.method === "POST")
  if (g.res) return g.res
  const body: any = await req.json().catch(() => ({}))
  if (req.method === "POST") {
    // Login check, or password change when body.newPassword is set
    if (body.newPassword !== undefined) {
      // If the ADMIN_PASSWORD secret exists it overrides everything: refuse to change it here
      if (deps.adminPassword) return json({ error: "Password is managed by the ADMIN_PASSWORD secret" }, 400)
      if (String(body.newPassword).length < MIN_PASSWORD) return json({ error: "Password too short" }, 400)
      if (String(body.newPassword) === "admin") return json({ error: "Password too weak" }, 400)
      await setPassword(repo, String(body.newPassword))
      return json({ ok: true, mustChange: false })
    }
    // Login check: mustChange tells the admin page to force the first password change
    return json({ ok: true, mustChange: g.isDefault })
  }
  if (req.method === "PUT") {
    const data = clean(body)
    if (!data) return json({ error: "Invalid catalog" }, 400)
    await repo.saveCatalog(data)
    if (body.delivery !== undefined) await repo.setSetting("delivery", String(cleanFee(body.delivery)))
    return json({ ok: true })
  }
  return json({ error: "Method not allowed" }, 405)
}

async function photosRoute(req: Request, path: string, repo: Repo, deps: AppDeps) {
  if (req.method === "GET") {
    const id = path.split("/")[3]
    if (!id || !UUID_ANY.test(id)) return new Response("Not found", { status: 404 })
    const photo = await repo.getPhoto(id)
    if (!photo) return new Response("Not found", { status: 404 })
    return new Response(photo.data as BodyInit, {
      headers: {
        "content-type": photo.type,
        // A photo never changes (a new upload gets a new id): browsers/CDN can keep it "forever"
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    })
  }
  if (req.method === "POST") {
    if (path.split("/")[3]) return new Response("Not found", { status: 404 })      // upload only on /api/photos (no id)
    const g = await guard(req, repo, deps); if (g.res) return g.res
    // The Content-Type header tells the image format
    const type = (req.headers.get("content-type") || "").split(";")[0]
    if (!PHOTO_TYPES.includes(type)) return json({ error: "Unsupported image type" }, 415)
    const buf = new Uint8Array(await req.arrayBuffer())
    if (buf.length > 3_000_000) return json({ error: "Image too large" }, 413)
    // Stored unattached; linked to a product when the catalogue is saved
    return json({ url: "/api/photos/" + (await repo.addPhoto(type, buf)) })
  }
  return json({ error: "Method not allowed" }, 405)
}

// Review screenshots shown as animated cards on the home page.
const MAX_REVIEWS = 30
async function reviewsRoute(req: Request, path: string, repo: Repo, deps: AppDeps) {
  const id = path.split("/")[3]
  if (req.method === "GET" && !id) {
    const ids = await repo.listReviews()
    // Short cache: the list is requested by every home page visit
    return json({ reviews: ids.map((i) => ({ id: i, url: "/api/reviews/" + i })) }, 200, { "cache-control": "public, max-age=30" })
  }
  if (req.method === "GET") {
    if (!UUID_ANY.test(id)) return new Response("Not found", { status: 404 })
    const img = await repo.getReview(id)
    if (!img) return new Response("Not found", { status: 404 })
    return new Response(img.data as BodyInit, {
      headers: { "content-type": img.type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
    })
  }
  const g = await guard(req, repo, deps); if (g.res) return g.res
  if (req.method === "POST" && !id) {
    const type = (req.headers.get("content-type") || "").split(";")[0]
    if (!PHOTO_TYPES.includes(type)) return json({ error: "Unsupported image type" }, 415)
    const buf = new Uint8Array(await req.arrayBuffer())
    if (buf.length > 3_000_000) return json({ error: "Image too large" }, 413)
    if ((await repo.listReviews()).length >= MAX_REVIEWS) return json({ error: "Too many reviews" }, 409)
    const rid = await repo.addReview(type, buf)
    return json({ id: rid, url: "/api/reviews/" + rid })
  }
  if (req.method === "DELETE" && id && UUID_ANY.test(id)) {
    await repo.deleteReview(id)
    return json({ ok: true })
  }
  return json({ error: "Method not allowed" }, 405)
}

// Success panel of the home page. GET: the owner's texts + the three real figures as brackets ("99+"), never exact numbers.
// PUT (admin): saves the texts in the settings table.
async function achievementsRoute(req: Request, repo: Repo, deps: AppDeps) {
  if (req.method === "GET") {
    let totals: Totals = { orders: 0, customers: 0, revenue: 0 }
    try { totals = await repo.orderTotals() } catch (e) { console.error("Totals failed", e) }
    const cfg = readAch(await repo.getSetting("achievements").catch(() => null))
    const fresh = new URL(req.url).searchParams.has("fresh")      // the admin page asks with ?fresh=1
    return json({ ...cfg, stats: publicStats(totals) }, 200, fresh ? {} : { "cache-control": "public, max-age=60" })
  }
  if (req.method === "PUT") {
    const g = await guard(req, repo, deps); if (g.res) return g.res
    const raw = await req.text()
    let body: unknown = null; try { body = raw.length < 20_000 ? JSON.parse(raw) : null } catch { /* invalid JSON */ }
    const cfg = cleanAch(body)
    if (!cfg) return json({ error: "Invalid data" }, 400)
    await repo.setSetting("achievements", JSON.stringify(cfg))
    return json(cfg)
  }
  return json({ error: "Method not allowed" }, 405)
}

// Service ratings: public read + write (rate-limited, see core/feedback.ts); only the admin can delete
async function feedbackRoute(req: Request, path: string, repo: Repo, deps: AppDeps) {
  const id = path.split("/")[3]
  if (req.method === "DELETE" && id) {
    const g = await guard(req, repo, deps); if (g.res) return g.res
    if (!UUID_ANY.test(id)) return json({ error: "Not found" }, 404)
    return (await repo.deleteFeedback(id)) ? json({ ok: true }) : json({ error: "Not found" }, 404)
  }
  if (id) return json({ error: "Method not allowed" }, 405)
  return handleFeedback(req, repo)
}

// ---- "Sur mesure" requests: the public POST saves one, the other methods are admin-only -----------------------
async function customRoute(req: Request, path: string, repo: Repo, deps: AppDeps) {
  const id = path.split("/")[3]
  if (req.method === "POST" && !id) return handleCustom(req, repo)
  const g = await guard(req, repo, deps); if (g.res) return g.res
  if (!id) return req.method === "GET" ? json({ requests: await repo.listCustom(200) }) : json({ error: "Method not allowed" }, 405)
  if (!UUID_ANY.test(id)) return json({ error: "Not found" }, 404)
  if (req.method === "DELETE") return (await repo.deleteCustom(id)) ? json({ ok: true }) : json({ error: "Not found" }, 404)
  if (req.method === "PATCH") {
    const status = ((await req.json().catch(() => null)) as any)?.status
    if (!CUSTOM_STATUSES.includes(status)) return json({ error: "Invalid status" }, 400)
    return (await repo.setCustomStatus(id, status)) ? json({ ok: true }) : json({ error: "Not found" }, 404)
  }
  return json({ error: "Method not allowed" }, 405)
}

// ---- Promo codes (admin) ------------------------------------------------------------------------------------
async function promosRoute(req: Request, path: string, repo: Repo, deps: AppDeps) {
  const g = await guard(req, repo, deps); if (g.res) return g.res
  return handlePromoAdmin(req, path, repo)
}

// ---- Orders history (admin) --------------------------------------------------------------------------------
const REPORT_CAP = 5000      // most recent orders included in the PDF export
const ORDER_NO = /^NOVA-\d{8}-\d{4,8}$/
async function ordersRoute(req: Request, path: string, repo: Repo, deps: AppDeps) {
  const g = await guard(req, repo, deps); if (g.res) return g.res
  const [, , , no, sub] = path.split("/")             // /api/orders/<no>/<sub>
  if (!no) {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405)
    const u = new URL(req.url)
    const limit = Math.min(100, Math.max(1, Math.floor(Number(u.searchParams.get("limit"))) || 50))
    const offset = Math.max(0, Math.floor(Number(u.searchParams.get("offset"))) || 0)
    return json({ ...(await repo.listOrders(limit, offset)), tz: deps.timezone || "Africa/Tunis" })
  }
  // Saved PDFs: stats + cleanup (the orders stay; a deleted invoice is rebuilt on demand)
  if (no === "pdfs") {
    if (req.method === "GET") return json(await repo.pdfStats())
    if (req.method === "DELETE") {
      const days = Math.floor(Number(new URL(req.url).searchParams.get("days")))
      if (!(days >= 0 && days <= 3650)) return json({ error: "Invalid days" }, 400)
      return json({ ok: true, removed: await repo.clearInvoicePdfs(days) })
    }
    return json({ error: "Method not allowed" }, 405)
  }
  // One PDF with all the orders (optionally between two days, shop time zone)
  if (no === "export.pdf") {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405)
    const q = new URL(req.url).searchParams, day = /^\d{4}-\d{2}-\d{2}$/
    const from = day.test(q.get("from") || "") ? q.get("from")! : "", to = day.test(q.get("to") || "") ? q.get("to")! : ""
    const tz = deps.timezone || "Africa/Tunis"
    const all = await repo.listAllOrders(REPORT_CAP)
    const orders = all.filter((o) => { const d = dayKey(new Date(o.at), tz); return (!from || d >= from) && (!to || d <= to) })
    const fr = (d: string) => d.split("-").reverse().join("/")
    const logo = await deps.invoiceLogo?.(req).catch(() => undefined)
    const bytes = buildOrdersReportPdf(orders, {
      period: from || to ? `Du ${from ? fr(from) : "début"} au ${to ? fr(to) : "jour"}` : "Toutes les commandes",
      cur: await deps.siteCurrency(req), tz, logo, truncated: all.length >= REPORT_CAP,
      generated: new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
    })
    return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="commandes-${dayKey(new Date(), tz)}.pdf"`, "cache-control": "no-store" } })
  }
  if (!ORDER_NO.test(no)) return json({ error: "Not found" }, 404)
  if (req.method === "GET" && sub === "pdf") {
    const o = await repo.getOrder(no)
    if (!o) return json({ error: "Not found" }, 404)
    // Saved invoice; orders made before invoices were saved get an identical PDF rebuilt from their data
    let logo: InvoiceLogo | undefined
    if (!o.pdf && deps.invoiceLogo) {
      try {
        logo = await deps.invoiceLogo(req)
      } catch (e) {
        // Keep invoice downloads working if the logo asset is temporarily unavailable.
        console.error("Invoice logo could not be loaded", e)
      }
    }
    const bytes = o.pdf || buildInvoicePdf({
      no: o.no,
      date: o.at.slice(0, 10).split("-").reverse().join("/"),
      cur: o.cur,
      customer: o.customer,
      lines: o.lines,
      delivery: o.delivery,
      total: o.total,
      discount: o.discount, promo: o.promo,
      logo,
      contacts: await deps.siteContacts?.(req).catch(() => undefined),
    })
    return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="facture-${no}.pdf"`, "cache-control": "no-store" } })
  }
  // Send the confirmation + invoice e-mail (again) to the customer: used when the first attempt failed
  if (req.method === "POST" && sub === "email") {
    if (!deps.mail) return json({ error: "mail_not_configured", message: "L'envoi d'e-mails n'est pas configuré (voir DEPLOY.md)." }, 503)
    const o = await repo.getOrder(no)
    if (!o) return json({ error: "Not found" }, 404)
    let pdf = o.pdf
    if (!pdf) {
      let logo: InvoiceLogo | undefined
      try { logo = await deps.invoiceLogo?.(req) } catch (e) { console.error("Invoice logo could not be loaded", e) }
      pdf = buildInvoicePdf({ no: o.no, date: o.at.slice(0, 10).split("-").reverse().join("/"), cur: o.cur, customer: o.customer, lines: o.lines, delivery: o.delivery, total: o.total, discount: o.discount, promo: o.promo, logo, contacts: await deps.siteContacts?.(req).catch(() => undefined) })
    }
    const logoUrl = new URL("/images/NOVA_3D_logo_invoice.png", req.url).href
    try {
      await sendInvoiceEmail(deps.mail, o.customer.email, `Confirmation de commande NOVA 3D ${o.no} - votre facture`,
        invoiceHtml(o.no, o.customer, o.lines, o.delivery, o.total, o.cur, confirmationIntro(o.customer.name), logoUrl, o.discount, o.promo),
        { filename: `facture-${o.no}.pdf`, base64: toBase64(pdf) })
    } catch (e) {
      console.error("Invoice email failed", e)
      return json({ error: "mail_failed", message: "Le fournisseur d'e-mails a refusé l'envoi (voir les logs du Worker)." }, 502)
    }
    await repo.setOrderEmailSent(o.no, true)
    return json({ ok: true })
  }
  if (req.method === "PATCH" && !sub) {
    const b: any = await req.json().catch(() => ({}))
    if (b.status !== "new" && b.status !== "done") return json({ error: "Invalid status" }, 400)
    return (await repo.setOrderStatus(no, b.status)) ? json({ ok: true }) : json({ error: "Not found" }, 404)
  }
  return json({ error: "Method not allowed" }, 405)
}

// ---- Dashboard (admin) -------------------------------------------------------------------------------------
const DASH_CAP = 20000
async function dashboardRoute(req: Request, repo: Repo, deps: AppDeps) {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405)
  const g = await guard(req, repo, deps); if (g.res) return g.res
  const [orders, catalog, cur] = [await repo.listAllOrders(DASH_CAP), await repo.readCatalog(), await deps.siteCurrency(req)]
  return json(buildDashboard(orders, catalog, new Date(), deps.timezone || "Africa/Tunis", cur, orders.length >= DASH_CAP))
}
