/* NOVA 3D - public/js/admin-custom.js
 * Admin "Sur mesure" tab: the requests sent from the public form (GET /api/custom), newest first.
 * Each request has a status (new -> quoted = price sent -> done), a "Répondre" link (WhatsApp) and a delete button.
 * Uses call(), esc(), $(), toast(), ask(), httpErr(), fmtDate() from admin.js / admin-ui.js. Load order: after admin-orders.js. */

var CR = [];
var CR_STATUS = [["new", "Nouvelle"], ["quoted", "Prix envoyé"], ["done", "Terminée"]];

// Red counter on the "Sur mesure" tab = requests still "new"
function setCustomBadge() {
    var n = CR.filter(function (x) { return x.status === "new" }).length, b = $("nbc");
    b.textContent = n; b.classList.toggle("hide", !n)
}

// One card per request. data-st = status menu, data-del = delete button (handled below).
function drawCustom() {
    $("crlist").innerHTML = CR.length ? CR.map(function (x) {
        var digits = (x.phone || "").replace(/\D/g, "");
        return '<div class="card crq"><div class="crq-h"><b>' + esc(x.name || "Sans nom") + '</b><span>' + esc(fmtDate(x.at)) + '</span></div>'
            + '<p>' + esc(x.description) + '</p>'
            + '<div class="crq-m">' + (x.color ? 'Couleur : ' + esc(x.color) : 'Couleur non précisée') + (x.budget ? ' · Budget : ' + esc(x.budget) : '') + (x.phone ? ' · Tél. : ' + esc(x.phone) : '') + '</div>'
            + '<div class="oact"><select data-st="' + esc(x.id) + '" aria-label="Statut">'
            + CR_STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === x.status ? ' selected' : '') + '>' + s[1] + '</option>' }).join("") + '</select>'
            + (digits ? '<a class="pill out" target="_blank" rel="noopener" href="https://wa.me/' + digits + '">Répondre sur WhatsApp</a>' : '')
            + '<button type="button" class="pill out danger" data-del="' + esc(x.id) + '">Supprimer</button></div></div>'
    }).join("") : '<p class="note" style="padding:14px">Aucune demande pour le moment.</p>'
}

// Loads the list. quiet = only refresh the red counter (used once after login)
function loadCustom(quiet) {
    return call("GET", "/api/custom").then(function (r) { if (!r.ok) throw r.status; return r.json() }).then(function (d) {
        CR = d.requests || []; setCustomBadge(); if (!quiet) drawCustom()
    }).catch(function (s) {
        if (!quiet) $("crlist").innerHTML = '<p class="note" style="padding:14px">Impossible de charger les demandes.</p>';
        if (!quiet) toast(typeof s === "number" ? "Sur mesure : " + httpErr(s) : "Erreur réseau.", "err")
    })
}

$("crf").onclick = function () { loadCustom() };

// Status menu: PATCH, then keep the new value in memory
$("crlist").addEventListener("change", function (e) {
    var id = e.target.dataset.st; if (!id) return;
    var st = e.target.value;
    call("PATCH", "/api/custom/" + id, { status: st }).then(function (r) {
        if (!r.ok) throw r.status;
        CR.forEach(function (x) { if (x.id === id) x.status = st });
        setCustomBadge(); toast("Statut mis à jour.")
    }).catch(function (s) { toast("Sur mesure : " + (typeof s === "number" ? httpErr(s) : "erreur réseau."), "err"); loadCustom() })
});

// Delete (after a Yes / No confirmation)
$("crlist").addEventListener("click", function (e) {
    var id = e.target.dataset.del; if (!id) return;
    ask("Supprimer cette demande ?").then(function (yes) {
        if (!yes) return;
        call("DELETE", "/api/custom/" + id).then(function (r) {
            if (!r.ok) throw r.status;
            CR = CR.filter(function (x) { return x.id !== id }); setCustomBadge(); drawCustom(); toast("Demande supprimée.", "del")
        }).catch(function (s) { toast("Sur mesure : " + (typeof s === "number" ? httpErr(s) : "erreur réseau."), "err") })
    })
});
