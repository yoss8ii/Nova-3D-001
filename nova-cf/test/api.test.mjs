// Run with:  npm test      (Node 22+, no database needed)
import test from "node:test"
import assert from "node:assert/strict"
import { createApp } from "../src/app.ts"
import { hashPassword, sha } from "../src/core/auth.ts"
import { buildDashboard } from "../src/core/stats.ts"
import { memoryRepo, freshState } from "./memory-repo.mjs"

const PW = "test-pass-123"    // admin password used by the tests (the factory password "admin" is tested separately)

// factory: true = fresh install (no password saved yet, so the factory password "admin" is active)
async function setup({ factory = false, ...over } = {}) {
  const state = freshState()
  if (!factory) state.settings.set("pwhash", await hashPassword(PW))
  const app = createApp({
    repo: () => memoryRepo(state), ordersEnabled: false, siteCurrency: async () => "TND", ...over,
  })
  const call = (method, path, { body, pw, headers } = {}) =>
    app(new Request("http://x" + path, {
      method, body: body === undefined ? undefined : typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body),
      headers: { ...(pw !== undefined ? { "x-admin-password": encodeURIComponent(pw) } : {}), ...headers },
    }))
  return { state, call }
}

test("public catalogue uses the short public format", async () => {
  const { call } = await setup()
  const r = await call("GET", "/api/catalog"); assert.equal(r.status, 200)
  const d = await r.json()
  assert.equal(d.products[0].n, "Porte-clés prénom"); assert.equal(d.products[0].best, 1); assert.equal(d.products[0].cat, "c1")
})

test("admin routes: 401 without or with a wrong password, 200 with the right one", async () => {
  const { call } = await setup()
  assert.equal((await call("POST", "/api/catalog", { body: {} })).status, 401)
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: "wrong" })).status, 401)
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: "admin" })).status, 401)   // the factory password is gone
  const r = await call("POST", "/api/catalog", { body: {}, pw: PW })
  assert.equal(r.status, 200); assert.equal((await r.json()).mustChange, false)
})

test("factory password: only usable to set a new password, everything else is 403 change_password", async () => {
  const { call, state } = await setup({ factory: true })
  const login = await call("POST", "/api/catalog", { body: {}, pw: "admin" })
  assert.equal(login.status, 200); assert.equal((await login.json()).mustChange, true)
  for (const [m, path, body] of [["PUT", "/api/catalog", { categories: [], products: [] }], ["GET", "/api/orders"], ["GET", "/api/dashboard"], ["POST", "/api/photos"]]) {
    const r = await call(m, path, { body, pw: "admin", headers: { "content-type": "image/jpeg" } })
    assert.equal(r.status, 403, path); assert.equal((await r.json()).error, "change_password")
  }
  assert.equal((await call("POST", "/api/catalog", { body: { newPassword: "admin" }, pw: "admin" })).status, 400)     // too short
  assert.equal((await call("POST", "/api/catalog", { body: { newPassword: "short" }, pw: "admin" })).status, 400)
  assert.equal((await call("POST", "/api/catalog", { body: { newPassword: "Nouveau-mdp-1" }, pw: "admin" })).status, 200)
  assert.match(state.settings.get("pwhash"), /^pbkdf2\$100000\$/)                                                       // salted PBKDF2, never plain
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: "admin" })).status, 401)
  assert.equal((await call("GET", "/api/orders", { pw: "Nouveau-mdp-1" })).status, 200)
})

test("legacy SHA-256 hashes still work and are upgraded to PBKDF2 at the next login", async () => {
  const { call, state } = await setup()
  state.settings.set("pwhash", await sha("ancien-mdp-1"))
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: "ancien-mdp-1" })).status, 200)
  assert.match(state.settings.get("pwhash"), /^pbkdf2\$/)
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: "ancien-mdp-1" })).status, 200)
})

test("brute force: 8 wrong passwords lock the IP for a while (429), even with the right password", async () => {
  const { call } = await setup()
  for (let i = 0; i < 8; i++) assert.equal((await call("POST", "/api/catalog", { body: {}, pw: "nope" + i })).status, 401)
  const r = await call("POST", "/api/catalog", { body: {}, pw: PW })
  assert.equal(r.status, 429); assert.ok(Number(r.headers.get("retry-after")) > 0)
  // another IP is not affected
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: PW, headers: { "cf-connecting-ip": "1.2.3.4" } })).status, 200)
})

test("a successful login clears the failure counter", async () => {
  const { call } = await setup()
  for (let i = 0; i < 5; i++) await call("POST", "/api/catalog", { body: {}, pw: "bad" })
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: PW })).status, 200)
  for (let i = 0; i < 7; i++) await call("POST", "/api/catalog", { body: {}, pw: "bad" })
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: PW })).status, 200)   // 7 < 8: only counted since the reset
})

test("password change works immediately and the old one stops working (the original bug)", async () => {
  const { call } = await setup()
  assert.equal((await call("POST", "/api/catalog", { body: { newPassword: "abc" }, pw: PW })).status, 400) // too short
  assert.equal((await call("POST", "/api/catalog", { body: { newPassword: "nouveau12" }, pw: PW })).status, 200)
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: "nouveau12" })).status, 200)
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: PW })).status, 401)
})

test("passwords with Arabic letters and accents work (URL-encoded header)", async () => {
  const { call } = await setup()
  await call("POST", "/api/catalog", { body: { newPassword: "كلمة-سر-é1-x" }, pw: PW })
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: "كلمة-سر-é1-x" })).status, 200)
})

test("ADMIN_PASSWORD secret wins and cannot be changed from the page", async () => {
  const { call } = await setup({ adminPassword: "secret99" })
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: PW })).status, 401)
  assert.equal((await call("POST", "/api/catalog", { body: {}, pw: "secret99" })).status, 200)
  assert.equal((await call("POST", "/api/catalog", { body: { newPassword: "another-pass1" }, pw: "secret99" })).status, 400)
})

test("saving the catalogue sanitises bad values", async () => {
  const { call, state } = await setup()
  const body = { categories: [{ id: "c1", n: "A" }], products: [{ id: "p9", n: "T", p: -5, q: 2.6, sh: "nope", b: "red", cat: "ghost", ph: ["/api/photos/not-a-uuid"] }] }
  assert.equal((await call("PUT", "/api/catalog", { body, pw: PW })).status, 200)
  const p = state.catalog.products[0]
  assert.deepEqual([p.p, p.q, p.sh, p.b, p.cat, p.ph.length], [0, 3, "key", "#00a6a6", null, 0])
  assert.equal((await call("PUT", "/api/catalog", { body: { nope: 1 }, pw: PW })).status, 400)
})

test("photos: admin upload, public read, type and auth checks", async () => {
  const { call } = await setup()
  const bytes = new Uint8Array([1, 2, 3])
  assert.equal((await call("POST", "/api/photos", { body: bytes, headers: { "content-type": "image/jpeg" } })).status, 401)
  assert.equal((await call("POST", "/api/photos", { body: bytes, pw: PW, headers: { "content-type": "text/html" } })).status, 415)
  const up = await call("POST", "/api/photos", { body: bytes, pw: PW, headers: { "content-type": "image/jpeg" } })
  const { url } = await up.json()
  const got = await call("GET", url)
  assert.equal(got.status, 200); assert.equal(got.headers.get("content-type"), "image/jpeg")
  assert.deepEqual([...new Uint8Array(await got.arrayBuffer())], [1, 2, 3])
  assert.equal((await call("GET", "/api/photos/00000000-0000-0000-0000-000000000000")).status, 404)
  assert.equal((await call("GET", "/api/photos/bad")).status, 404)
})

