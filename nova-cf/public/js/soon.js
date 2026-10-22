/* NOVA 3D - public/js/soon.js
 * "Bientôt disponible" page: replaces the default texts / links of /bientot/index.html with what the owner saved in the admin
 * (GET /api/coming-soon, stored in KV, no database). If the request fails, the default texts already in the HTML stay.
 * Texts go in with textContent (never innerHTML); the links were checked by the server (instagram.com address, digits-only WhatsApp number). */
(function () {
    function $(id) { return document.getElementById(id) }
    // Light / dark switch (toggleTheme() comes from /js/theme.js and remembers the choice for the whole site)
    $("sTheme").addEventListener("click", function () {
        var d = document.documentElement; d.classList.add("sw");
        if (window.toggleTheme) toggleTheme();
        setTimeout(function () { d.classList.remove("sw") }, 600)
    });
    fetch("/api/coming-soon", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json() }).then(function (c) {
        if (c.titleFr) $("sTitleFr").textContent = c.titleFr;
        if (c.textFr) $("sTextFr").textContent = c.textFr;
        if (c.titleAr) $("sTitleAr").textContent = c.titleAr;
        if (c.textAr) $("sTextAr").textContent = c.textAr;
        var ig = $("sIg"), wa = $("sWa");
        if (c.instagram && /^https:\/\/(www\.)?instagram\.com\//i.test(c.instagram)) ig.href = c.instagram;
        else if (!c.instagram) ig.classList.add("hide");
        if (c.whatsapp && /^\d{8,15}$/.test(c.whatsapp)) wa.href = "https://wa.me/" + c.whatsapp + "?text=" + encodeURIComponent("Bonjour NOVA 3D ! مرحبا");
        else if (!c.whatsapp) wa.classList.add("hide")
    }).catch(function () { /* keep the default texts */ })
})();
