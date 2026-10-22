/* NOVA 3D - public/js/custom.js
 * Custom order page.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order: core, ui, data, custom, events, main. */

/* =====================================================================
 * CUSTOM ORDER PAGE  (data-page="custom")
 * The request is saved (POST /api/custom, shown in the admin tab "Sur mesure") AND opened in WhatsApp with a ready-made message.
 * WhatsApp is opened first, inside the click, so phones do not block the pop-up; the save runs in parallel and its failure is harmless.
 * ===================================================================== */

// Colour swatches (from PALETTE in core.js); the selected one has aria-pressed="true"
function drawSw() {
    $("sw").innerHTML = PALETTE.map(function (c) {
        return '<button type="button" data-c="' + esc(c[0]) + '" style="--c:' + c[1] + '" title="' + esc(c[0]) + '" aria-label="' + esc(c[0]) + '" aria-pressed="' + (c[0] === col) + '"></button>'
    }).join("")
}

function customPage() {
    drawSw();
    $("send").onclick = function () {
        var d = $("cd").value.trim(), n = $("cn").value.trim(), p = $("cp").value.trim(), b = $("cb").value.trim();
        if (!d) { $("cd").focus(); return }   // description is the only required field
        window.open("https://wa.me/" + SITE.phone + "?text=" + encodeURIComponent(
            "Demande de commande sur mesure\nNom : " + (n || "-") + (p ? "\nTéléphone : " + p : "") + "\nDescription : " + d + "\nCouleur : " + col + (b ? "\nBudget : " + b + " " + SITE.currency : "")
        ), "_blank");
        fetch("/api/custom", {
            method: "POST", keepalive: true, headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: n, phone: p, description: d, color: col, budget: b, website: $("cw").value })
        }).then(function (r) { if (r.ok) notify("Demande enregistrée. Nous vous répondons avec un prix et un délai.") }).catch(function () { })
    }
}