test("reviews: public list/read, admin upload + delete, auth and type checks", async () => {
  const { call } = await setup()
  const bytes = new Uint8Array([9, 8, 7])
  assert.deepEqual((await (await call("GET", "/api/reviews")).json()).reviews, [])
  assert.equal((await call("POST", "/api/reviews", { body: bytes, headers: { "content-type": "image/jpeg" } })).status, 401)
  assert.equal((await call("POST", "/api/reviews", { body: bytes, pw: PW, headers: { "content-type": "text/html" } })).status, 415)
  const up = await call("POST", "/api/reviews", { body: bytes, pw: PW, headers: { "content-type": "image/png" } })
  assert.equal(up.status, 200)
  const { id, url } = await up.json()
  assert.equal((await (await call("GET", "/api/reviews")).json()).reviews[0].url, url)
  const got = await call("GET", url)
  assert.equal(got.status, 200); assert.equal(got.headers.get("content-type"), "image/png")
  assert.equal((await call("DELETE", "/api/reviews/" + id)).status, 401)
  assert.equal((await call("DELETE", "/api/reviews/" + id, { pw: PW })).status, 200)
  assert.equal((await call("GET", url)).status, 404)
  assert.equal((await call("GET", "/api/reviews/bad")).status, 404)
})

const customer = { name: "Sarra B", email: "s@example.com", phone: "21612345678", address: "12 rue du Lac" }

test("orders are refused (503) until enabled", async () => {
  const { call } = await setup()
  assert.equal((await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 1 }] } })).status, 503)
})

test("orders: stock is taken, invoice number returned, stats counts, stock exhaustion = 409", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  const r = await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 2 }] } })
  assert.equal(r.status, 200)
  const d = await r.json(); assert.match(d.invoice, /^NOVA-\d{8}-\d{6}$/); assert.equal(d.emailSent, false) // no mail configured
  assert.equal(state.catalog.products[0].q, 1)
  assert.equal(state.orders[0].total, 12)                                     // price from the database
  // the home page panel gets brackets only: one 12 TND order shows as "10+" received, never 12
  const ach = await (await call("GET", "/api/achievements")).json()
  assert.deepEqual(ach.stats.map((x) => [x.k, x.n]), [["clients", 1], ["orders", 1], ["revenue", 10]])
  assert.equal((await call("GET", "/api/stats")).status, 404)                  // the exact order count is no longer public
  assert.equal((await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 5 }] } })).status, 409)
  assert.equal(state.catalog.products[0].q, 1)                                // untouched after refusal
})

test("orders: invalid customer / unknown product / empty cart are rejected", async () => {
  const { call } = await setup({ ordersEnabled: true })
  assert.equal((await call("POST", "/api/order", { body: { customer: { ...customer, email: "bad" }, items: [{ id: "p1", q: 1 }] } })).status, 400)
  assert.equal((await call("POST", "/api/order", { body: { customer, items: [{ id: "zzz", q: 1 }] } })).status, 400)
  assert.equal((await call("POST", "/api/order", { body: { customer, items: [] } })).status, 400)
})

test("the database connection is released after every request, and unknown routes give 404", async () => {
  const { call, state } = await setup()
  await call("GET", "/api/catalog"); await call("GET", "/api/achievements")
  assert.equal(state.closed, 2)
  assert.equal((await call("GET", "/api/nothing")).status, 404)
})

test("old price: kept only when higher than the price, shown in the public catalogue", async () => {
  const { call, state } = await setup()
  const body = { categories: [{ id: "c1", n: "A" }], products: [
    { id: "a", n: "Remise", p: 5, o: 8, q: 1 }, { id: "b", n: "Pas de remise", p: 5, o: 3, q: 1 } ] }
  assert.equal((await call("PUT", "/api/catalog", { body, pw: PW })).status, 200)
  assert.deepEqual(state.catalog.products.map((p) => p.o), [8, 0])
  assert.deepEqual((await (await call("GET", "/api/catalog")).json()).products.map((p) => p.o), [8, 0])
})

test("delivery fee: set by admin, public in the catalogue, added to the order total, PDF returned", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  assert.equal((await (await call("GET", "/api/catalog")).json()).delivery, 0)
  const body = { categories: [], products: [{ id: "p1", n: "T", p: 6, q: 3 }], delivery: 7.5 }
  assert.equal((await call("PUT", "/api/catalog", { body, pw: PW })).status, 200)
  assert.equal((await (await call("GET", "/api/catalog")).json()).delivery, 7.5)
  const r = await (await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 2 }] } })).json()
  assert.equal(r.total, 19.5); assert.equal(r.delivery, 7.5); assert.equal(state.orders[0].total, 19.5)
  assert.equal(atob(r.pdf).slice(0, 5), "%PDF-")
})

// ---------------------------------------------------------------------------------------------------------------
// New: stock safety, order history + saved invoices, anti-abuse, owner notification, dashboard
// ---------------------------------------------------------------------------------------------------------------
const order = (call, q = 1, over = {}) => call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q }], ...over } })

test("admin save keeps the orders placed meanwhile: only the stock DIFFERENCE is applied (q0)", async () => {
  const { call, state } = await setup({ ordersEnabled: true })            // stock 3
  const loaded = (await (await call("GET", "/api/catalog")).json()).products[0]   // the admin page loads: sees 3
  assert.equal((await order(call, 2)).status, 200)                        // a customer buys 2 -> stock 1
  // the admin (still seeing 3) adds 10 units: 13 - 3 = +10 applied on the LIVE stock 1 -> 11 (not 13)
  const body = { categories: [], products: [{ ...loaded, q: 13, q0: loaded.q }] }
  assert.equal((await call("PUT", "/api/catalog", { body, pw: PW })).status, 200)
  assert.equal(state.catalog.products[0].q, 11)
  // saving without touching the stock changes nothing, even though the page still shows an old value
  const same = { categories: [], products: [{ ...loaded, q: 3, q0: 3, n: "Renommé" }] }
  await call("PUT", "/api/catalog", { body: same, pw: PW })
  assert.equal(state.catalog.products[0].q, 11); assert.equal(state.catalog.products[0].n, "Renommé")
  // without q0 the stock is set to q; a new product starts at q; the stock never goes below 0
  await call("PUT", "/api/catalog", { body: { categories: [], products: [{ ...loaded, q: 4 }, { id: "n1", n: "New", q: 7, q0: 0 }] }, pw: PW })
  assert.deepEqual(state.catalog.products.map((p) => p.q), [4, 7])
  await call("PUT", "/api/catalog", { body: { categories: [], products: [{ ...loaded, q: 0, q0: 50 }] }, pw: PW })
  assert.equal(state.catalog.products[0].q, 0)
  assert.equal("q0" in state.catalog.products[0], false)                  // q0 is never stored nor published
})

