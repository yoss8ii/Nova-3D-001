/* NOVA 3D - public/js/admin.js
 * Admin page: login (with forced first password change), tabs and the catalogue editor (categories, products, photos,
 * favourite stars, delivery fee, password). Orders = admin-orders.js, dashboard = admin-dash.js.
 *
 * HOW EDITING WORKS: nothing is saved while you type. Each category, product and the delivery fee has a "Modifier" button:
 * it turns the row into a form (a DRAFT kept in ED). "Enregistrer" sends that one change, then the screen is redrawn with
 * the values read back from the database, and only then the confirmation appears. "Annuler" throws the draft away. */

// State: C = categories [{id,n}], L = products (short field names, see src/core/catalog.ts), DV = delivery fee,
// all three = what the DATABASE holds (as last read). pw = admin password typed at login (sent as header x-admin-password).
var C = [], L = [], pw = "", DV = 0, OPEN = {};   // OPEN = products whose detail row (description, 3D) is open
// ED = drafts of the rows being edited, by zone key: "p:<product id>", "c:<category id>", "dv" (delivery fee).
// A draft of a row that does not exist in the database yet carries _new: true.
var ED = {};
// ACH = the success panel as saved: { on, title, sub, cards: [{t, d}], stats: [{k, l, n}] } (stats = the real figures as brackets, read-only here).
// Its draft is ED.ach (zone key "ach").
var ACH = null;
// SESSION: the password is kept in sessionStorage (this browser tab only, erased when the tab is closed or on "Se déconnecter"),
// so a page refresh does not log you out. It is only saved after a successful login (never the factory password).
var SKEY = "n3d_admin_pw";
function remember() { try { sessionStorage.setItem(SKEY, pw) } catch (e) { } }
function forget() { try { sessionStorage.removeItem(SKEY) } catch (e) { } }
function saved() { try { return sessionStorage.getItem(SKEY) || "" } catch (e) { return "" } }
// Calls any admin API route with the password header (path e.g. "/api/orders"; b = JSON body)
function call(m, path, b) { return fetch(path, { method: m, headers: { "content-type": "application/json", "x-admin-password": encodeURIComponent(pw) }, body: b ? JSON.stringify(b) : undefined }) }
// Calls /api/catalog with the given method (POST login/password, PUT save) and the password header
function api(m, b) { return call(m, "/api/catalog", b) }
// Shows one tab (dash | orders | custom | promo | shop | set)
var TAB = "dash";
function showTab(n) {
    TAB = n;
    [].forEach.call(document.querySelectorAll(".tabp"), function (e) { e.classList.toggle("hide", e.id !== "t-" + n) });
    [].forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === n ? "true" : "false") });
    if (n === "dash" && window.loadDash) loadDash();
    if (n === "orders" && window.loadOrders) loadOrders(true);
    if (n === "custom" && window.loadCustom) loadCustom();
    if (n === "promo" && window.loadPromos) loadPromos()
}

