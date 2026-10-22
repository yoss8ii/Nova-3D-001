/* NOVA 3D - public/js/admin-dash.js
 * Admin "Tableau de bord" tab: today / this month / all-time numbers, a bar chart per day (30 days) or per month
 * (12 months), the same figures as a table, best products, best customers and stock alerts.
 * Data: GET /api/dashboard (computed by src/core/stats.ts). Everything is drawn without any library. */

var DASH = null, DMODE = "days", DMET = "revenue", DSEL = -1;

function loadDash() {
    call("GET", "/api/dashboard").then(function (r) { if (!r.ok) throw r.status; return r.json() }).then(function (d) {
        DASH = d; DSEL = -1; setBadge(d.toPrepare); drawDash()
    }).catch(function (s) {
        $("dash").innerHTML = '<p class="note">Impossible de charger le tableau de bord.</p>';
        toast(typeof s === "number" ? "Tableau de bord : " + httpErr(s) : "Erreur réseau.", "err")
    })
}

// French labels from "2026-10-17" / "2026-10" (UTC noon: no day shift whatever the browser time zone)
function dayLabel(k, long) { return new Date(k + "T12:00:00Z").toLocaleDateString("fr-FR", long ? { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" } : { day: "numeric", timeZone: "UTC" }) }
function monthLabel(k, long) { return new Date(k + "-15T12:00:00Z").toLocaleDateString("fr-FR", long ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" }) }
function kpi(label, big, sub, alert) { return '<div class="kpi' + (alert ? ' alert' : '') + '"><small>' + esc(label) + '</small><b>' + esc(big) + '</b><span>' + esc(sub) + '</span></div>' }

// The sentence shown under the chart for the selected bar
function detail(row) {
    var m = DMODE === "days", d = DASH;
    return (m ? dayLabel(row.date, true) : monthLabel(row.month, true)) + " · " + plur(row.orders, "commande") + " · " + fmtMoney(row.revenue, d.cur)
        + " · " + plur(row.items, "article") + " · " + plur(row.customers, "client") + (m ? "" : " (dont " + plur(row.newCustomers, "nouveau") + ")")
}

function drawDash() {
    var d = DASH, c = d.cur, n = d.now, rows = DMODE === "days" ? d.days : d.months;
    if (DSEL < 0 || DSEL >= rows.length) DSEL = rows.length - 1;       // default: today / this month
    var val = function (r) { return DMET === "revenue" ? r.revenue : r.orders }, max = Math.max.apply(null, rows.map(val).concat([1]));

    var kpis = '<div class="kp">'
        + kpi("Aujourd'hui", fmtMoney(n.today.revenue, c), plur(n.today.orders, "commande") + " · " + plur(n.today.items, "article"))
        + kpi("Ce mois-ci", fmtMoney(n.month.revenue, c), plur(n.month.orders, "commande") + " · " + plur(n.month.customers, "client"))
        + kpi("Depuis le début", fmtMoney(n.all.revenue, c), plur(n.all.orders, "commande") + " · " + plur(n.all.items, "article") + " vendus")
        + kpi("Panier moyen", fmtMoney(d.averageBasket, c), "par commande")
        + kpi("À préparer", String(d.toPrepare), d.toPrepare ? "commandes en attente" : "rien en attente", d.toPrepare > 0)
        + kpi("Clients", String(n.all.customers), d.returningCustomers + " ont recommandé")
        + kpi("Produits", String(d.catalog.products), d.catalog.categories + " catégories · " + d.catalog.stockUnits + " en stock")
        + kpi("Ruptures", String(d.catalog.outOfStock), plur(d.catalog.lowStock.length, "produit") + " presque épuisé" + (d.catalog.lowStock.length > 1 ? "s" : ""), d.catalog.outOfStock > 0)
        + '</div>';

    var bars = rows.map(function (r, i) {
        return '<button type="button" class="cb' + (val(r) ? ' has' : '') + (i === DSEL ? ' sel' : '') + '" data-ci="' + i + '" aria-label="' + esc(detail(r)) + '"><i style="height:' + Math.round(val(r) / max * 100) + '%"></i></button>'
    }).join("");
    // Axis: every 5th day (counting back from today) or every month
    var axis = rows.map(function (r, i) { return '<span>' + (DMODE === "days" ? ((rows.length - 1 - i) % 5 === 0 ? dayLabel(r.date) : "") : monthLabel(r.month)) + '</span>' }).join("");

    var table = '<div class="tw"><table class="tb tbd"><thead><tr><th>' + (DMODE === "days" ? "Jour" : "Mois") + '</th><th>Commandes</th><th>Articles</th><th>Clients</th>' + (DMODE === "days" ? "" : "<th>Nouveaux clients</th>") + '<th>Chiffre d\'affaires</th></tr></thead><tbody>'
        + rows.slice().reverse().map(function (r) {
            return '<tr class="' + (r.orders ? "" : "zero") + '"><td>' + esc(DMODE === "days" ? dayLabel(r.date, true) : monthLabel(r.month, true)) + '</td><td>' + r.orders + '</td><td>' + r.items + '</td><td>' + r.customers + '</td>'
                + (DMODE === "days" ? "" : '<td>' + r.newCustomers + '</td>') + '<td><b>' + esc(fmtMoney(r.revenue, c)) + '</b></td></tr>'
        }).join("") + '</tbody></table></div>';

    var topP = d.topProducts.length ? '<div class="tw"><table class="tb tbd"><thead><tr><th>Produit</th><th>Vendus</th><th>CA</th></tr></thead><tbody>'
        + d.topProducts.map(function (p) { return '<tr><td>' + esc(p.n) + '</td><td>' + p.q + '</td><td>' + esc(fmtMoney(p.revenue, c)) + '</td></tr>' }).join("") + '</tbody></table></div>' : '<p class="note">Aucune vente pour le moment.</p>';
    var topC = d.topCustomers.length ? '<div class="tw"><table class="tb tbd"><thead><tr><th>Client</th><th>Commandes</th><th>Dépensé</th></tr></thead><tbody>'
        + d.topCustomers.map(function (p) { return '<tr><td>' + esc(p.name) + '<small style="display:block;color:var(--mut)">' + esc(p.email) + '</small></td><td>' + p.orders + '</td><td>' + esc(fmtMoney(p.spent, c)) + '</td></tr>' }).join("") + '</tbody></table></div>' : '<p class="note">Aucun client pour le moment.</p>';
    var low = d.catalog.lowStock.length || d.catalog.outOfStock ? '<div class="tw"><table class="tb tbd"><thead><tr><th>Stock à surveiller</th><th>Restant</th></tr></thead><tbody>'
        + d.catalog.lowStock.map(function (p) { return '<tr><td>' + esc(p.n) + '</td><td>' + p.q + '</td></tr>' }).join("")
        + (d.catalog.outOfStock ? '<tr><td><b>' + plur(d.catalog.outOfStock, "produit") + ' en rupture</b></td><td>0</td></tr>' : '') + '</tbody></table></div>' : '<p class="note">Tous les stocks sont corrects.</p>';

    $("dash").innerHTML = '<div class="dh" style="margin-top:6px"><h2>Vue d\'ensemble</h2><button class="link" data-dr="1">Actualiser</button></div>' + kpis
        + (d.truncated ? '<p class="note">Seules les 20 000 commandes les plus récentes sont prises en compte.</p>' : '')
        + '<div class="dh"><h2>Activité</h2><span><span class="seg2" role="group" aria-label="Période">'
        + '<button type="button" data-dm="days" aria-pressed="' + (DMODE === "days") + '">30 jours</button><button type="button" data-dm="months" aria-pressed="' + (DMODE === "months") + '">12 mois</button></span> '
        + '<span class="seg2" role="group" aria-label="Valeur"><button type="button" data-dk="revenue" aria-pressed="' + (DMET === "revenue") + '">Chiffre d\'affaires</button><button type="button" data-dk="orders" aria-pressed="' + (DMET === "orders") + '">Commandes</button></span></span></div>'
        + '<div class="chart" role="group" aria-label="Graphique">' + bars + '</div><div class="cax">' + axis + '</div><p class="cdet" id="cdet" role="status">' + esc(detail(rows[DSEL])) + '</p>'
        + '<div class="dh"><h2>Détail par ' + (DMODE === "days" ? "jour" : "mois") + '</h2></div>' + table
        + '<div class="dh"><h2>Produits, clients et stock</h2></div><div class="two"><div><h3 style="margin:0 0 8px">Meilleurs produits</h3>' + topP + '</div><div><h3 style="margin:0 0 8px">Meilleurs clients</h3>' + topC + '</div><div><h3 style="margin:0 0 8px">Stock</h3>' + low + '</div></div>'
}

$("dash").addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t || !DASH) return;
    if (t.dataset.dr) loadDash();
    else if (t.dataset.dm) { DMODE = t.dataset.dm; DSEL = -1; drawDash() }
    else if (t.dataset.dk) { DMET = t.dataset.dk; drawDash() }
    else if (t.dataset.ci !== undefined) {
        DSEL = +t.dataset.ci;
        [].forEach.call($("dash").querySelectorAll(".cb"), function (b, i) { b.classList.toggle("sel", i === DSEL) });
        $("cdet").textContent = detail((DMODE === "days" ? DASH.days : DASH.months)[DSEL])
    }
});
