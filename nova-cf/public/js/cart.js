/* NOVA 3D - public/js/cart.js
 * Cart page and order submission.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order is fixed in every HTML page: core, ui, data, <page script>, events, main. */

/* =====================================================================
 * 10. CART PAGE  (data-page="cart")
 * ===================================================================== */

// COLOUR OF THE PIECE (optional, per cart line). Default = "Identique à la photo". "Choisir" opens the swatches (PALETTE in core.js) +
// a colour picker for any other colour. cartColors[id] holds the choice; it is sent with the order (item.color).
// colOpen = lines whose colour panel is open. data-colo = open/close, data-col = "id|#hex" (empty hex = identical), data-colp = colour picker.
var colOpen = {};

// PROMO CODE (optional). promo = { code, percent } once the server accepted the code typed in the cart (POST /api/promo), else null.
// The discount is a % of the products subtotal only (not the delivery). The server recomputes it when the order is placed.
var promo = null;
function discount() { return promo ? Math.round(total() * promo.percent) / 100 : 0 }
function grandTotal() { return Math.max(0, Math.round((total() - discount() + fee()) * 100) / 100) }
// Promo box: the input + button, or the applied code with "Retirer". msg = small message under it (error / confirmation)
function drawPromo(msg, isErr) {
    var b = $("pcw"); if (!b) return;
    b.innerHTML = promo
        ? '<div class="pchip"><span><b>' + esc(promo.code) + '</b> · -' + esc(String(promo.percent).replace(".", ",")) + ' %</span><button type="button" class="link" id="pcx">Retirer</button></div>'
        : '<div class="promo"><input id="pc" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Entrez votre code" aria-label="Code promo"><button type="button" class="pill out" id="pcb">Appliquer</button></div>';
    $("pcm").textContent = msg || ""; $("pcm").className = "note" + (isErr ? " err" : msg ? " ok" : "");
    drawItems()
}
function applyPromo() {
    var code = ($("pc").value || "").trim(), btn = $("pcb");
    if (!code) { $("pcm").textContent = "Entrez un code promo."; $("pcm").className = "note err"; $("pc").focus(); return }
    btn.disabled = true; $("pcm").textContent = "Vérification…"; $("pcm").className = "note";
    fetch("/api/promo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: code }) })
        .then(function (r) { return r.json().catch(function () { return {} }).then(function (d) { return { s: r.status, d: d } }) })
        .then(function (res) {
            if (res.s === 200 && res.d.ok) { promo = { code: res.d.code, percent: res.d.percent }; drawPromo("Code appliqué : -" + String(res.d.percent).replace(".", ",") + " % sur vos produits.") }
            else { btn.disabled = false; $("pcm").textContent = res.d.message || "Ce code promo n'est pas valide."; $("pcm").className = "note err" }
        })
        .catch(function () { btn.disabled = false; $("pcm").textContent = "Erreur réseau. Réessayez."; $("pcm").className = "note err" })
}
function colorSummary(cur) {
    return cur ? '<i class="cdot-s" style="background:' + esc(cur) + '"></i>' + esc(colorNameOf(cur)) + ' <small>' + esc(cur) + '</small>' : "Identique à la photo"
}
function colorHTML(id) {
    var cur = cartColors[id] || "", i = esc(id), custom = cur && !PALETTE.some(function (p) { return p[1] === cur });
    var s = '<div class="cchoice"><span class="ccur">Couleur : ' + colorSummary(cur) + '</span>'
        + '<button type="button" class="cmore" data-colo="' + i + '" aria-expanded="' + !!colOpen[id] + '">' + (colOpen[id] ? "Fermer" : "Choisir") + '</button>';
    if (colOpen[id]) {
        s += '<div class="cpanel"><button type="button" class="cid" data-col="' + i + '|" aria-pressed="' + !cur + '">Identique à la photo</button>'
            + PALETTE.map(function (p) { return '<button type="button" class="cdot" data-col="' + i + '|' + p[1] + '" style="background:' + p[1] + '" title="' + esc(p[0]) + '" aria-label="' + esc(p[0]) + '" aria-pressed="' + (cur === p[1]) + '"></button>' }).join("")
            + '<label class="cpk' + (custom ? ' on' : '') + '" title="Autre couleur"><input type="color" data-colp="' + i + '" value="' + (cur || "#00a6a6") + '" aria-label="Choisir une autre couleur"><span aria-hidden="true">+</span></label></div>'
    }
    return s + '</div>'
}

// One cart line: thumbnail, name, unit price, - / + buttons, line total, "Retirer".
// data-m = minus, data-pl = plus, data-rm = remove (handled in section 11).
function rowHTML(id) {
    var x = byId(id);
    return '<li class="it"><div class="th2" style="background:' + esc(x.b) + '33">' + (x.ph && x.ph.length ? '<img src="' + esc(x.ph[0]) + '" alt="">' : '') + '</div>'
        + '<div class="ii"><b>' + esc(x.n) + '</b><span class="meta pbox">' + priceHTML(x) + ' l\'unité</span>'
        + '<span class="qty"><button data-m="' + esc(id) + '" aria-label="Moins">−</button>' + cart[id] + '<button data-pl="' + esc(id) + '" aria-label="Plus">+</button></span>' + colorHTML(id) + '</div>'
        + '<div class="lt">' + f(x.p * cart[id]) + '<button class="x" data-rm="' + esc(id) + '">Retirer</button></div></li>'
}

// Redraw only the list of lines and the total (keeps what the visitor typed in the form).
// If the cart became empty, redraw the whole page (empty-cart message).
function drawItems() {
    var ids = Object.keys(cart).filter(byId);
    if (!ids.length) { cartPage(); return }
    $("items").innerHTML = ids.map(rowHTML).join("");
    $("st2").textContent = f(total());
    $("dsr").style.display = promo ? "" : "none";
    if (promo) $("ds").textContent = "- " + f(discount());
    $("dl").textContent = fee() > 0 ? f(fee()) : "Gratuite";
    $("tt").textContent = f(grandTotal())
}

// Draws the whole cart page inside <div id="cp">: either an error, the "panier vide" message,
// or the two columns (list of lines + customer form). Form field ids: f1 name, f2 e-mail,
// f3 phone, f4 address. Buttons: #cok = confirm, #cx = cancel. #cm = message area.
function cartPage() {
    var ids = Object.keys(cart).filter(byId), box = $("cp");
    if (DATA.err) { box.innerHTML = '<p class="meta">La boutique est momentanément indisponible.</p>'; return }
    if (!ids.length) { box.innerHTML = '<div class="empty2"><h2>Votre panier est vide</h2><p style="color:var(--mut)">Découvrez nos produits et ajoutez-les au panier.</p><a class="pill" href="/produits/">Voir les produits</a></div>'; return }
    box.innerHTML = '<div class="cols"><ul class="items" id="items"></ul>'
        + '<form id="cf" class="form"><h2 style="font-size:22px;margin-bottom:14px">Vos informations</h2>'
        + '<label for="f1">Nom complet</label><input id="f1" required autocomplete="name">'
        + '<label for="f2">E-mail</label><input id="f2" type="email" required autocomplete="email">'
        + '<label for="f3">Téléphone</label><input id="f3" type="tel" required autocomplete="tel" inputmode="tel">'
        + '<label for="f4">Adresse de livraison</label><textarea id="f4" required style="min-height:80px" autocomplete="street-address"></textarea>'
        // Honeypot (anti-bot): invisible to people, bots fill it and the server then refuses the order
        + '<input id="fw" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">'
        + '<label for="pc">Code promo</label><div id="pcw"></div><div class="note" id="pcm" aria-live="polite"></div>'
        + '<div class="sumr"><span>Sous-total</span><span id="st2"></span></div>'
        + '<div class="sumr disc" id="dsr" style="display:none"><span>Code promo</span><span id="ds"></span></div>'
        + '<div class="sumr"><span>Livraison</span><span id="dl"></span></div>'
        + '<div class="prow" style="margin:8px 0 14px"><b>Total</b><span class="price" id="tt"></span></div>'
        + '<button class="pill" id="cok" style="width:100%">Confirmer la commande</button>'
        + '<button type="button" class="pill out" id="cx" style="width:100%;margin-top:10px">Annuler la commande</button>'
        + '<div class="note" id="cm" role="alert"></div></form></div>';
    drawPromo()
}

// Builds the WhatsApp message used as a fallback when online orders are not enabled yet
// (server answers 503). Lists the items, the total and the customer's details.
function waText(c) {
    var s = "Bonjour, je souhaite commander :\n";
    Object.keys(cart).filter(byId).forEach(function (id) {
        var x = byId(id);
        s += cart[id] + " × " + x.n + (cartColors[id] ? " [couleur : " + colorNameOf(cartColors[id]) + " " + cartColors[id] + "]" : "") + " (" + f(x.p * cart[id]) + ")\n"
    });
    return s + (promo ? "Code promo : " + promo.code + " (- " + f(discount()) + ")\n" : "") + "Livraison : " + (fee() > 0 ? f(fee()) : "Gratuite") + "\nTotal : " + f(grandTotal()) + "\n\nNom : " + c.name + "\nE-mail : " + c.email + "\nTéléphone : " + c.phone + "\nAdresse : " + c.address
}

// Invoice preview shown after the order (same content as the PDF), with PDF buttons.
function invoiceView(d, c) {
    var rows = d.lines.map(function (l) { return '<tr><td>' + esc(l.n) + (l.c ? '<br><small class="meta"><i class="cdot-s" style="background:' + esc(l.c) + '"></i>Couleur : ' + esc(l.cn || "") + ' ' + esc(l.c) + '</small>' : '') + '</td><td>' + l.q + '</td><td>' + esc(l.p) + ' ' + esc(d.cur) + '</td><td>' + esc(l.p * l.q) + ' ' + esc(d.cur) + '</td></tr>' }).join("");
    return '<div class="inv"><div class="invh"><b>NOVA 3D</b><span>Facture ' + esc(d.invoice) + '<br>' + esc(d.date) + '</span></div>'
        + '<p class="meta">' + esc(c.name) + ' · ' + esc(c.email) + '<br>' + esc(c.phone) + ' · ' + esc(c.address) + '</p>'
        + '<div class="tw2"><table><tr><th>Produit</th><th>Qté</th><th>Prix</th><th>Total</th></tr>' + rows + '</table></div>'
        + (d.discount > 0 ? '<div class="sumr"><span>Code promo ' + esc(d.promo || "") + '</span><span>- ' + esc(d.discount) + ' ' + esc(d.cur) + '</span></div>' : '')
        + '<div class="sumr"><span>Livraison</span><span>' + (d.delivery > 0 ? esc(d.delivery) + ' ' + esc(d.cur) : 'Gratuite') + '</span></div>'
        + '<div class="prow"><b>Total</b><span class="price">' + esc(d.total) + ' ' + esc(d.cur) + '</span></div></div>'
        + '<p><a class="pill" id="pdfdl">Télécharger la facture (PDF)</a> <a class="pill out" id="pdfop" target="_blank" rel="noopener">Aperçu PDF</a></p>'
        + '<p><a class="pill out" href="/suivi/?no=' + encodeURIComponent(d.invoice) + '">Suivre ma commande</a> <a class="pill out" href="/produits/">Continuer mes achats</a></p>'
}
// Turns the base64 PDF returned by /api/order into a Blob and wires the two buttons
function bindPdf(d) {
    try {
        var bin = atob(d.pdf), a = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([a], { type: "application/pdf" }));
        $("pdfdl").href = url; $("pdfdl").download = "facture-" + d.invoice + ".pdf"; $("pdfop").href = url
    } catch (e) { $("pdfdl").style.display = "none"; $("pdfop").style.display = "none" }
}

