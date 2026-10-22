/**
 * src/core/colors.ts - colour names for the "colour of the piece" option
 *
 * The customer can pick a colour for each cart line (or keep the piece identical to the photo = no colour).
 * The browser sends a hex colour "#rrggbb"; the server validates it and stores it on the order line:
 *   c  = the hex colour (lower case)        cn = the closest NAMED colour, in French, for people reading the order / invoice.
 * KEEP THIS LIST IN SYNC with PALETTE in public/js/core.js (the swatches the customer sees).
 */
export const PALETTE: [string, string][] = [
  ["Blanc", "#ffffff"], ["Noir", "#111111"], ["Gris", "#8e9196"], ["Rouge", "#d33322"],
  ["Orange", "#f08a24"], ["Jaune", "#f2c200"], ["Vert", "#2fa65a"], ["Vert menthe", "#7fd1ae"],
  ["Turquoise", "#00a6a6"], ["Bleu", "#2f6fe0"], ["Bleu marine", "#1b2a5c"], ["Violet", "#7b4bd6"],
  ["Rose", "#ee6aa7"], ["Marron", "#7a4a2b"], ["Beige", "#d8c3a0"], ["Doré", "#c9a227"],
]

const HEX = /^#[0-9a-f]{6}$/i

// A valid colour from the browser (lower-case "#rrggbb"), or undefined (= "identical to the photo")
export function cleanColor(v: unknown): string | undefined {
  return typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : undefined
}

// "#d33322" -> [211, 51, 34]
export const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

// Closest palette name (squared distance in RGB, weighted a little for the eye: green counts more)
export function colorName(hex: string): string {
  const [r, g, b] = rgbOf(hex)
  let best = PALETTE[0][0], bestD = Infinity
  for (const [name, h] of PALETTE) {
    const [pr, pg, pb] = rgbOf(h)
    const d = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2
    if (d < bestD) { bestD = d; best = name }
  }
  return best
}

// Text used on documents: "Rouge (#d33322)"
export const colorLabel = (hex: string, name?: string) => `${name || colorName(hex)} (${hex})`
