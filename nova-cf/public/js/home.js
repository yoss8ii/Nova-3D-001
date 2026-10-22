/* NOVA 3D - public/js/home.js
 * Home page.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order is fixed in every HTML page: core, ui, data, <page script>, events, main. */

/* =====================================================================
 * 8. HOME PAGE  (data-page="home")
 * ===================================================================== */

// Animated counter: counts from 0 up to "to" in 1.8 s with an ease-out curve; `after` is written behind the number (e.g. "+").
// No animation if the visitor prefers reduced motion.
function countUp(el, to, after) {
    after = after || "";
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = to.toLocaleString("fr-FR") + after; return }
    var t0 = performance.now(), d = 1800;
    (function s(t) {
        var k = Math.min(1, (t - t0) / d);   // progress 0 -> 1
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString("fr-FR") + after;
        if (k < 1) requestAnimationFrame(s)
    })(t0)
}

// Arrows of the best-sellers row (data-sw = -1 / 1): scroll by about one card
document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-sw]");
    if (!b) return;
    var row = $("bestGrid"), card1 = row.querySelector(".p");
    row.scrollBy({ left: Number(b.dataset.sw) * (card1 ? card1.offsetWidth + 14 : row.clientWidth * .8), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
});

// Success panel. a = answer of GET /api/achievements: { on, title, sub, cards: [{t, d}], stats: [{k, l, n, cur}] }.
// Every n is already a bracket (99, 250...) chosen by the server: the exact numbers never reach this page.
// The title is written 3 times, big, in gradient + outline.
function drawAchievements(a) {
    if (!a || !a.on || !(a.stats.length || a.cards.length)) return;          // switched off or nothing to show: the section stays hidden
    var title = (a.title || "").toUpperCase(), up = esc(title);
    $("achT").innerHTML = title ? '<span>' + up + '</span><span aria-hidden="true">' + up + '</span><span aria-hidden="true">' + up + '</span>' : "";
    $("achT").className = "ach-word" + (title.length > 24 ? " xl" : title.length > 12 ? " long" : "");
    $("achS").textContent = a.sub || ""; $("achS").hidden = !a.sub;
    $("achStats").innerHTML = a.stats.map(function (s) { var lab = s.l + (s.cur ? " (" + (SITE.currency || "") + ")" : ""); return '<li><b aria-label="' + esc(lab) + ' : plus de ' + s.n + '">0</b><span>' + esc(lab) + '</span></li>' }).join("");
    [].forEach.call($("achStats").querySelectorAll("b"), function (el, i) { countUp(el, a.stats[i].n, "+") });
    $("achCards").innerHTML = a.cards.map(function (c) { return '<li>' + (c.t ? '<b>' + esc(c.t) + '</b> ' : '') + esc(c.d) + '</li>' }).join("");
    $("ach").classList.toggle("no-notes", !a.cards.length);
    $("ach").classList.toggle("no-stats", !a.stats.length);
    $("achSec").hidden = false
}

function home() {
    // "Meilleures ventes" = products ticked "Meilleure vente" in the admin; if none, the first 4 products
    var best = DATA.products.filter(function (x) { return x.best });
    if (!best.length) best = DATA.products.slice(0, 4);
    // Swipeable cards: no "rv" class here (cards sit off-screen inside the row, the scroll animation would keep them hidden)
    $("bestGrid").innerHTML = DATA.err ? '<p class="meta">La boutique est momentanément indisponible.</p>'
        : stockNotice(best) + best.map(function (x) { return card(x).replace('class="p rv"', 'class="p"') }).join("");
    if (DATA.err || !DATA.products.length || best.every(function (x) { return x.q <= 0 })) $("bestWrap").classList.add("single");   // no arrows when there is nothing to swipe

    // Review screenshots (animated cards), see reviews.js
    loadReviews();
    // Service ratings (stars + comments), see feedback.js
    if (typeof loadFeedback === "function") loadFeedback();

    // Review screenshots (animated cards), see reviews.js
    loadReviews();

    // Success panel (texts from the admin + real figures as brackets)
    fetch("/api/achievements").then(function (r) { return r.ok ? r.json() : null })
        .then(drawAchievements).catch(function () { })
}


/* ---- Printer background + smooth scrolling -------------------------------------------------------------
 * - The printer animation (#printerBg) is fixed behind the page. Once the cover hides it completely it is switched off
 *   (display: none), which also stops its drawing loop, and switched back on when the visitor scrolls up.
 * - The "scroll down" arrow and any in-page #link scroll with an eased animation (ease-in-out, ~0.9 s).
 *   With "reduce motion" the jump is instant. */
(function () {
    var bg = document.getElementById("printerBg"), cover = document.getElementById("after");
    if (!bg || !cover) return;
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, tick = false;
    function check() {
        tick = false;
        bg.classList.toggle("off", cover.getBoundingClientRect().top <= -20)    // the cover's top edge left the screen: the machine is hidden behind it
    }
    addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(check) } }, { passive: true });
    check();

    function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }
    function scrollToY(y, ms) {
        var y0 = scrollY, d = y - y0, t0 = performance.now();
        if (reduce || Math.abs(d) < 2) { scrollTo(0, y); return }
        document.documentElement.style.scrollBehavior = "auto";          // our easing replaces the browser's
        (function s(t) {
            var k = Math.min(1, (t - t0) / ms); scrollTo(0, y0 + d * ease(k));
            if (k < 1) requestAnimationFrame(s); else document.documentElement.style.scrollBehavior = ""
        })(t0)
    }
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a || a.getAttribute("href").length < 2) return;
        var t = document.getElementById(a.getAttribute("href").slice(1)); if (!t) return;
        e.preventDefault();
        var head = document.querySelector("header"), off = head ? head.offsetHeight : 0;
        scrollToY(t.getBoundingClientRect().top + scrollY - off + 8, 900);
        history.replaceState(null, "", "#" + t.id)
    })
})();
