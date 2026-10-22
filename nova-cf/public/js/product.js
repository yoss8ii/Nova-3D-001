/* NOVA 3D - public/js/product.js
 * Product page (data-page="product"): /produit/?id=<product id>. One page per product, so it can be shared and found on Google.
 * The page title, description and share tags are updated here from the catalogue (Google runs the script), and the product is
 * published as structured data (schema.org Product) when it has a photo.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order: core, ui, data, product, events, main. */

// Changes the content of an existing <meta>/<link> of the page head (selector -> attribute -> value)
function setHead(sel, attr, val) { var e = document.querySelector(sel); if (e) e.setAttribute(attr, val) }

function productPage() {
    var box = $("pp"), id = new URLSearchParams(location.search).get("id"), x = id && byId(id);
    if (DATA.err) { box.innerHTML = '<p class="meta">La boutique est momentanément indisponible.</p>'; return }
    if (!x) {
        box.innerHTML = '<div class="empty2"><h1 style="font-size:28px">Produit introuvable</h1><p style="color:var(--mut)">Ce produit n\'existe plus ou le lien est incorrect.</p><a class="pill" href="/produits/">Voir les produits</a></div>';
        return
    }
    var ph = x.ph || [], url = location.origin + "/produit/?id=" + encodeURIComponent(x.id), desc = x.d || (x.n + " : objet imprimé en 3D par NOVA 3D.");
    var catName = (DATA.categories.filter(function (c) { return c.id === x.cat })[0] || {}).n;

    // Head: title, description, canonical + share tags
    document.title = x.n + " | NOVA 3D";
    setHead('meta[name="description"]', "content", desc.slice(0, 160));
    setHead('link[rel="canonical"]', "href", url);
    setHead('meta[property="og:title"]', "content", x.n + " | NOVA 3D");
    setHead('meta[property="og:description"]', "content", desc.slice(0, 160));
    setHead('meta[property="og:url"]', "content", url);
    if (ph.length) setHead('meta[property="og:image"]', "content", location.origin + ph[0]);
    if (ph.length) {
        var ld = document.createElement("script");
        ld.type = "application/ld+json";
        ld.textContent = JSON.stringify({
            "@context": "https://schema.org", "@type": "Product", "name": x.n, "description": desc, "image": location.origin + ph[0],
            "offers": { "@type": "Offer", "url": url, "price": String(x.p), "priceCurrency": SITE.currency || "TND", "availability": "https://schema.org/" + (x.q > 0 ? "InStock" : "OutOfStock") }
        });
        document.head.appendChild(ld)
    }

    // Related products: same category first, then the others (4 at most)
    var rel = DATA.products.filter(function (y) { return y.id !== x.id && y.cat === x.cat })
        .concat(DATA.products.filter(function (y) { return y.id !== x.id && y.cat !== x.cat })).slice(0, 4);

    box.innerHTML = '<div class="pp-grid"><div class="pp-media"><div class="tile" style="--c:' + esc(x.b) + '">'
        + (ph.length ? '<img id="qi" src="' + esc(ph[0]) + '" alt="' + esc(x.n) + '">' : PLACEHOLDER) + '</div>'
        // Thumbnails (only with several photos): same markup as the quick view, handled in events.js
        + (ph.length > 1 ? '<div class="gal">' + ph.map(function (u, i) {
            return '<button data-ph="' + esc(u) + '" aria-pressed="' + (i === 0) + '" aria-label="Photo ' + (i + 1) + '"><img src="' + esc(u) + '" alt=""></button>'
        }).join("") + '</div>' : '') + '</div>'
        + '<div class="pp-info"><p class="crumb"><a href="/produits/">Produits</a>' + (catName ? ' › ' + esc(catName) : '') + '</p>'
        + '<h1>' + esc(x.n) + '</h1><div class="meta">' + stock(x) + '</div>'
        + '<div class="pp-price"><span class="pbox">' + priceHTML(x) + '</span></div>'
        + (x.d ? '<p class="pp-desc">' + esc(x.d) + '</p>' : '')
        + '<div class="pp-act">' + buyBtn(x, "pill add", "Ajouter au panier") + favBtn(x.id) + '<button type="button" class="pill out" data-share="1">Partager</button></div>'
        + '<p class="pp-note">Chaque pièce est imprimée à la commande. <a href="/sur-mesure/">Besoin d\'une version personnalisée ?</a></p></div></div>'
        + (rel.length ? '<section class="rv"><div class="head"><h2>Vous aimerez aussi</h2></div><div class="grid">' + rel.map(card).join("") + '</div></section>' : '')
}
