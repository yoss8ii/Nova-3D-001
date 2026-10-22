/**
 * src/core/tax.ts - VAT (TVA) shown on invoices
 *
 * Catalogue prices are the prices the customer pays (TTC = VAT included). The VAT is therefore
 * EXTRACTED from the total, never added on top: the amount to pay does not change.
 *   HT  = TTC / (1 + rate / 100)        TVA = TTC - HT
 * Settings (wrangler.jsonc "vars"): TVA_RATE (default 19) and TVA_NUMBER (the shop's tax ID / matricule fiscal,
 * printed on the invoice when filled in). TVA_RATE = "0" hides the VAT lines.
 */
export interface VatConfig { rate: number; number?: string }
export const DEFAULT_VAT: VatConfig = { rate: 19 }

const round2 = (n: number) => Math.round(n * 100) / 100

// Reads the two settings; anything invalid falls back to 19 %
export function vatFromEnv(rate?: string, number?: string): VatConfig {
  const r = rate === undefined || String(rate).trim() === "" ? DEFAULT_VAT.rate : Number(String(rate).replace(",", "."))
  const n = String(number || "").trim().slice(0, 40)
  return { rate: Number.isFinite(r) && r >= 0 && r < 100 ? r : DEFAULT_VAT.rate, ...(n ? { number: n } : {}) }
}

// Splits a VAT-inclusive total into HT + TVA (TVA = TTC - HT, so HT + TVA always equals the total to the cent)
export function vatBreakdown(totalTtc: number, rate: number) {
  const ht = round2(totalTtc / (1 + rate / 100))
  return { ht, tva: round2(totalTtc - ht), ttc: totalTtc }
}

// "19 %" / "7,5 %"
export const rateLabel = (rate: number) => String(rate).replace(".", ",") + " %"