test("order history: every order and its invoice PDF are saved; admin lists, downloads and marks them", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  const d = await (await order(call, 1)).json()
  assert.equal(state.orders[0].pdf.length > 100, true)                    // the invoice sent to the customer is stored
  assert.equal(atob(d.pdf).length, state.orders[0].pdf.length)            // ... and it is the very same file
  // admin only
  assert.equal((await call("GET", "/api/orders")).status, 401)
  assert.equal((await call("GET", `/api/orders/${d.invoice}/pdf`)).status, 401)
  const list = await (await call("GET", "/api/orders", { pw: PW })).json()
  assert.equal(list.total, 1); assert.equal(list.orders[0].no, d.invoice); assert.equal(list.orders[0].customer.name, "Sarra B")
  assert.equal(list.orders[0].status, "new"); assert.equal("pdf" in list.orders[0], false); assert.equal(list.tz, "Africa/Tunis")
  const pdf = await call("GET", `/api/orders/${d.invoice}/pdf`, { pw: PW })
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get("content-type"), "application/pdf")
  assert.equal(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5)), "%PDF-")
  assert.equal((await call("GET", "/api/orders/NOVA-20200101-0000/pdf", { pw: PW })).status, 404)
  assert.equal((await call("GET", "/api/orders/not-an-order/pdf", { pw: PW })).status, 404)
  // status
  assert.equal((await call("PATCH", `/api/orders/${d.invoice}`, { body: { status: "x" }, pw: PW })).status, 400)
  assert.equal((await call("PATCH", `/api/orders/${d.invoice}`, { body: { status: "done" }, pw: PW })).status, 200)
  assert.equal(state.orders[0].status, "done")
  assert.equal((await call("PATCH", "/api/orders/NOVA-20200101-0000", { body: { status: "done" }, pw: PW })).status, 404)
})

test("order history: orders saved before invoices were stored get an identical PDF rebuilt; paging works", async () => {
  const { call, state } = await setup()
  for (let i = 1; i <= 3; i++) state.orders.push({ no: "NOVA-2026010" + i + "-12345" + i, customer, lines: [{ id: "p1", n: "Porte-clés", p: 6, q: i }], delivery: 0, total: 6 * i, cur: "TND", at: `2026-01-0${i}T10:00:00.000Z`, emailSent: true, status: "done" })
  const page = await (await call("GET", "/api/orders?limit=2&offset=0", { pw: PW })).json()
  assert.deepEqual(page.orders.map((o) => o.no), ["NOVA-20260103-123453", "NOVA-20260102-123452"]); assert.equal(page.total, 3)
  assert.equal((await (await call("GET", "/api/orders?limit=2&offset=2", { pw: PW })).json()).orders.length, 1)
  const r = await call("GET", "/api/orders/NOVA-20260101-123451/pdf", { pw: PW })
  assert.equal(r.status, 200); assert.equal(new TextDecoder().decode((await r.arrayBuffer()).slice(0, 5)), "%PDF-")
})

test("anti-abuse: honeypot, per-e-mail limit and per-IP limit on orders", async () => {
  const bot = await setup({ ordersEnabled: true })
  assert.equal((await order(bot.call, 1, { website: "http://spam" })).status, 400); assert.equal(bot.state.orders.length, 0)
  const a = await setup({ ordersEnabled: true })          // same e-mail: the 4th order within an hour is refused
  for (let i = 0; i < 3; i++) assert.equal((await order(a.call, 1)).status, 200)
  const refused = await order(a.call, 1)
  assert.equal(refused.status, 429); assert.equal(a.state.orders.length, 3)
  const b = await setup({ ordersEnabled: true })          // different e-mails, same IP: the 7th order is refused
  const mk = (i) => b.call("POST", "/api/order", { body: { customer: { ...customer, email: `c${i}@example.com` }, items: [{ id: "p1", q: 1 }] } })
  b.state.catalog.products[0].q = 100
  for (let i = 0; i < 6; i++) assert.equal((await mk(i)).status, 200)
  assert.equal((await mk(7)).status, 429)
  // another IP is fine
  assert.equal((await b.call("POST", "/api/order", { body: { customer: { ...customer, email: "z@example.com" }, items: [{ id: "p1", q: 1 }] }, headers: { "cf-connecting-ip": "9.9.9.9" } })).status, 200)
  // absurd quantity
  const c = await setup({ ordersEnabled: true }); c.state.catalog.products[0].q = 1000
  assert.equal((await order(c.call, 500)).status, 400)
})

test("a taken invoice number is redrawn instead of failing the order", async () => {
  const state = freshState(); let tries = 0
  const repo = () => { const r = memoryRepo(state), real = r.placeOrder; r.placeOrder = async (o) => (tries++ < 2 ? { ok: false, dup: true } : real(o)); return r }
  const app = createApp({ repo, ordersEnabled: true, siteCurrency: async () => "TND" })
  const r = await app(new Request("http://x/api/order", { method: "POST", body: JSON.stringify({ customer, items: [{ id: "p1", q: 1 }] }) }))
  assert.equal(r.status, 200); assert.equal(tries, 3); assert.equal(state.orders.length, 1)
  tries = -100                                            // always duplicated: clean 503, stock untouched
  const r2 = await app(new Request("http://x/api/order", { method: "POST", body: JSON.stringify({ customer: { ...customer, email: "other@example.com" }, items: [{ id: "p1", q: 1 }] }) }))
  assert.equal(r2.status, 503); assert.equal(state.catalog.products[0].q, 2)
})

test("e-mails: invoice to the customer + short 'commande à préparer' notice to the owner (no invoice, no PDF); email_sent recorded", async () => {
  const sent = [], realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }) }
  try {
    const { call, state } = await setup({ ordersEnabled: true, mail: { apiKey: "k", from: "NOVA <f@x.com>", notify: "owner@x.com" } })
    const d = await (await order(call, 1)).json()
    assert.equal(d.emailSent, true); assert.equal(state.orders[0].emailSent, true)
    assert.deepEqual(sent.map((m) => m.body.to[0]), ["s@example.com", "owner@x.com"])
    assert.equal(sent[0].body.attachments[0].content, d.pdf)
    assert.equal(sent[1].body.subject, "Nouvelle commande à préparer")
    assert.match(sent[1].body.html, /commande à préparer/)
    assert.ok(sent[1].body.html.includes(d.invoice)); assert.ok(sent[1].body.html.includes(d.lines[0].n))      // order number + product
    assert.match(sent[1].body.html, /\d{2}\/\d{2}\/\d{4}<\/b> à <b>\d{2}:\d{2}/)                                  // date + time
    assert.match(sent[1].body.html, new RegExp("<b>" + d.lines[0].q + "</b>"))                                      // quantity
    assert.equal(sent[1].body.attachments, undefined)
    assert.doesNotMatch(sent[1].body.html, new RegExp("Sarra|s@example\\.com|21612345678|rue du Lac"))
  } finally { globalThis.fetch = realFetch }
})

test("dashboard: orders, revenue, customers, products and stock; admin only", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  state.catalog.products[0].q = 10
  await order(call, 2); await order(call, 1, { customer: { ...customer, name: "Autre", email: "o@example.com" } }); await order(call, 1)
  assert.equal((await call("GET", "/api/dashboard")).status, 401)
  const d = await (await call("GET", "/api/dashboard", { pw: PW })).json()
  assert.deepEqual([d.now.today.orders, d.now.today.revenue, d.now.today.items, d.now.today.customers], [3, 24, 4, 2])
  assert.equal(d.now.all.orders, 3); assert.equal(d.averageBasket, 8); assert.equal(d.returningCustomers, 1); assert.equal(d.toPrepare, 3)
  assert.equal(d.days.length, 30); assert.equal(d.months.length, 12); assert.equal(d.days.at(-1).date, d.today); assert.equal(d.days.at(-1).orders, 3)
  assert.equal(d.months.at(-1).newCustomers, 2)
  assert.deepEqual(d.topProducts[0], { id: "p1", n: "Porte-clés prénom", q: 4, revenue: 24 })
  assert.equal(d.topCustomers[0].email, "s@example.com"); assert.equal(d.topCustomers[0].spent, 18)
  assert.deepEqual([d.catalog.products, d.catalog.categories, d.catalog.bestSellers, d.catalog.stockUnits], [1, 1, 1, 6])
  assert.equal(d.cur, "TND")
})

