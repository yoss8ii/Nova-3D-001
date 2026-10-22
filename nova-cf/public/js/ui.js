/* NOVA 3D - public/js/ui.js
 * HTML builders, header/footer, scroll reveal, quick-view popup.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order is fixed in every HTML page: core, ui, data, <page script>, events, main. */

/* =====================================================================
 * 5. HTML BUILDERS
 * Functions that return HTML strings. Each page then injects them with innerHTML.
 * ===================================================================== */

// Price block: current price, and the old price struck through (+ -X%) when there is a discount (x.o > x.p)
function priceHTML(x) {
    var d = x.o > x.p;
    return (d ? '<span class="pold"><s class="old">' + f(x.o) + '</s><span class="off">-' + Math.round((1 - x.p / x.o) * 100) + '%</span></span>' : '')
        + '<span class="price">' + f(x.p) + '</span>'
}

// Stock label: "Rupture de stock" (0) / "Plus que N" (1-3) / "En stock"
function stock(x) {
    return x.q <= 0 ? '<span class="stock out">Rupture de stock</span>'
        : x.q <= 3 ? '<span class="stock low">Plus que ' + x.q + '</span>'
        : '<span class="stock">En stock</span>'
}

// Message shown INSTEAD of / ABOVE the product list when there is nothing to buy (class "notice" spans the whole grid / row).
//   list = the products about to be shown. Returns "" when at least one of them can be bought.
//   Not the same message as the search one: here the shop itself is empty or sold out.
function stockNotice(list) {
    var link = ' <a href="/sur-mesure/">Commandez une pièce sur mesure</a> ou écrivez-nous : nous réimprimons vite.';
    if (!DATA.products.length) return '<p class="notice"><b>Aucun produit en vente pour le moment.</b> Nos nouvelles pièces arrivent bientôt.' + link + '</p>';
    if (list.length && list.every(function (x) { return x.q <= 0 })) {
        var all = DATA.products.every(function (x) { return x.q <= 0 });
        return '<p class="notice"><b>' + (all ? 'Tous nos articles sont en rupture de stock.' : 'Ces articles sont en rupture de stock.') + '</b> Un nouveau lot est en préparation.' + link + '</p>'
    }
    return ""
}

// Picture shown when a product has no photo yet
var PLACEHOLDER = '<span class="noph" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10.5" r="1.6"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg></span>';

// Content of a product tile: the first photo if there is one, otherwise a neutral placeholder
function tileHTML(x) {
    return x.ph && x.ph.length
        ? '<img src="' + esc(x.ph[0]) + '" alt="' + esc(x.n) + '" loading="lazy">'
        : PLACEHOLDER
}

// Heart button (favourite). data-fav = product id; clicks are handled in events.js.
function favBtn(id) {
    return '<button type="button" class="fav" data-fav="' + esc(id) + '" aria-pressed="' + isFav(id) + '" aria-label="Ajouter aux favoris"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.3-9.5C1.6 8.1 3.5 5 6.8 5c2 0 3.5 1.2 5.2 3.2C13.7 6.2 15.2 5 17.2 5c3.3 0 5.2 3.1 4.1 6.5C19.5 16.4 12 21 12 21z"/></svg></button>'
}

// "Ajouter" button (data-i = product id, handled in events.js). Sold out: a WhatsApp link asking to be warned when the piece is back.
//   cls = CSS class(es), label = text of the add button
function buyBtn(x, cls, label) {
    return x.q > 0 ? '<button class="' + cls + '" data-i="' + esc(x.id) + '">' + label + '</button>'
        : '<a class="' + cls + ' notify" target="_blank" rel="noopener" href="https://wa.me/' + esc(SITE.phone) + '?text='
        + encodeURIComponent("Bonjour, prévenez-moi quand « " + x.n + " » est de nouveau disponible.") + '">Me prévenir</a>'
}

// A full product card (tile + heart + name + stock + price + "Ajouter" button).
// data-q on the tile opens the quick-view popup; data-i on the button adds to the cart; data-fav on the heart toggles the favourite.
// All three are handled by the global click listener in events.js.
function card(x) {
    return '<div class="p rv"><button class="tile" data-q="' + esc(x.id) + '" style="--c:' + esc(x.b) + '" aria-label="Voir ' + esc(x.n) + '">' + tileHTML(x) + '</button>' + favBtn(x.id)
        + '<h3>' + esc(x.n) + '</h3><div class="meta">' + stock(x) + '</div>'
        + '<div class="prow"><span class="pbox">' + priceHTML(x) + '</span>' + buyBtn(x, "add", "Ajouter") + '</div></div>'
}

