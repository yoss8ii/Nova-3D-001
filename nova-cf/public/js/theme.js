/* NOVA 3D - public/js/theme.js
 * Light / dark theme. Loaded in <head> WITHOUT "defer" so the saved choice is applied before the page is drawn (no flash).
 * No saved choice = the device decides (CSS @media prefers-color-scheme). The header button (#tg, see layout() in ui.js) calls toggleTheme().
 * The colours themselves are the CSS variables of css/styles.css, section 1. */
(function () {
    try { var t = localStorage.getItem("n3d_theme"); if (t === "dark" || t === "light") document.documentElement.dataset.theme = t } catch (e) { }
})();

// Switches between light and dark and remembers the choice
function toggleTheme() {
    var d = document.documentElement, dark = d.dataset.theme ? d.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    d.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("n3d_theme", d.dataset.theme) } catch (e) { }
}
