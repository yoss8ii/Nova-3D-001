/* NOVA 3D - public/js/reviews.js
 * Home page "Avis clients": animated cards made of customer review screenshots.
 * The screenshots are uploaded / deleted from the admin page (section "Avis clients"); the list
 * comes from GET /api/reviews. If there are none, the whole section stays hidden.
 * Markup: <section id="reviewsSec" hidden> ... <div class="rmarq" id="rcards"> in index.html.
 * Styles: section 11 of css/styles.css (.rmarq .rtrack .rc). Plain script: shares the other files' globals. */

// One card. dup = true for the second copy of the row (needed for the endless loop): hidden from
// screen readers and from the keyboard.
function reviewCard(url, dup) {
    return '<button type="button" class="rc" data-rv="' + esc(url) + '" aria-label="Voir cet avis en grand"'
        + (dup ? ' data-dup="1" aria-hidden="true" tabindex="-1"' : '') + '>'
        + '<img src="' + esc(url) + '" alt="Avis d\'un client" loading="lazy" decoding="async"></button>'
}

// Fetches the list and builds the row. The list is repeated until it is wide enough, then written
// twice: the CSS slides the row by 50 %, so the second copy takes the place of the first one.
function loadReviews() {
    var sec = $("reviewsSec"), box = $("rcards");
    if (!sec || !box) return;
    fetch("/api/reviews")
        .then(function (r) { return r.ok ? r.json() : { reviews: [] } })
        .catch(function () { return { reviews: [] } })
        .then(function (d) {
            var urls = (d.reviews || []).map(function (x) { return x.url });
            if (!urls.length) return;                       // nothing to show: section stays hidden
            var set = urls.slice();
            while (set.length < 6) set = set.concat(urls);
            box.innerHTML = '<div class="rtrack" style="--dur:' + set.length * 6 + 's">'
                + set.map(function (u) { return reviewCard(u, false) }).join("")
                + set.map(function (u) { return reviewCard(u, true) }).join("") + '</div>';
            sec.hidden = false;
            reveal()                                         // scroll-reveal for the newly shown section
        })
}

// Click on a card: show the screenshot full size in a popup (click anywhere or Esc to close)
document.addEventListener("click", function (e) {
    var c = e.target.closest && e.target.closest("[data-rv]");
    if (!c) return;
    var dlg = $("rdlg");
    if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "rdlg"; dlg.className = "rdlg";
        dlg.addEventListener("click", function () { dlg.close() });
        document.body.appendChild(dlg)
    }
    dlg.innerHTML = '<img src="' + esc(c.dataset.rv) + '" alt="Avis d\'un client">';
    dlg.showModal()
});