// Small notification at the bottom of the screen (e.g. "Produit ajouté au panier"), with an optional link. Disappears after ~2.6 s.
function notify(msg, href, label) {
    var box = $("pt");
    if (!box) { document.body.insertAdjacentHTML("beforeend", '<div id="pt" aria-live="polite"></div>'); box = $("pt") }
    var t = document.createElement("div");
    t.className = "nt"; t.setAttribute("role", "status");
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (href ? '<a href="' + esc(href) + '">' + esc(label) + '</a>' : "");
    while (box.children.length >= 2) box.removeChild(box.firstChild);
    box.appendChild(t);
    requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add("in") }) });
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove() }, 300) }, 2600)
}

// Sticky cart bar at the bottom of the screen on phones (hidden on the cart page and when the cart is empty).
// Called by badge() every time the cart changes, and again once the catalogue is loaded (to show the total).
function cartBar() {
    var b = $("cbar");
    if (!b) return;
    var n = 0, t = DATA.products.length ? total() : 0;
    for (var k in cart) n += cart[k];
    b.hidden = !n || PG === "cart";
    document.body.classList.toggle("has-cbar", !b.hidden);
    b.innerHTML = '<span>Panier · ' + n + (n > 1 ? " articles" : " article") + '</span><b>' + (t ? f(t) + " →" : "Voir →") + '</b>'
}


/* =====================================================================
 * 6. PAGE LAYOUT (header, footer, scroll animations, quick-view popup)
 * ===================================================================== */

// Scroll-reveal: every element with class "rv" fades in when it enters the screen.
// (CSS: .rv is invisible, .rv.in is visible.) Called again after the grid is redrawn.
// Without IntersectionObserver, or if the visitor prefers reduced motion, everything shows at once.
function reveal() {
    var els = document.querySelectorAll(".rv:not(.in)");
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        els.forEach(function (e) { e.classList.add("in") });
        return
    }
    var io = new IntersectionObserver(function (en) {
        en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target) } })
    }, { threshold: .12 });
    els.forEach(function (e) { io.observe(e) })
}

// Builds the header (logo + menu + cart icon + burger button) inside <div id="hd">
// and inserts the empty quick-view <dialog> at the top of <body>.
function layout() {
    document.body.insertAdjacentHTML("afterbegin", '<dialog id="qv"></dialog>');

    // Menu entries: [page key (matches data-page), URL, label].
    // >>> To add a page: add a line here and create public/<folder>/index.html <<<
    var L = [["home", "/", "Accueil"], ["shop", "/produits/", "Produits"], ["custom", "/sur-mesure/", "Sur mesure"], ["about", "/a-propos/", "À propos"], ["cart", "/panier/", "Panier"]];

    // Theme button icon (half-filled circle)
    var THEME_IC = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/></svg>';

    // Cart icon (inline SVG)
    var CART = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h2.6l2.2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.2"/><circle cx="9.5" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>';

    $("hd").innerHTML = '<header><a class="logo" href="/" aria-label="NOVA 3D, accueil"><img src="/images/NOVA_3D_logo.svg" alt="NOVA 3D"></a>'
        // <nav>: one link per entry of L. The current page gets aria-current="page" (styled as active).
        // The "cart" link has class nav-cart: it is hidden on phones, where the cart icon is used instead.
        + '<nav id="nv">' + L.map(function (l) {
            return '<a href="' + l[1] + '"' + (l[0] === "cart" ? ' class="nav-cart"' : '') + (l[0] === PG ? ' aria-current="page"' : '') + '>'
                + l[2] + (l[0] === "cart" ? '<span class="bd"></span>' : '') + '</a>'
        }).join("") + '</nav>'
        // Right side: cart icon with counter (phones) + burger menu button (phones)
        + '<div class="hact"><button type="button" class="theme-btn" id="tg" aria-label="Changer de thème (clair ou sombre)">' + THEME_IC + '</button><a class="cart-ic" href="/panier/" aria-label="Panier"' + (PG === "cart" ? ' aria-current="page"' : '') + '>' + CART + '<span class="bd"></span></a>'
        + '<button class="menu-btn" id="mb" aria-label="Menu" aria-expanded="false" aria-controls="nv"><span></span><span></span><span></span></button></div></header>'
        // Dark overlay behind the phone menu (click it to close the menu)
        + '<div class="scrim" id="sc"></div>';
    document.body.insertAdjacentHTML("beforeend", '<a class="cartbar" id="cbar" href="/panier/" hidden></a>');
    badge()
}

