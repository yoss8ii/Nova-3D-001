/**
 * src/core/promo.ts - promo codes (created by the admin, one percentage per code)
 *
 *   POST /api/promo          public  { code }  -> { ok, code, percent }  (checks a code typed in the cart; 20 tries per 10 minutes per IP)
 *   GET  /api/promos         admin   { promos: [{ code, percent, active, uses, at }] }
 *   POST /api/promos         admin   { code, percent }   creates the code, or changes its percentage
 *   PATCH /api/promos/:code  admin   { active: boolean }
 *   DELETE /api/promos/:code admin
 * The discount is taken off the PRODUCTS subtotal only (never the delivery fee). The server recomputes it at order time:
 * the browser's figures are never trusted.
 */
import type { Repo } from "../repo/types.ts"
import { json } from "./http.ts"
import { clientIp } from "./auth.ts"

const round2 = (n: number) => Math.round(n * 100) / 100

// "  summer-10 " -> "SUMMER-10". Only A-Z 0-9 - _ , 3 to 20 characters; anything else -> "" (invalid)
export function cleanCode(raw: unknown): string {
  const c = String(raw ?? "").trim().toUpperCase()
  return /^[A-Z0-9_-]{3,20}$/.test(c) ? c : ""
}

// Percentage between 0.01 and 100 (2 decimals). Anything else -> 0 (invalid)
export function cleanPercent(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(",", "."))
  return Number.isFinite(n) && n > 0 && n <= 100 ? round2(n) : 0
}

// Amount taken off a subtotal
export const discountOf = (subtotal: number, percent: number) => round2(subtotal * percent / 100)

const MAX_TRIES = 20, TRIES_WINDOW = 10 * 60

// Public: is this code valid right now?
export async function handlePromoCheck(req: Request, repo: Repo) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const key = "promo-ip:" + clientIp(req)
  if ((await repo.hit(key, TRIES_WINDOW)).n > MAX_TRIES) return json({ message: "Trop d'essais. Réessayez dans quelques minutes." }, 429)
  const body: any = await req.json().catch(() => null)
  const code = cleanCode(body?.code)
  const promo = code ? await repo.getPromo(code) : null
  if (!promo || !promo.active) return json({ error: "promo_invalid", message: "Ce code promo n'est pas valide." }, 404)
  return json({ ok: true, code: promo.code, percent: promo.percent })
}

// Admin: list / create / activate / delete (the caller has already checked the admin password)
export async function handlePromoAdmin(req: Request, path: string, repo: Repo) {
  const code = decodeURIComponent(path.split("/")[3] || "")
  if (!code) {
    if (req.method === "GET") return json({ promos: await repo.listPromos() })
    if (req.method === "POST") {
      const b: any = await req.json().catch(() => null)
      const c = cleanCode(b?.code), p = cleanPercent(b?.percent)
      if (!c) return json({ message: "Code invalide : 3 à 20 caractères (lettres, chiffres, - ou _)." }, 400)
      if (!p) return json({ message: "Pourcentage invalide : entre 0,01 et 100." }, 400)
      await repo.savePromo(c, p)
      return json({ ok: true, code: c, percent: p })
    }
    return json({ error: "Method not allowed" }, 405)
  }
  const c = cleanCode(code)
  if (!c) return json({ error: "Not found" }, 404)
  if (req.method === "DELETE") return (await repo.deletePromo(c)) ? json({ ok: true }) : json({ error: "Not found" }, 404)
  if (req.method === "PATCH") {
    const b: any = await req.json().catch(() => null)
    if (typeof b?.active !== "boolean") return json({ error: "Invalid data" }, 400)
    return (await repo.setPromoActive(c, b.active)) ? json({ ok: true }) : json({ error: "Not found" }, 404)
  }
  return json({ error: "Method not allowed" }, 405)
}
