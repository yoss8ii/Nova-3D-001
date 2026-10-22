# Deploy NOVA 3D on Cloudflare, then get it on Google

Result: the website is served by Cloudflare (free), the API runs as a Cloudflare Worker, and the data lives in a
Postgres database of your choice (these steps use Supabase, any Postgres works).

You need: a computer with **Node.js 20+**, a free **Cloudflare** account, a free **Supabase** account
(or any Postgres), and ideally a **domain name**.

Do the steps in order. Every command is run in a terminal, inside the project folder.

---

## Part 1 – Install

```bash
npm install
npm test            # optional: automatic tests (26), no database needed, should all pass
```

## Part 2 – Create the database (Supabase)

1. On supabase.com create a **new project**. Save the database password.
2. Click **Connect** (top of the project page) and copy the **connection string** (format
   `postgres://postgres:[YOUR-PASSWORD]@host:5432/postgres`). Replace `[YOUR-PASSWORD]` with your password.
   If the password contains special characters (`@ : / # ?`), URL-encode them (`@` becomes `%40`).
   If your computer cannot connect with the direct string (direct connections can be IPv6-only), copy the
   **Session pooler** string from the same dialog instead.
3. Create the tables (also creates 2 categories and 1 sample product):

```bash
# macOS / Linux
DATABASE_URL="postgres://postgres:PASSWORD@HOST:5432/postgres" npm run migrate

# Windows PowerShell
$env:DATABASE_URL="postgres://postgres:PASSWORD@HOST:5432/postgres"; npm run migrate
```

You should see `Applying 001_init.sql` … `Applying 010_promo_codes.sql`, `Done: 10 migration(s) applied.` (010 adds the promo codes: **run `npm run migrate` before deploying this version**; the others are listed below) (009 adds the table of saved "sur mesure" requests: **run `npm run migrate` before deploying this version**; 005 adds the saved invoices, the order status and the anti-abuse counters: **run it before deploying this version**) (an existing database only gets the new files: run it again after each update).
Running it again is harmless: it only applies new files.

## Part 3 – Connect Cloudflare to the database

```bash
npx wrangler login                      # opens the browser, log in to Cloudflare
npx wrangler hyperdrive create nova-db --connection-string="postgres://postgres:PASSWORD@HOST:5432/postgres" --caching-disabled
```

* **Keep `--caching-disabled`.** Hyperdrive's cache is not cleared when data is written, so without it a customer
  could see an old price or stock for up to a minute after an order or an admin change.
* The command prints an **id**. Open `wrangler.jsonc` and replace `PASTE-YOUR-HYPERDRIVE-ID` with it.
* If you forgot the flag: `npx wrangler hyperdrive update <ID> --caching-disabled`.

Optional secrets (only if you want them):

```bash
npx wrangler secret put ADMIN_PASSWORD   # fixes the admin password; it can then NOT be changed from the admin page
```

## Part 4 – Set your address and deploy

Choose your final address first (Part 5 explains how to get a custom domain; you can also start with the free
`*.workers.dev` address and run this again later):

```bash
npm run seo -- https://nova.pieca.workers.dev/     # writes your address into canonical links, sitemap, robots.txt
npm run deploy
```

`npm run deploy` prints your site address, like `https://nova.<your-name>.workers.dev`. Open it: the home page
should show the sample product.

## Part 5 – Custom domain (recommended for Google)

1. Cloudflare dashboard → **Add a domain** (if your domain is bought elsewhere, change its nameservers to the two
   Cloudflare gives you; it can take a few hours).
2. **Workers & Pages** → **nova** → **Settings** → **Domains & Routes** → **Add** → **Custom domain** →
   enter `www.yourdomain.com` (and the bare `yourdomain.com` if you want both).
3. Pick ONE address as the main one (with or without `www`). Redirect the other one to it:
   **Rules** → **Redirect Rules**. The canonical tags already point to the main address.
4. Changed address? Run `npm run seo -- https://new-address.com` then `npm run deploy` again.

## Part 6 – First things to do on the live site

