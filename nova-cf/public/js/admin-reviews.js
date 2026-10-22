/* NOVA 3D - public/js/admin-reviews.js
 * Admin page: customer review screenshots (cards of the home page). */

// R = review screenshots [{id, url}] in display order. Unlike products, they are saved at once
// (upload = POST /api/reviews, delete = DELETE /api/reviews/:id): no need to press "Enregistrer".
var R = [];

// Redraws the thumbnails. data-rdel = review id (delete button)
function drawReviews() {
    $("rlist").innerHTML = R.map(function (r, i) {
        return '<span class="th rth"><img src="' + esc(r.url) + '" alt="Capture ' + (i + 1) + '"><button data-rdel="' + esc(r.id) + '" aria-label="Supprimer la capture">✕</button></span>'
    }).join("") || '<p class="note">Aucune capture. La section « Retour des clients » est masquée sur le site tant qu\'il n\'y en a pas.</p>'
}

// Loads the list (called once the login succeeded, see load() in admin.js)
function loadAdminReviews() {
    fetch("/api/reviews", { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw 0; return r.json() })
        .then(function (d) { R = d.reviews || []; drawReviews() })
        .catch(function () { $("rlist").innerHTML = '<p class="note">Impossible de charger les avis.</p>' })
}

// Choosing files uploads them one by one (resized to 1200 px so the text stays readable)
document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id !== "rup") return;
    var files = [].slice.call(t.files), ok = 0;
    t.value = "";
    $("rm").textContent = "Envoi en cours…";
    files.reduce(function (pr, fl) {
        return pr.then(function () { return shrink(fl, 1200, .85) })
            .then(function (b) { return fetch("/api/reviews", { method: "POST", headers: { "content-type": "image/jpeg", "x-admin-password": encodeURIComponent(pw) }, body: b }) })
            .then(function (r) { if (!r.ok) throw r.status; return r.json() })
            .then(function (d) { R.push(d); ok++; drawReviews() })
    }, Promise.resolve())
        .then(function () { $("rm").textContent = ""; toast(ok > 1 ? ok + " captures ajoutées" : "Capture ajoutée", "ok") })
        .catch(function (s) {
            $("rm").textContent = "";
            toast(s === 409 ? "Maximum 30 captures." : typeof s === "number" ? "Échec de l'envoi. " + httpErr(s) : "Image illisible ou erreur réseau.", "err")
        })
});

// Delete button (asks first)
document.addEventListener("click", function (e) {
    var id = e.target.dataset && e.target.dataset.rdel;
    if (!id) return;
    ask("Supprimer cette capture d'avis ?").then(function (yes) {
        if (!yes) return;
        fetch("/api/reviews/" + encodeURIComponent(id), { method: "DELETE", headers: { "x-admin-password": encodeURIComponent(pw) } })
            .then(function (r) { if (!r.ok) throw r.status; R = R.filter(function (x) { return x.id !== id }); drawReviews(); toast("Capture supprimée", "del") })
            .catch(function (s) { toast("Échec de la suppression. " + (typeof s === "number" ? httpErr(s) : ""), "err") })
    })
});


/* ---- Service feedback (stars + comments left on the home page) ----------------------------------------------- */
var FB = [];
function stars(n) { return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n) }
function drawFeedback() {
    $("fblist").innerHTML = FB.map(function (x) {
        return '<div class="fbrow"><b class="fbst" aria-label="' + x.stars + ' sur 5">' + stars(x.stars) + '</b> <span>' + esc(x.name || "Anonyme") + '</span> <span class="note">' + esc(new Date(x.at).toLocaleDateString("fr-FR")) + '</span>'
            + (x.comment ? '<p style="margin:4px 0 0">' + esc(x.comment) + '</p>' : '') + '<button type="button" class="link" data-fdel="' + esc(x.id) + '">Supprimer</button></div>'
    }).join("") || '<p class="note">Aucun avis pour le moment.</p>'
}
function loadAdminFeedback() {
    fetch("/api/feedback", { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw 0; return r.json() })
        .then(function (d) { FB = d.items || []; drawFeedback(); $("fbsum").textContent = d.count ? d.avg.toFixed(1).replace(".", ",") + " / 5 · " + d.count + " avis" : "" })
        .catch(function () { $("fblist").innerHTML = '<p class="note">Impossible de charger les notes.</p>' })
}
document.addEventListener("click", function (e) {
    var id = e.target.dataset && e.target.dataset.fdel;
    if (!id) return;
    ask("Supprimer ce commentaire ?").then(function (yes) {
        if (!yes) return;
        fetch("/api/feedback/" + encodeURIComponent(id), { method: "DELETE", headers: { "x-admin-password": encodeURIComponent(pw) } })
            .then(function (r) { if (!r.ok) throw r.status; toast("Commentaire supprimé", "del"); loadAdminFeedback() })
            .catch(function (s) { toast("Échec de la suppression. " + (typeof s === "number" ? httpErr(s) : ""), "err") })
    })
});
