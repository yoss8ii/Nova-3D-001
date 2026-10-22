/**
 * src/repo/types.ts - THE DATABASE CONTRACT
 *
 * The whole application (src/core/*, src/app.ts) talks to the database ONLY through the
 * `Repo` interface below. It never writes SQL and never imports a database driver.
 *
 * To use another database (MySQL, SQLite/D1, MongoDB, Firestore, ...): write a new file in
 * src/repo/ that implements `Repo`, and choose it in src/worker.ts. Nothing else changes.
 * The default implementation is src/repo/postgres.ts (any Postgres: Supabase, Neon, RDS...).
 */

// A category as stored: id + name (n)
export interface Category { id: string; n: string }

// A product as stored. Short field names are used end to end (see DEVELOPER-GUIDE.md):
//   n name, p price (current), o old price (struck through when o > p, 0 = no discount), q quantity in stock, d description, cat category id (or null),
//   best best-seller flag, sh 3D shape, b colour #rrggbb, ph photo ids (UUIDs)
//   q0 (only sent by the admin page when saving): the stock the admin SAW when the page was loaded. saveCatalog() then
//      applies the DIFFERENCE (q - q0) to the live stock, so orders placed in the meantime are never overwritten.
export interface Product {
  id: string; n: string; p: number; o: number; q: number; d: string
  cat: string | null; best: boolean; sh: string; b: string; ph: string[]; q0?: number
}

export interface Catalog { categories: Category[]; products: Product[] }

// One line of an order. Name and price are the TRUSTED values read from the database.
// c / cn = colour chosen by the customer for this line (hex + closest French colour name); absent = identical to the photo.
export interface OrderLine { id: string; n: string; p: number; q: number; c?: string; cn?: string }

export interface Feedback { id: string; name: string | null; stars: number; comment: string; at: string }

// A "sur mesure" request sent from the public form (status: new -> quoted -> done)
export type CustomStatus = "new" | "quoted" | "done"
export interface CustomRequest { id: string; name: string; phone: string; description: string; color: string; budget: string; status: CustomStatus; at: string }

// A promo code created by the admin: percent = % taken off the products subtotal, uses = orders that used it
export interface PromoCode { code: string; percent: number; active: boolean; uses: number; at: string }

export interface Customer { name: string; email: string; phone: string; address: string }

// An order to record. `pdf` = the invoice PDF sent to the customer (kept so the admin can download it again).
export interface OrderRecord { no: string; customer: Customer; lines: OrderLine[]; delivery: number; total: number; cur: string; pdf?: Uint8Array; promo?: string; discount?: number }

// An order as shown in the admin history / dashboard (no PDF bytes). at = ISO date, status = "new" (to prepare) | "done".
export type OrderStatus = "new" | "done"
export interface OrderSummary {
  no: string; customer: Customer; lines: OrderLine[]; delivery: number; total: number; cur: string
  at: string; emailSent: boolean; status: OrderStatus
  promo?: string; discount?: number          // promo code used and the amount it took off (absent = none)
}
export interface OrderFull extends OrderSummary { pdf: Uint8Array | null }

// Result of placeOrder(): ok, or the name of the first product without enough stock, or dup = invoice number already used (retry with a new one)
export type PlaceOrderResult = { ok: true } | { ok: false; name?: string; dup?: boolean }

export interface Repo {
  // Whole catalogue (products carry their photo ids, in display order)
  readCatalog(): Promise<Catalog>
  // Replace the whole catalogue in ONE transaction (all or nothing). Input is already validated.
  saveCatalog(c: Catalog): Promise<void>
  // Small key/value settings (used for the admin password hash, key "pwhash")
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  // ATOMIC: take the stock of every line AND record the order, or do nothing at all.
  placeOrder(o: OrderRecord): Promise<PlaceOrderResult>
  // Number of recorded orders (home page counter)
  countOrders(): Promise<number>
  // Real figures for the home page success panel (customers = distinct e-mail, else phone, else name; revenue = sum of order totals)
  orderTotals(): Promise<{ orders: number; customers: number; revenue: number }>
  // Order history (admin): newest first, one page at a time, plus the total number of orders
  listOrders(limit: number, offset: number): Promise<{ orders: OrderSummary[]; total: number }>
  // Every order (newest first, capped) without PDF: feeds the dashboard
  listAllOrders(cap: number): Promise<OrderSummary[]>
  // One order with its saved invoice PDF (pdf = null for orders made before invoices were saved)
  getOrder(no: string): Promise<OrderFull | null>
  // Saved invoice PDFs: how many / how many bytes, and removal (olderThanDays = 0 -> every saved PDF). The orders themselves are kept;
  // a deleted PDF is simply rebuilt on demand from the order data. Returns the number of PDFs removed.
  pdfStats(): Promise<{ count: number; bytes: number }>
  clearInvoicePdfs(olderThanDays: number): Promise<number>
  setOrderEmailSent(no: string, sent: boolean): Promise<void>
  // false when the order does not exist
  setOrderStatus(no: string, status: OrderStatus): Promise<boolean>
  // Anti-abuse counters (login failures, orders per IP / e-mail). hit() adds 1 inside a window of windowSec seconds and
  // returns the new count + seconds before the window ends; peekHits() reads without adding; resetHits() clears.
  hit(key: string, windowSec: number): Promise<{ n: number; retry: number }>
  peekHits(key: string, windowSec: number): Promise<{ n: number; retry: number }>
  resetHits(key: string): Promise<void>
  // Photos
  getPhoto(id: string): Promise<{ type: string; data: Uint8Array } | null>
  addPhoto(type: string, data: Uint8Array): Promise<string> // returns the new photo id
  // Service feedback (stars + optional name / comment), newest first
  addFeedback(f: { name: string | null; stars: number; comment: string }): Promise<string>
  listFeedback(limit: number): Promise<Feedback[]>
  feedbackSummary(): Promise<{ count: number; avg: number }>
  deleteFeedback(id: string): Promise<boolean>
  // Custom-order requests (admin tab "Sur mesure"), newest first
  addCustom(r: Pick<CustomRequest, "name" | "phone" | "description" | "color" | "budget">): Promise<string>
  listCustom(limit: number): Promise<CustomRequest[]>
  setCustomStatus(id: string, status: CustomStatus): Promise<boolean>   // false when the request does not exist
  deleteCustom(id: string): Promise<boolean>
  // Review screenshots (home page cards). Ids come back in display order.
  listReviews(): Promise<string[]>
  getReview(id: string): Promise<{ type: string; data: Uint8Array } | null>
  addReview(type: string, data: Uint8Array): Promise<string> // returns the new review id
  deleteReview(id: string): Promise<void>
  // Promo codes (admin tab "Codes promo"). Codes are stored upper-case. savePromo creates the code or changes its percentage (uses kept).
  getPromo(code: string): Promise<PromoCode | null>
  listPromos(): Promise<PromoCode[]>
  savePromo(code: string, percent: number): Promise<void>
  setPromoActive(code: string, active: boolean): Promise<boolean>   // false when the code does not exist
  deletePromo(code: string): Promise<boolean>
  // Release the connection. Always called once per request.
  close(): Promise<void>
}