1. Open `https://nova.pieca.workers.dev/gestion-nova-k7q2x9/`, log in with **admin**: the page then **forces you to choose a real password** (8 characters minimum) before anything else works. After 8 wrong attempts an IP address is blocked for 15 minutes.
2. Replace the sample product with your real ones (photos, prices, stock) and press **Enregistrer**.
3. Edit `public/data/site.json` (WhatsApp number with country code and digits only, Facebook, Instagram), then
   `npm run deploy`.
4. Already built in against abuse: a login attempt limit, a limit of orders per IP address (6 per 30 min) and per e-mail address (3 per hour), an invisible anti-bot field in the cart. For more protection add: Cloudflare → **Security** → **WAF** → **Rate limiting rules** → create a rule
   "URI Path starts with `/api/`" limited to a reasonable number of requests per minute per IP
   (check the limits of your plan).

### New-order notification, order history and dashboard

* Every order is saved with its invoice PDF. In the admin page: **Commandes** = history, search, "À préparer / Traitée" status, download of the PDF sent to the customer. **Tableau de bord** = per day / per month figures, customers, best products, stock alerts.
* To also receive an **e-mail for every new order** (with the invoice attached): `npx wrangler secret put OWNER_EMAIL` (your address; needs one e-mail provider set up, see below), then `npm run deploy`.
* The dashboard cuts days and months in the shop time zone: `TIMEZONE` in `wrangler.jsonc` (default `Africa/Tunis`).

### Accept online orders later (optional)

Online orders are **off** (the cart then offers to send the order by WhatsApp). To turn them on:

1. Set up the e-mail sending (section "Order confirmation e-mail" below: Gmail script, free, no domain needed).
2. `npx wrangler secret put GMAIL_SCRIPT_URL` and `npx wrangler secret put GMAIL_SCRIPT_SECRET`.
3. In `wrangler.jsonc` set `"ORDERS_ENABLED": "true"`, then `npm run deploy`.

---

## Part 7 – Google Search Console

Google finds sites by itself, but this makes it faster and shows you problems.

1. Go to **search.google.com/search-console** → **Add property**.
2. **Domain** property (best, needs your own domain on Cloudflare): enter `yourdomain.com`. Google gives a
   **TXT record**. In Cloudflare → your domain → **DNS** → **Records** → **Add record** → type `TXT`, name `@`,
   content = the text Google gave → Save. Back in Google click **Verify**.
   *No own domain (workers.dev)?* choose **URL prefix**, then the **HTML tag** method: paste your code into the
   commented `google-site-verification` line of `public/index.html`, uncomment it, `npm run deploy`, then Verify.
3. **Sitemaps** (left menu) → enter `sitemap.xml` → **Submit**. Status should become "Success".
4. **URL inspection** (top bar) → paste `https://yourdomain.com/` → **Request indexing**. Repeat for
   `/produits/`, `/sur-mesure/`, `/a-propos/`.
5. Wait. Indexing takes from a few days to a few weeks. "Discovered – currently not indexed" is normal at first.
   Check progress in **Pages**. Typing `site:yourdomain.com` in Google shows what is indexed.
6. After the shop has photos, test one page in Google's **Rich Results Test** (search for it): it should detect
   "Product" items on `/produits/`.
7. Optional: in **Bing Webmaster Tools** use "Import from Google Search Console" (covers Bing, Yahoo, DuckDuckGo).

### What is already done for you

* Titles, descriptions, canonical links, Open Graph tags (nice previews on Facebook/WhatsApp), `lang="fr"`.
* `robots.txt` and `sitemap.xml`. The cart is `noindex`. The admin page is `noindex` (meta tag + header) and is
  deliberately **not** in `robots.txt`, because listing it would reveal its secret address.
* Structured data: Organization + WebSite on the home page, and Product data (price, stock, photo) generated
  from your catalogue on `/produits/` (only products that have a photo).
* Fast static pages served from Cloudflare's network, which also helps ranking.

### What will help you rank (needs you)

