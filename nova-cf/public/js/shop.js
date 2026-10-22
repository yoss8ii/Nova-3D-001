/* NOVA 3D - public/js/shop.js
 * Products page.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order is fixed in every HTML page: core, ui, data, <page script>, events, main. */

/* =====================================================================
 * 9. PRODUCTS PAGE  (data-page="shop")
 * ===================================================================== */

// Sort orders of the menu #so (value -> compare function). "" = the order of the shop (admin order).
var SORTS = {
    pa: function (a, b) { return a.p - b.p },
    pd: function (a, b) { return b.p - a.p },
    az: function (a, b) { return a.n.localeCompare(b.n, "fr") }
};

// Category filter buttons: "Tous" + one per category + "Promos" (only if some product is discounted) + "Favoris" (only if there are hearts).
// aria-pressed marks the selected one. The two special ids start with "__".
function drawChips() {
    var list = [{ id: "", n: "Tous" }].concat(DATA.categories);
    if (DATA.products.some(function (x) { return x.o > x.p })) list.push({ id: "__promo", n: "Promos" });
    if (favs.length) list.push({ id: "__fav", n: "♥ Favoris" });
    else if (cat === "__fav") cat = "";
    $("chips").innerHTML = list.map(function (c) {
        return '<button class="chip" data-f="' + esc(c.id) + '" aria-pressed="' + (c.id === cat) + '">' + esc(c.n) + '</button>'
    }).join("")
}

// Does the product belong to the selected chip?
function inCat(x) { return !cat || (cat === "__promo" ? x.o > x.p : cat === "__fav" ? isFav(x.id) : x.cat === cat) }

// Product grid, filtered by the selected chip (cat) and the search text (q), then sorted (sortBy)
function drawGrid() {
    var g = DATA.products.filter(function (x) { return inCat(x) && x.n.toLowerCase().indexOf(q) > -1 });
    if (SORTS[sortBy]) g.sort(SORTS[sortBy]);
    var html;
    if (DATA.err) html = '<p class="meta">La boutique est momentanément indisponible.</p>';
    else if (!DATA.products.length) html = stockNotice(g);                      // the shop has no product at all
    else if (!g.length) html = q                                                // nothing matches: say why
        ? '<p class="meta">Aucun produit ne correspond à « ' + esc(q) + ' ».</p>'
        : '<p class="notice"><b>Cette catégorie est vide pour le moment.</b> Regardez les autres catégories ou <a href="/sur-mesure/">commandez sur mesure</a>.</p>';
    else html = stockNotice(g) + g.map(card).join("");                          // sold-out message (if all out) above the cards
    $("grid").innerHTML = html;
    reveal()   // the new cards need their scroll animation
}

// SEO: publishes the products as structured data (JSON-LD, schema.org Product) so Google can
// understand names, prices and stock, and may show rich results. Only products WITH a photo are
// listed (Google requires an image). Runs once the catalogue is loaded; no visual effect.
function seoProducts() {
    var items = DATA.products.filter(function (x) { return x.ph && x.ph.length }).map(function (x) {
        return {
            "@type": "Product", "name": x.n, "description": x.d || x.n,
            "image": location.origin + x.ph[0],
            "offers": {
                "@type": "Offer", "url": location.origin + "/produit/?id=" + encodeURIComponent(x.id),
                "price": String(x.p), "priceCurrency": SITE.currency || "TND",
                "availability": "https://schema.org/" + (x.q > 0 ? "InStock" : "OutOfStock")
            }
        }
    });
    if (!items.length) return;
    var el = document.createElement("script");
    el.type = "application/ld+json";
    el.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": items });
    document.head.appendChild(el)
}

function shop() {
    drawChips(); drawGrid(); seoProducts();
    // Live search: redraw the grid at every keystroke
    $("q").oninput = function () { q = this.value.trim().toLowerCase(); drawGrid() }
}


// Custom dropdown for the sort menu: replaces the browser's grey list with a styled one. The real <select id="so"> is kept (hidden) and
// receives the choice + a "change" event, so events.js keeps working unchanged. Keyboard: Enter/Space/arrows/Escape.
function enhanceSelect(sel) {
    if (!sel || sel.dataset.dd) return;
    sel.dataset.dd = "1";
    var box = document.createElement("div"); box.className = "dd";
    var arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    box.innerHTML = '<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false"><span></span>' + arrow + '</button><ul class="dd-menu" role="listbox" tabindex="-1"></ul>';
    sel.parentNode.insertBefore(box, sel.nextSibling);
    var btn = box.querySelector(".dd-btn"), menu = box.querySelector(".dd-menu"), idx = 0;
    btn.setAttribute("aria-label", sel.getAttribute("aria-label") || "");
    function paint() {
        btn.firstChild.textContent = sel.options[sel.selectedIndex].text;
        menu.innerHTML = [].map.call(sel.options, function (o, i) { return '<li role="option" data-i="' + i + '" aria-selected="' + (i === sel.selectedIndex) + '"' + (i === idx ? ' class="act"' : '') + '>' + esc(o.text) + '</li>' }).join("")
    }
    function open(v) { box.classList.toggle("open", v); btn.setAttribute("aria-expanded", v); idx = sel.selectedIndex; paint() }
    function pick(i) { sel.selectedIndex = i; sel.dispatchEvent(new Event("change", { bubbles: true })); open(false); btn.focus() }
    btn.addEventListener("click", function () { open(!box.classList.contains("open")) });
    menu.addEventListener("click", function (e) { var li = e.target.closest("li"); if (li) pick(+li.dataset.i) });
    document.addEventListener("click", function (e) { if (!box.contains(e.target)) open(false) });
    box.addEventListener("keydown", function (e) {
        var isOpen = box.classList.contains("open");
        if (e.key === "Escape") { open(false); btn.focus() }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!isOpen) open(true); else { idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + sel.options.length) % sel.options.length; paint() } }
        else if ((e.key === "Enter" || e.key === " ") && isOpen) { e.preventDefault(); pick(idx) }
    });
    paint()
}
enhanceSelect($("so"));
