# NOVA 3D

Boutique de gadgets imprimés en 3D : site statique + API (Cloudflare Workers) + base Postgres (Supabase ou autre).

* **Mettre en ligne (Cloudflare + Google)** : lire `DEPLOY.md`
* **Comprendre / modifier le code** : lire `DEVELOPER-GUIDE.md`
* Tests : `npm install` puis `npm test` (aucune base de données nécessaire)

```
public/      le site : html (pages), css/, js/ (un fichier par rôle) + robots.txt, sitemap.xml, _headers
src/app.ts   l'API, indépendante de l'hébergeur
src/core/    logique : mot de passe admin, catalogue, commandes, e-mail
src/repo/    accès base de données (types.ts = contrat, postgres.ts = implémentation)
src/worker.ts  adaptateur Cloudflare (seul fichier lié à Cloudflare)
migrations/  tables SQL        scripts/  migrate + set-domain      test/  tests
wrangler.jsonc  configuration Cloudflare
```