* Add **real photos** to every product and a good name + description (what it is, size, material).
* Put your site link on your Facebook and Instagram pages and in your WhatsApp profile.
* Create a free **Google Business Profile** if you also serve customers locally.
* Add real customer review screenshots in the admin page (section **Avis clients**). They appear as animated cards on the home page; the section stays hidden until there is at least one.
* Limit to know: products open in a popup, so each product has no page of its own. Google ranks your
  *pages* (home, products, custom, about). Individual product pages would be the next SEO step (ask for it).
* `og:image` uses the transparent logo; a 1200 x 630 picture would look better in shared links.

---

## Everyday work

| I want to | Do |
|---|---|
| Change products / prices / stock | Admin page, then Enregistrer (instant, no deploy) |
| Change a text, colour or page | Edit the file in `public/`, then `npm run deploy` |
| Change the API code | Edit `src/`, `npm test`, `npm run deploy` |
| Change the database structure | Add the next `migrations/NNN_xxx.sql`, run `npm run migrate`, deploy |
| Try locally | `npm run dev` (uses `localConnectionString` of `wrangler.jsonc`, can be your Supabase URL) |
| See live errors | `npx wrangler tail` |

## Problems

| Symptom | Likely cause and fix |
|---|---|
| Deploy fails mentioning the Hyperdrive id | Replace `PASTE-YOUR-HYPERDRIVE-ID` in `wrangler.jsonc` |
| Shop says "momentanément indisponible" | Migrations not run, wrong connection string, or database paused. Run `npx wrangler tail` and reload |
| Admin says wrong password | A `ADMIN_PASSWORD` secret exists (it wins). Use it, or delete it: `npx wrangler secret delete ADMIN_PASSWORD` |
| Admin says "Trop d'essais" | 8 wrong passwords from your IP: wait 15 minutes |
| Old price or stock shown, or the admin table only updates after a minute or more | Hyperdrive caching is on: `npx wrangler hyperdrive update <ID> --caching-disabled` (the catalogue, settings and order reads already bypass it, but disable it anyway) |
| My file change is not visible | Static files only change after `npm run deploy` (and a browser refresh) |
| Google says "Couldn't fetch" for the sitemap | Wrong domain in the sitemap: run `npm run seo -- https://your-real-address` and deploy again |

## Use another database or host later

All data access goes through the `Repo` interface (`src/repo/types.ts`). For MySQL, SQLite/D1, MongoDB...
write a new file next to `src/repo/postgres.ts` that implements it and use it in `src/worker.ts`.
For another host (Node server, Vercel...) write a small adapter like `src/worker.ts`. `src/app.ts` and
`src/core/*` never change. See `DEVELOPER-GUIDE.md`.

---

## Order confirmation e-mail + invoice PDF (free, from your Gmail)

`ORDERS_ENABLED` is `"true"`: online orders are open. The customer receives a **confirmation e-mail with the PDF invoice attached**. Easiest setup, free (about 100 e-mails/day, no domain):

1. Open https://script.google.com (signed in with the Gmail that must send the e-mails) → **New project**.
2. Replace the code with the content of `scripts/gmail-sender.gs`. Change `SECRET` to a long password of your own.
3. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone** → Deploy. Accept the Google permissions ("Advanced" → "Go to ... (unsafe)" is normal for your own script).
4. Copy the Web app URL (ends with `/exec`).
5. In the project folder:

```bash
npx wrangler secret put GMAIL_SCRIPT_URL      # the /exec URL
npx wrangler secret put GMAIL_SCRIPT_SECRET   # the same SECRET as in the script
npx wrangler secret put MAIL_FROM             # optional: only the name is used, e.g.  NOVA 3D
npx wrangler secret put OWNER_EMAIL           # optional: you also get "Nouvelle commande" with the invoice
npm run deploy
```

6. Place a test order. In the admin → Commandes the column **E-mail** shows "✓ Envoyée". Otherwise: `npx wrangler tail`, order again, read the message.