// Cart form submit ("Confirmer la commande"): sends the order to /api/order (src/core/order.ts).
//   200 -> thank-you screen, cart emptied
//   503 -> online orders not enabled yet: offer to send the order by WhatsApp instead
//   409 -> not enough stock: reload the catalogue and redraw the cart
//   other -> show the server message
document.addEventListener("submit", function (e) {
    if (e.target.id !== "cf") return;
    e.preventDefault();
    var c = { name: $("f1").value.trim(), email: $("f2").value.trim(), phone: $("f3").value.trim(), address: $("f4").value.trim() },
        btn = $("cok"), m = $("cm");
    if (c.phone.replace(/\D/g, "").length < 8) { m.textContent = "Entrez un numéro de téléphone valide (8 chiffres minimum)."; $("f3").focus(); return }
    btn.disabled = true; m.textContent = "Envoi en cours…";   // disabled during the request to avoid double orders
    fetch("/api/order", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer: c, promo: promo ? promo.code : undefined, website: $("fw") ? $("fw").value : "", items: Object.keys(cart).map(function (id) { return cartColors[id] ? { id: id, q: cart[id], color: cartColors[id] } : { id: id, q: cart[id] } }) })
    })
        .then(function (r) { return r.json().catch(function () { return {} }).then(function (d) { return { s: r.status, d: d } }) })
        .then(function (res) {
            var d = res.d;
            if (res.s === 200) {
                $("cp").innerHTML = '<div class="empty2"><h2>Merci ' + esc(c.name) + ' !</h2><p>Commande ' + esc(d.invoice) + ' confirmée. '
                    + (d.emailSent ? 'Un e-mail de confirmation avec la facture (PDF) a été envoyé à ' + esc(c.email) + '.' : 'Votre facture est disponible ci-dessous.')
                    + '</p>' + invoiceView(d, c) + '</div>';
                cart = {}; cartColors = {}; promo = null; saveCart(); bindPdf(d)
            }
            else if (res.s === 503) {
                m.innerHTML = '<p>La commande en ligne n\'est pas encore ouverte. Envoyez votre commande par WhatsApp, nous vous répondrons rapidement.</p><a class="pill" target="_blank" rel="noopener" href="https://wa.me/' + esc(SITE.phone) + '?text=' + encodeURIComponent(waText(c)) + '">Envoyer par WhatsApp</a>';
                btn.disabled = false
            }
            else {
                m.textContent = d.message || "Impossible de valider la commande.";
                btn.disabled = false;
                if (res.s === 409) loadData().then(drawItems);
                if (d.error === "promo_invalid") { promo = null; drawPromo(d.message, true) }
            }
        })
        .catch(function () { m.textContent = "Erreur réseau. Réessayez."; btn.disabled = false })
});

