/**
 * src/core/stats.ts - admin dashboard numbers (pure functions: no database, easy to test)
 *
 * buildDashboard() receives every order (newest first) + the catalogue and returns what the dashboard page shows:
 * today / this month / all-time totals, one row per day (last 30 days) and per month (last 12 months),
 * best products, best customers and stock alerts.
 * Days and months are computed in the shop's time zone (TIMEZONE, default Africa/Tunis), not in UTC.
 * "Revenue" = order totals, delivery fee included. A "customer" = one distinct e-mail address.
 */
import type { Catalog, OrderSummary } from "../repo/types.ts"

export interface Period { orders: number; revenue: number; items: number; customers: number }
export interface DayRow extends Period { date: string }                       // "2026-10-17"
export interface MonthRow extends Period { month: string; newCustomers: number }  // "2026-10"

const r2 = (n: number) => Math.round(n * 100) / 100

// "YYYY-MM-DD" of a moment in a time zone
export function dayKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}
// The key of the day `n` days before the day `key` (pure calendar arithmetic, immune to time-zone shifts)
function minusDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}
function minusMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7)
}
const who = (o: OrderSummary) => (o.customer.email || o.customer.phone || o.customer.name).trim().toLowerCase()
const itemsOf = (o: OrderSummary) => o.lines.reduce((s, l) => s + l.q, 0)

// Totals of a group of orders
function sum(list: OrderSummary[]): Period {
  return {
    orders: list.length,
    revenue: r2(list.reduce((s, o) => s + o.total, 0)),
    items: list.reduce((s, o) => s + itemsOf(o), 0),
    customers: new Set(list.map(who)).size,
  }
}

export function buildDashboard(orders: OrderSummary[], catalog: Catalog, now: Date, tz: string, cur: string, truncated = false) {
  const today = dayKey(now, tz), month = today.slice(0, 7)
  const keyed = orders.map((o) => ({ o, day: dayKey(new Date(o.at), tz) }))

  // Group orders by day and by month
  const byDay = new Map<string, OrderSummary[]>(), byMonth = new Map<string, OrderSummary[]>()
  for (const { o, day } of keyed) {
    ;(byDay.get(day) || byDay.set(day, []).get(day)!).push(o)
    ;(byMonth.get(day.slice(0, 7)) || byMonth.set(day.slice(0, 7), []).get(day.slice(0, 7))!).push(o)
  }

  // First month in which each customer ever ordered (to count NEW customers per month)
  const first = new Map<string, string>()
  for (const { o, day } of [...keyed].reverse()) { const k = who(o); if (!first.has(k)) first.set(k, day.slice(0, 7)) }

  // One row per day for the last 30 days (days without orders = zeros) and per month for the last 12 months
  const days: DayRow[] = []
  for (let i = 29; i >= 0; i--) { const d = minusDays(today, i); days.push({ date: d, ...sum(byDay.get(d) || []) }) }
  const months: MonthRow[] = []
  for (let i = 11; i >= 0; i--) {
    const m = minusMonths(month, i)
    months.push({ month: m, ...sum(byMonth.get(m) || []), newCustomers: [...first.values()].filter((f) => f === m).length })
  }

  // Best products (units and revenue, all time) and best customers (all time)
  const prod = new Map<string, { id: string; n: string; q: number; revenue: number }>()
  const cust = new Map<string, { name: string; email: string; orders: number; spent: number }>()
  for (const o of orders) {
    for (const l of o.lines) {
      const x = prod.get(l.id) || { id: l.id, n: l.n, q: 0, revenue: 0 }
      x.q += l.q; x.revenue = r2(x.revenue + l.p * l.q); x.n = l.n; prod.set(l.id, x)
    }
    const k = who(o), c = cust.get(k) || { name: o.customer.name, email: o.customer.email, orders: 0, spent: 0 }
    c.orders++; c.spent = r2(c.spent + o.total); cust.set(k, c)
  }
  const allCustomers = [...cust.values()]

  const p = catalog.products
  return {
    cur, tz, today, month, truncated,
    now: { today: sum(byDay.get(today) || []), month: sum(byMonth.get(month) || []), all: sum(orders) },
    averageBasket: orders.length ? r2(orders.reduce((s, o) => s + o.total, 0) / orders.length) : 0,
    returningCustomers: allCustomers.filter((c) => c.orders > 1).length,
    toPrepare: orders.filter((o) => o.status === "new").length,
    days, months,
    topProducts: [...prod.values()].sort((a, b) => b.q - a.q || b.revenue - a.revenue).slice(0, 8),
    topCustomers: allCustomers.sort((a, b) => b.spent - a.spent).slice(0, 8),
    catalog: {
      products: p.length, categories: catalog.categories.length,
      bestSellers: p.filter((x) => x.best).length,
      outOfStock: p.filter((x) => x.q === 0).length,
      lowStock: p.filter((x) => x.q > 0 && x.q <= 3).sort((a, b) => a.q - b.q).slice(0, 8).map((x) => ({ id: x.id, n: x.n, q: x.q })),
      stockUnits: p.reduce((s, x) => s + x.q, 0),
    },
  }
}