If you change the script later: **Deploy → Manage deployments → Edit → New version** (the URL stays the same).
Alternatives: `BREVO_API_KEY` + `MAIL_FROM` (free, 300/day, no domain) or `RESEND_API_KEY` + `MAIL_FROM` (needs a domain you own and verified). The Gmail script is used first when `GMAIL_SCRIPT_URL` is set, then Brevo, then Resend.
Without any of these the order still works (the customer downloads the PDF from the confirmation screen).
If an e-mail fails, the admin "Commandes" tab shows **Non envoyée** with a **Renvoyer** button.

## Security notes

* The admin password is stored as a salted PBKDF2 hash. The factory password `admin` only works to set a real one.
* `public/_headers` sends a Content-Security-Policy. If you add an external script, font or image host, add it there, otherwise the browser blocks it.
* The stock typed in the admin page is applied as a *difference* (what you added or removed), so an order placed while the page was open is never lost.

## Logo and contacts on the invoice

* The invoice PDF uses the small logo `public/images/NOVA_3D_logo_invoice.png` (560 px, decoded once and kept in memory). Do not point it to the big site logo: decoding it on every order is too slow for a Worker and makes each PDF several MB. To change the logo, replace that file (RGB or RGBA PNG, 8 bits, not interlaced, about 500 px wide).
* The footer of the PDF and the footer of the website show the contacts filled in `public/data/site.json` (`phone` = WhatsApp, `facebook`, `instagram`). An empty value is simply not shown, so Facebook and Instagram appear as soon as you put their full addresses there (e.g. `"instagram": "https://www.instagram.com/your-account/"`).
* Invoices already saved keep the layout they were sent with (without logo); only new orders get the logo.

## Order PDFs and home page

* **Admin > Commandes**: *Supprimer les anciens PDF* deletes the saved invoice PDFs older than 30 days / 3 / 6 months / 1 year / all (the orders stay; a deleted invoice is rebuilt, with logo, when you download it). *Télécharger toutes les commandes (PDF)* exports one PDF with every order (optional start and end dates, up to the 5 000 most recent orders).
* **Home page**: the printer animation is a fixed background (`#printerBg` in `public/index.html`), the banner text is in front, and the rest of the page slides over it (`.cover`). The old spinning 3D object is hidden: remove the `hidden` attribute on `.panel` to show it again. Styles: section 22 of `public/css/styles.css`; scrolling and "scroll down" button: end of `public/js/home.js`.
* **Hover animations** on buttons: section 21 of `styles.css` (mouse devices only, off with "reduce motion").

## Colour of the piece

* In the cart, each line shows **Couleur : Identique à la photo** (default). *Choisir* opens 16 swatches and a colour picker for any other colour; the choice is optional and kept in the browser (`n3d_cart_colors`).
* The chosen colour is saved on the order line (`c` = hex, `cn` = closest French name, e.g. "Rouge (#d33322)", no migration needed) and printed on the invoice PDF, the e-mails, the admin order history (colour dot + details) and the "all orders" PDF.
* One colour per cart line (all the units of that product). To change the swatches, edit `PALETTE` in **both** `public/js/core.js` and `src/core/colors.ts`.

## Page « Bientôt disponible » (page d'attente)

While it is ON, every public page (home, shop, product, cart, about, tracking, custom order) shows `/bientot/` instead of the site (answer 503 + `Retry-After`, so Google keeps your pages). The admin page and the API stay reachable. Texts (FR + AR), Instagram, WhatsApp and the ON/OFF switch are edited in the admin, tab **Page d'attente**. They are saved in Cloudflare **KV**, not in Postgres.

One-time setup:
1. `npx wrangler kv namespace create NOVA_KV`
2. Copy the printed `id` into `wrangler.jsonc`: remove the `//` in front of the `"kv_namespaces"` line and replace `PASTE_THE_ID_HERE`.
3. `npm run deploy`

From then on the page is **ON** (default texts) until you untick « Afficher la page » in the admin and save. A change is live in under a minute.
Without steps 1-2 the feature is simply off (the site stays open) and the admin tab says so.