/* ---- Small helpers ---- */
// <option> list for the category <select> (v = selected category id), "Sans catégorie" first. Categories not saved yet are not offered.
function copts(v) { return '<option value="">Sans catégorie</option>' + C.filter(isSaved).map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === v ? ' selected' : '') + '>' + esc(c.n) + '</option>' }).join("") }
function isSaved(x) { return !x._new }
// Index of the category / product of a zone key in C / L (-1 when it is gone)
function idxOf(key) { var id = key.slice(2); return (key[0] === "c" ? C : L).findIndex(function (x) { return x.id === id }) }
function copyProduct(p) { var o = {}; for (var k in p) o[k] = p[k]; o.ph = (p.ph || []).slice(); return o }
function newProduct(id) { return { id: id, n: "", cat: "", p: "", o: 0, q: "", ph: [], d: "", best: 0, _new: true } }
// Buttons of a row: "Modifier" + "Supprimer", or "Enregistrer" + "Annuler" while the row is being edited (key = zone key)
function rowBtns(key, editing, extra) {
    var k = esc(key);
    return editing
        ? '<button type="button" class="pill sm" data-ok="' + k + '">Enregistrer</button> <button type="button" class="link" data-cancel="' + k + '">Annuler</button>'
        : (extra || "") + '<button type="button" class="link" data-edit="' + k + '">Modifier</button> <button type="button" class="del" data-del="' + k + '">Supprimer</button>'
}
// Favourite ("meilleure vente") star of product i. Only clickable while the row is being edited.
var SPARK = [0, 60, 120, 180, 240, 300].map(function (a) { return '<i style="--a:' + a + 'deg"></i>' }).join("");
function starHTML(i, on, enabled) {
    return '<button type="button" class="star' + (on ? ' on' : '') + '" data-star="' + i + '" aria-pressed="' + (on ? "true" : "false") + '" aria-label="Meilleure vente" title="Meilleure vente"' + (enabled ? '' : ' disabled') + '>'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z"/></svg>' + SPARK + '</button>'
}

