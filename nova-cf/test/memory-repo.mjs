// In-memory Repo used by the tests: proves the API logic works without any database.
// It follows the same contract as src/repo/postgres.ts (see src/repo/types.ts).
export function memoryRepo(state) {
  const summary = (o) => { const { pdf, ...rest } = o; return structuredClone(rest) }
  return {
    async readCatalog() { return structuredClone(state.catalog) },
    async saveCatalog(c) {
      // Same rule as postgres.ts: with q0 only the difference q - q0 is applied to the live stock
      const old = new Map(state.catalog.products.map((p) => [p.id, p]))
      state.catalog = structuredClone({
        categories: c.categories,
        products: c.products.map(({ q0, ...p }) => {
          const live = old.get(p.id)
          return { ...p, q: live && q0 !== undefined ? Math.max(0, live.q + (p.q - q0)) : p.q }
        }),
      })
    },
    async orderTotals() {
      const who = (o) => (o.customer.email || o.customer.phone || o.customer.name).trim().toLowerCase()
      return { orders: state.orders.length, customers: new Set(state.orders.map(who)).size, revenue: state.orders.reduce((s, o) => s + o.total, 0) }
    },
    async getSetting(k) { return state.settings.get(k) ?? null },
    async setSetting(k, v) { state.settings.set(k, v) },
    async placeOrder(o) {
      if (state.orders.some((x) => x.no === o.no)) return { ok: false, dup: true }
      for (const l of o.lines) {
        const p = state.catalog.products.find((x) => x.id === l.id)
        if (!p || p.q < l.q) return { ok: false, name: l.n }   // nothing taken: all or nothing
      }
      for (const l of o.lines) state.catalog.products.find((x) => x.id === l.id).q -= l.q
      if (o.promo) { const pc = state.promos.get(o.promo); if (pc) pc.uses++ }
      state.orders.push({ ...o, at: state.now ? state.now() : new Date().toISOString(), emailSent: false, status: "new" })
      return { ok: true }
    },
    async countOrders() { return state.orders.length },
    async listOrders(limit, offset) {
      const all = [...state.orders].reverse()
      return { orders: all.slice(offset, offset + limit).map(summary), total: all.length }
    },
    async listAllOrders(cap) { return [...state.orders].reverse().slice(0, cap).map(summary) },
    async getOrder(no) {
      const o = state.orders.find((x) => x.no === no)
      return o ? { ...summary(o), pdf: o.pdf ?? null } : null
    },
    async pdfStats() { const l = state.orders.filter((o) => o.pdf); return { count: l.length, bytes: l.reduce((n, o) => n + o.pdf.length, 0) } },
    async clearInvoicePdfs(days) {
      const limit = Date.now() - days * 864e5; let n = 0
      for (const o of state.orders) if (o.pdf && new Date(o.at).getTime() < limit) { o.pdf = null; n++ }
      return n
    },
    async setOrderEmailSent(no, sent) { const o = state.orders.find((x) => x.no === no); if (o) o.emailSent = sent },
    async setOrderStatus(no, status) { const o = state.orders.find((x) => x.no === no); if (o) o.status = status; return !!o },
    async hit(key, windowSec) {
      const now = Date.now(), h = state.hits.get(key)
      const cur = h && now - h.t < windowSec * 1000 ? { n: h.n + 1, t: h.t } : { n: 1, t: now }
      state.hits.set(key, cur)
      return { n: cur.n, retry: Math.ceil((cur.t + windowSec * 1000 - now) / 1000) }
    },
    async peekHits(key, windowSec) {
      const h = state.hits.get(key)
      return h && Date.now() - h.t < windowSec * 1000 ? { n: h.n, retry: Math.ceil((h.t + windowSec * 1000 - Date.now()) / 1000) } : { n: 0, retry: 0 }
    },
    async resetHits(key) { state.hits.delete(key) },
    async getPhoto(id) { return state.photos.get(id) ?? null },
    async addPhoto(type, data) { const id = crypto.randomUUID(); state.photos.set(id, { type, data }); return id },
    async addFeedback(f) { const id = crypto.randomUUID(); state.feedback.unshift({ id, ...f, at: new Date().toISOString() }); return id },
    async listFeedback(limit) { return state.feedback.slice(0, limit).map((x) => ({ ...x })) },
    async feedbackSummary() { const n = state.feedback.length; return { count: n, avg: n ? state.feedback.reduce((s, x) => s + x.stars, 0) / n : 0 } },
    async deleteFeedback(id) { const i = state.feedback.findIndex((x) => x.id === id); if (i < 0) return false; state.feedback.splice(i, 1); return true },
    async addCustom(r) { const id = crypto.randomUUID(); state.custom.unshift({ id, ...r, status: "new", at: new Date().toISOString() }); return id },
    async listCustom(limit) { return state.custom.slice(0, limit).map((x) => ({ ...x })) },
    async setCustomStatus(id, status) { const x = state.custom.find((c) => c.id === id); if (!x) return false; x.status = status; return true },
    async deleteCustom(id) { const i = state.custom.findIndex((c) => c.id === id); if (i < 0) return false; state.custom.splice(i, 1); return true },
    async listReviews() { return [...state.reviews.keys()] },
    async getReview(id) { return state.reviews.get(id) ?? null },
    async addReview(type, data) { const id = crypto.randomUUID(); state.reviews.set(id, { type, data }); return id },
    async deleteReview(id) { state.reviews.delete(id) },
    async getPromo(code) { const p = state.promos.get(code); return p ? { ...p } : null },
    async listPromos() { return [...state.promos.values()].reverse().map((p) => ({ ...p })) },
    async savePromo(code, percent) { const p = state.promos.get(code); if (p) p.percent = percent; else state.promos.set(code, { code, percent, active: true, uses: 0, at: new Date().toISOString() }) },
    async setPromoActive(code, active) { const p = state.promos.get(code); if (!p) return false; p.active = active; return true },
    async deletePromo(code) { return state.promos.delete(code) },
    async close() { state.closed++ },
  }
}
export function freshState() {
  return {
    catalog: {
      categories: [{ id: "c1", n: "Porte-clés" }],
      products: [{ id: "p1", n: "Porte-clés prénom", p: 6, q: 3, d: "x", cat: "c1", best: true, sh: "key", b: "#00a6a6", ph: [] }],
    },
    settings: new Map(), orders: [], photos: new Map(), reviews: new Map(), feedback: [], custom: [], hits: new Map(), promos: new Map(), closed: 0,
  }
}
