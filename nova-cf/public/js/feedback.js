/* NOVA 3D - public/js/feedback.js
 * Home page "Votre avis compte": rate the service 1 (mauvais) to 5 stars (très bien), with an optional name and comment.
 * GET /api/feedback = average + latest ratings, POST /api/feedback = send one. Markup: <section id="feedbackSec"> in index.html,
 * styles: section "Service rating" at the end of css/styles.css. Plain script: shares the other files' globals. */

// Message shown for each rating (changes by itself when the mouse passes over a star, or when a star is chosen)
var STAR_WORDS = [
    "",
    "Insatisfait",
    "Peu satisfait",
    "Moyennement satisfait",
    "Satisfait",
    "Très satisfait"
];

var STAR_IDLE = "Passez sur les étoiles pour noter";

function starWord(n) {
    return STAR_WORDS[n] || STAR_IDLE;
}

function chosenWord() {
    var c = document.querySelector('input[name="stars"]:checked');
    return starWord(c ? Number(c.value) : 0);
}

// "★★★☆☆" for n stars
function starText(n) { return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n) }

// Average + the latest ratings that have a comment (max 6)
function loadFeedback() {
    var sum = $("fbSum"), list = $("fbList");
    if (!sum || !list) return;
    fetch("/api/feedback")
        .then(function (r) { return r.ok ? r.json() : null })
        .catch(function () { return null })
        .then(function (d) {
            if (!d) return;
            sum.innerHTML = d.count ? '<span class="stars-ro" aria-hidden="true">' + starText(Math.round(d.avg)) + '</span> <b>' + String(d.avg).replace(".", ",") + ' / 5</b> · ' + d.count + (d.count > 1 ? ' avis' : ' avis') : "";
            list.innerHTML = (d.items || []).filter(function (x) { return x.comment }).slice(0, 6).map(function (x) {
                return '<figure class="fb-card"><div class="stars-ro" aria-label="' + x.stars + ' sur 5">' + starText(x.stars) + '</div>'
                    + '<blockquote>' + esc(x.comment) + '</blockquote><figcaption>' + esc(x.name || "Anonyme") + '</figcaption></figure>'
            }).join("")
        })
}

// Sending the form (no inline script: the page's security policy forbids it)
document.addEventListener("submit", function (e) {
    if (e.target.id !== "fbForm") return;
    e.preventDefault();
    var msg = $("fbMsg"), btn = e.target.querySelector("button"), st = e.target.querySelector('input[name="stars"]:checked');
    if (!st) { msg.textContent = "Choisissez une note de 1 à 5 étoiles."; msg.className = "fb-msg err"; return }
    btn.disabled = true; msg.textContent = "Envoi…"; msg.className = "fb-msg";
    fetch("/api/feedback", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ stars: Number(st.value), name: $("fbName").value, comment: $("fbText").value, website: $("fbWeb").value })
    }).then(function (r) { return r.json().catch(function () { return {} }).then(function (j) { return { ok: r.ok, j: j } }) })
        .catch(function () { return { ok: false, j: { message: "Connexion impossible, réessayez." } } })
        .then(function (o) {
            btn.disabled = false;
            if (!o.ok) { msg.textContent = o.j.message || "Une erreur est survenue, réessayez."; msg.className = "fb-msg err"; return }
            e.target.reset(); showWord(0);
            msg.textContent = "Merci pour votre avis !"; msg.className = "fb-msg ok";
            loadFeedback()
        })
});

// Dynamic message under the stars: hover (mouse) or focus (keyboard) shows that rating, leaving shows the chosen one
function showWord(n) { var w = $("fbWord"); if (w) w.textContent = n ? starWord(n) : chosenWord() }
document.addEventListener("mouseover", function (e) {
    var l = e.target.closest && e.target.closest(".stars-row label");
    if (l) showWord(Number(l.htmlFor.replace("st", "")))
});
document.addEventListener("mouseout", function (e) {
    if (e.target.closest && e.target.closest(".stars-row") && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".stars-row"))) showWord(0)
});
document.addEventListener("focusin", function (e) { if (e.target.name === "stars") showWord(Number(e.target.value)) });
document.addEventListener("focusout", function (e) { if (e.target.name === "stars") showWord(0) });
document.addEventListener("change", function (e) {
    if (e.target.name !== "stars") return;
    showWord(0);
    var m = $("fbMsg"); m.textContent = ""; m.className = "fb-msg"
});