test("buildDashboard: days and months follow the shop time zone, empty days are zero, new vs returning customers", () => {
  const o = (no, at, email, total, q = 1) => ({ no, at, customer: { name: email, email, phone: "1" }, lines: [{ id: "p1", n: "P", p: total, q }], delivery: 0, total, cur: "TND", emailSent: true, status: "done" })
  const orders = [   // newest first
    o("c", "2026-10-16T23:30:00Z", "a@x.com", 10),    // 00:30 on the 17th in Tunis (UTC+1)  -> counts for TODAY (17th)
    o("b", "2026-09-30T23:30:00Z", "b@x.com", 5, 2),  // 00:30 on 1 Oct in Tunis              -> October
    o("a", "2026-09-10T12:00:00Z", "a@x.com", 20),    // September, a@x.com's first order
  ]
  const d = buildDashboard(orders, { categories: [], products: [] }, new Date("2026-10-17T09:00:00Z"), "Africa/Tunis", "TND")
  assert.equal(d.today, "2026-10-17"); assert.equal(d.month, "2026-10")
  assert.deepEqual(d.now.today, { orders: 1, revenue: 10, items: 1, customers: 1 })
  assert.deepEqual(d.now.month, { orders: 2, revenue: 15, items: 3, customers: 2 })
  assert.equal(d.now.all.revenue, 35)
  const oct = d.months.at(-1), sep = d.months.at(-2), aug = d.months.at(-3)
  assert.deepEqual([oct.orders, oct.newCustomers, sep.orders, sep.newCustomers, aug.orders], [2, 1, 1, 1, 0])   // b is new in Oct; a was new in Sep, not Oct
  assert.equal(d.days.find((x) => x.date === "2026-10-01").orders, 1); assert.equal(d.days.find((x) => x.date === "2026-10-02").orders, 0)
  assert.equal(d.days[0].date, "2026-09-18"); assert.equal(d.months[0].month, "2025-11")
  assert.equal(d.returningCustomers, 1)
})

// ---------------------------------------------------------------------------------------------------------------
// Invoice PDF: logo + shop contacts (WhatsApp / Instagram / Facebook) in the PDF created at order time
// ---------------------------------------------------------------------------------------------------------------
import { readFile } from "node:fs/promises"
import { decodePngLogo } from "../src/core/pdf.ts"

test("the invoice PDF sent and saved at order time contains the logo and the shop contacts", async () => {
  const png = new Uint8Array(await readFile(new URL("../public/images/NOVA_3D_logo_invoice.png", import.meta.url)))
  const logo = await decodePngLogo(png)
  assert.ok(logo.width > 100 && logo.rgb.length === logo.width * logo.height * 3)
  const contacts = { phone: "21612345678", instagram: "https://www.instagram.com/nova3d/", facebook: "https://facebook.com/nova3d" }
  const { call, state } = await setup({ ordersEnabled: true, invoiceLogo: async () => logo, siteContacts: async () => contacts })
  const d = await (await order(call, 1)).json()
  const text = (b) => new TextDecoder("latin1").decode(b)
  const stored = text(state.orders[0].pdf)
  assert.match(stored, /\/Subtype \/Image/)                       // the logo is embedded
  assert.match(stored, /WhatsApp : \+21612345678/); assert.match(stored, /Instagram : instagram\.com\/nova3d/); assert.match(stored, /Facebook : facebook\.com\/nova3d/)
  assert.equal(Buffer.from(state.orders[0].pdf).toString("base64"), d.pdf)            // customer copy = saved copy
  assert.match(stored, /FlateDecode/); assert.ok(state.orders[0].pdf.length < 120_000)   // compressed: light enough to e-mail and to store
  // missing / empty contacts are simply skipped, a broken logo never blocks the order
  const b = await setup({ ordersEnabled: true, invoiceLogo: async () => { throw new Error("no logo") }, siteContacts: async () => ({ phone: "", instagram: "", facebook: "" }) })
  assert.equal((await order(b.call, 1)).status, 200)
  const t2 = text(b.state.orders[0].pdf); assert.doesNotMatch(t2, /Image|WhatsApp|Instagram|Facebook/); assert.match(t2, /NOVA 3D/)
})

// ---------------------------------------------------------------------------------------------------------------
// Saved PDFs cleanup + "all orders" PDF export
// ---------------------------------------------------------------------------------------------------------------
test("admin can see and delete saved invoice PDFs (orders are kept, invoices are rebuilt on demand)", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  state.catalog.products[0].q = 50
  const first = await (await order(call, 1)).json()
  // pretend this order is 40 days old and place a recent one
  state.orders[0].at = new Date(Date.now() - 40 * 864e5).toISOString()
  const recent = await (await order(call, 1, { customer: { ...customer, email: "r@example.com" } })).json()
  assert.equal((await call("GET", "/api/orders/pdfs")).status, 401)
  const st = await (await call("GET", "/api/orders/pdfs", { pw: PW })).json()
  assert.equal(st.count, 2); assert.ok(st.bytes > 1000)
  assert.equal((await call("DELETE", "/api/orders/pdfs?days=abc", { pw: PW })).status, 400)
  assert.equal((await call("DELETE", "/api/orders/pdfs?days=30", { pw: PW }).then((r) => r.json())).removed, 1)   // only the 40-day-old one
  assert.equal(state.orders[0].pdf, null); assert.ok(state.orders[1].pdf)
  assert.equal(state.orders.length, 2)                                                                           // orders are kept
  const rebuilt = await call("GET", `/api/orders/${first.invoice}/pdf`, { pw: PW })                              // ... and still downloadable
  assert.equal(rebuilt.status, 200); assert.equal(new TextDecoder().decode((await rebuilt.arrayBuffer()).slice(0, 5)), "%PDF-")
  assert.equal((await call("DELETE", "/api/orders/pdfs?days=0", { pw: PW }).then((r) => r.json())).removed, 1)   // 0 = everything
  assert.deepEqual(await (await call("GET", "/api/orders/pdfs", { pw: PW })).json(), { count: 0, bytes: 0 })
})

