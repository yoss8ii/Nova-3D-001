/* NOVA 3D - public/js/events.js
 * Global event listeners (clicks, tilt effect) and the mobile menu.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order is fixed in every HTML page: core, ui, data, <page script>, events, main. */

/* =====================================================================
 * 12. EVENTS
 * One global listener per event type ("event delegation"): buttons are created
 * dynamically with innerHTML, so we read their data-* attributes here instead of
 * attaching a listener to each button.
 * ===================================================================== */

document.addEventListener("click", function (e) {
    var t = e.target, id;

    // "Ajouter" button (data-i = product id): add 1 to the cart, never above the stock.
    // The button text briefly changes to "Ajouté ✓".
    if (t.dataset.i) {
        var x = byId(t.dataset.i);
        if (x && (cart[x.id] || 0) < x.q) {
            cart[x.id] = (cart[x.id] || 0) + 1; saveCart();
            var o = t.textContent; t.textContent = "Ajouté ✓"; setTimeout(function () { t.textContent = o }, 900);
            notify(x.n + " ajouté au panier", "/panier/", "Voir le panier")
        } else if (x) notify("Stock maximum atteint pour " + x.n)
    }
    // Heart (data-fav = product id): add / remove the favourite, update every heart of that product, refresh the Products page chips
    var fv = t.closest && t.closest("[data-fav]");
    if (fv) {
        var on = toggleFav(fv.dataset.fav);
        document.querySelectorAll('[data-fav="' + fv.dataset.fav + '"]').forEach(function (b) { b.setAttribute("aria-pressed", on) });
        if (PG === "shop") { drawChips(); if (cat === "__fav") drawGrid() }
    }
    // Header button: light / dark theme
    if (t.closest && t.closest("#tg")) toggleTheme();
    // Product page "Partager": native share sheet on phones, otherwise copy the link
    if (t.dataset.share) {
        if (navigator.share) navigator.share({ title: document.title, url: location.href }).catch(function () { });
        else if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { notify("Lien copié") }, function () { })
    }
    // Cart page: "−" (data-m): remove one, delete the line when it reaches 0
    if (t.dataset.m) { id = t.dataset.m; cart[id]--; if (cart[id] < 1) delete cart[id]; saveCart(); drawItems() }
    // Cart page: "+" (data-pl): add one, never above the stock
    if (t.dataset.pl) { id = t.dataset.pl; if (cart[id] < byId(id).q) cart[id]++; saveCart(); drawItems() }
    // Cart page: "Retirer" (data-rm): remove the whole line
    if (t.dataset.rm) { delete cart[t.dataset.rm]; saveCart(); drawItems() }
    // Cart page: "Annuler la commande": confirm, empty the cart, go back to the shop
    if (t.id === "cx") ask("Annuler la commande et vider le panier ?").then(function (yes) {
        if (!yes) return;
        cart = {}; cartColors = {}; promo = null; saveCart();
        toast("Commande annulée.", "del");
        setTimeout(function () { location.href = "/produits/" }, 900)
    })

    // Quick-view popup: close button (data-close) or click on the dark backdrop (the <dialog> itself)
    if (t.dataset.close) t.closest("dialog").close();
    if (t.tagName === "DIALOG") t.close();
    // Quick-view popup: click on a thumbnail (data-ph = URL) swaps the big image
    var g = t.closest && t.closest("[data-ph]");
    if (g) {
        $("qi").src = g.dataset.ph;
        document.querySelectorAll(".gal button").forEach(function (b) { b.setAttribute("aria-pressed", b === g) })
    }
    // Click on a product tile (data-q = product id): open the quick-view popup
    var tl = t.closest && t.closest("[data-q]");
    if (tl && !t.dataset.close) openQ(tl.dataset.q);

    // Products page: category chip (data-f = category id, "" = all)
    if (t.dataset.f !== undefined && t.classList.contains("chip")) { cat = t.dataset.f; drawChips(); drawGrid() }
    // Custom order page: colour swatch (data-c = colour label)
    if (t.dataset.c) { col = t.dataset.c; drawSw() }
});

// Products page: sort menu (value = "" | pa | pd | az, see SORTS in shop.js)
document.addEventListener("change", function (e) { if (e.target.id === "so") { sortBy = e.target.value; drawGrid() } });

/* =====================================================================
 * 13. MOBILE MENU (burger button, visible below 700 px)
 * ===================================================================== */

// Open or close the slide-in menu. The class "menu-open" on <body> drives the CSS.
function menu(open) {
    document.body.classList.toggle("menu-open", open);
    $("mb").setAttribute("aria-expanded", open);
}
document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest) return;
    if (t.closest("#mb")) menu(!document.body.classList.contains("menu-open"));   // burger: toggle
    else if (t.id === "sc" || t.closest("#nv a")) menu(false);                    // backdrop or a menu link: close
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape") menu(false) });   // Esc closes it
matchMedia("(min-width:701px)").addEventListener("change", function () { menu(false) });      // close when the window gets wide
