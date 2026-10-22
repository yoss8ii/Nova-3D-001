# NOVA 3D – Developer guide (Cloudflare + Postgres version)

Every source file is also commented inline. Search for `>>>` for the places you are most likely to edit.

## 1. Big picture

```
Browser ──► Cloudflare ──► public/*  (static site, served directly)
                    └────► /api/*  ──► src/worker.ts ──► src/app.ts ──► src/core/* ──► Repo (src/repo/types.ts)
                                                                                         └─ postgres.ts ──► Hyperdrive ──► your Postgres
```

Three layers, each knowing only the one below:

| Layer | Files | Knows about |
|---|---|---|
| **Adapter** (platform) | `src/worker.ts` | Cloudflare bindings (`env.HYPERDRIVE`, secrets, `ctx.waitUntil`) |
| **API + logic** | `src/app.ts`, `src/core/*` | web standards only (`Request`, `Response`, `fetch`, `crypto`) |
| **Database** | `src/repo/*` | SQL / the database driver |

This is what makes the backend portable: change the platform by rewriting only `worker.ts`; change the database by
adding one file that implements `Repo`.

The cart is **not** on the server: it lives in the visitor's browser (`localStorage` key `n3d_cart`).

## 2. File map

| File | Role |
|---|---|
| `public/index.html`, `produits/`, `panier/`, `sur-mesure/`, `a-propos/` | The public pages (each has SEO tags in `<head>`) |
| `public/gestion-nova-k7q2x9/index.html` | Admin page (own inline script and styles) |
| `public/js/*.js` | Public pages, one file per job. Plain scripts sharing globals: keep the order. Every page loads `core` (state, helpers, cart + favourites storage), `ui` (HTML builders, header/footer, notifications, cart bar, popup), `data` (site.json + catalogue), then ITS OWN script(s), then `events` (clicks, tilt, mobile menu) and `main` (start-up): home = `home` + `reviews` + `feedback` (+ `printer-anim` at the end), products = `shop`, cart = `cart`, custom = `custom`, product page = `product`, tracking = `track`, about = none |
| `public/js/theme.js` | Loaded in `<head>` (no `defer`): applies the saved light / dark choice before the page is drawn; `toggleTheme()` is called by the header button |
| `public/js/admin-ui.js`, `admin.js`, `admin-reviews.js`, `admin-orders.js`, `admin-dash.js`, `admin-custom.js` | Admin page: toasts/helpers, catalogue editor, review screenshots, orders (+ CSV export), dashboard, "Sur mesure" requests |
| `public/css/admin.css` | Styles used only by the admin page |
| `public/js/printer-anim.js` | Home page: the 3D printer animation, fixed behind the page |
| `public/sw.js`, `public/manifest.webmanifest` | PWA: installable site; the service worker is network-first (never serves an old version when online) and ignores `/api/*` and the admin |
| `public/css/styles.css` | The only stylesheet |
| `public/data/site.json` | WhatsApp number, currency, Facebook, Instagram, orders counter base |
| `public/robots.txt`, `sitemap.xml` | For Google (domain set by `npm run seo`) |
| `public/_headers` | HTTP headers (admin: no cache, noindex) |
| `src/worker.ts` | Cloudflare adapter: builds the dependencies and calls the app |
| `src/app.ts` | Routes `/api/*`, error handling, closes the DB connection after each request |
| `src/core/auth.ts` | Admin password (salted PBKDF2, factory-password rule, login attempt limit) |
| `src/core/report-pdf.ts` | "Historique des commandes" PDF (all orders, several pages) |
| `src/core/stats.ts` | Dashboard numbers (pure functions, per day / month in the shop time zone) |
| `src/core/catalog.ts` | Validation (`clean`) and public format (`toPublic`) of the catalogue |
| `src/core/order.ts` | Order flow + invoice HTML |
| `src/core/mail.ts` | E-mail sending (Resend by default; rewrite for another provider) |
| `src/repo/types.ts` | **The database contract** (`Repo` interface + data types) |
| `src/repo/postgres.ts` | `Repo` implemented with the `pg` driver |
| `migrations/*.sql` | Tables, applied by `npm run migrate` |
| `scripts/migrate.mjs`, `set-domain.mjs` | Migration runner / writes your domain into the SEO files |
| `test/` | `api.test.mjs` + `memory-repo.mjs` (an in-memory Repo, so tests need no database) |
| `wrangler.jsonc` | Cloudflare configuration (assets, Hyperdrive, variables) |
| `seo.config.json` | Remembers the domain currently written in the SEO files |

## 3. API