test("export: one PDF with every order, optional period, admin only", async () => {
  const { call, state } = await setup()
  for (let i = 1; i <= 70; i++) state.orders.push({ no: `NOVA-202601${String(i % 28 + 1).padStart(2, "0")}-${100000 + i}`, customer: { ...customer, name: "Client " + i }, lines: [{ id: "p1", n: "Porte-clés", p: 6, q: 1 + (i % 3) }], delivery: 7, total: 13 + 6 * (i % 3), cur: "TND", at: `2026-01-${String(i % 28 + 1).padStart(2, "0")}T12:00:00.000Z`, emailSent: true, status: i % 2 ? "new" : "done" })
  state.orders.push({ no: "NOVA-20261001-999999", customer, lines: [{ id: "p1", n: "Gros lot", p: 1200, q: 1 }], delivery: 0, total: 1200, cur: "TND", at: "2026-10-01T09:00:00.000Z", emailSent: true, status: "done" })
  assert.equal((await call("GET", "/api/orders/export.pdf")).status, 401)
  const all = await call("GET", "/api/orders/export.pdf", { pw: PW })
  assert.equal(all.status, 200); assert.equal(all.headers.get("content-type"), "application/pdf"); assert.match(all.headers.get("content-disposition"), /commandes-\d{4}-\d{2}-\d{2}\.pdf/)
  const txt = new TextDecoder("latin1").decode(await all.arrayBuffer())
  assert.equal(txt.slice(0, 5), "%PDF-"); assert.match(txt, /Toutes les commandes/); const n = Number(txt.match(/Page 1 \/ (\d+)/)[1]); assert.ok(n >= 3 && n <= 5); assert.match(txt, new RegExp(`Page ${n} / ${n}`))   // 71 orders = several pages
  assert.match(txt, /71/); assert.match(txt, /1 200,00 TND/); assert.doesNotMatch(txt, /\?00,00 TND/)                                  // no broken space character in amounts
  const oct = new TextDecoder("latin1").decode(await (await call("GET", "/api/orders/export.pdf?from=2026-10-01&to=2026-10-31", { pw: PW })).arrayBuffer())
  assert.match(oct, /Du 01\/10\/2026 au 31\/10\/2026/); assert.match(oct, /Gros lot/); assert.doesNotMatch(oct, /Client 1\)/); assert.match(oct, /Page 1 \/ 1/)
  const none = new TextDecoder("latin1").decode(await (await call("GET", "/api/orders/export.pdf?from=2030-01-01", { pw: PW })).arrayBuffer())
  assert.match(none, /Aucune commande/)
})

// ---------------------------------------------------------------------------------------------------------------
// Colour of the piece (optional per cart line)
// ---------------------------------------------------------------------------------------------------------------
import { colorName, cleanColor } from "../src/core/colors.ts"

test("colour helpers: validation and closest French name", () => {
  assert.equal(cleanColor("#D33322"), "#d33322"); assert.equal(cleanColor(" #00a6a6 "), "#00a6a6")
  for (const bad of ["red", "#fff", "#12345", "#gggggg", "", null, undefined, 5, "javascript:1"]) assert.equal(cleanColor(bad), undefined)
  assert.equal(colorName("#d33322"), "Rouge"); assert.equal(colorName("#fefefe"), "Blanc"); assert.equal(colorName("#0a0a0a"), "Noir")
  assert.equal(colorName("#e03020"), "Rouge"); assert.equal(colorName("#1f6fe5"), "Bleu")
})

test("order with a chosen colour: saved on the line, shown on the PDF / e-mail / history; no colour = identical to the photo", async () => {
  const sent = [], realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }) }
  try {
    const { call, state } = await setup({ ordersEnabled: true, mail: { apiKey: "k", from: "N <f@x.com>" } })
    state.catalog.products.push({ id: "p2", n: "Fidget", p: 12, q: 5, d: "", cat: "c1", best: false, sh: "spin", b: "#222222", ph: [] }); state.catalog.products[0].q = 5
    const r = await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 2, color: "#D33322" }, { id: "p2", q: 1 }, ] } })
    assert.equal(r.status, 200); const d = await r.json()
    assert.deepEqual(d.lines[0], { id: "p1", n: "Porte-clés prénom", p: 6, q: 2, c: "#d33322", cn: "Rouge" })
    assert.deepEqual(d.lines[1], { id: "p2", n: "Fidget", p: 12, q: 1 })
    const pdf = new TextDecoder("latin1").decode(state.orders[0].pdf)
    assert.match(pdf, /Couleur : Rouge \\\(#d33322\\\)/); assert.match(pdf, /Pièce identique/)   // (parentheses are escaped inside a PDF string)
    assert.match(sent[0].html, /Couleur : Rouge \(#d33322\)/); assert.match(sent[0].html, /identique à la photo/)
    assert.equal(state.orders[0].lines[0].c, "#d33322")
    const hist = await (await call("GET", "/api/orders", { pw: PW })).json()
    assert.equal(hist.orders[0].lines[0].cn, "Rouge")
    // a garbage colour never blocks the order: the line is simply "identical to the photo"
    const bad = await call("POST", "/api/order", { body: { customer: { ...customer, email: "b@example.com" }, items: [{ id: "p1", q: 1, color: "<script>" }] } })
    assert.equal(bad.status, 200); assert.equal("c" in (await bad.json()).lines[0], false)
    // the report lists the colour too
    const rep = new TextDecoder("latin1").decode(await (await call("GET", "/api/orders/export.pdf", { pw: PW })).arrayBuffer())
    assert.match(rep, /Rouge #d33322/)
  } finally { globalThis.fetch = realFetch }
})

test("orders: the same product sent twice is merged into one line, and the stock check covers both", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  // stock of p1 = 3: two separate lines of 2 must NOT be accepted (2 + 2 > 3), even though each line alone fits
  assert.equal((await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 2 }, { id: "p1", q: 2 }] } })).status, 409)
  assert.equal(state.catalog.products[0].q, 3); assert.equal(state.orders.length, 0)
  const r = await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 1 }, { id: "p1", q: 2 }] } })
  assert.equal(r.status, 200)
  const d = await r.json(); assert.equal(d.lines.length, 1); assert.equal(d.lines[0].q, 3); assert.equal(d.total, 18)
  assert.equal(state.catalog.products[0].q, 0)
})

test("orders: invoice date and number use the shop's local day, not the UTC day", async () => {
  // Pacific/Kiritimati is UTC+14: its calendar day is (almost) always different from the UTC one for part of the day
  const tz = "Pacific/Kiritimati"
  const { call } = await setup({ ordersEnabled: true, timezone: tz })
  const d = await (await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 1 }] } })).json()
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  assert.equal(d.invoice.slice(5, 13), local.replace(/-/g, ""))
  assert.equal(d.date, local.split("-").reverse().join("/"))
})

test("anti-spam: refused orders (no stock) do not count; the public catalogue is cached 10 s, ?fresh=1 is not", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  for (let i = 0; i < 5; i++) assert.equal((await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 50 }] } })).status, 409)
  assert.equal((await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 1 }] } })).status, 200)   // still allowed
  assert.match((await call("GET", "/api/catalog")).headers.get("cache-control"), /max-age=10/)
  assert.equal((await call("GET", "/api/catalog?fresh=1")).headers.get("cache-control"), "no-store")
})

const JPG = Uint8Array.from(atob("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAeACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDPooorhPqAooooAKKKKACiiigAooooAKKKKAP/2Q=="), (c) => c.charCodeAt(0))     // a real 40x30 JPEG