/* ---- Drawing (always from C / L / DV, with the drafts in ED shown on the rows being edited) ---- */
// Categories table: one row per category (data-c = index in C)
function drawCats() {
    var rows = C.map(function (c, i) {
        var d = ED["c:" + c.id], n = L.filter(function (p) { return p.cat === c.id }).length;
        return '<tr' + (d ? ' class="ed"' : '') + '><td class="num">' + (i + 1) + '</td>'
            + '<td><input data-c="' + i + '" value="' + esc(d ? d.n : c.n) + '" placeholder="Nom de la catégorie" aria-label="Nom de la catégorie"' + (d ? '' : ' disabled') + '></td>'
            + '<td class="num">' + n + '</td><td class="act">' + rowBtns("c:" + c.id, !!d) + '</td></tr>'
    }).join("");
    $("cats").innerHTML = rows ? '<table class="tb tbs"><thead><tr><th>#</th><th>Nom</th><th>Produits</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="note" style="padding:14px">Aucune catégorie.</p>';
    paintZones()
}
// Products table: one row per product, plus a second row (description + 3D) when "Plus" is open or the product is being edited.
// Inputs carry data-k = the field name (n, cat, p, o = old price, q, d, sh, b); each row carries data-i = index in L.
// Photo buttons: data-rp = "index:photoIndex" (remove), data-up = index (upload). Both exist only while editing.
function drawProducts() {
    var rows = L.map(function (p, i) {
        var d = ED["p:" + p.id], e = !!d, v = d || p, dis = e ? '' : ' disabled', open = !!OPEN[p.id] || e, cls = e ? ' ed' : '';
        return '<tr class="pr' + cls + '" data-i="' + i + '">'
            + '<td class="ph">' + v.ph.map(function (u, j) { return '<span class="th"><img src="' + esc(u) + '" alt="">' + (e ? '<button type="button" data-rp="' + i + ':' + j + '" aria-label="Retirer la photo">✕</button>' : '') + '</span>' }).join("")
            + (e ? '<label class="addph">+<input type="file" accept="image/*" multiple data-up="' + i + '" hidden></label>' : '') + '</td>'
            + '<td><input data-k="n" value="' + esc(v.n) + '" placeholder="Nom du produit" aria-label="Nom"' + dis + '></td>'
            + '<td><select data-k="cat" aria-label="Catégorie"' + dis + '>' + copts(v.cat) + '</select></td>'
            + '<td><input data-k="p" type="number" min="0" step="0.5" value="' + v.p + '" placeholder="0" aria-label="Prix"' + dis + '></td>'
            + '<td><input data-k="o" type="number" min="0" step="0.5" value="' + (v.o || "") + '" placeholder="—" aria-label="Ancien prix (barré)"' + dis + '></td>'
            + '<td><input data-k="q" type="number" min="0" step="1" value="' + v.q + '" placeholder="0" aria-label="Stock"' + dis + '></td>'
            + '<td class="num">' + starHTML(i, v.best, e) + '</td>'
            + '<td class="act">' + rowBtns("p:" + p.id, e, e ? '' : '<button type="button" class="link" data-more="' + i + '">' + (open ? 'Moins ▴' : 'Plus ▾') + '</button> ') + '</td></tr>'
            + (open ? '<tr class="mr' + cls + '" data-i="' + i + '"><td colspan="8"><div class="g"><div><label>Description</label><textarea data-k="d" style="min-height:70px"' + dis + '>' + esc(v.d || "") + '</textarea></div>'
                + '</div></td></tr>' : '')
    }).join("");
    $("list").innerHTML = rows ? '<table class="tb"><thead><tr><th>Photos</th><th>Nom</th><th>Catégorie</th><th>Prix</th><th>Ancien prix <small>(barré)</small></th><th>Stock</th><th>★</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="note" style="padding:14px">Aucun produit.</p>';
    paintZones()
}
// Delivery fee card (Réglages tab)
function drawDelivery() {
    var e = ED.dv !== undefined, inp = $("dv"), val = String(e ? ED.dv : DV);
    if (inp.value !== val) inp.value = val;
    inp.disabled = !e;
    $("dvact").innerHTML = e
        ? '<button type="button" class="pill sm" data-ok="dv">Enregistrer</button> <button type="button" class="link" data-cancel="dv">Annuler</button>'
        : '<button type="button" class="link" data-edit="dv">Modifier</button>';
    paintZones()
}
function draw() { drawCats(); drawProducts(); drawDelivery() }
// Success panel card (Réglages tab): the real figures (read-only, as brackets) + the texts to edit
function drawAch() {
    if (!ACH) return;
    var d = ED.ach, e = !!d, v = d || ACH, dis = e ? '' : ' disabled';
    var figs = ACH.stats.length ? ACH.stats.map(function (s) { return esc(s.l) + " " + s.n + "+" }).join(" · ") : "aucune commande pour le moment";
    $("achbox").innerHTML = '<p class="note" style="margin:0 0 12px">Les trois chiffres (clients, commandes, total reçu) sont calculés à partir de vos vraies commandes et affichés par paliers (« 99+ »), jamais exacts. Aujourd\'hui : <b>' + figs + '</b>.</p>'
        + '<label class="chk"><input type="checkbox" data-ach="on"' + (v.on ? ' checked' : '') + dis + '> Afficher le panneau sur la page d\'accueil</label>'
        + '<label for="ach-title">Titre (un ou deux mots : il s\'affiche très grand, trois fois)</label><input id="ach-title" data-ach="title" maxlength="80" value="' + esc(v.title) + '"' + dis + '>'
        + '<label for="ach-sub" style="margin-top:10px">Phrase d\'accroche (au-dessus du titre)</label><input id="ach-sub" data-ach="sub" maxlength="200" value="' + esc(v.sub) + '"' + dis + '>'
        + '<label style="margin-top:10px">Points forts, en bas du panneau (8 maximum)</label>'
        + (v.cards.length ? v.cards.map(function (c, i) {
            return '<div class="achrow"><input data-achc="' + i + ':t" maxlength="60" placeholder="En gras (facultatif)" aria-label="Titre du point fort ' + (i + 1) + '" value="' + esc(c.t) + '"' + dis + '>'
                + '<input data-achc="' + i + ':d" maxlength="240" placeholder="Texte court" aria-label="Texte du point fort ' + (i + 1) + '" value="' + esc(c.d) + '"' + dis + '>'
                + (e ? '<button type="button" class="del" data-ach-rm="' + i + '" aria-label="Retirer le point fort ' + (i + 1) + '">✕</button>' : '') + '</div>'
        }).join("") : '<p class="note" style="margin:0 0 8px">Aucun point fort.</p>')
        + (e && v.cards.length < 8 ? '<button type="button" class="link" data-ach-add="1">Ajouter un point fort</button>' : '');
    $("achact").innerHTML = e
        ? '<button type="button" class="pill sm" data-ok="ach">Enregistrer</button> <button type="button" class="link" data-cancel="ach">Annuler</button>'
        : '<button type="button" class="link" data-edit="ach">Modifier</button>';
    paintZones()
}
function copyAch(a) { return { on: !!a.on, title: a.title, sub: a.sub, cards: a.cards.map(function (c) { return { t: c.t, d: c.d } }) } }
// Reads the saved panel (GET /api/achievements?fresh=1) and redraws its card
function fetchAch() {
    return fetch("/api/achievements?fresh=1", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json() }).then(function (a) { ACH = a; drawAch() })
}
// Redraws only what a zone key belongs to
function redraw(key) { if (key === "ach") drawAch(); else if (key === "dv") drawDelivery(); else if (key[0] === "c") drawCats(); else drawProducts() }

