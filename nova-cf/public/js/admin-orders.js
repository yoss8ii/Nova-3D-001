/* NOVA 3D - public/js/admin-orders.js
 * Admin "Commandes" tab: history of every order, search / status filter, "À préparer" <-> "Traitée" status,
 * details (address + lines) and download of the invoice PDF that was sent to the customer (saved by the server).
 * Uses call(), pw, esc(), $(), toast(), fmtMoney(), fmtDate(), plur() from admin.js / admin-ui.js. */

var OL = [], OTOTAL = 0, OTZ = "Africa/Tunis", OOPEN = {}, OLOAD = false;
var OPAGE = 50;

// Red counter on the "Commandes" tab = orders still to prepare
function setBadge(n) { var b = $("nbo"); b.textContent = n; b.classList.toggle("hide", !n) }

// Loads the first page (reset = true) or the next one, then redraws
function loadOrders(reset) {
    if (OLOAD) return Promise.resolve();
    if (reset) loadPdfStats();
    OLOAD = true;
    var off = reset ? 0 : OL.length;
    return call("GET", "/api/orders?limit=" + OPAGE + "&offset=" + off).then(function (r) {
        if (!r.ok) throw r.status; return r.json()
    }).then(function (d) {
        OL = reset ? d.orders : OL.concat(d.orders); OTOTAL = d.total; OTZ = d.tz || OTZ; OLOAD = false;
        if (OL.length >= OTOTAL) setBadge(OL.filter(function (x) { return x.status === "new" }).length);   // everything is loaded: exact count
        drawOrders()
    }).catch(function (s) {
        OLOAD = false; $("olist").innerHTML = '<p class="note" style="padding:14px">Impossible de charger les commandes.</p>';
        toast(typeof s === "number" ? "Commandes : " + httpErr(s) : "Erreur réseau.", "err")
    })
}
// A search needs every order in memory: load the remaining pages first (50 at a time)
function loadAllOrders() { return OL.length < OTOTAL ? loadOrders(false).then(function () { return OL.length < OTOTAL && OL.length ? loadAllOrders() : null }) : Promise.resolve() }

// The orders matching the search box and the status filter
function shownOrders() {
    var q = $("osr").value.trim().toLowerCase(), st = $("ost").value;
    return OL.filter(function (o) {
        if (st && o.status !== st) return false;
        return !q || [o.no, o.customer.name, o.customer.email, o.customer.phone].join(" ").toLowerCase().indexOf(q) > -1
    })
}

// Little colour dots next to the number of articles: which lines of the order have a colour chosen by the customer
function dots(o) {
    var c = o.lines.filter(function (l) { return l.c });
    return c.length ? '<small class="odots" title="Couleurs choisies par le client">' + c.map(function (l) { return '<i style="background:' + esc(l.c) + '"></i>' }).join("") + '</small>' : ""
}
function drawOrders() {
    var list = shownOrders();
    var rows = list.map(function (o) {
        var n = o.lines.reduce(function (s, l) { return s + l.q }, 0), names = o.lines.map(function (l) { return l.q + " × " + l.n }).join(", ");
        var row = '<tr class="pr"><td>' + esc(fmtDate(o.at, OTZ)) + '</td>'
            + '<td><b>' + esc(o.no) + '</b></td>'
            + '<td class="wrapc"><b>' + esc(o.customer.name) + '</b><small>' + esc(o.customer.email) + ' · ' + esc(o.customer.phone) + '</small></td>'
            + '<td title="' + esc(names) + '">' + plur(n, "article") + dots(o) + '</td>'
            + '<td><b>' + esc(fmtMoney(o.total, o.cur)) + '</b></td>'
            + '<td>' + (o.emailSent ? '<span class="ok-m">✓ Envoyée</span>' : '<span class="ko-m">Non envoyée</span> <button type="button" class="link" data-omail="' + esc(o.no) + '" title="Envoyer la confirmation et la facture au client par e-mail">Renvoyer</button>') + '</td>'
            + '<td><button type="button" class="bdg ' + (o.status === "done" ? "done" : "") + '" data-ost="' + esc(o.no) + '" title="Cliquer pour changer">' + (o.status === "done" ? "Traitée" : "À préparer") + '</button></td>'
            + '<td class="act"><button class="link" data-od="' + esc(o.no) + '">Détails ' + (OOPEN[o.no] ? "▴" : "▾") + '</button> <button type="button" class="pill" data-opdf="' + esc(o.no) + '" title="Télécharger la facture envoyée au client (PDF)" style="padding:8px 14px;font-size:13px">PDF ↓</button></td></tr>';
        if (OOPEN[o.no]) {
            row += '<tr class="od"><td colspan="8"><b>Adresse de livraison</b><br>' + esc(o.customer.address).replace(/\n/g, "<br>") + '<div class="od-l">'
                + o.lines.map(function (l) { return '<div><span>' + l.q + ' × ' + esc(l.n) + (l.c ? ' <span class="ocol"><i style="background:' + esc(l.c) + '"></i>' + esc(l.cn || "") + ' ' + esc(l.c) + '</span>' : ' <span class="ocol same">couleur identique à la photo</span>') + '</span><span>' + esc(fmtMoney(l.p * l.q, o.cur)) + '</span></div>' }).join("")
                + '<div><span>Livraison</span><span>' + (o.delivery > 0 ? esc(fmtMoney(o.delivery, o.cur)) : "Gratuite") + '</span></div>'
                + '<div><b>Total</b><b>' + esc(fmtMoney(o.total, o.cur)) + '</b></div></div></td></tr>'
        }
        return row
    }).join("");
    $("olist").innerHTML = rows
        ? '<table class="tb tbo"><thead><tr><th>Date</th><th>Facture</th><th>Client</th><th>Articles</th><th>Total</th><th>E-mail</th><th>Statut</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="note" style="padding:14px">' + (OL.length ? "Aucune commande ne correspond." : "Aucune commande pour le moment.") + '</p>';
    var more = OL.length < OTOTAL; $("omore").classList.toggle("hide", !more);
    $("omore").textContent = "Charger plus (" + (OTOTAL - OL.length) + " restantes)"
}