test("feedback: 1-5 stars, anonymous or named, validation, no links, 3 per hour, admin-only delete", async () => {
  const { call } = await setup()
  const post = (b) => call("POST", "/api/feedback", { body: b })
  assert.equal((await post({ comment: "ok" })).status, 400)                         // stars required
  assert.equal((await post({ stars: 6 })).status, 400)
  assert.equal((await post({ stars: 0 })).status, 400)
  assert.equal((await post({ stars: 5, comment: "voir http://spam.example" })).status, 400)
  assert.equal((await post({ stars: 5, name: "Sami", comment: "Très bien !" })).status, 200)
  assert.equal((await post({ stars: 2 })).status, 200)                              // anonymous, no comment
  assert.equal((await post({ stars: 4, website: "bot" })).status, 200)             // honeypot: looks fine, but is NOT saved
  const d = await (await call("GET", "/api/feedback")).json()
  assert.equal(d.count, 2); assert.equal(d.avg, 3.5)
  assert.equal(d.items[0].stars, 2); assert.equal(d.items[0].name, null); assert.equal(d.items[1].name, "Sami")
  assert.equal((await post({ stars: 3 })).status, 200)
  assert.equal((await post({ stars: 3 })).status, 429)                              // 4th in the hour
  assert.equal((await call("DELETE", "/api/feedback/" + d.items[0].id)).status, 401)
  assert.equal((await call("DELETE", "/api/feedback/" + d.items[0].id, { pw: PW })).status, 200)
  assert.equal((await (await call("GET", "/api/feedback")).json()).count, 2)
})

test("invoice: no product picture is embedded, even when the product has a photo", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  const up = await (await call("POST", "/api/photos", { body: JPG, pw: PW, headers: { "content-type": "image/jpeg" } })).json()
  const id = up.url.split("/").pop()
  const cat = await (await call("GET", "/api/catalog")).json(); cat.products[0].ph = [up.url]
  assert.equal((await call("PUT", "/api/catalog", { body: cat, pw: PW })).status, 200)
  // the old thumbnail route is gone: it must not store the file as a new photo either
  assert.equal((await call("POST", "/api/photos/" + id + "/thumb", { body: JPG, pw: PW, headers: { "content-type": "image/jpeg" } })).status, 404)
  assert.equal(state.photos.size, 1)
  assert.equal((await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 1 }] } })).status, 200)
  const pdf = Buffer.from(state.orders[0].pdf).toString("latin1")
  assert.doesNotMatch(pdf, /DCTDecode/); assert.doesNotMatch(pdf, /\/Subtype \/Image \/Width 40/)
})

test("success panel: figures are brackets (99+), texts are editable in the admin and cleaned", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  // nothing ordered yet: no figure at all, the default texts are shown
  let a = await (await call("GET", "/api/achievements")).json()
  assert.deepEqual(a.stats, []); assert.equal(a.on, true); assert.ok(a.title && a.cards.length >= 1)
  // 37 orders by 30 different customers, 12 TND each = 444 TND: shown as 25+ / 25+ / 250+
  const mk = (i) => ({ no: "N" + i, customer: { name: "c" + (i % 30), email: "c" + (i % 30) + "@x.tn", phone: "20123456" }, lines: [], total: 12, cur: "TND", at: new Date().toISOString(), status: "new", delivery: 0 })
  for (let i = 0; i < 37; i++) state.orders.push(mk(i))
  a = await (await call("GET", "/api/achievements?fresh=1")).json()
  assert.deepEqual(a.stats.map((x) => x.n), [25, 25, 250])
  // only the admin can change the texts; the saved data is trimmed and limited
  assert.equal((await call("PUT", "/api/achievements", { body: { on: false, title: "x", sub: "", cards: [] } })).status, 401)
  const cards = Array.from({ length: 12 }, (_, i) => ({ t: "  Carte " + i + " ", d: "d" }))
  const r = await call("PUT", "/api/achievements", { body: { on: false, title: "  Mes réussites  ", sub: "s", cards: [...cards, { t: "", d: "" }] }, pw: PW })
  assert.equal(r.status, 200)
  a = await (await call("GET", "/api/achievements?fresh=1")).json()
  assert.equal(a.on, false); assert.equal(a.title, "Mes réussites"); assert.equal(a.cards.length, 8); assert.equal(a.cards[0].t, "Carte 0")
  assert.equal((await call("PUT", "/api/achievements", { body: "nope", pw: PW })).status, 400)
})

// ---- order confirmation e-mail + re-send
test("admin can re-send the confirmation e-mail of an order whose e-mail failed", async () => {
  const realFetch = globalThis.fetch, sent = []
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{"message":"domain not verified"}', { status: 403 }) }
  try {
    const { call, state } = await setup({ ordersEnabled: true, mail: { apiKey: "k", from: "N <f@x.com>" } })
    const d = await (await order(call, 1)).json()
    assert.equal(d.emailSent, false); assert.equal(state.orders[0].emailSent, false)          // provider refused: the order is kept
    assert.equal((await call("POST", `/api/orders/${d.invoice}/email`)).status, 401)
    assert.equal((await call("POST", `/api/orders/${d.invoice}/email`, { pw: PW })).status, 502)  // still refused
    globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }) }
    assert.equal((await call("POST", `/api/orders/${d.invoice}/email`, { pw: PW })).status, 200)
    assert.equal(state.orders[0].emailSent, true); assert.equal(sent.at(-1).to[0], "s@example.com"); assert.equal(sent.at(-1).attachments[0].filename, `facture-${d.invoice}.pdf`)
    assert.equal((await call("POST", "/api/orders/NOVA-20260101-123456/email", { pw: PW })).status, 404)
  } finally { globalThis.fetch = realFetch }
  const none = await setup({ ordersEnabled: true }); const d2 = await (await order(none.call, 1)).json()
  assert.equal((await none.call("POST", `/api/orders/${d2.invoice}/email`, { pw: PW })).status, 503)   // no mail configured
})

// ---- e-mail providers (Brevo, Gmail script)
test("e-mail: Brevo is called with its own format (api-key, sender, attachment), content shows the invoice", async () => {
  const sent = [], realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) }); return new Response("{}", { status: 201 }) }
  try {
    const { call, state } = await setup({ ordersEnabled: true, mail: { provider: "brevo", apiKey: "bk", from: "NOVA 3D <contact@x.com>", notify: "owner@x.com" } })
    const d = await (await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 1 }] } })).json()
    assert.equal(d.emailSent, true); assert.equal(state.orders[0].emailSent, true)
    assert.equal(sent[0].url, "https://api.brevo.com/v3/smtp/email"); assert.equal(sent[0].headers["api-key"], "bk")
    assert.deepEqual(sent[0].body.sender, { name: "NOVA 3D", email: "contact@x.com" })
    assert.equal(sent[0].body.to[0].email, "s@example.com"); assert.equal(sent[0].body.attachment[0].content, d.pdf)
    assert.match(sent[0].body.htmlContent, /Bonjour Sarra B/); assert.match(sent[0].body.htmlContent, /Total : /)
    assert.equal(sent[1].body.to[0].email, "owner@x.com")
  } finally { globalThis.fetch = realFetch }
})


