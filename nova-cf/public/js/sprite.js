/* NOVA 3D - public/js/sprite.js
 * SVG shapes used by the 3D previews.
 * Plain script (no modules): shares the global variables of the other files in public/js.
 * Load order is fixed in every HTML page: sprite, core, ui, data, home, reviews, shop, cart, custom, events, main. */

/* =====================================================================
 * 1. SVG SPRITE
 * The 8 shapes available for the 3D preview of a product (key, heart,
 * badge, hex, spin, dragon, cube, ball). Each is a <symbol id="s-NAME">.
 * A product's "shape" field in the admin picks one of them; obj() below
 * stacks the same shape several times to fake a 3D printed object.
 * >>> To add a shape: add a <symbol id="s-myshape"> here, add ["myshape","Label"]
 *     to the SH list in the admin page, and add "myshape" to SHAPES in
 *     src/core/catalog.ts. <<<
 * ===================================================================== */
var SPRITE = "<svg width=\"0\" height=\"0\" style=\"position:absolute\" aria-hidden=\"true\"><defs>\n<symbol id=\"s-key\" viewBox=\"0 0 100 100\"><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M20 30h60a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H20a10 10 0 0 1-10-10V40a10 10 0 0 1 10-10zM26 44a6 6 0 1 0 .01 0z\"/></symbol>\n<symbol id=\"s-heart\" viewBox=\"0 0 100 100\"><path fill=\"currentColor\" d=\"M50 88C6 56 10 18 33 18c9 0 15 6 17 13 2-7 8-13 17-13 23 0 27 38-17 70z\"/></symbol>\n<symbol id=\"s-badge\" viewBox=\"0 0 100 100\"><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M50 10a40 40 0 1 0 .01 0zM50 24a26 26 0 1 1-.01 0z\"/><circle cx=\"50\" cy=\"50\" r=\"12\" fill=\"currentColor\"/></symbol>\n<symbol id=\"s-hex\" viewBox=\"0 0 100 100\"><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M50 8L88 29V71L50 92L12 71V29zM50 36a8 8 0 1 0 .01 0z\"/></symbol>\n<symbol id=\"s-spin\" viewBox=\"0 0 100 100\"><g stroke=\"currentColor\" fill=\"none\" stroke-linecap=\"round\"><path stroke-width=\"14\" d=\"M50 50L50 24M50 50L27 63M50 50L73 63\"/><circle cx=\"50\" cy=\"20\" r=\"11\" stroke-width=\"7\"/><circle cx=\"25\" cy=\"66\" r=\"11\" stroke-width=\"7\"/><circle cx=\"75\" cy=\"66\" r=\"11\" stroke-width=\"7\"/></g><circle cx=\"50\" cy=\"50\" r=\"13\" fill=\"currentColor\"/></symbol>\n<symbol id=\"s-dragon\" viewBox=\"0 0 100 100\"><path d=\"M14 74C28 14 46 14 50 48S72 88 84 36\" stroke=\"currentColor\" stroke-width=\"12\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"84\" cy=\"30\" r=\"11\" fill=\"currentColor\"/></symbol>\n<symbol id=\"s-cube\" viewBox=\"0 0 100 100\"><path fill=\"currentColor\" d=\"M50 8L88 29V71L50 92L12 71V29z\"/><path stroke=\"#0006\" stroke-width=\"4\" fill=\"none\" d=\"M12 29L50 50L88 29M50 50V92\"/></symbol>\n<symbol id=\"s-ball\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"38\" fill=\"currentColor\"/><circle cx=\"50\" cy=\"50\" r=\"20\" fill=\"none\" stroke=\"#0006\" stroke-width=\"5\"/></symbol>\n</defs></svg>";