// Downloads a PDF from an admin route (the password travels in a header, so a plain link would not work)
function fetchPdf(path, filename, btn) {
    var label = btn.textContent; btn.disabled = true;
    return fetch(path, { headers: { "x-admin-password": encodeURIComponent(pw) } })
        .then(function (r) { if (!r.ok) throw r.status; return r.blob() })
        .then(function (b) {
            var u = URL.createObjectURL(b), a = document.createElement("a");
            a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(u) }, 4000)
        })
        .catch(function (s) { toast(typeof s === "number" ? "PDF : " + httpErr(s) : "Erreur réseau.", "err") })
        .then(function () { btn.disabled = false; btn.textContent = label })
}
// Invoice PDF of one order (the file saved when the order was placed, or rebuilt if it was deleted)
function downloadPdf(no, btn) { fetchPdf("/api/orders/" + encodeURIComponent(no) + "/pdf", "facture-" + no + ".pdf", btn) }

// Sends the confirmation + invoice e-mail again (only offered when the first attempt failed)
function resendEmail(no, btn) {
    btn.disabled = true; btn.textContent = "Envoi…";
    call("POST", "/api/orders/" + encodeURIComponent(no) + "/email").then(function (r) {
        return r.json().catch(function () { return {} }).then(function (d) { if (!r.ok) throw d.message || r.status; return d })
    }).then(function () {
        var o = OL.filter(function (x) { return x.no === no })[0]; if (o) o.emailSent = true;
        drawOrders(); toast("E-mail envoyé au client", "ok")
    }).catch(function (m) {
        btn.disabled = false; btn.textContent = "Renvoyer";
        toast(typeof m === "number" ? httpErr(m) : typeof m === "string" ? m : "Erreur réseau.", "err")
    })
}

function fmtBytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(n / 1024)) + " Ko" }
// "Factures PDF enregistrées : 12 (850 Ko)"
function loadPdfStats() {
    call("GET", "/api/orders/pdfs").then(function (r) { if (!r.ok) throw r.status; return r.json() }).then(function (d) {
        $("pdfst").textContent = d.count ? "· " + plur(d.count, "facture") + " (" + fmtBytes(d.bytes) + ")" : "· aucune"
    }).catch(function () { $("pdfst").textContent = "" })
}
// Delete the saved PDFs older than N days (0 = all). The orders stay.
function deletePdfs() {
    var days = Number($("pdfdays").value);
    ask(days ? "Supprimer les PDF enregistrés des commandes de plus de " + days + " jours ?" : "Supprimer TOUS les PDF enregistrés ?").then(function (yes) {
        if (!yes) return;
        call("DELETE", "/api/orders/pdfs?days=" + days).then(function (r) { if (!r.ok) throw r.status; return r.json() }).then(function (d) {
            toast(d.removed ? plur(d.removed, "PDF supprimé") : "Aucun PDF à supprimer", "ok"); loadPdfStats()
        }).catch(function (s) { toast(typeof s === "number" ? httpErr(s) : "Erreur réseau.", "err") })
    })
}
// One PDF with all the orders (optionally between two dates)
function exportOrders(btn) {
    var f = $("exf").value, t = $("ext").value;
    if (f && t && f > t) { toast("La date de début doit précéder la date de fin.", "err"); return }
    fetchPdf("/api/orders/export.pdf?from=" + encodeURIComponent(f) + "&to=" + encodeURIComponent(t), "commandes" + (f || t ? "-" + (f || "debut") + "_" + (t || "jour") : "") + ".pdf", btn)
}

