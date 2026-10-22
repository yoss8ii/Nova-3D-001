/**
 * src/core/coming-soon.ts - the "Bientôt disponible" page (pure functions: no database, easy to test)
 *
 * While the page is ON, every public page of the website answers with /bientot/ (see src/worker.ts); the admin page and the API
 * stay reachable. The texts, the contact links and the ON/OFF switch are written by the shop owner in the admin ("Page d'attente"
 * tab) and kept in a small key-value store (Cloudflare KV): NOT in the Postgres database, so the page keeps working
 * even when the database is down.
 *
 * Until something is saved the page is ON with the default texts below (the site starts "closed"; the owner switches it off).
 */

export interface ComingSoon {
  on: boolean
  titleFr: string; textFr: string       // French title + message
  titleAr: string; textAr: string       // Arabic (Tunisian) title + message, shown right-to-left
  instagram: string                     // https://www.instagram.com/... ("" = the address in public/data/site.json)
  whatsapp: string                      // digits only, with country code: 21626183165 ("" = the number in public/data/site.json)
}

export const DEFAULT_SOON: ComingSoon = {
  on: true,
  titleFr: "Bientôt disponible",
  textFr: "Nous créons notre site de design 3D : porte-clés, gadgets et objets personnalisés imprimés en 3D. Un peu de patience, ça arrive !",
  titleAr: "قريبًا",
  textAr: "نحضّرو في موقعنا متاع تصميم ثلاثي الأبعاد: porte-clés وgadgets وأشياء مخصّصة مطبوعة بالـ3D. شوية صبر، قريب نكونو معاكم!",
  instagram: "",
  whatsapp: "",
}

export const SOON_KEY = "coming-soon"
const LIMITS = { title: 80, text: 600 }

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")

// Instagram: a full https://instagram.com/... address or just a handle (@nova_tn_3d) -> full address; "" stays ""; anything else = null (invalid)
export function cleanInstagram(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : ""
  if (!s) return ""
  if (/^https:\/\/(www\.)?instagram\.com\/[\w./?=&%-]{1,100}$/i.test(s)) return s
  const h = s.replace(/^@/, "")
  return /^[\w.]{1,30}$/.test(h) ? "https://www.instagram.com/" + h : null
}

// WhatsApp: "+216 26 183 165" -> "21626183165" (8 to 15 digits, country code included); "" stays ""; anything else = null (invalid)
export function cleanWhatsapp(v: unknown): string | null {
  const s = typeof v === "string" ? v.replace(/[\s().-]/g, "").replace(/^\+/, "").replace(/^00/, "") : ""
  if (!s) return ""
  return /^\d{8,15}$/.test(s) ? s : null
}

// Checks what the admin sends. Returns the clean config, or the name of the bad field ({ bad: "instagram" }).
export function cleanSoon(body: unknown): ComingSoon | { bad: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  if (typeof b.on !== "boolean") return { bad: "on" }
  const instagram = cleanInstagram(b.instagram); if (instagram === null) return { bad: "instagram" }
  const whatsapp = cleanWhatsapp(b.whatsapp); if (whatsapp === null) return { bad: "whatsapp" }
  const c: ComingSoon = {
    on: b.on, instagram, whatsapp,
    titleFr: str(b.titleFr, LIMITS.title), textFr: str(b.textFr, LIMITS.text),
    titleAr: str(b.titleAr, LIMITS.title), textAr: str(b.textAr, LIMITS.text),
  }
  // An empty text falls back to the default one: the page is never blank
  if (!c.titleFr) c.titleFr = DEFAULT_SOON.titleFr
  if (!c.textFr) c.textFr = DEFAULT_SOON.textFr
  if (!c.titleAr) c.titleAr = DEFAULT_SOON.titleAr
  if (!c.textAr) c.textAr = DEFAULT_SOON.textAr
  return c
}

// Reads the stored JSON (or null / garbage = defaults, page ON)
export function readSoon(raw: string | null | undefined): ComingSoon {
  if (!raw) return { ...DEFAULT_SOON }
  try { const c = cleanSoon(JSON.parse(raw)); return "bad" in c ? { ...DEFAULT_SOON } : c } catch { return { ...DEFAULT_SOON } }
}
