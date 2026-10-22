/* NOVA 3D - public/js/track.js
 * Order tracking page (data-page="track"): invoice number + phone -> POST /api/track -> status of the order.
 * Statuses come from the admin order list: "new" = being prepared, "done" = handled. Nothing personal is shown.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order: core, ui, data, track, events, main. */

// Result card: invoice number, date, 3 steps, lines and total. d = answer of /api/track.
function trackView(d) {
    var done = d.status === "done";
    return '<div class="trk"><div class="trk-h"><b>' + esc(d.no) + '</b><span>' + esc(new Date(d.at).toLocaleDateString("fr-FR")) + '</span></div>'
        + '<ol class="steps"><li class="on">Commande reçue</li><li class="on">En préparation</li><li' + (done ? ' class="on"' : '') + '>Traitée</li></ol>'
        + '<p class="trk-s">' + (done ? "Votre commande a été traitée. Merci pour votre confiance !" : "Votre commande est en cours de préparation : chaque pièce est imprimée à la commande.") + '</p>'
        + '<ul class="trk-l">' + d.lines.map(function (l) { return '<li>' + l.q + ' × ' + esc(l.n) + '</li>' }).join("") + '</ul>'
        + '<div class="sumr"><span>Livraison</span><span>' + (d.delivery > 0 ? esc(d.delivery) + ' ' + esc(d.cur) : 'Gratuite') + '</span></div>'
        + '<div class="prow"><b>Total</b><span class="price">' + esc(d.total) + ' ' + esc(d.cur) + '</span></div></div>'
}

function trackPage() {
    var no = new URLSearchParams(location.search).get("no");
    if (no) $("tn").value = no;
    $("tf").onsubmit = function (e) {
        e.preventDefault();
        var btn = $("tb"), m = $("tm"), out = $("tr");
        btn.disabled = true; m.textContent = "Recherche…"; out.innerHTML = "";
        fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ no: $("tn").value.trim(), phone: $("tp").value.trim() }) })
            .then(function (r) { return r.json().catch(function () { return {} }).then(function (d) { return { ok: r.ok, d: d } }) })
            .then(function (res) { m.textContent = res.ok ? "" : (res.d.message || "Recherche impossible."); if (res.ok) out.innerHTML = trackView(res.d) })
            .catch(function () { m.textContent = "Erreur réseau. Réessayez." })
            .then(function () { btn.disabled = false })
    }
}
