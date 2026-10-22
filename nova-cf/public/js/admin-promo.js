/* NOVA - public/js/admin-promo.js
 * Admin "Codes promo" tab: create a code with its percentage, switch it on/off, delete it (GET/POST /api/promos, PATCH/DELETE /api/promos/:code).
 * A code takes its percentage off the PRODUCTS subtotal of the cart (never the delivery fee). Codes are upper-case.
 * Uses call(), esc(), $(), toast(), ask(), httpErr() from admin.js / admin-ui.js. Load order: after admin-custom.js. */

var PR = [];

function drawPromos() {
    $("prlist").innerHTML = PR.length
        ? '<div class="tw"><table class="tb"><thead><tr><th>Code</th><th>Réduction</th><th>Utilisations</th><th>État</th><th></th></tr></thead><tbody>'
        + PR.map(function (x) {
            var c = esc(x.code);
            return '<tr' + (x.active ? '' : ' class="off"') + '><td><b>' + c + '</b></td><td>-' + esc(String(x.percent).replace(".", ",")) + ' %</td><td>' + x.uses + '</td>'
                + '<td><button type="button" class="pill sm out" data-pa="' + c + '" aria-pressed="' + x.active + '">' + (x.active ? 'Actif' : 'Désactivé') + '</button></td>'
                + '<td class="act"><button type="button" class="link" data-pe="' + c + '">Modifier le %</button> <button type="button" class="del" data-pd="' + c + '">Supprimer</button></td></tr>'
        }).join("") + '</tbody></table></div>'
        : '<p class="note" style="padding:14px">Aucun code promo pour le moment.</p>'
}

function loadPromos() {
    return call("GET", "/api/promos").then(function (r) { if (!r.ok) throw r.status; return r.json() }).then(function (d) {
        PR = d.promos || []; drawPromos()
    }).catch(function (s) {
        $("prlist").innerHTML = '<p class="note" style="padding:14px">Impossible de charger les codes promo.</p>';
        toast(typeof s === "number" ? "Codes promo : " + httpErr(s) : "Erreur réseau.", "err")
    })
}

// Create a code, or change the percentage of an existing one (same code = update)
function savePromo(code, percent, done) {
    call("POST", "/api/promos", { code: code, percent: percent }).then(function (r) {
        return r.json().catch(function () { return {} }).then(function (d) {
            if (!r.ok) throw d.message || r.status;
            toast("Code " + d.code + " enregistré (-" + String(d.percent).replace(".", ",") + " %).", "ok"); if (done) done(); return loadPromos()
        })
    }).catch(function (m) { toast(typeof m === "string" ? m : "Codes promo : " + (typeof m === "number" ? httpErr(m) : "erreur réseau."), "err") })
}

$("prf").onclick = function () { loadPromos() };

$("prform").addEventListener("submit", function (e) {
    e.preventDefault();
    savePromo($("prc").value.trim(), $("prp").value, function () { $("prc").value = ""; $("prp").value = ""; $("prc").focus() })
});

$("prlist").addEventListener("click", function (e) {
    var t = e.target, code;
    if ((code = t.dataset.pa)) {
        var x = PR.filter(function (p) { return p.code === code })[0]; if (!x) return;
        call("PATCH", "/api/promos/" + encodeURIComponent(code), { active: !x.active }).then(function (r) {
            if (!r.ok) throw r.status; x.active = !x.active; drawPromos(); toast("Code " + code + (x.active ? " activé." : " désactivé."))
        }).catch(function (s) { toast("Codes promo : " + (typeof s === "number" ? httpErr(s) : "erreur réseau."), "err"); loadPromos() })
    } else if ((code = t.dataset.pe)) {
        $("prc").value = code; $("prp").focus(); $("prp").select(); toast("Entrez le nouveau pourcentage puis « Enregistrer ».")
    } else if ((code = t.dataset.pd)) {
        ask("Supprimer le code " + code + " ?").then(function (yes) {
            if (!yes) return;
            call("DELETE", "/api/promos/" + encodeURIComponent(code)).then(function (r) {
                if (!r.ok) throw r.status; PR = PR.filter(function (p) { return p.code !== code }); drawPromos(); toast("Code supprimé.", "del")
            }).catch(function (s) { toast("Codes promo : " + (typeof s === "number" ? httpErr(s) : "erreur réseau."), "err") })
        })
    }
});
