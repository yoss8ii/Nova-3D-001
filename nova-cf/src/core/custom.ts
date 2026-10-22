/**
 * src/core/custom.ts - POST /api/custom (public): saves a "sur mesure" request
 *
 *   POST { name?, phone?, description, color?, budget?, website? }   website = honeypot (hidden field, bots fill it)
 * The public page still opens WhatsApp afterwards; this only keeps a copy for the admin "Sur mesure" tab.
 * Anti-abuse: honeypot, max 5 requests per IP per hour (only SUCCESSFUL ones count), no links in the text.
 * The admin routes (list / status / delete) live in app.ts next to the other guarded routes.
 */
import type { Repo, CustomStatus } from "../repo/types.ts"
import { json } from "./http.ts"
import { clientIp } from "./auth.ts"

export const CUSTOM_STATUSES: CustomStatus[] = ["new", "quoted", "done"]
const MAX_PER_IP = 5, WINDOW = 60 * 60

export async function handleCustom(req: Request, repo: Repo): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const body: any = await req.json().catch(() => null)
  if (body?.website) return json({ ok: true }, 200)                      // honeypot: pretend it worked
  const description = String(body?.description ?? "").trim().slice(0, 1000)
  if (!description) return json({ message: "Décrivez l'objet souhaité." }, 400)
  const name = String(body?.name ?? "").trim().slice(0, 80)
  const phone = String(body?.phone ?? "").trim().slice(0, 30)
  const color = String(body?.color ?? "").trim().slice(0, 30)
  const budget = String(body?.budget ?? "").trim().slice(0, 30)
  if (/https?:\/\/|www\./i.test([name, description, color, budget].join(" "))) return json({ message: "Les liens ne sont pas autorisés." }, 400)

  const key = "custom-ip:" + clientIp(req)
  if ((await repo.peekHits(key, WINDOW)).n >= MAX_PER_IP) return json({ message: "Trop de demandes pour le moment, réessayez plus tard." }, 429)
  await repo.addCustom({ name, phone, description, color, budget })
  await repo.hit(key, WINDOW)
  return json({ ok: true })
}