/* ---- Zone feedback: a circular loader on the row / card being saved, then a green tick (or a red "!") ----
 * ZS = current state of each zone ("saving" | "saved" | "failed"), zone key as above. */
var ZS = {};
// The DOM elements of a zone (looked up each time: the tables are redrawn)
function zoneEls(key) {
    if (key === "ach") return [$("achcard")];
    var i = key === "dv" ? 0 : idxOf(key);
    if (key === "dv") return [$("dv").closest(".card")];
    if (i < 0) return [];
    if (key[0] === "p") return [].slice.call($("list").querySelectorAll('tr[data-i="' + i + '"]'));
    var inp = $("cats").querySelector('input[data-c="' + i + '"]'); return inp ? [inp.closest("tr")] : []
}
// Sets the state of a zone (or null) and paints it
function setZone(key, state) {
    if (state) ZS[key] = state; else delete ZS[key];
    zoneMark(zoneEls(key), state);
    if (state === "saved") setTimeout(function () { if (ZS[key] === "saved") setZone(key, null) }, 1500)
}
// After a table was redrawn, paints the zones that are still marked again
function paintZones() { Object.keys(ZS).forEach(function (key) { zoneMark(zoneEls(key), ZS[key]) }) }

/* ---- Editing: Modifier / Annuler ---- */
function startEdit(key) {
    if (ED[key] !== undefined || ZS[key] === "saving") return;
    if (key === "dv") ED.dv = DV;
    else if (key === "ach") { if (!ACH) return; ED.ach = copyAch(ACH) }
    else if (key[0] === "c") { var c = C[idxOf(key)]; if (!c) return; ED[key] = { id: c.id, n: c.n } }
    else { var p = L[idxOf(key)]; if (!p) return; var d = copyProduct(p); d.q0 = p.q; ED[key] = d }       // q0 = stock seen now: the server applies only the difference
    redraw(key); focusEdit(key)
}
function cancelEdit(key) {
    if (ZS[key] === "saving") return;
    var d = ED[key]; delete ED[key];
    if (d && d._new) { var i = idxOf(key); if (i > -1) (key[0] === "c" ? C : L).splice(i, 1) }      // a row never saved just disappears
    setZone(key, null); (key[0] === "c" ? draw : redraw)(key)       // removing a category changes the product lists too
}
// Puts the cursor in the main field of the row being edited (the name; the amount for the delivery fee)
function focusEdit(key) {
    var el = key === "ach" ? $("ach-title") : key === "dv" ? $("dv") : key[0] === "c" ? $("cats").querySelector('input[data-c="' + idxOf(key) + '"]') : $("list").querySelector('tr.pr[data-i="' + idxOf(key) + '"] input[data-k="n"]');
    if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }) }
}
// A name is required. Marks the field and says so; returns false when it is empty.
function checkName(key) {
    var d = ED[key]; if (!d || key === "dv" || key === "ach" || String(d.n).trim()) return true;
    focusEdit(key); var el = document.activeElement; if (el && el.classList) el.classList.add("bad");
    toast(key[0] === "c" ? "Donnez un nom à la catégorie." : "Donnez un nom au produit.", "err");
    return false
}

