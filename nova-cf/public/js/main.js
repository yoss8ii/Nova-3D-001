/* NOVA 3D - public/js/main.js
 * Start-up: runs the code of the current page.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order is fixed in every HTML page: core, ui, data, <page script>, events, main. */

/* =====================================================================
 * 14. START-UP
 * Order: read the cart -> draw the header -> load site.json (+ catalogue) -> draw the
 * footer and the page-specific content.
 * ===================================================================== */
loadCart(); loadFavs(); layout();
loadData().then(function () {
    footer(); badge();
    if (PG === "home") home();
    if (PG === "shop") shop();
    if (PG === "cart") cartPage();
    if (PG === "custom") customPage();
    if (PG === "product") productPage();
    if (PG === "track") trackPage();
    reveal()
});

// Offline-ready + installable (see /sw.js and /manifest.webmanifest). A failure never matters: the site works without it.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(function () { });
