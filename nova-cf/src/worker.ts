/**
 * src/worker.ts - CLOUDFLARE ADAPTER (the only Cloudflare-specific code)
 *
 * Cloudflare calls fetch() for every request. /api/* goes to the platform-independent API in
 * src/app.ts; everything else is served from the static files in public/ (the ASSETS binding).
 *
 * To run on another platform, write a similar small file (Node http server, Vercel handler...)
 * that builds the same `deps`. To use another database, replace postgresRepo() below.
 *
 * Bindings / secrets (see wrangler.jsonc and DEPLOY.md):
 *   HYPERDRIVE      Hyperdrive config pointing at your Postgres (required)
 *   ADMIN_PASSWORD  optional secret; if set, it is THE admin password
 *   ORDERS_ENABLED  "true" to accept online orders (default "false")
 *   GMAIL_SCRIPT_URL + GMAIL_SCRIPT_SECRET (free, sent from your Gmail), or BREVO_API_KEY (free, no domain needed) or RESEND_API_KEY (needs your own domain), + MAIL_FROM   optional secrets for the order e-mail
 *   OWNER_EMAIL     optional: receives a short "Nouvelle commande à préparer" e-mail for every order
 *   NTFY_TOPIC / NTFY_SERVER, TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   optional: instant phone notification for every order (see core/notify.ts)
 *   NOVA_KV         optional Cloudflare KV namespace: holds the "Bientôt disponible" page (texts + ON/OFF). Without it the feature is off and the site is always open.
 *   TIMEZONE        optional, default "Africa/Tunis": the shop time zone used by the dashboard (days / months)
 */
import { createApp } from "./app.ts"
import { postgresRepo } from "./repo/postgres.ts"
import { readSoon, SOON_KEY } from "./core/coming-soon.ts"
import { decodePngLogo, type InvoiceLogo } from "./core/pdf.ts"

interface Env {
  ASSETS: { fetch(req: Request | string | URL): Promise<Response> }
  HYPERDRIVE: { connectionString: string }
  NOVA_KV?: { get(key: string, opts?: { cacheTtl?: number }): Promise<string | null>; put(key: string, value: string): Promise<void> }
  ADMIN_PASSWORD?: string
  ORDERS_ENABLED?: string
  RESEND_API_KEY?: string
  BREVO_API_KEY?: string
  GMAIL_SCRIPT_URL?: string
  GMAIL_SCRIPT_SECRET?: string
  MAIL_FROM?: string
  OWNER_EMAIL?: string
  NTFY_TOPIC?: string
  NTFY_SERVER?: string
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  TIMEZONE?: string
}

let logoCache: Promise<InvoiceLogo> | undefined
async function loadLogo(env: Env, r: Request) {
  const response = await env.ASSETS.fetch(new URL("/images/NOVA_3D_logo_invoice.png", r.url))
  if (!response.ok) throw new Error("Logo asset not found")
  return decodePngLogo(new Uint8Array(await response.arrayBuffer()))
}

// "Bientôt disponible" gate. The public pages (home, shop, cart...) answer with /bientot/ while the page is ON in the admin.
// Not gated: /api/*, the admin page, scripts, styles, images, robots.txt, sitemap.xml and the Google verification file.
// 503 + Retry-After = what Google recommends for a site that is temporarily closed (nothing is removed from the search results).
// Fail-safe: no KV binding, or KV unreadable -> the site simply stays open.
const GATED_PAGES = ["/", "/produits", "/produit", "/panier", "/a-propos", "/suivi", "/sur-mesure"]
async function comingSoonGate(req: Request, env: Env): Promise<Response | null> {
  if (!env.NOVA_KV || (req.method !== "GET" && req.method !== "HEAD")) return null
  const url = new URL(req.url)
  const page = url.pathname.replace(/\/index\.html$/, "/").replace(/(.)\/+$/, "$1")
  if (!GATED_PAGES.includes(page)) return null
  let raw: string | null
  try { raw = await env.NOVA_KV.get(SOON_KEY, { cacheTtl: 30 }) } catch { return null }   // cacheTtl 30 s = the minimum KV allows: a change is live within about a minute
  if (!readSoon(raw).on) return null
  const res = await env.ASSETS.fetch(new URL("/bientot/", url))
  if (!res.ok) return null
  const headers = new Headers(res.headers)
  headers.set("retry-after", "3600"); headers.set("cache-control", "no-store"); headers.set("x-robots-tag", "noindex")
  return new Response(req.method === "HEAD" ? null : res.body, { status: 503, headers })
}

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    // Not an API call: the "coming soon" page when it is ON, else the website (static files of public/)
    if (!new URL(req.url).pathname.startsWith("/api/")) return (await comingSoonGate(req, env)) ?? env.ASSETS.fetch(req)

    const app = createApp({
      repo: () => postgresRepo(env.HYPERDRIVE.connectionString),
      adminPassword: env.ADMIN_PASSWORD || undefined,
      ordersEnabled: env.ORDERS_ENABLED === "true",
      // Gmail script first, then Brevo, then Resend
      mail: env.GMAIL_SCRIPT_URL && env.GMAIL_SCRIPT_SECRET
        ? { provider: "gmail", url: env.GMAIL_SCRIPT_URL, apiKey: env.GMAIL_SCRIPT_SECRET, from: env.MAIL_FROM || "NOVA 3D", notify: env.OWNER_EMAIL || undefined }
        : env.MAIL_FROM && (env.BREVO_API_KEY || env.RESEND_API_KEY)
          ? { provider: env.BREVO_API_KEY ? "brevo" : "resend", apiKey: (env.BREVO_API_KEY || env.RESEND_API_KEY)!, from: env.MAIL_FROM, notify: env.OWNER_EMAIL || undefined }
          : undefined,
      push: { ntfyTopic: env.NTFY_TOPIC, ntfyServer: env.NTFY_SERVER, telegramToken: env.TELEGRAM_BOT_TOKEN, telegramChat: env.TELEGRAM_CHAT_ID },
      timezone: env.TIMEZONE || "Africa/Tunis",
      // Currency comes from the same file the website uses
      siteCurrency: async (r) => {
        try { return (await (await env.ASSETS.fetch(new URL("/data/site.json", r.url))).json() as any).currency || "TND" }
        catch { return "TND" }
      },
      // Invoice logo: a small PNG (public/images/NOVA_3D_logo_invoice.png, 560 px, ~70 KB). It is decoded ONCE per Worker instance
      // and kept in memory: decoding the full-size site logo on every order would be slow and make every PDF several MB.
      invoiceLogo: (r) => (logoCache ??= loadLogo(env, r).catch((e) => { logoCache = undefined; throw e })),
      // Shop contacts printed in the invoice footer (same file as the website footer)
      siteContacts: async (r) => {
        try { const j: any = await (await env.ASSETS.fetch(new URL("/data/site.json", r.url))).json(); return { phone: j.phone, facebook: j.facebook, instagram: j.instagram } }
        catch { return {} }
      },
      settingsKv: env.NOVA_KV ? { get: (k) => env.NOVA_KV!.get(k), put: (k, v) => env.NOVA_KV!.put(k, v) } : undefined,
      defer: (p) => ctx.waitUntil(p),
    })
    return app(req)
  },
}