/* ---- Saving ---- */
// Product as the server expects it (trimmed name, numbers, q0 = stock the page based its edit on)
function pickProduct(p) {
    return { id: p.id, n: String(p.n).trim(), cat: p.cat || "", p: Number(p.p) || 0, o: Number(p.o) || 0, q: Math.max(0, Math.round(Number(p.q) || 0)), q0: p.q0, d: p.d || "", best: p.best ? 1 : 0, ph: p.ph.slice() }
}
function upsert(a, x) { var i = a.findIndex(function (y) { return y.id === x.id }); if (i < 0) a.push(x); else a[i] = x }
// The body of PUT /api/catalog for ONE change: the catalogue as the database holds it, with only this row replaced / added / removed.
// So other rows being edited are never sent half-typed. op = "save" | "del". Not-yet-saved rows (_new) are left out.
function buildBody(key, op) {
    var cats = C.filter(isSaved).map(function (c) { return { id: c.id, n: c.n } }), prods = L.filter(isSaved).map(pickProduct), dv = DV, id = key.slice(2), d = ED[key];
    if (key === "dv") { if (op === "save") dv = Number(d) || 0 }
    else if (key[0] === "c") { if (op === "del") cats = cats.filter(function (c) { return c.id !== id }); else upsert(cats, { id: id, n: String(d.n).trim() }) }      // products of a deleted category lose it on the server
    else { if (op === "del") prods = prods.filter(function (p) { return p.id !== id }); else upsert(prods, pickProduct(d)) }
    return { categories: cats, products: prods, delivery: dv }
}
// Confirmation text, built BEFORE the request (a deleted row is not there afterwards)
function okText(key, op) {
    if (key === "dv") return "Frais de livraison enregistrés";
    if (key === "ach") return "Panneau de réussites enregistré";
    var it = (key[0] === "c" ? C : L)[idxOf(key)], n = ED[key] ? ED[key].n : it ? it.n : "", w = key[0] === "c" ? "Catégorie" : "Produit";
    return w + " « " + String(n).trim() + " » " + (op === "del" ? "supprimé" + (key[0] === "c" ? "e" : "") : "enregistré" + (key[0] === "c" ? "e" : ""))
}
// Saves one change. The loader shows at once; the request waits for the earlier ones (one save at a time).
// Order of events: request -> screen redrawn with the values read back from the database -> tick + message.
var CHAIN = Promise.resolve();
function commit(key, op) {
    if (ZS[key] === "saving") return;
    setZone(key, "saving");
    var msg = okText(key, op), done = false;
    CHAIN = CHAIN.then(function () {
        var send = key === "ach" ? call("PUT", "/api/achievements", ED.ach) : api("PUT", buildBody(key, op));
        return send.then(function (r) {
            if (!r.ok) throw r.status;
            done = true; delete ED[key];
            return key === "ach" ? fetchAch() : fetchCatalog()
        }).then(function () {
            setZone(key, "saved"); toast(msg, op === "del" ? "del" : "ok")
        }).catch(function (s) {
            setZone(key, "failed");
            toast(done ? "Enregistré, mais l'affichage n'a pas pu être actualisé. Rechargez la page." : typeof s === "number" ? "Échec de l'enregistrement. " + httpErr(s) : "Erreur réseau. Rien n'a été enregistré.", "err")
        })
    })
}
// Asks first, then deletes at once
function askDelete(key) {
    var it = (key[0] === "c" ? C : L)[idxOf(key)]; if (!it || ZS[key] === "saving") return;
    ask(key[0] === "c" ? "Supprimer la catégorie « " + it.n + " » ? Ses produits passeront en « Sans catégorie »." : "Supprimer « " + it.n + " » ?").then(function (yes) { if (yes) commit(key, "del") })
}

