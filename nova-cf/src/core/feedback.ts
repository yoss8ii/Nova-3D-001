/**
 * src/core/feedback.ts - GET / POST /api/feedback (public)
 *
 * Visitors rate the service from 1 star (mauvais) to 5 stars (très bien) and may add a comment, with a name
 * or anonymously. The newest ratings are shown on the home page; the admin deletes abusive ones.
 *   POST { name?, stars, comment?, website? }   website = honeypot (hidden field, bots fill it)
 * Anti-abuse: honeypot, max 3 ratings per IP per hour (only SUCCESSFUL ones count), no links in the text.
 */
import type { Repo } from "../repo/types.ts"
import { json } from "./http.ts"
import { clientIp } from "./auth.ts"

const MAX_PER_IP = 3, WINDOW = 60 * 60
const LIST = 30

export async function handleFeedback(req: Request, repo: Repo): Promise<Response> {
  if (req.method === "GET") {
    const [items, sum] = [await repo.listFeedback(LIST), await repo.feedbackSummary()]
    return json({ count: sum.count, avg: Math.round(sum.avg * 10) / 10, items }, 200, { "cache-control": "public, max-age=30" })
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const body: any = await req.json().catch(() => null)
  if (body?.website) return json({ message: "Merci !" }, 200)          // honeypot: pretend it worked
  const stars = Math.floor(Number(body?.stars))
  if (!(stars >= 1 && stars <= 5)) return json({ message: "Choisissez une note de 1 à 5 étoiles." }, 400)
  const name = String(body?.name ?? "").trim().slice(0, 40)
  const comment = String(body?.comment ?? "").trim().slice(0, 500)
  if (/https?:\/\/|www\./i.test(name + " " + comment)) return json({ message: "Les liens ne sont pas autorisés." }, 400)

  const key = "feedback-ip:" + clientIp(req)
  if ((await repo.peekHits(key, WINDOW)).n >= MAX_PER_IP) return json({ message: "Merci ! Vous avez déjà laissé plusieurs avis, réessayez plus tard." }, 429)
  await repo.addFeedback({ name: name || null, stars, comment })
  await repo.hit(key, WINDOW)
  return json({ ok: true })
}
