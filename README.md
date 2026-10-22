# NOVA 3D

Boutique de gadgets imprimés en 3D (porte-clés, fidgets, commandes sur mesure).

* Site statique + API Cloudflare Workers + Postgres (Supabase) : tout est dans [`nova-cf/`](nova-cf/).
* **Installation et mise en ligne** : [`nova-cf/DEPLOY.md`](nova-cf/DEPLOY.md)
* **Documentation développeur** : [`nova-cf/DEVELOPER-GUIDE.md`](nova-cf/DEVELOPER-GUIDE.md)
* Tests (sans base de données) : `cd nova-cf && npm test`

Administration : `https://<votre-site>/gestion-nova-k7q2x9/` — tableau de bord, historique des commandes (factures PDF, export CSV), demandes sur mesure, boutique (catégories, produits, favoris), réglages.
