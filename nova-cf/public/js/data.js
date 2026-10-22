/* NOVA 3D - public/js/data.js
 * Loads site.json and the catalogue.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order is fixed in every HTML page: core, ui, data, <page script>, events, main. */

/* =====================================================================
 * 7. LOADING DATA
 * ===================================================================== */

// Loads /data/site.json (all pages) and /api/catalog (only pages that show products).
// Afterwards the cart is cleaned: products that were deleted or are out of stock are removed,
// and quantities above the available stock are lowered.
// Returns a Promise; the start-up code at the bottom waits for it.
function loadData() {
    var need = PG === "home" || PG === "shop" || PG === "cart" || PG === "product";
    return Promise.all([
        fetch("/data/site.json").then(function (r) { return r.json() }).then(function (s) { SITE = s }),
        need ? fetch("/api/catalog").then(function (r) { if (!r.ok) throw 0; return r.json() }).then(function (d) {
            DATA = d;
            Object.keys(cart).forEach(function (id) {
                var x = byId(id);
                if (!x || x.q < 1) delete cart[id];
                else if (cart[id] > x.q) cart[id] = x.q
            });
            saveCart()
        }).catch(function () { DATA.err = 1 }) : 0   // API down -> DATA.err, pages show an error message
    ])
}