| Route | Method | Who | What |
|---|---|---|---|
| `/api/catalog` | GET | public | Catalogue JSON (cached 10 s; `?fresh=1` = no cache, used by the admin page) |
| `/api/catalog` | POST | admin | `{}` = login check (`mustChange: true` while the factory password is used), `{newPassword}` = change password (8+ characters) |
| `/api/orders?limit=&offset=` | GET | admin | order history (newest first) |
| `/api/orders/:no/pdf` | GET | admin | the saved invoice PDF (rebuilt for orders older than the migration 005) |
| `/api/orders/:no` | PATCH | admin | `{status: "new"\|"done"}` |
| `/api/dashboard` | GET | admin | dashboard data |
| `/api/orders/pdfs` | GET / DELETE | admin | count + size of the saved invoice PDFs / `?days=N` deletes the ones older than N days (0 = all) |
| `/api/orders/export.pdf?from=&to=` | GET | admin | one PDF with all the orders (`src/core/report-pdf.ts`) |
| `/api/catalog` | PUT | admin | Save the whole catalogue `{categories, products}` |
| `/api/photos` | POST | admin | Upload an image (jpeg/png/webp, max 3 MB) → `{url}` |
| `/api/photos/:id` | GET | public | The image (cached for 1 year) |
| `/api/order` | POST | public | Place an order (503 while disabled) |
| `/api/achievements` | GET | public | success panel: texts + 3 real figures as brackets (`n` = 99, 250…), never exact |
| `/api/achievements` | PUT | admin | `{on, title, sub, cards: [{t, d}]}` texts of the success panel (settings key `achievements`) |
| `/api/custom` | POST | public | saves a \"sur mesure\" request `{name?, phone?, description, color?, budget?}` (honeypot `website`, 5 per hour per IP) |
| `/api/custom` | GET | admin | the saved requests, newest first |
| `/api/custom/:id` | PATCH / DELETE | admin | `{status: \"new\" \| \"quoted\" \| \"done\"}` / delete |
| `/api/track` | POST | public | `{no, phone}` -> status + lines + total of the order (phone compared on its last 8 digits; 10 wrong guesses per 10 min per IP) |
| `/api/feedback` | GET / POST | public | service ratings: `{count, avg, items}` / send `{name?, stars: 1-5, comment?}` (3 per hour per IP, no links) |
| `/api/feedback/:id` | DELETE | admin | delete a rating (admin page, Réglages > Notes et commentaires) |

"Admin" = header `x-admin-password` (URL-encoded, so any character is allowed).

## 4. Data model

Short names are used between server and browser:

| Product field | Meaning | Column |
|---|---|---|
| `id` | unique id | `id` |
| `n` / `p` / `q` / `d` | name / price / stock / description | `name`, `price`, `quantity`, `description` |
| `cat` | category id | `category_id` |
| `best` | best seller (1/0) | `best` |
| `sh` | 3D shape: `key heart badge hex spin dragon cube ball` | `shape` |
| `b` | colour `#rrggbb` | `color` |
| `o` | old price, struck through when higher than `p` (0 = no discount) | `old_price` |
| `ph` | photo URLs `/api/photos/<uuid>` (ids inside the `Repo`) | table `photos` |

Other tables: `categories`, `settings` (key/value, holds the password hash), `orders` (one row per order, with its invoice PDF `invoice_pdf`, `email_sent` and `status`), `rate_limits` (anti-abuse counters: login attempts, orders per IP / e-mail).

## 5. Admin password

Order checked (`src/core/auth.ts`): `ADMIN_PASSWORD` secret → hash saved in `settings` → default `admin`.
**Change the default right after deploying.** The hash lives in Postgres, so a change is effective immediately.

## 6. Common tasks

| I want to… | Do this |
|---|---|
| Add the developer brand + logo in the footer | `dev` in `public/data/site.json` (`brand`, `logo` e.g. `/images/brand.png`) |
| Change the delivery fee | admin page, "Livraison" section (stored in `settings`, key `delivery`) |
| Change the invoice PDF layout | `src/core/pdf.ts` |
| Change WhatsApp / social links / currency | `public/data/site.json`, deploy |
| Change page text | the page's HTML in `public/`, deploy |
| Change page title / Google description | the SEO block in the page `<head>` |
| Change colours / dark mode | variables at the top of `public/css/styles.css` |
| Change the menu | list `L` in `layout()` of `js/ui.js` |
| Add a page | copy a simple page folder, new `data-page`, add to `L` in `js/ui.js`, add a `<url>` to `sitemap.xml` |
| Add / change a promo code | admin page, tab « Codes promo » (API in `src/core/promo.ts`, table `promo_codes`, migration `010`) |
| Add a database column | new `migrations/006_*.sql`, then `types.ts`, `postgres.ts`, `catalog.ts`, and the admin form |
| Use another e-mail provider | rewrite the body of `sendInvoiceEmail()` in `src/core/mail.ts` |
| Use another database | new file implementing `Repo` (copy `test/memory-repo.mjs` as a starting skeleton), use it in `worker.ts` |
| Use another host | new adapter like `worker.ts` that builds `AppDeps` and calls `createApp(...)(request)` |
| Open online orders | see "Accept online orders" in `DEPLOY.md` |