test("e-mail: Gmail script is called with the secret, the PDF and the sender name; a refusal means 'Non envoyée'", async () => {
  const sent = [], realFetch = globalThis.fetch; let ok = true
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return new Response(JSON.stringify(ok ? { ok: true } : { ok: false, error: "secret" }), { status: 200 }) }
  try {
    const { call, state } = await setup({ ordersEnabled: true, mail: { provider: "gmail", url: "https://script.google.com/macros/s/X/exec", apiKey: "sec", from: "NOVA 3D" } })
    const d = await (await call("POST", "/api/order", { body: { customer, items: [{ id: "p1", q: 1 }] } })).json()
    assert.equal(d.emailSent, true); assert.equal(sent[0].url, "https://script.google.com/macros/s/X/exec")
    assert.equal(sent[0].body.secret, "sec"); assert.equal(sent[0].body.to, "s@example.com"); assert.equal(sent[0].body.fromName, "NOVA 3D")
    assert.equal(sent[0].body.attachment.content, d.pdf); assert.match(sent[0].body.attachment.name, /^facture-NOVA-/)
    ok = false
    const d2 = await (await call("POST", "/api/order", { body: { customer: { ...customer, email: "b@example.com" }, items: [{ id: "p1", q: 1 }] } })).json()
    assert.equal(d2.ok, true); assert.equal(d2.emailSent, false); assert.equal(state.orders[1].emailSent, false)
  } finally { globalThis.fetch = realFetch }
})


// ---- "sur mesure" requests + order tracking -------------------------------------------------------------------
test("custom request: saved, validated, rate limited; admin lists, changes the status and deletes", async () => {
  const { call, state } = await setup()
  assert.equal((await call("POST", "/api/custom", { body: { description: "  " } })).status, 400)
  assert.equal((await call("POST", "/api/custom", { body: { description: "voir https://x.com" } })).status, 400)
  assert.equal((await call("POST", "/api/custom", { body: { description: "bot", website: "x" } })).status, 200)
  assert.equal(state.custom.length, 0)                                    // honeypot: nothing saved
  const ok = await call("POST", "/api/custom", { body: { name: "Sami", phone: "20123456", description: "Support téléphone chat", color: "Noir", budget: "30" } })
  assert.equal(ok.status, 200); assert.equal(state.custom.length, 1)
  assert.equal((await call("GET", "/api/custom")).status, 401)
  const list = await (await call("GET", "/api/custom", { pw: PW })).json()
  assert.equal(list.requests[0].description, "Support téléphone chat"); assert.equal(list.requests[0].status, "new")
  const id = list.requests[0].id
  assert.equal((await call("PATCH", "/api/custom/" + id, { pw: PW, body: { status: "oops" } })).status, 400)
  assert.equal((await call("PATCH", "/api/custom/" + id, { pw: PW, body: { status: "quoted" } })).status, 200)
  assert.equal(state.custom[0].status, "quoted")
  assert.equal((await call("DELETE", "/api/custom/" + id, { pw: PW })).status, 200); assert.equal(state.custom.length, 0)
  for (let i = 0; i < 4; i++) await call("POST", "/api/custom", { body: { description: "x" + i } })
  assert.equal((await call("POST", "/api/custom", { body: { description: "de trop" } })).status, 429)   // 5 per hour
})

test("order tracking: needs invoice number + phone, returns only status and lines, wrong guesses are limited", async () => {
  const { call, state } = await setup()
  state.orders.push({ no: "NOVA-20261020-123456", customer: { name: "A", email: "a@b.c", phone: "+216 26 183 165", address: "secret" }, lines: [{ id: "p1", n: "Porte-clés", p: 6, q: 2 }], delivery: 7, total: 19, cur: "TND", at: "2026-10-20T10:00:00.000Z", emailSent: true, status: "new" })
  assert.equal((await call("POST", "/api/track", { body: { no: "bad", phone: "26183165" } })).status, 400)
  const r = await call("POST", "/api/track", { body: { no: "nova-20261020-123456", phone: "26 183 165" } })
  assert.equal(r.status, 200)
  const d = await r.json()
  assert.equal(d.status, "new"); assert.deepEqual(d.lines, [{ n: "Porte-clés", q: 2 }]); assert.equal(d.total, 19)
  assert.ok(!JSON.stringify(d).includes("secret") && !JSON.stringify(d).includes("a@b.c"))
  assert.equal((await call("POST", "/api/track", { body: { no: "NOVA-20261020-123456", phone: "99999999" } })).status, 404)
  assert.equal((await call("POST", "/api/track", { body: { no: "NOVA-20261020-999999", phone: "26183165" } })).status, 404)
  for (let i = 0; i < 8; i++) await call("POST", "/api/track", { body: { no: "NOVA-20261020-123456", phone: "9999999" + i } })
  assert.equal((await call("POST", "/api/track", { body: { no: "NOVA-20261020-123456", phone: "26183165" } })).status, 429)
})

// ---------------------------------------------------------------------------------------------------------------
// Promo codes: created by the admin with a percentage, checked in the cart, applied to the products only
// ---------------------------------------------------------------------------------------------------------------
test("promo codes: admin creates / changes / switches / deletes; every admin route needs the password", async () => {
  const { call } = await setup()
  assert.equal((await call("GET", "/api/promos")).status, 401)
  assert.equal((await call("POST", "/api/promos", { body: { code: "ete10", percent: 10 } })).status, 401)
  assert.equal((await call("POST", "/api/promos", { body: { code: "x", percent: 10 }, pw: PW })).status, 400)          // too short
  assert.equal((await call("POST", "/api/promos", { body: { code: "ETE 10", percent: 10 }, pw: PW })).status, 400)     // space
  assert.equal((await call("POST", "/api/promos", { body: { code: "ETE10", percent: 0 }, pw: PW })).status, 400)
  assert.equal((await call("POST", "/api/promos", { body: { code: "ETE10", percent: 101 }, pw: PW })).status, 400)
  const ok = await (await call("POST", "/api/promos", { body: { code: " ete10 ", percent: "10" }, pw: PW })).json()
  assert.deepEqual([ok.code, ok.percent], ["ETE10", 10])                                                              // upper-cased
  await call("POST", "/api/promos", { body: { code: "ETE10", percent: 15.5 }, pw: PW })                               // same code = new percentage
  let list = (await (await call("GET", "/api/promos", { pw: PW })).json()).promos
  assert.equal(list.length, 1); assert.equal(list[0].percent, 15.5); assert.equal(list[0].active, true)
  assert.equal((await call("PATCH", "/api/promos/ETE10", { body: { active: false }, pw: PW })).status, 200)
  assert.equal((await call("PATCH", "/api/promos/NOPE", { body: { active: false }, pw: PW })).status, 404)
  assert.equal((await call("PATCH", "/api/promos/ETE10", { body: { active: "no" }, pw: PW })).status, 400)
  list = (await (await call("GET", "/api/promos", { pw: PW })).json()).promos; assert.equal(list[0].active, false)
  assert.equal((await call("DELETE", "/api/promos/ETE10", { pw: PW })).status, 200)
  assert.equal((await call("DELETE", "/api/promos/ETE10", { pw: PW })).status, 404)
})

test("promo codes: public check accepts only active codes and is rate limited", async () => {
  const { call, state } = await setup()
  await call("POST", "/api/promos", { body: { code: "ETE10", percent: 10 }, pw: PW })
  const good = await call("POST", "/api/promo", { body: { code: "ete10" } })
  assert.equal(good.status, 200); assert.deepEqual(await good.json(), { ok: true, code: "ETE10", percent: 10 })
  assert.equal((await call("POST", "/api/promo", { body: { code: "WRONG" } })).status, 404)
  assert.equal((await call("POST", "/api/promo", { body: {} })).status, 404)
  state.promos.get("ETE10").active = false
  assert.equal((await call("POST", "/api/promo", { body: { code: "ETE10" } })).status, 404)                           // switched off
  assert.equal((await call("GET", "/api/promo")).status, 405)
  for (let i = 0; i < 20; i++) await call("POST", "/api/promo", { body: { code: "GUESS" + i } })
  assert.equal((await call("POST", "/api/promo", { body: { code: "ETE10" } })).status, 429)
})

