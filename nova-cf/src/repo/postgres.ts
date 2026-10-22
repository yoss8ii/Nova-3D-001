/**
 * src/repo/postgres.ts - Repo implemented with the standard "pg" driver
 *
 * Works with ANY Postgres: Supabase, Neon, Railway, Render, AWS RDS, a VPS...
 * On Cloudflare the connectionString comes from the Hyperdrive binding (env.HYPERDRIVE.connectionString),
 * which pools connections for the Worker. Anywhere else, pass your normal DATABASE_URL.
 *
 * One Client per request; it connects lazily on the first query and is closed by close().
 * Tables are created by migrations/*.sql (run `npm run migrate`).
 */
import { Client } from "pg"
import type { Repo, Catalog, OrderRecord, PlaceOrderResult, OrderSummary, OrderStatus, PromoCode } from "./types.ts"

// Columns of an order WITHOUT the PDF, and the conversion of a row into an OrderSummary
const ORDER_COLS = "no, customer, lines, delivery, total, currency, created_at, email_sent, status, promo_code, discount"
const toOrder = (r: any): OrderSummary => ({
  no: r.no, customer: r.customer, lines: r.lines, delivery: Number(r.delivery), total: Number(r.total), cur: r.currency,
  at: new Date(r.created_at).toISOString(), emailSent: !!r.email_sent, status: r.status as OrderStatus,
  ...(r.promo_code ? { promo: r.promo_code as string, discount: Number(r.discount) } : {}),
})

const toPromo = (r: any): PromoCode => ({ code: r.code, percent: Number(r.percent), active: !!r.active, uses: Number(r.uses), at: new Date(r.created_at).toISOString() })