## 7. Things to know

* **Never edit a migration that was already applied.** Add a new numbered file.
* **Hyperdrive caching must stay disabled** (stock and prices change in real time).
* **Tests**: `npm test` runs the whole API against an in-memory `Repo`. Add a test when you add a route.
  The SQL in `postgres.ts` is the one part not covered by the tests (it needs a real database).
* `site.json` and `package.json` cannot contain comments; their fields are described here.
* Photos are stored in the database (`BYTEA`). The admin page shrinks them to max 1000 px before upload.
  Photos not attached to a product within 1 hour are deleted at the next catalogue save.
  For many large photos, move them to object storage (e.g. Cloudflare R2) behind `getPhoto/addPhoto`.
* Prices and stock are re-read from the database when an order is placed; the browser's values are never trusted.
* The admin URL is secret by obscurity (plus the password): it is not in `robots.txt` or the sitemap.
* Unused legacy CSS rules (`.seg`, `.empty`, `#cart`, `#cl`, `.sum`) are marked in `styles.css`.


## 9. Stock and the admin page

Products sent by the admin page carry `q0` = the stock the page saw when it loaded. `saveCatalog()` applies only `q - q0` to the live stock (`GREATEST(0, quantity + q - q0)`), so orders placed meanwhile are kept. Without `q0` the stock is simply set to `q`. `q0` is never stored or published.


## 10. Product previews on invoices, ratings, best-sellers row

* **Invoices** carry no product pictures (the thumbnail feature was removed; `photos.thumb` is dropped by migration 007).
* **Ratings** (`feedback` table): public read/write, rate-limited, moderated by deletion in the admin page.
* **Best sellers** are a scroll-snap row (`.swipe` in `styles.css`), arrows only on computers. Empty / sold-out messages: `stockNotice()` in `js/ui.js`.
* Apply the new migration: `npm run migrate`.

## 11. Admin editing (Modifier / Enregistrer)

`public/js/admin.js`: nothing is saved while typing. `C`, `L`, `DV` hold what the database holds; "Modifier" copies a row into a draft (`ED`, key `p:<id>` / `c:<id>` / `dv`).
"Enregistrer" calls `commit(key, "save")`: `buildBody()` takes the database catalogue and replaces only that row, `PUT /api/catalog`, then `fetchCatalog()` redraws from the
database, and only then the tick and the toast appear. Saves run one after another (`CHAIN`). Photos are uploaded at once but attached when the row is saved.
Check before release: `npm run ci` (type check + tests).

## 12. Success panel (home page)

Replaces the old "commandes réalisées" counter (`ordersBase` and `/api/stats` no longer exist). `src/core/achievements.ts` turns the real totals
(`repo.orderTotals()`: distinct customers, orders, revenue) into brackets with `tier()` (37 -> 25+, 120 -> 99+): the exact numbers never leave the server.
The texts (title shown big 3 times, tagline, up to 8 highlights) are saved in the settings table (key `achievements`) from Réglages > Panneau de réussites (zone key `ach` in `admin.js`).
Home side: `drawAchievements()` in `public/js/home.js`; the section stays hidden when switched off or empty.

## Storefront additions (UI / features)
* **Success panel animation**: `ring()` in `js/home.js` builds 28 `<i>` discs; `.ring` in `styles.css` (section 16b) places them with CSS 3D (`--i`, `--n`, `--ring-t`). Size = `font-size` of `.ach-obj` (everything is in `em`); colour = the site green `--ach-acc`.
* **Product page** `/produit/?id=<id>` (`js/product.js`): own title / description / share tags / JSON-LD, related products. The quick view links to it.
* **Favourites** (heart, `localStorage n3d_favs`, chip "Favoris" on the products page), **"Promos" chip**, **sort menu** (`SORTS` in `js/shop.js`), skeleton cards while loading.
* **Cart feedback**: `notify()` toast and the sticky `#cbar` bar on phones (`cartBar()` in `js/ui.js`). Sold-out products show "Me prévenir" (WhatsApp message prefilled).
* **Custom orders** are saved (`custom_requests`, migration 009) and still opened in WhatsApp; admin tab "Sur mesure".
* **Order tracking** `/suivi/` (`js/track.js`, `src/core/track.ts`): invoice number + phone; status = the admin order status (`new` = en préparation, `done` = traitée).
* **Theme**: header button, saved in `localStorage n3d_theme`; **PWA**: `manifest.webmanifest`, `sw.js`, icons `images/icon-*.png`; **FAQ** on the About page (edit the `<details>` blocks and the JSON-LD in `a-propos/index.html`).
* Apply the new migration: `npm run migrate` (009).