test("orders with a promo code: % off the products only (delivery untouched), saved on the order, counted, shown on the invoice", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  await call("PUT", "/api/catalog", { body: { categories: [], products: [{ id: "p1", n: "T", p: 6, q: 10 }], delivery: 7 }, pw: PW })
  await call("POST", "/api/promos", { body: { code: "ETE10", percent: 10 }, pw: PW })
  const r = await (await order(call, 5, { promo: "ete10" })).json()
  assert.equal(r.discount, 3); assert.equal(r.promo, "ETE10")
  assert.equal(r.total, 34)                                   // 30 - 3 + 7 delivery
  assert.equal(state.orders[0].total, 34); assert.equal(state.orders[0].discount, 3); assert.equal(state.orders[0].promo, "ETE10")
  assert.equal(state.promos.get("ETE10").uses, 1)
  assert.equal(atob(r.pdf).slice(0, 5), "%PDF-")
  assert.match(atob(r.pdf), /Code promo ETE10/)
  // admin history keeps the code, and the rebuilt invoice is valid too
  const hist = await (await call("GET", "/api/orders", { pw: PW })).json()
  assert.equal(hist.orders[0].promo, "ETE10")
  state.orders[0].pdf = null
  const pdf = await call("GET", "/api/orders/" + r.invoice + "/pdf", { pw: PW })
  assert.equal(pdf.status, 200); assert.match(new TextDecoder("latin1").decode(await pdf.arrayBuffer()), /Code promo ETE10/)
})

test("orders with a promo code: unknown or switched-off code is refused and takes no stock; no code = no discount", async () => {
  const { call, state } = await setup({ ordersEnabled: true })
  await call("POST", "/api/promos", { body: { code: "ETE10", percent: 10 }, pw: PW })
  const bad = await order(call, 1, { promo: "NOPE" })
  assert.equal(bad.status, 400); assert.equal((await bad.json()).error, "promo_invalid")
  state.promos.get("ETE10").active = false
  assert.equal((await order(call, 1, { promo: "ETE10" })).status, 400)
  assert.equal(state.catalog.products[0].q, 3); assert.equal(state.orders.length, 0)
  const plain = await (await order(call, 1)).json()
  assert.equal(plain.total, 6); assert.equal(plain.discount, undefined); assert.equal(state.orders[0].promo, undefined)
})

test("orders with a 100 % promo code: products free, delivery still paid", async () => {
  const { call } = await setup({ ordersEnabled: true })
  await call("PUT", "/api/catalog", { body: { categories: [], products: [{ id: "p1", n: "T", p: 6, q: 3 }], delivery: 7 }, pw: PW })
  await call("POST", "/api/promos", { body: { code: "FREE", percent: 100 }, pw: PW })
  const r = await (await order(call, 1, { promo: "FREE" })).json()
  assert.equal(r.discount, 6); assert.equal(r.total, 7)
})

test("push notification: ntfy + Telegram get the new order (no e-mail / phone / address), a failing channel never blocks the order", async () => {
  const sent = [], realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), init }); return new Response("{}", { status: String(url).includes("telegram") ? 500 : 200 }) }
  try {
    const { call, state } = await setup({ ordersEnabled: true, push: { ntfyTopic: "my-topic", telegramToken: "TOK", telegramChat: "42" } })
    const r = await order(call, 2); assert.equal(r.status, 200); const d = await r.json()
    assert.equal(state.orders.length, 1)
    const ntfy = sent.find((m) => m.url === "https://ntfy.sh/my-topic"), tg = sent.find((m) => m.url.includes("api.telegram.org/botTOK/"))
    assert.ok(ntfy && tg)
    assert.match(ntfy.init.body, new RegExp(d.invoice)); assert.match(ntfy.init.body, /Sarra/)
    assert.doesNotMatch(ntfy.init.body, /s@example\.com|21612345678|rue du Lac/)
    assert.equal(JSON.parse(tg.init.body).chat_id, "42")
  } finally { globalThis.fetch = realFetch }
  const { call } = await setup({ ordersEnabled: true })               // nothing configured: no call, order fine
  assert.equal((await order(call, 1)).status, 200)
})

// ---- "Bientôt disponible" page (stored in a key-value store, not in the database) ----
const fakeKv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v) } } }

test("coming soon: without a key-value store the page is off and cannot be saved", async () => {
  const { call } = await setup()
  const d = await (await call("GET", "/api/coming-soon")).json()
  assert.equal(d.available, false); assert.equal(d.on, false)
  assert.equal((await call("PUT", "/api/coming-soon", { body: { on: true }, pw: PW })).status, 501)
})

test("coming soon: ON by default, shop contacts as fallback, only the admin can save", async () => {
  const kv = fakeKv()
  const { call } = await setup({ settingsKv: kv, siteContacts: async () => ({ phone: "216 26-183-165", instagram: "https://www.instagram.com/nova_tn_3d" }) })
  const d = await (await call("GET", "/api/coming-soon")).json()
  assert.equal(d.available, true); assert.equal(d.on, true)
  assert.equal(d.whatsapp, "21626183165"); assert.equal(d.instagram, "https://www.instagram.com/nova_tn_3d")
  assert.match(d.titleFr, /Bientôt/); assert.ok(d.textAr.length > 10)
  const body = { on: false, titleFr: " Ouverture  bientôt ", textFr: "Texte", titleAr: "", textAr: "", instagram: "@nova.3d", whatsapp: "+216 22 333 444" }
  assert.equal((await call("PUT", "/api/coming-soon", { body })).status, 401)          // no password
  assert.equal(kv.m.size, 0)
  const r = await call("PUT", "/api/coming-soon", { body, pw: PW }); assert.equal(r.status, 200)
  const s = await (await call("GET", "/api/coming-soon?fresh=1")).json()
  assert.equal(s.on, false); assert.equal(s.titleFr, "Ouverture bientôt")
  assert.equal(s.instagram, "https://www.instagram.com/nova.3d"); assert.equal(s.whatsapp, "21622333444")
  assert.match(s.titleAr, /قريب/)                                                      // an empty title falls back to the default
})

test("coming soon: bad data is refused (400, field named); an empty contact falls back to the shop contact", async () => {
  const kv = fakeKv()
  const { call } = await setup({ settingsKv: kv, siteContacts: async () => ({ phone: "21626183165" }) })
  const ok = { on: true, titleFr: "a", textFr: "b", titleAr: "c", textAr: "d", instagram: "", whatsapp: "" }
  for (const [bad, field] of [[{ ...ok, instagram: "https://evil.example/x" }, "instagram"], [{ ...ok, instagram: "javascript:alert(1)" }, "instagram"],
    [{ ...ok, whatsapp: "12ab" }, "whatsapp"], [{ ...ok, on: "yes" }, "on"]]) {
    const r = await call("PUT", "/api/coming-soon", { body: bad, pw: PW }); assert.equal(r.status, 400); assert.equal((await r.json()).field, field)
  }
  assert.equal((await call("PUT", "/api/coming-soon", { body: ok, pw: PW })).status, 200)
  const d = await (await call("GET", "/api/coming-soon")).json()
  assert.equal(d.whatsapp, "21626183165"); assert.equal(d.instagram, "")
})