// Colour choice events (own listeners: this file is loaded before events.js)
document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-col],[data-colo]") : null;
    if (!t) return;
    if (t.dataset.colo) { colOpen[t.dataset.colo] = !colOpen[t.dataset.colo]; drawItems(); return }
    var p = t.dataset.col.split("|");
    if (p[1]) cartColors[p[0]] = p[1]; else delete cartColors[p[0]];
    saveCart(); drawItems()
});
// Colour picker: follow the choice live (without redrawing, which would close the native picker); redraw once it is closed
document.addEventListener("input", function (e) {
    var id = e.target.dataset && e.target.dataset.colp; if (!id) return;
    cartColors[id] = e.target.value; saveCart();
    var box = e.target.closest(".cchoice");
    box.querySelector(".ccur").innerHTML = "Couleur : " + colorSummary(cartColors[id]);
    box.querySelectorAll("[aria-pressed]").forEach(function (b) { b.setAttribute("aria-pressed", "false") });
    e.target.closest(".cpk").classList.add("on")
});
document.addEventListener("change", function (e) { if (e.target.dataset && e.target.dataset.colp) drawItems() });

// Promo code events (own listeners: this file is loaded before events.js)
document.addEventListener("click", function (e) {
    if (e.target.id === "pcb") applyPromo();
    else if (e.target.id === "pcx") { promo = null; drawPromo("Code retiré.") }
});
document.addEventListener("keydown", function (e) { if (e.target.id === "pc" && e.key === "Enter") { e.preventDefault(); applyPromo() } });
