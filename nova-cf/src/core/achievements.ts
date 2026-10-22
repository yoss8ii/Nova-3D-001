/**
 * src/core/achievements.ts - the "success panel" of the home page (pure functions: no database, easy to test)
 *
 * The three figures (customers, orders, total received) are COUNTED FROM THE REAL ORDERS and are only ever sent to
 * visitors as a bracket: "99+", "250+", "2 500+"... never the exact number. The texts around them (title, subtitle,
 * cards) are written by the shop owner in the admin page and saved in the settings table (key "achievements").
 */

export interface Card { t: string; d: string }                                   // t = title, d = text
export interface Achievements { on: boolean; title: string; sub: string; cards: Card[] }
export interface Totals { orders: number; customers: number; revenue: number }
export interface PublicStat { k: "clients" | "orders" | "revenue"; l: string; n: number; cur?: 1 }   // n = the bracket, shown as "n+"

export const MAX_CARDS = 8

// What the panel shows until the owner edits it (true descriptions of the service, no invented results)
export const DEFAULT_ACH: Achievements = {
  on: true,
  title: "Nos réussites",
  sub: "Impression 3D sur mesure",
  cards: [
    { t: "Objets personnalisés", d: "Porte-clés, plaques et gadgets à votre nom ou à votre image." },
    { t: "Commande sur mesure", d: "Décrivez votre idée : nous la transformons en objet imprimé en 3D." },
  ],
}

// The brackets, from low to high. A real number is shown as the biggest bracket that is not above it (37 -> "25+", 120 -> "99+").
const TIERS = [1, 5, 10, 25, 50, 99, 250, 500, 999, 2500, 5000, 9999, 25000, 50000, 99999, 250000, 500000, 999999]
export function tier(n: number): number | null {
  let r: number | null = null
  for (const t of TIERS) if (n >= t) r = t
  return r
}

// The figures visitors see: a bracket per figure; a figure that is still 0 is left out
export function publicStats(t: Totals): PublicStat[] {
  const rows: (PublicStat | null)[] = [
    { k: "clients", l: "Clients servis", n: tier(t.customers) as number },
    { k: "orders", l: "Commandes", n: tier(t.orders) as number },
    { k: "revenue", l: "Total reçu", n: tier(Math.floor(t.revenue)) as number, cur: 1 },
  ]
  return rows.filter((r): r is PublicStat => !!r && r.n !== null)
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

// Checks what the admin page sends (or what was saved): returns clean data, or null when it is not an object
export function cleanAch(x: any): Achievements | null {
  if (!x || typeof x !== "object") return null
  const cards = (Array.isArray(x.cards) ? x.cards : []).slice(0, MAX_CARDS)
    .map((c: any) => ({ t: str(c?.t, 60), d: str(c?.d, 240) })).filter((c: Card) => c.t || c.d)
  return { on: !!x.on, title: str(x.title, 80), sub: str(x.sub, 200), cards }
}

// The saved settings value (JSON text or null) -> data; the defaults when nothing valid is saved
export function readAch(raw: string | null): Achievements {
  if (!raw) return DEFAULT_ACH
  try { return cleanAch(JSON.parse(raw)) ?? DEFAULT_ACH } catch { return DEFAULT_ACH }
}
