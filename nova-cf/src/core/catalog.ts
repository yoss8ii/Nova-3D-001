/**
 * src/core/catalog.ts - validation and public format of the catalogue
 *
 * The admin page sends the whole catalogue; clean() sanitises it BEFORE it reaches the database.
 * toPublic() turns the stored catalogue into the JSON served to the website.
 */
import type { Catalog } from "../repo/types.ts"

// Legacy "shape" values kept in the database (the 3D preview was removed from the site and the admin).
// and the SH list in the admin page.
export const SHAPES = ["key", "heart", "badge", "hex", "spin", "dragon", "cube", "ball"]
// A photo id is a UUID: anything else is rejected
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// str(): text cut to a max length. num(): number clamped between min and max (def if not a number).
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max)
const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

// Validate + sanitise what the admin sent. Returns null if the structure is wrong or too big
// (max 30 categories / 200 products). Invalid values get a safe default
// (unknown shape -> "key", bad colour -> teal, unknown category -> none...).
export function clean(body: any): Catalog | null {
  if (!body || !Array.isArray(body.categories) || !Array.isArray(body.products)) return null
  if (body.categories.length > 30 || body.products.length > 200) return null
  const categories = body.categories.map((c: any) => ({ id: str(c.id, 40) || crypto.randomUUID(), n: str(c.n, 40) || "Catégorie" }))
  const ids = new Set(categories.map((c: any) => c.id))
  const products: any[] = body.products.map((p: any) => ({
    id: str(p.id, 40) || crypto.randomUUID(),
    n: str(p.n, 60) || "Sans nom",
    p: num(p.p, 0, 100000, 0),
    o: 0,   // old price, fixed just below (only kept when higher than the current price)
    q: Math.round(num(p.q, 0, 100000, 0)),
    d: str(p.d, 300),
    cat: ids.has(p.cat) ? p.cat : null,
    best: !!p.best,
    sh: SHAPES.includes(p.sh) ? p.sh : SHAPES[0],
    b: /^#[0-9a-fA-F]{6}$/.test(p.b) ? p.b : "#00a6a6",
    // The browser sends photo URLs ("/api/photos/<uuid>"); we keep only valid UUIDs, max 8
    ph: (Array.isArray(p.ph) ? p.ph : []).map((u: any) => String(u).replace("/api/photos/", "")).filter((u: string) => UUID.test(u)).slice(0, 8),
    // q0 = stock seen by the admin page at load time (see Product in repo/types.ts); absent = "set the stock to q"
    q0: p.q0 === undefined || p.q0 === null || p.q0 === "" ? undefined : Math.round(num(p.q0, 0, 100000, 0)),
  }))
  for (const [i, p] of products.entries()) { const o = num(body.products[i].o, 0, 100000, 0); p.o = o > p.p ? o : 0 }
  return { categories, products }
}

// Delivery fee set by the admin: 0..10000, 2 decimals
export const cleanFee = (v: unknown) => Math.round(num(v, 0, 10000, 0) * 100) / 100

// Stored catalogue -> JSON for the website (photo ids become URLs, best becomes 1/0, no category = "")
export function toPublic(c: Catalog) {
  return {
    categories: c.categories.map((k) => ({ id: k.id, n: k.n })),
    products: c.products.map((p) => ({
      id: p.id, n: p.n, p: p.p, o: p.o > p.p ? p.o : 0, q: p.q, d: p.d,
      cat: p.cat || "", best: p.best ? 1 : 0, sh: p.sh, b: p.b,
      ph: p.ph.map((id) => "/api/photos/" + id),
    })),
  }
}
