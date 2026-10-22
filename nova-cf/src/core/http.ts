/** src/core/http.ts - tiny helpers shared by the route handlers */

// JSON response. "no-store" = browsers/CDN must not cache it (prices and stock stay fresh).
export const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  })

// Escape text before putting it in HTML (used by the invoice e-mail)
export const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