// Toggles "À préparer" <-> "Traitée"
function toggleStatus(no) {
    var o = OL.filter(function (x) { return x.no === no })[0]; if (!o) return;
    var next = o.status === "done" ? "new" : "done";
    var rowOf = function () { var b = document.querySelector('[data-ost="' + no + '"]'); return b ? [b.closest("tr")] : [] };
    zoneMark(rowOf(), "saving");          // circular loader on the order row until the server answers
    call("PATCH", "/api/orders/" + encodeURIComponent(no), { status: next }).then(function (r) {
        if (!r.ok) throw r.status;
        o.status = next; drawOrders(); zoneMark(rowOf(), "saved"); setTimeout(function () { zoneMark(rowOf(), null) }, 1500);
        setBadge(Math.max(0, (Number($("nbo").textContent) || 0) + (next === "done" ? -1 : 1)));
        toast(next === "done" ? "Commande marquée comme traitée" : "Commande remise à préparer", "ok")
    }).catch(function (s) { zoneMark(rowOf(), "failed"); toast(typeof s === "number" ? httpErr(s) : "Erreur réseau.", "err") })
}

$("t-orders").addEventListener("click", function (e) {
    var t = e.target.closest("button, label"); if (!t) return;
    if (t.id === "orf") { loadOrders(true); loadPdfStats() }
    if (t.id === "pdfdel") deletePdfs();
    if (t.id === "exgo") exportOrders(t);
    if (t.id === "omore") loadOrders(false);
    if (t.dataset.od) { OOPEN[t.dataset.od] = !OOPEN[t.dataset.od]; drawOrders() }
    if (t.dataset.opdf) downloadPdf(t.dataset.opdf, t);
    if (t.dataset.ost) toggleStatus(t.dataset.ost);
    if (t.dataset.omail) resendEmail(t.dataset.omail, t)
});
var otimer;
$("osr").addEventListener("input", function () { clearTimeout(otimer); otimer = setTimeout(function () { loadAllOrders().then(drawOrders) }, 250) });
$("ost").addEventListener("change", function () { loadAllOrders().then(drawOrders) });

// CSV export (opens in Excel / Google Sheets): one row per order, in the shop time zone. Uses the dates #exf / #ext when filled.
// Loads every page of orders first, so nothing is missing. ";" separator + BOM = French Excel opens it correctly.
function csvCell(v) { v = String(v == null ? "" : v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }
$("excsv").onclick = function () {
    var btn = this; btn.disabled = true;
    (OL.length ? loadAllOrders() : loadOrders(true).then(loadAllOrders)).then(function () {
        var from = $("exf").value, to = $("ext").value, rows = [["N° facture", "Date", "Statut", "Client", "E-mail", "Téléphone", "Adresse", "Articles", "Livraison", "Total", "Devise"]];
        OL.slice().reverse().filter(function (o) { var d = o.at.slice(0, 10); return (!from || d >= from) && (!to || d <= to) }).forEach(function (o) {
            rows.push([o.no, fmtDate(o.at, OTZ), o.status === "done" ? "Traitée" : "À préparer", o.customer.name, o.customer.email, o.customer.phone, o.customer.address,
                o.lines.map(function (l) { return l.q + " x " + l.n + (l.cn ? " (" + l.cn + ")" : "") }).join(" | "), o.delivery, o.total, o.cur])
        });
        var blob = new Blob(["\ufeff" + rows.map(function (r) { return r.map(csvCell).join(";") }).join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "commandes-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href) }, 1000);
        toast(plur(rows.length - 1, "commande") + " exportée" + (rows.length > 2 ? "s" : "") + ".")
    }).catch(function () { toast("Export impossible.", "err") }).then(function () { btn.disabled = false })
};
