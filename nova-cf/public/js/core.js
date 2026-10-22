/* NOVA 3D - public/js/core.js
 * Global state, small helpers, cart storage.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order is fixed in every HTML page: core, ui, data, <page script>, events, main. */

/* =====================================================================
 * 2. GLOBAL STATE
 * ===================================================================== */

// SITE = contents of /data/site.json (phone, currency, facebook, instagram).
//        The defaults below are only used until site.json has been loaded.
// DATA = the catalogue loaded from /api/catalog: { categories: [{id, n}], products: [...] }.
//        If the API fails, DATA.err is set to 1 and pages show "boutique indisponible".
// cart = the shopping cart, { productId: quantity }. Saved in localStorage ("n3d_cart").
// cartColors = optional colour per cart line, { productId: "#rrggbb" }. No entry = "identical to the photo". Saved in localStorage ("n3d_cart_colors").
// cat  = id of the category selected on the Products page ("" = all).
// q    = search text typed on the Products page (lower-case).
// col  = colour chosen on the custom-order page.
// sortBy = sort order chosen on the Products page ("" = shop order | pa = price up | pd = price down | az = name).
// favs = ids of the products the visitor marked with the heart. Saved in localStorage ("n3d_favs").
var SITE = { phone: "", currency: "TND", facebook: "", instagram: "" },
    DATA = { categories: [], products: [] },
    cart = {},
    cartColors = {},
    cat = "",
    q = "",
    col = "Noir",
    sortBy = "",
    favs = [];

// PG   = which page we are on. Read from <body data-page="..."> in each HTML file.
//        Values: home | shop | cart | custom | about
var PG = document.body.dataset.page;

// Colours offered for a cart line and on the custom-order page: [name, hex]. KEEP IN SYNC with PALETTE in src/core/colors.ts (the server names the colour on invoices).
var PALETTE = [["Blanc", "#ffffff"], ["Noir", "#111111"], ["Gris", "#8e9196"], ["Rouge", "#d33322"], ["Orange", "#f08a24"], ["Jaune", "#f2c200"], ["Vert", "#2fa65a"], ["Vert menthe", "#7fd1ae"],
["Turquoise", "#00a6a6"], ["Bleu", "#2f6fe0"], ["Bleu marine", "#1b2a5c"], ["Violet", "#7b4bd6"], ["Rose", "#ee6aa7"], ["Marron", "#7a4a2b"], ["Beige", "#d8c3a0"], ["Doré", "#c9a227"]];
// Closest PALETTE name of a "#rrggbb" colour
function colorNameOf(hex) {
    var c = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16) }), best = PALETTE[0][0], bd = Infinity;
    PALETTE.forEach(function (p) {
        var d = 0, w = [2, 4, 3]; for (var i = 0; i < 3; i++) d += w[i] * Math.pow(c[i] - parseInt(p[1].slice(1 + 2 * i, 3 + 2 * i), 16), 2);
        if (d < bd) { bd = d; best = p[0] }
    });
    return best
}


/* =====================================================================
 * 3. SMALL HELPERS
 * ===================================================================== */

// Shortcut for document.getElementById
function $(i) { return document.getElementById(i) }

// Escape text before putting it inside innerHTML (prevents HTML injection).
// ALWAYS use esc() for anything that comes from the database or from the user.
function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    })
}

// Format a price with the currency from site.json, e.g. f(6) -> "6 TND"
function f(n) { return Math.round(n * 100) / 100 + " " + SITE.currency }

// Find a product by its id in DATA.products (returns undefined if not found)
function byId(id) { return DATA.products.filter(function (x) { return x.id === id })[0] }


/* =====================================================================
 * 4. CART STORAGE
 * The cart lives in the browser (localStorage), not on the server.
 * ===================================================================== */

// Read the cart from localStorage (falls back to an empty cart if unreadable)
function loadCart() {
    try { cart = JSON.parse(localStorage.getItem("n3d_cart") || "{}") || {} }
    catch (e) { cart = {} }
    try { cartColors = JSON.parse(localStorage.getItem("n3d_cart_colors") || "{}") || {} }
    catch (e) { cartColors = {} }
}

// Favourites (heart on the product cards): read / write / toggle. toggleFav returns the new state (true = now a favourite).
function loadFavs() {
    try { favs = JSON.parse(localStorage.getItem("n3d_favs") || "[]") || [] }
    catch (e) { favs = [] }
}
function isFav(id) { return favs.indexOf(id) > -1 }
function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i > -1) favs.splice(i, 1); else favs.push(id);
    try { localStorage.setItem("n3d_favs", JSON.stringify(favs)) } catch (e) { }
    return i < 0
}

// Save the cart, then refresh the red counter in the header
function saveCart() {
    // a colour only makes sense for a product that is still in the cart
    for (var k in cartColors) if (!cart[k] || !/^#[0-9a-f]{6}$/i.test(cartColors[k])) delete cartColors[k];
    try { localStorage.setItem("n3d_cart", JSON.stringify(cart)); localStorage.setItem("n3d_cart_colors", JSON.stringify(cartColors)) } catch (e) { }
    badge()
}

// Update every cart counter (class "bd") with the total number of items; empty when the cart is empty
function badge() {
    var n = 0;
    for (var k in cart) n += cart[k];
    document.querySelectorAll(".bd").forEach(function (b) { b.textContent = n || "" });
    cartBar()
}
