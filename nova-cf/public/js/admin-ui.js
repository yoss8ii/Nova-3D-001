/* NOVA 3D - public/js/admin-ui.js
 * Admin page: helpers, toast notifications and Yes/No confirmation. Load order: admin-ui.js, admin.js, admin-reviews.js. */

// Escape text before putting it in innerHTML
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] }) }
// Shortcut for getElementById
function $(i) { return document.getElementById(i) }
// Toast icons by type: ok (green), del (red), err (orange)
var TI = { ok: "✓", del: "✕", err: "!" };
// Shows a small notification at the top for ~3 s (5 s for errors). Max 4 at once. type = "ok" | "del" | "err"
function toast(msg, type) {
    type = type || "ok";
    var box = $("toasts"), t = document.createElement("div");
    t.className = "toast " + type;
    t.setAttribute("role", type === "err" ? "alert" : "status");
    t.innerHTML = '<span class="ti" aria-hidden="true">' + TI[type] + '</span><span>' + esc(msg) + '</span>';
    while (box.children.length >= 4) box.removeChild(box.firstChild);
    box.appendChild(t);
    requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add("in") }) });
    function close() { t.classList.remove("in"); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t) }, 300) }
    t.onclick = close;
    setTimeout(close, type === "err" ? 5000 : 2800)
}
// Yes/No confirmation shown as a toast. Returns a Promise: true if "Oui", false if "Non" or Esc.
// Usage: ask("Supprimer ?").then(function (yes) { if (yes) ... })
function ask(msg) {
    return new Promise(function (res) {
        var box = $("toasts"), t = document.createElement("div");
        t.className = "toast ask";
        t.setAttribute("role", "alertdialog");
        t.innerHTML = '<span class="ti" aria-hidden="true">?</span><span class="toast-msg">' + esc(msg) + '</span><span class="toast-btns"><button type="button" data-a="1">Oui</button><button type="button" class="no" data-a="0">Non</button></span>';
        box.appendChild(t);
        requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add("in") }) });
        function done(v) {
            document.removeEventListener("keydown", key);
            t.classList.remove("in");
            setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t) }, 300);
            res(v)
        }
        function key(e) { if (e.key === "Escape") done(false) }
        t.addEventListener("click", function (e) { var a = e.target.dataset.a; if (a !== undefined) done(a === "1") });
        document.addEventListener("keydown", key);
        t.querySelector(".no").focus()
    })
}
// Turns an HTTP status code into a French message for the user
function httpErr(s) { return s === 401 ? "Mot de passe invalide ou session expirée." : s === 403 ? "Accès refusé : changez d'abord le mot de passe d'origine." : s === 413 ? "Fichier trop lourd." : s === 415 ? "Format d'image non supporté." : s === 429 ? "Trop de requêtes, réessayez dans un instant." : "Erreur serveur (" + s + ")." }

// Money: 12.5 -> "12,5 TND" (French format, max 2 decimals)
function fmtMoney(n, cur) { return Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " " + (cur || "") }
// Date + time of an ISO moment, in the shop's time zone (tz comes from the API)
function fmtDate(iso, tz) { try { return new Date(iso).toLocaleString("fr-FR", { timeZone: tz || "Africa/Tunis", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) } catch (e) { return iso } }
// Plural helper: plur(3, "commande") -> "3 commandes"
function plur(n, w) { return n + " " + w + (n > 1 ? "s" : "") }


// ---- Zone feedback: a small circular loader on the zone that is being saved, then a green tick (or a red "!") ----------
// els = array of elements; state = "saving" | "saved" | "failed" | null (clears). CSS: .zs-* rules in css/admin.css.
function zoneMark(els, state) {
    (els || []).forEach(function (e) {
        if (!e) return;
        e.classList.remove("zs-saving", "zs-saved", "zs-failed");
        if (state) e.classList.add("zs-" + state)
    })
}