// Reads the live catalogue (GET /api/catalog) into C, L, DV and redraws. Drafts of rows still being edited are kept.
function fetchCatalog() {
    return fetch("/api/catalog?fresh=1", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json() }).then(function (d) {
        C = d.categories; DV = Number(d.delivery) || 0;
        L = d.products.map(function (p) { p.ph = p.ph || []; p.q0 = p.q; return p });      // q0 = stock as seen right now
        mergeDrafts(); draw()
    })
}
// After a refresh: rows never saved come back (they are not in the database), drafts of rows deleted meanwhile are dropped, and a stock
// field nobody touched follows the live stock (the server applies only q - q0, so orders placed meanwhile are kept).
function mergeDrafts() {
    Object.keys(ED).forEach(function (k) {
        if (k === "dv" || k === "ach") return;
        var d = ED[k], id = k.slice(2), list = k[0] === "c" ? C : L, live = list.find(function (x) { return x.id === id });
        if (!live) { if (d._new) list.push(k[0] === "c" ? { id: id, n: "", _new: true } : newProduct(id)); else delete ED[k]; return }
        if (k[0] === "p" && Number(d.q) === Number(d.q0)) { d.q = live.q; d.q0 = live.q }
    })
}

/* ---- Events (delegated: one listener each) ---- */
// The zone key of the form field that has the focus (null when it is not part of a row being edited)
function keyOf(t) {
    if (t.id === "dv") return "dv";
    if (t.dataset && (t.dataset.ach !== undefined || t.dataset.achc !== undefined)) return "ach";
    if (t.dataset && t.dataset.c !== undefined) return C[t.dataset.c] ? "c:" + C[t.dataset.c].id : null;
    var r = t.closest && t.closest("[data-i]"); return r && L[r.dataset.i] ? "p:" + L[r.dataset.i].id : null
}
// TYPING: copy what is typed into the DRAFT of the row (never into C / L)
document.addEventListener("input", function (e) {
    var t = e.target, key = keyOf(t), d = key && ED[key];
    if (d === undefined || d === null) return;
    if (key === "ach") {
        var ds = t.dataset;
        if (ds.ach === "on") d.on = t.checked; else if (ds.ach) d[ds.ach] = t.value; else { var q = ds.achc.split(":"); d.cards[+q[0]][q[1]] = t.value }
    } else if (key === "dv") ED.dv = t.value;
    else if (t.dataset.c !== undefined) d.n = t.value;
    else if (t.dataset.k) { var k = t.dataset.k; d[k] = ["p", "q", "o"].indexOf(k) > -1 ? (t.value === "" ? "" : Number(t.value)) : t.value }
    if (t.classList && t.classList.contains("bad") && t.value) t.classList.remove("bad")
});
// Enter saves the row being edited, Escape cancels it (not inside the description box, where Enter adds a line)
document.addEventListener("keydown", function (e) {
    var t = e.target, key = (e.key === "Enter" || e.key === "Escape") && t.tagName !== "TEXTAREA" && t.tagName !== "BUTTON" ? keyOf(t) : null;
    if (!key || ED[key] === undefined) return;
    e.preventDefault();
    if (e.key === "Escape") cancelEdit(key); else if (ZS[key] !== "saving" && checkName(key)) commit(key, "save")
});
// CHANGES: choosing photos uploads them one by one (POST /api/photos) and adds the returned URL to the DRAFT's photo list;
// the product only gets them when its row is saved (a photo never attached is purged by the server later)
document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset.up === undefined) return;
    var i = +t.dataset.up, p = L[i], d = p && ED["p:" + p.id], files = [].slice.call(t.files), ok = 0, zk = d && "p:" + p.id;
    if (!d || !files.length) return;
    setZone(zk, "saving");
    files.reduce(function (pr, fl) {
        return pr.then(function () { return shrink(fl) })
            .then(function (b) { return fetch("/api/photos", { method: "POST", headers: { "content-type": "image/jpeg", "x-admin-password": encodeURIComponent(pw) }, body: b }) })
            .then(function (r) { if (!r.ok) throw r.status; return r.json() })
            .then(function (j) { d.ph.push(j.url); ok++ })
    }, Promise.resolve())
        .then(function () { setZone(zk, null); drawProducts(); toast(ok > 1 ? ok + " photos ajoutées (à enregistrer)" : "Photo ajoutée (à enregistrer)", "ok") })
        .catch(function (s) { setZone(zk, null); drawProducts(); toast(typeof s === "number" ? "Échec de l'envoi de la photo. " + httpErr(s) : "Image illisible ou erreur réseau.", "err") })
});
// CLICKS, by data attribute / id:
//   data-edit / data-ok / data-cancel / data-del = zone key | data-more = open details | data-star = favourite | data-rp = remove photo
//   #addc add a category | #add add a product | #chpw change password
document.addEventListener("click", function (e) {
    var t = e.target;
    // Favourite star (only enabled while editing): toggle on the draft without redrawing, so the animation can play
    var star = t.closest && t.closest("[data-star]");
    if (star) {
        var d = ED["p:" + L[star.dataset.star].id]; if (!d) return;
        d.best = d.best ? 0 : 1;
        star.classList.toggle("on", !!d.best); star.setAttribute("aria-pressed", d.best ? "true" : "false");
        star.classList.remove("pop"); void star.offsetWidth; star.classList.add("pop"); return
    }
    if (t.dataset.edit) startEdit(t.dataset.edit);
    if (t.dataset.cancel) cancelEdit(t.dataset.cancel);
    if (t.dataset.ok) { var key = t.dataset.ok; if (ZS[key] !== "saving" && checkName(key)) commit(key, "save") }
    if (t.dataset.del) askDelete(t.dataset.del);
    // Success panel cards (only while editing it)
    if (t.dataset.achAdd && ED.ach && ED.ach.cards.length < 8) { ED.ach.cards.push({ t: "", d: "" }); drawAch(); var ins = $("achbox").querySelectorAll('[data-achc$=":t"]'); if (ins.length) ins[ins.length - 1].focus() }
    if (t.dataset.achRm !== undefined && ED.ach) { ED.ach.cards.splice(+t.dataset.achRm, 1); drawAch() }
    if (t.dataset.more !== undefined) { var mp = L[t.dataset.more]; OPEN[mp.id] = !OPEN[mp.id]; drawProducts() }
    if (t.dataset.rp) { var a = t.dataset.rp.split(":"), pd = ED["p:" + L[a[0]].id]; if (pd) { pd.ph.splice(a[1], 1); drawProducts() } }
    // New category / product: a row in edit mode with every field EMPTY (the grey placeholders show what to type); the name is required
    if (t.id === "addc") { var c = { id: crypto.randomUUID(), n: "", _new: true }; C.push(c); ED["c:" + c.id] = { id: c.id, n: "", _new: true }; drawCats(); focusEdit("c:" + c.id) }
    if (t.id === "add") { var p = newProduct(crypto.randomUUID()); L.push(p); ED["p:" + p.id] = copyProduct(p); drawProducts(); focusEdit("p:" + p.id) }
    if (t.id === "chpw") {
        var np = $("np").value; if (np.length < 8) { $("pm").textContent = "8 caractères minimum."; toast("Le mot de passe doit contenir au moins 8 caractères.", "err"); return }
        api("POST", { newPassword: np }).then(function (r) { if (r.ok) { pw = np; remember(); $("np").value = ""; $("pm").textContent = "Mot de passe modifié."; toast("Mot de passe modifié", "ok") } else { return r.json().catch(function () { return {} }).then(function (d) { var why = d.error === "Password is managed by the ADMIN_PASSWORD secret" ? "Le mot de passe est défini par le secret ADMIN_PASSWORD de Cloudflare : modifiez-le là-bas." : httpErr(r.status); $("pm").textContent = "Échec (" + r.status + ")"; toast("Échec du changement de mot de passe. " + why, "err") }) } }).catch(function () { $("pm").textContent = "Erreur réseau"; toast("Erreur réseau. Réessayez.", "err") })
    }
});
// Leaving the page with a row still in edit mode: the browser asks first
window.addEventListener("beforeunload", function (e) { if (Object.keys(ED).length) { e.preventDefault(); e.returnValue = "" } });

