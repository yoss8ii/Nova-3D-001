/* NOVA - public/js/toast.js
 * Public pages: the same toast notifications and Yes/No confirmation as the admin page (styles: "toasts" in styles.css).
 *   toast("Message", "ok" | "del" | "err")      small notification at the top (~3 s, 5 s for errors)
 *   ask("Question ?").then(function (yes) {})    Yes/No toast, Esc = No
 * Plain script: uses esc() from core.js. Load it before events.js. */

var TOAST_IC = { ok: "✓", del: "✕", err: "!" };
function toastBox() {
    var b = document.getElementById("toasts");
    if (!b) { b = document.createElement("div"); b.id = "toasts"; b.setAttribute("aria-live", "polite"); document.body.appendChild(b) }
    return b
}
function toast(msg, type) {
    type = type || "ok";
    var box = toastBox(), t = document.createElement("div");
    t.className = "toast " + type;
    t.setAttribute("role", type === "err" ? "alert" : "status");
    t.innerHTML = '<span class="ti" aria-hidden="true">' + TOAST_IC[type] + '</span><span>' + esc(msg) + '</span>';
    while (box.children.length >= 4) box.removeChild(box.firstChild);
    box.appendChild(t);
    requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add("in") }) });
    function close() { t.classList.remove("in"); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t) }, 300) }
    t.onclick = close;
    setTimeout(close, type === "err" ? 5000 : 2800)
}
function ask(msg) {
    return new Promise(function (res) {
        var box = toastBox(), t = document.createElement("div");
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
