    
    /* NOVA - public/js/admin-soon.js
     * Admin "Page d'attente" tab.
     * Uses call(), esc(), $(), toast(), httpErr(), zoneMark() from admin.js / admin-ui.js.
     * Load order: after admin-promo.js.
     *
     * Lucide icons:
     * - construction: waiting page active
     * - circle-check: waiting page disabled
     */
    
    var SOON = null;
    var SOON_ED = null;
    
    function soonIcons() {
        if (window.lucide && typeof window.lucide.createIcons === "function") {
            window.lucide.createIcons();
        }
    }
    
    function soonBadge() {
        var b = $("nbs");
        if (!b) return;
    
        b.classList.toggle(
            "hide",
            !(SOON && SOON.available && SOON.on)
        );
    }
    
    function drawSoon() {
        if (!SOON) return;
    
        var e = !!SOON_ED;
        var v = SOON_ED || SOON;
        var dis = e ? "" : " disabled";
    
        // Status card
        $("soonstate").innerHTML = !SOON.available
            ? '<p class="note err" style="margin:0 0 8px">' +
              "Stockage non configuré : la page d'attente est désactivée et le site reste ouvert." +
              "</p>" +
              '<p class="note" style="margin:0">' +
              'Une seule fois : <code>npx wrangler kv namespace create NOVA_KV</code>, ' +
              'collez l’identifiant affiché dans <code>wrangler.jsonc</code> ' +
              '(bloc <code>kv_namespaces</code>), puis <code>npm run deploy</code>. ' +
              'Détails : DEPLOY.md, « Page Bientôt disponible ».' +
              "</p>"
            : '<p style="margin:0;font-weight:800;font-size:17px">' +
              (
                  SOON.on
                      ? '<i data-lucide="construction" class="soon-icon" aria-hidden="true"></i> ' +
                        "Page d'attente ACTIVE : les visiteurs ne voient que cette page."
                      : '<i data-lucide="circle-check" class="soon-icon" aria-hidden="true"></i> ' +
                        "Page d'attente désactivée : le site est ouvert à tous."
              ) +
              "</p>" +
              '<p class="note" style="margin:6px 0 0">' +
              "Cette page d'administration reste toujours accessible. " +
              "Un changement est visible sur le site en moins d'une minute." +
              "</p>";
    
        var off = !SOON.available ? " disabled" : dis;
    
        $("soonbox").innerHTML =
            '<label class="chk">' +
            '<input type="checkbox" data-soon="on"' +
            (v.on ? " checked" : "") + off +
            '> Afficher la page « Bientôt disponible » à la place du site' +
            "</label>" +
    
            '<div class="g">' +
            "<div>" +
            '<label for="soon-tf">Titre (français)</label>' +
            '<input id="soon-tf" data-soon="titleFr" maxlength="80" value="' +
            esc(v.titleFr) + '"' + off + ">" +
            "</div>" +
    
            "<div>" +
            '<label for="soon-ta">Titre (arabe)</label>' +
            '<input id="soon-ta" data-soon="titleAr" maxlength="80" dir="rtl" lang="ar" value="' +
            esc(v.titleAr) + '"' + off + ">" +
            "</div>" +
            "</div>" +
    
            '<div class="g">' +
            "<div>" +
            '<label for="soon-xf">Message (français)</label>' +
            '<textarea id="soon-xf" data-soon="textFr" rows="4" maxlength="600"' +
            off + ">" + esc(v.textFr) + "</textarea>" +
            "</div>" +
    
            "<div>" +
            '<label for="soon-xa">Message (arabe)</label>' +
            '<textarea id="soon-xa" data-soon="textAr" rows="4" maxlength="600" dir="rtl" lang="ar"' +
            off + ">" + esc(v.textAr) + "</textarea>" +
            "</div>" +
            "</div>" +
    
            '<div class="g">' +
            "<div>" +
            '<label for="soon-ig">Instagram (adresse ou @pseudo)</label>' +
            '<input id="soon-ig" data-soon="instagram" maxlength="120" ' +
            'placeholder="https://www.instagram.com/nova_tn_3d" value="' +
            esc(v.instagram) + '"' + off + ">" +
            "</div>" +
    
            "<div>" +
            '<label for="soon-wa">WhatsApp (avec l’indicatif, sans +)</label>' +
            '<input id="soon-wa" data-soon="whatsapp" maxlength="20" inputmode="tel" ' +
            'placeholder="21626183165" value="' +
            esc(v.whatsapp) + '"' + off + ">" +
            "</div>" +
            "</div>" +
    
            '<p class="note" style="margin:0 0 4px">' +
            "Un champ de contact vidé cache le bouton correspondant. " +
            "Un titre ou un message vide reprend le texte par défaut." +
            "</p>" +
    
            '<div class="dvact" id="soonact">' +
            (
                !SOON.available
                    ? ""
                    : e
                        ? '<button type="button" class="pill sm" data-soon-ok="1">Enregistrer</button> ' +
                          '<button type="button" class="link" data-soon-cancel="1">Annuler</button>'
                        : '<button type="button" class="link" data-soon-edit="1">Modifier</button>'
            ) +
            "</div>";
    
        soonBadge();
        soonIcons();
    }
    
    // Read saved settings from the server.
    // quiet = suppress error toast, used during login.
    function loadSoon(quiet) {
        return fetch("/api/coming-soon?fresh=1", {
            cache: "no-store"
        })
            .then(function (r) {
                if (!r.ok) throw r.status;
                return r.json();
            })
            .then(function (d) {
                SOON = d;
                drawSoon();
            })
            .catch(function (s) {
                if (!quiet) {
                    toast(
                        typeof s === "number"
                            ? "Page d'attente : " + httpErr(s)
                            : "Erreur réseau.",
                        "err"
                    );
                }
    
                throw s;
            });
    }
    
    // Read the current form values.
    function readSoonFields() {
        var d = {};
    
        [].forEach.call(
            $("soonbox").querySelectorAll("[data-soon]"),
            function (el) {
                d[el.dataset.soon] =
                    el.type === "checkbox" ? el.checked : el.value;
            }
        );
    
        return d;
    }
    
    // Handle actions using event delegation.
    $("soonbox").addEventListener("click", function (e) {
        var t = e.target;
    
        // Support clicks on SVG icons and nested elements inside buttons.
        if (t && typeof t.closest === "function") {
            t = t.closest(
                "[data-soon-edit], [data-soon-cancel], [data-soon-ok]"
            ) || t;
        }
    
        var card = $("soonbox");
    
        if (t.dataset.soonEdit !== undefined) {
            SOON_ED = {
                on: SOON.on,
                titleFr: SOON.titleFr,
                textFr: SOON.textFr,
                titleAr: SOON.titleAr,
                textAr: SOON.textAr,
                instagram: SOON.instagram,
                whatsapp: SOON.whatsapp
            };
    
            drawSoon();
            return;
        }
    
        if (t.dataset.soonCancel !== undefined) {
            SOON_ED = null;
            drawSoon();
            return;
        }
    
        if (t.dataset.soonOk === undefined) return;
    
        var body = readSoonFields();
    
        zoneMark([card], "saving");
        t.disabled = true;
    
        call("PUT", "/api/coming-soon", body)
            .then(function (r) {
                return r.json()
                    .catch(function () {
                        return {};
                    })
                    .then(function (d) {
                        if (!r.ok) {
                            throw d.field
                                ? { field: d.field }
                                : r.status;
                        }
    
                        return loadSoon(true);
                    });
            })
            .then(function () {
                SOON_ED = null;
                drawSoon();
    
                zoneMark([$("soonbox")], "saved");
                toast("Page d'attente enregistrée.", "ok");
    
                setTimeout(function () {
                    zoneMark([$("soonbox")], null);
                }, 1800);
            })
            .catch(function (m) {
                zoneMark([card], "failed");
    
                // The original button may have been replaced by drawSoon().
                var saveButton = card.querySelector("[data-soon-ok]");
                if (saveButton) saveButton.disabled = false;
    
                setTimeout(function () {
                    zoneMark([card], null);
                }, 2200);
    
                toast(
                    m && m.field === "instagram"
                        ? "Instagram : entrez une adresse instagram.com ou un @pseudo."
                        : m && m.field === "whatsapp"
                            ? "WhatsApp : entrez le numéro avec l'indicatif (8 à 15 chiffres)."
                            : m === 501
                                ? "Stockage non configuré (voir l'encadré en haut)."
                                : "Page d'attente : " +
                                  (typeof m === "number"
                                      ? httpErr(m)
                                      : "erreur réseau."),
                    "err"
                );
            });
    });
    