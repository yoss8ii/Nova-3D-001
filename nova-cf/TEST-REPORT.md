# NOVA – test report and changes (October 2026)

## Found while testing, and fixed
1. Home page: `loadReviews()` was called twice (two requests, cards drawn twice) -> once.
2. Prices: `f()` printed raw floats (e.g. `18.900000000000002 TND` for some quantities) -> rounded to 2 decimals.
3. Hidden banner animation (spinning 3D object, floating shapes) was still built and styled on every load -> removed (HTML, JS, CSS).
4. Every page downloaded `sprite.js` (the 3D shapes) only for those previews -> file removed.
5. Product without photo showed a spinning "3D" preview -> neutral picture placeholder.
6. Admin product form offered "Aperçu 3D : forme / couleur" -> removed (database columns kept, nothing breaks).
7. Mouse-tilt listeners (pointermove/pointerout on every tile) existed only for the 3D preview -> removed.

## Changes asked
- `wrangler.jsonc`: worker name `nova3d` -> `nova` (default URL `nova.<subdomain>.workers.dev`, same as `seo.config.json`).
  The local database name in `localConnectionString` is still `nova3d` on purpose (renaming it would point at a database that does not exist on your PC).
- Promo codes: admin tab « Codes promo » (create, change %, on/off, delete, usage counter); cart field « Code promo »;
  the % applies to the products only, never to delivery; the server re-checks the code and recomputes the discount at order time;
  the code and amount appear on the invoice PDF, the e-mail and the order history. Public check limited to 20 tries / 10 min / IP.
- More blurred texture on all pages (soft colour clouds + fine grain, light and dark mode), frosted-glass cards, smoother hovers, clearer messages.

## To deploy
1. `DATABASE_URL="postgres://..." npm run migrate`   (applies `010_promo_codes.sql`)
2. `npm test` (47 tests pass)  then  `npm run deploy`
3. If you rename the Worker, redeploy: the URL changes with the name (`nova.<subdomain>.workers.dev`).