// Resizes a chosen image to max `max` px (default 1000) and re-encodes it as JPEG (quality `q`, default .82) before upload, to keep photos light.
// Returns a Promise of a Blob.
function shrink(file, max, q) { return new Promise(function (res, rej) { var im = new Image(), u = URL.createObjectURL(file); im.onload = function () { var s = Math.min(1, (max || 1000) / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(res, "image/jpeg", q || .82) }; im.onerror = rej; im.src = u }) }

// Loads the catalogue, hides the login and shows the admin (dashboard tab first).
function load() {
    fetchCatalog().then(function () {
        remember(); $("login").classList.add("hide"); $("app").classList.remove("hide");
        var t = (location.hash || "").slice(1); showTab(["dash", "orders", "custom", "promo", "shop", "set"].indexOf(t) > -1 ? t : "dash"); if (window.loadCustom && TAB !== "custom") loadCustom(true); loadAdminReviews(); loadAdminFeedback(); fetchAch().catch(function () { })
    }).catch(function () { $("lm").textContent = "Base de données indisponible."; toast("Base de données indisponible.", "err") })
}
// Tabs
$("tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-tab]"); if (b) { showTab(b.dataset.tab); history.replaceState(null, "", "#" + b.dataset.tab) } });
// LOGIN: POST /api/catalog with the typed password. 200 -> admin (or the forced password change if the factory password "admin" is used).
$("lf").onsubmit = function (e) {
    e.preventDefault(); pw = $("pw").value; $("lm").textContent = "";
    api("POST", {}).then(function (r) {
        if (r.status === 429) { $("lm").textContent = "Trop d'essais. Réessayez dans quelques minutes."; toast("Trop d'essais. Réessayez dans quelques minutes.", "err"); return }
        if (!r.ok) throw 0;
        return r.json().then(function (d) { if (d.mustChange) { $("lf").classList.add("hide"); $("fc").classList.remove("hide"); $("fp1").focus() } else load() })
    }).catch(function () { $("lm").textContent = "Mot de passe incorrect, ou serveur injoignable."; toast("Mot de passe incorrect, ou serveur injoignable.", "err") })
};
// FORCED FIRST CHANGE: the factory password only works to set a new one
$("fc").onsubmit = function (e) {
    e.preventDefault(); var a = $("fp1").value, b = $("fp2").value;
    if (a.length < 8) { $("fm").textContent = "8 caractères minimum."; return }
    if (a !== b) { $("fm").textContent = "Les deux mots de passe sont différents."; return }
    api("POST", { newPassword: a }).then(function (r) {
        if (!r.ok) { $("fm").textContent = a === "admin" ? "Choisissez un autre mot de passe." : "Échec (" + r.status + ")."; return }
        pw = a; toast("Mot de passe enregistré", "ok"); load()
    }).catch(function () { $("fm").textContent = "Erreur réseau." })
};

// LOGOUT: forget the password and come back to the login screen
$("logout").addEventListener("click", function () { forget(); pw = ""; ED = {}; location.hash = ""; location.reload() });
// RESTORE: if this tab already logged in, check the saved password silently (the login screen stays hidden meanwhile)
(function () {
    var p = saved(); if (!p) return;
    pw = p; $("login").classList.add("hide");
    api("POST", {}).then(function (r) { if (!r.ok) throw r.status; return r.json() }).then(function (d) {
        if (d.mustChange) throw 0; load()
    }).catch(function () { forget(); pw = ""; $("login").classList.remove("hide") })
})();