export function postgresRepo(connectionString: string): Repo {
  const db = new Client({ connectionString })
  let connecting: Promise<void> | null = null
  // Connect once, on demand; every query waits for the connection
  // Hyperdrive caches SELECT results for about a minute and does NOT clear them when data is written, so a read right after a save could
  // show the old values. Hyperdrive never caches a query that uses a non-immutable function: this always-true condition (now() is
  // "stable") keeps the reads the admin screens depend on live, even if the Hyperdrive config was created without --caching-disabled.
  const FRESH = "now() IS NOT NULL"
  const run = async (text: string, params: unknown[] = []) => {
    if (!connecting) connecting = db.connect()
    await connecting
    return db.query(text, params)
  }

  return {
    async readCatalog() {
      const [cats, prods, photos] = [
        await run(`SELECT id, name FROM categories WHERE ${FRESH} ORDER BY position, name`),
        await run(`SELECT id, name, price, old_price, quantity, description, category_id, best, shape, color FROM products WHERE ${FRESH} ORDER BY position, name`),
        await run(`SELECT id, product_id FROM photos WHERE product_id IS NOT NULL AND ${FRESH} ORDER BY position, created_at`),
      ]
      // Group photo ids by product
      const by: Record<string, string[]> = {}
      for (const r of photos.rows) (by[r.product_id] ||= []).push(r.id)
      return {
        categories: cats.rows.map((c: any) => ({ id: c.id, n: c.name })),
        products: prods.rows.map((p: any) => ({
          id: p.id, n: p.name, p: Number(p.price), o: Number(p.old_price), q: p.quantity, d: p.description,
          cat: p.category_id || null, best: !!p.best, sh: p.shape, b: p.color, ph: by[p.id] || [],
        })),
      } as Catalog
    },

    // One transaction: upsert, delete what is gone, attach photos, purge orphan photos (> 1 hour old)
    async saveCatalog(data) {
      await run("BEGIN")
      try {
        for (const [i, k] of data.categories.entries())
          await run("INSERT INTO categories (id,name,position) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, position=EXCLUDED.position", [k.id, k.n, i])
        // Stock: when the admin page sends q0 (the stock it saw), only the DIFFERENCE q - q0 is applied to the live stock,
        // so orders placed while the admin page was open are kept. Without q0 the stock is simply set to q.
        for (const [i, p] of data.products.entries())
          await run(
            `INSERT INTO products (id,name,price,old_price,quantity,description,category_id,best,shape,color,position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, old_price=EXCLUDED.old_price,
             quantity = CASE WHEN $12::int IS NULL THEN EXCLUDED.quantity ELSE GREATEST(0, products.quantity + (EXCLUDED.quantity - $12::int)) END,
             description=EXCLUDED.description, category_id=EXCLUDED.category_id, best=EXCLUDED.best, shape=EXCLUDED.shape, color=EXCLUDED.color, position=EXCLUDED.position`,
            [p.id, p.n, p.p, p.o, p.q, p.d, p.cat, p.best, p.sh, p.b, i, p.q0 ?? null],
          )
        await run("DELETE FROM products WHERE id <> ALL($1::text[])", [data.products.map((p) => p.id)])
        await run("DELETE FROM categories WHERE id <> ALL($1::text[])", [data.categories.map((k) => k.id)])
        const used: string[] = []
        for (const p of data.products)
          for (const [j, id] of p.ph.entries()) {
            await run("UPDATE photos SET product_id=$1, position=$2 WHERE id=$3", [p.id, j, id])
            used.push(id)
          }
        await run("UPDATE photos SET product_id=NULL WHERE product_id IS NOT NULL AND id <> ALL($1::uuid[])", [used])
        await run("DELETE FROM photos WHERE product_id IS NULL AND created_at < now() - interval '1 hour'")
        await run("COMMIT")
      } catch (e) {
        await run("ROLLBACK").catch(() => {})
        throw e
      }
    },

    async getSetting(key) {
      const r = await run(`SELECT value FROM settings WHERE key = $1 AND ${FRESH}`, [key])
      return r.rows.length ? r.rows[0].value : null
    },
    async setSetting(key, value) {
      await run("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, value])
    },

    // Stock + order (+ its invoice PDF) in one transaction. "quantity >= $1" makes the UPDATE fail when stock is short.
    // A duplicate invoice number (unique violation 23505) rolls everything back and asks the caller to draw another one.
    async placeOrder(o: OrderRecord): Promise<PlaceOrderResult> {
      await run("BEGIN")
      try {
        for (const l of o.lines) {
          const r = await run("UPDATE products SET quantity = quantity - $1 WHERE id = $2 AND quantity >= $1", [l.q, l.id])
          if (!r.rowCount) { await run("ROLLBACK"); return { ok: false, name: l.n } }
        }
        await run("INSERT INTO orders (no, customer, lines, total, currency, delivery, invoice_pdf, promo_code, discount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [o.no, JSON.stringify(o.customer), JSON.stringify(o.lines), o.total, o.cur, o.delivery, o.pdf ? Buffer.from(o.pdf) : null, o.promo ?? null, o.discount ?? 0])
        if (o.promo) await run("UPDATE promo_codes SET uses = uses + 1 WHERE code = $1", [o.promo])
        await run("COMMIT")
        return { ok: true }
      } catch (e: any) {
        await run("ROLLBACK").catch(() => {})
        if (e?.code === "23505") return { ok: false, dup: true }
        throw e
      }
    },

    async countOrders() {
      const r = await run(`SELECT count(*)::int AS n FROM orders WHERE ${FRESH}`)
      return r.rows[0].n
    },

    // ---- Order history / dashboard (never selects the PDF column except in getOrder) ----
    async orderTotals() {
      const r = await run(`SELECT count(*)::int AS orders,
          count(DISTINCT lower(trim(coalesce(nullif(customer->>'email', ''), nullif(customer->>'phone', ''), customer->>'name'))))::int AS customers,
          coalesce(sum(total), 0)::float AS revenue FROM orders WHERE ${FRESH}`)
      return { orders: r.rows[0].orders as number, customers: r.rows[0].customers as number, revenue: Number(r.rows[0].revenue) }
    },
    async listOrders(limit, offset) {
      const r = await run(`SELECT ${ORDER_COLS} FROM orders WHERE ${FRESH} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset])
      return { orders: r.rows.map(toOrder), total: await this.countOrders() }
    },
    async listAllOrders(cap) {
      return (await run(`SELECT ${ORDER_COLS} FROM orders WHERE ${FRESH} ORDER BY created_at DESC LIMIT $1`, [cap])).rows.map(toOrder)
    },
    async getOrder(no) {
      const r = await run(`SELECT ${ORDER_COLS}, invoice_pdf FROM orders WHERE no = $1 AND ${FRESH}`, [no])
      return r.rows.length ? { ...toOrder(r.rows[0]), pdf: r.rows[0].invoice_pdf ? new Uint8Array(r.rows[0].invoice_pdf) : null } : null
    },
    async pdfStats() {
      const r = await run("SELECT count(invoice_pdf)::int AS n, coalesce(sum(length(invoice_pdf)), 0)::bigint AS b FROM orders")
      return { count: r.rows[0].n as number, bytes: Number(r.rows[0].b) }
    },
    async clearInvoicePdfs(days) {
      return (await run("UPDATE orders SET invoice_pdf = NULL WHERE invoice_pdf IS NOT NULL AND created_at < now() - ($1::int * interval '1 day')", [days])).rowCount ?? 0
    },
    async setOrderEmailSent(no, sent) {
      await run("UPDATE orders SET email_sent = $2 WHERE no = $1", [no, sent])
    },
    async setOrderStatus(no, status) {
      return !!(await run("UPDATE orders SET status = $2 WHERE no = $1", [no, status])).rowCount
    },

    // ---- Anti-abuse counters (table rate_limits). One atomic statement: restart the window when it has ended. ----
    async hit(key, windowSec) {
      if (Math.random() < 0.02) await run("DELETE FROM rate_limits WHERE started < now() - interval '1 day'")
      const r = await run(
        `INSERT INTO rate_limits (key, n, started) VALUES ($1, 1, now())
         ON CONFLICT (key) DO UPDATE SET
           n = CASE WHEN rate_limits.started < now() - ($2::int * interval '1 second') THEN 1 ELSE rate_limits.n + 1 END,
           started = CASE WHEN rate_limits.started < now() - ($2::int * interval '1 second') THEN now() ELSE rate_limits.started END
         RETURNING n, GREATEST(0, ceil(extract(epoch FROM (started + ($2::int * interval '1 second') - now()))))::int AS retry`,
        [key, windowSec])
      return { n: r.rows[0].n as number, retry: r.rows[0].retry as number }
    },
    async peekHits(key, windowSec) {
      const r = await run(
        `SELECT n, GREATEST(0, ceil(extract(epoch FROM (started + ($2::int * interval '1 second') - now()))))::int AS retry
         FROM rate_limits WHERE key = $1 AND started >= now() - ($2::int * interval '1 second')`, [key, windowSec])
      return r.rows.length ? { n: r.rows[0].n as number, retry: r.rows[0].retry as number } : { n: 0, retry: 0 }
    },
    async resetHits(key) {
      await run("DELETE FROM rate_limits WHERE key = $1", [key])
    },

    async getPhoto(id) {
      const r = await run("SELECT content_type, data FROM photos WHERE id = $1", [id])
      return r.rows.length ? { type: r.rows[0].content_type, data: new Uint8Array(r.rows[0].data) } : null
    },
    async addPhoto(type, data) {
      const r = await run("INSERT INTO photos (content_type, data) VALUES ($1, $2) RETURNING id", [type, Buffer.from(data)])
      return r.rows[0].id
    },

    async addFeedback(f) {
      const r = await run("INSERT INTO feedback (name, stars, comment) VALUES ($1,$2,$3) RETURNING id", [f.name, f.stars, f.comment])
      return r.rows[0].id
    },
    async listFeedback(limit) {
      const r = await run("SELECT id, name, stars, comment, created_at FROM feedback ORDER BY created_at DESC LIMIT $1", [limit])
      return r.rows.map((x: any) => ({ id: x.id, name: x.name, stars: x.stars, comment: x.comment, at: new Date(x.created_at).toISOString() }))
    },
    async feedbackSummary() {
      const r = await run("SELECT count(*)::int AS n, coalesce(avg(stars), 0)::float AS a FROM feedback")
      return { count: r.rows[0].n as number, avg: Number(r.rows[0].a) }
    },
    async deleteFeedback(id) {
      return !!(await run("DELETE FROM feedback WHERE id = $1", [id])).rowCount
    },

    async addCustom(r) {
      const x = await run("INSERT INTO custom_requests (name, phone, description, color, budget) VALUES ($1,$2,$3,$4,$5) RETURNING id", [r.name, r.phone, r.description, r.color, r.budget])
      return x.rows[0].id
    },
    async listCustom(limit) {
      const r = await run("SELECT id, name, phone, description, color, budget, status, created_at FROM custom_requests ORDER BY created_at DESC LIMIT $1", [limit])
      return r.rows.map((x: any) => ({ id: x.id, name: x.name, phone: x.phone, description: x.description, color: x.color, budget: x.budget, status: x.status, at: new Date(x.created_at).toISOString() }))
    },
    async setCustomStatus(id, status) {
      return !!(await run("UPDATE custom_requests SET status = $2 WHERE id = $1", [id, status])).rowCount
    },
    async deleteCustom(id) {
      return !!(await run("DELETE FROM custom_requests WHERE id = $1", [id])).rowCount
    },

    async listReviews() {
      const r = await run("SELECT id FROM reviews ORDER BY position")
      return r.rows.map((x: any) => x.id as string)
    },
    async getReview(id) {
      const r = await run("SELECT content_type, data FROM reviews WHERE id = $1", [id])
      return r.rows.length ? { type: r.rows[0].content_type, data: new Uint8Array(r.rows[0].data) } : null
    },
    async addReview(type, data) {
      const r = await run("INSERT INTO reviews (content_type, data) VALUES ($1, $2) RETURNING id", [type, Buffer.from(data)])
      return r.rows[0].id
    },
    async deleteReview(id) {
      await run("DELETE FROM reviews WHERE id = $1", [id])
    },

    // ---- Promo codes ----
    async getPromo(code) {
      const r = await run(`SELECT code, percent, active, uses, created_at FROM promo_codes WHERE code = $1 AND ${FRESH}`, [code])
      return r.rows.length ? toPromo(r.rows[0]) : null
    },
    async listPromos() {
      return (await run(`SELECT code, percent, active, uses, created_at FROM promo_codes WHERE ${FRESH} ORDER BY created_at DESC`)).rows.map(toPromo)
    },
    async savePromo(code, percent) {
      await run("INSERT INTO promo_codes (code, percent) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET percent = EXCLUDED.percent", [code, percent])
    },
    async setPromoActive(code, active) {
      return !!(await run("UPDATE promo_codes SET active = $2 WHERE code = $1", [code, active])).rowCount
    },
    async deletePromo(code) {
      return !!(await run("DELETE FROM promo_codes WHERE code = $1", [code])).rowCount
    },

    async close() {
      if (connecting) await db.end()
    },
  }
}
