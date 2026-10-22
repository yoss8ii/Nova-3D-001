/**
 * src/core/vat.ts - TVA (VAT) of Tunisia
 *
 * Tunisian rates: 19 % (standard), 13 % and 7 % (reduced). The shop uses ONE rate for the whole invoice: VAT_RATE in wrangler.jsonc
 * (a percentage, "19"; "0" or missing = no VAT shown).
 * The prices of the shop are TTC (VAT included): what the customer pays does not change. The invoice only SHOWS how the total splits
 * into "Total HT" + "TVA". Delivery is part of the total, so it is covered too.
 */
const r2 = (n: number) => Math.round(n * 100) / 100

// "19" / 19 / "19,5" -> 19 / 19.5. Anything invalid, negative or above 100 -> 0 (no VAT)
export function cleanVatRate(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(",", "."))
  return Number.isFinite(n) && n > 0 && n <= 100 ? r2(n) : 0
}

// Splits a TTC total into HT + VAT (ht + vat = total, to the cent)
export function splitVat(totalTtc: number, ratePct: number): { rate: number; ht: number; vat: number } {
  const rate = cleanVatRate(ratePct)
  if (!rate) return { rate: 0, ht: r2(totalTtc), vat: 0 }
  const ht = r2(totalTtc / (1 + rate / 100))
  return { rate, ht, vat: r2(totalTtc - ht) }
}