// Builds the footer in <div id="ft">: Facebook / Instagram / WhatsApp cards (only the ones
// that are filled in public/data/site.json) + the copyright line.
function footer() {
    var h = "", n = SITE.phone,
        IC = {   // 24x24 icons (currentColor)
            fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 8h2.5V5H14c-2.2 0-4 1.8-4 4v2H8v3h2v6h3v-6h2.4l.6-3h-3V9c0-.6.4-1 1-1z"/></svg>',
            ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></svg>',
            wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path fill="currentColor" d="M9 8.8c.2-.5.7-.5 1-.1l.8 1.2c.2.3.1.6-.1.9l-.4.5c.5 1 1.3 1.8 2.3 2.4l.6-.5c.3-.2.6-.2.9 0l1.2.8c.4.3.4.7 0 1-.7.7-1.7 1-2.7.6-2.4-1-4.1-2.7-4.8-4.8-.2-.6 0-1.1.4-1.5z"/></svg>'
        };
    if (SITE.facebook) h += '<a class="cc" href="' + esc(SITE.facebook) + '" target="_blank" rel="noopener"><b>' + IC.fb + '</b><span>Facebook<small>Suivez-nous</small></span></a>';
    if (SITE.instagram) h += '<a class="cc" href="' + esc(SITE.instagram) + '" target="_blank" rel="noopener"><b>' + IC.ig + '</b><span>Instagram<small>Nos créations</small></span></a>';
    if (n) h += '<a class="cc" href="https://wa.me/' + esc(n) + '" target="_blank" rel="noopener"><b>' + IC.wa + '</b><span>WhatsApp<small>+' + esc(n) + '</small></span></a>';
    // Developer credit: SITE.dev = { name, brand, logo } in public/data/site.json. Add the brand name and a logo
    // file (e.g. "/images/brand.png") there later: they appear automatically.
    var dv = SITE.dev || {}, dh = "";
    if (dv.name || dv.brand) dh = '<p class="dev">Développé par <b>' + esc(dv.name || "") + '</b>'
        + (dv.brand ? ' · ' + esc(dv.brand) : '')
        + (dv.logo ? ' <img src="' + esc(dv.logo) + '" alt="' + esc(dv.brand || dv.name || "") + '">' : '') + '</p>';
    $("ft").innerHTML = '<footer class="foot"><div class="contact">' + h + '</div><div class="flinks"><a href="/suivi/">Suivre ma commande</a><a href="/sur-mesure/">Commande sur mesure</a><a href="/a-propos/">À propos</a></div><p>© NOVA 3D. Chaque pièce est imprimée à la commande.</p>' + dh + '</footer>'
}

// Quick-view popup (native <dialog id="qv">) for a product: big photo or 3D preview,
// thumbnails if there are several photos, description, price and "Ajouter au panier".
function openQ(id) {
    var x = byId(id), d = $("qv"), ph = x.ph || [];
    d.innerHTML = '<div class="tile" style="--c:' + esc(x.b) + '"><button class="cl" aria-label="Fermer" data-close="1">✕</button>'
        // Big image (id="qi" is swapped when a thumbnail is clicked) or the large spinning 3D object
        + (ph.length ? '<img id="qi" src="' + esc(ph[0]) + '" alt="' + esc(x.n) + '">' : PLACEHOLDER) + '</div>'
        // Thumbnail strip, only when there is more than one photo (data-ph = image URL)
        + (ph.length > 1 ? '<div class="gal">' + ph.map(function (u, i) {
            return '<button data-ph="' + esc(u) + '" aria-pressed="' + (i === 0) + '" aria-label="Photo ' + (i + 1) + '"><img src="' + esc(u) + '" alt=""></button>'
        }).join("") + '</div>' : '')
        + '<div class="qb"><h3>' + esc(x.n) + '</h3><div class="meta">' + stock(x) + '</div><p>' + esc(x.d) + '</p>'
        + '<div class="prow"><span class="pbox">' + priceHTML(x) + '</span>' + buyBtn(x, "pill add", "Ajouter au panier") + '</div><a class="more" href="/produit/?id=' + encodeURIComponent(x.id) + '">Voir la fiche produit →</a></div>';
    d.showModal()
}

// Delivery fee (set in the admin page, sent with the catalogue)
function fee() { return DATA.delivery || 0 }

// Total price of the cart (ignores products that no longer exist)
function total() {
    var t = 0;
    for (var id in cart) { var x = byId(id); if (x) t += x.p * cart[id] }
    return t
}
