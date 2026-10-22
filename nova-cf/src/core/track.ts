/**
 * src/core/track.ts - POST /api/track (public): order tracking
 *
 *   POST { no, phone }   invoice number + the phone number given at checkout (compared on the last 8 digits)
 *   -> { no, at, status: "new" | "done", lines: [{ n, q }], delivery, total, cur }
 * Nothing else about the order (address, e-mail) is ever returned. Wrong guesses are limited per IP (10 per 10 minutes).
 */
import type { Repo } from "../repo/types.ts"
import { json } from "./http.ts"
import { clientIp } from "./auth.ts"

const ORDER_NO = /^NOVA-\d{8}-\d{4,8}$/
const MAX_MISSES = 10, WINDOW = 10 * 60
const tail = (s: string) => s.replace(/\D/g, "").slice(-8)

export async function handleTrack(req: Request, repo: Repo): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const body: any = await req.json().catch(() => null)
  const no = String(body?.no ?? "").trim().toUpperCase(), phone = tail(String(body?.phone ?? ""))
  if (!ORDER_NO.test(no) || phone.length < 8) return json({ message: "Entrez le numéro de facture (NOVA-…) et le téléphone utilisé pour la commande." }, 400)

  const key = "track-ip:" + clientIp(req)
  if ((await repo.peekHits(key, WINDOW)).n >= MAX_MISSES) return json({ message: "Trop d'essais. Réessayez dans quelques minutes." }, 429)
  const o = await repo.getOrder(no)
  if (!o || tail(o.customer.phone) !== phone) {
    await repo.hit(key, WINDOW)
    return json({ message: "Aucune commande ne correspond à ces informations." }, 404)
  }
  return json({ no: o.no, at: o.at, status: o.status, lines: o.lines.map((l) => ({ n: l.n, q: l.q })), delivery: o.delivery, total: o.total, cur: o.cur }, 200, { "cache-control": "no-store" })
}
