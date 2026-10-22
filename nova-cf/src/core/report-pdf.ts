/**
 * src/core/report-pdf.ts - "Historique des commandes" PDF (admin export)
 *
 * One PDF with every order of a period: a summary (orders, revenue, items, customers), then one block per order
 * (date, invoice number, customer, total, status + the items), oldest first, on as many A4 pages as needed.
 * Same toolkit as the invoice (src/core/pdf.ts): no PDF library, Helvetica, optional logo.
 */
import type { OrderSummary } from "../repo/types.ts"
import { C, enc, safe, cut, money, toPdfBytes, bytesToBinary, type InvoiceLogo } from "./pdf.ts"

export interface ReportOptions {
  period: string           // e.g. "Du 01/10/2026 au 17/10/2026" or "Toutes les commandes"
  cur: string
  tz: string
  generated: string        // e.g. "17/10/2026 14:30"
  logo?: InvoiceLogo
  truncated?: boolean      // true when more orders exist than the report cap
}

const PAGE_H = 842, ROW_H = 29, BOTTOM = 62

export function buildOrdersReportPdf(orders: OrderSummary[], o: ReportOptions): Uint8Array {
  const list = [...orders].sort((a, b) => a.at.localeCompare(b.at))   // oldest first: reads like a ledger
  const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: o.tz, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })

  const pages: string[] = []
  let c = ""
  let y = 0

  const text = (x: number, yy: number, v: string, size = 9, font: "F1" | "F2" = "F1", color = C.body) => {
    c += `BT ${color} rg /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm (${enc(v)}) Tj ET\n`
  }
  const rightText = (right: number, yy: number, v: string, size = 9, font: "F1" | "F2" = "F1", color = C.body) =>
    text(right - v.length * size * 0.5, yy, v, size, font, color)
  const rect = (x: number, yy: number, w: number, h: number, color: string) => { c += `${color} rg ${x} ${yy} ${w} ${h} re f\n` }
  const rule = (yy: number, color = C.faint) => { c += `${color} RG 0.7 w 40 ${yy} m 555 ${yy} l S\n` }

  // Column header row (every page)
  const columns = () => {
    rect(40, y - 8, 515, 22, C.accent)
    text(48, y - 1, "DATE", 7.5, "F2", C.white); text(112, y - 1, "FACTURE", 7.5, "F2", C.white); text(222, y - 1, "CLIENT", 7.5, "F2", C.white)
    rightText(478, y - 1, "TOTAL", 7.5, "F2", C.white); text(492, y - 1, "STATUT", 7.5, "F2", C.white)
    y -= 26
  }
  const newPage = () => {
    if (c) pages.push(c)
    c = ""
    rect(0, 826, 595, 16, C.accent)
    if (o.logo) {
      const h = pages.length === 0 ? 34 : 22, w = o.logo.width * h / o.logo.height
      c += `q ${w.toFixed(2)} 0 0 ${h} 40 ${pages.length === 0 ? 778 : 786} cm /Logo Do Q\n`
    } else text(40, pages.length === 0 ? 786 : 792, "NOVA 3D", pages.length === 0 ? 20 : 14, "F2", C.ink)
    if (pages.length === 0) {
      text(555 - 24 * 14 * 0.7, 790, "HISTORIQUE DES COMMANDES", 14, "F2", C.ink)    // bold capitals are wider than the 0.5 average used by rightText()
      rightText(555, 774, safe(o.period), 9, "F1", C.muted)
      rightText(555, 761, `Édité le ${o.generated}`, 8, "F1", C.muted)
      y = 700
    } else {
      text(555 - 24 * 8 * 0.7, 794, "HISTORIQUE DES COMMANDES", 8, "F2", C.muted)
      y = 790
    }
  }

  // Summary (first page)
  newPage()
  const customers = new Set(list.map((x) => (x.customer.email || x.customer.phone || x.customer.name).toLowerCase())).size
  const revenue = list.reduce((s, x) => s + x.total, 0), items = list.reduce((s, x) => s + x.lines.reduce((n, l) => n + l.q, 0), 0)
  rect(40, 706, 515, 40, C.panel)
  const stats: [string, string][] = [["COMMANDES", String(list.length)], ["CHIFFRE D'AFFAIRES", money(revenue, o.cur)], ["ARTICLES", String(items)], ["CLIENTS", String(customers)]]
  stats.forEach(([k, v], i) => { text(54 + i * 128, 731, k, 6.5, "F2", C.muted); text(54 + i * 128, 715, cut(v, 18), 11, "F2", C.ink) })
  y = 686
  columns()

  if (!list.length) text(48, y, "Aucune commande sur cette période.", 10, "F1", C.muted)

  list.forEach((x, i) => {
    if (y - ROW_H < BOTTOM) { newPage(); columns() }
    if (i % 2 === 1) rect(40, y - 17, 515, ROW_H - 1, "0.975 0.978 0.982")
    text(48, y, fmt.format(new Date(x.at)), 8, "F1", C.body)
    text(112, y, cut(safe(x.no), 22), 8, "F2", C.ink)
    text(222, y, cut(safe(x.customer.name), 30), 8.5, "F2", C.ink)
    rightText(478, y, money(x.total, x.cur), 8.5, "F2", C.ink)
    text(492, y, x.status === "done" ? "Traitée" : "À préparer", 8, "F1", x.status === "done" ? C.muted : "0.80 0.15 0.15")
    const articles = x.lines.map((l) => `${l.q} × ${l.n}${l.c ? ` [${l.cn || ""} ${l.c}]` : ""}`).join(", ")
    text(112, y - 12, cut(safe(articles) + (x.delivery > 0 ? `  (+ livraison ${money(x.delivery, x.cur)})` : ""), 108), 7, "F1", C.muted)
    y -= ROW_H
  })

  // Closing total
  if (list.length) {
    if (y - 50 < BOTTOM) newPage()
    y -= 6; rule(y + 14, C.ink)
    text(48, y - 2, `${list.length} commande${list.length > 1 ? "s" : ""}  ·  ${items} article${items > 1 ? "s" : ""}  ·  ${customers} client${customers > 1 ? "s" : ""}`, 8.5, "F1", C.muted)
    rightText(555, y - 2, `TOTAL : ${money(revenue, o.cur)}`, 11, "F2", C.ink)
    if (o.truncated) text(48, y - 18, "Seules les commandes les plus récentes sont incluses (limite atteinte).", 7.5, "F1", C.muted)
  }
  pages.push(c)

  // Footer with page numbers, then assemble the PDF
  const total = pages.length
  const objects: string[] = [""]
  let next = 1
  const add = (body: string) => { const id = next++; objects[id] = `${id} 0 obj\n${body}\nendobj\n`; return id }

  let xobj = ""
  if (o.logo && o.logo.rgb.length === o.logo.width * o.logo.height * 3) {
    const px = o.logo.rgbDeflate || o.logo.rgb
    const id = add(`<< /Type /XObject /Subtype /Image /Width ${o.logo.width} /Height ${o.logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${o.logo.rgbDeflate ? " /Filter /FlateDecode" : ""} /Length ${px.length} >>\nstream\n${bytesToBinary(px)}\nendstream`)
    xobj = `/XObject << /Logo ${id} 0 R >>`
  }
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
  const pageIds: number[] = []
  const contentIds = pages.map((body, i) => {
    const foot = `${C.faint} RG 0.8 w 40 46 m 555 46 l S\n` +
      `BT ${C.muted} rg /F1 7.5 Tf 1 0 0 1 40 32 Tm (${enc("NOVA 3D  ·  Historique des commandes")}) Tj ET\n` +
      `BT ${C.muted} rg /F1 7.5 Tf 1 0 0 1 ${(555 - `Page ${i + 1} / ${total}`.length * 3.75).toFixed(2)} 32 Tm (${enc(`Page ${i + 1} / ${total}`)}) Tj ET\n`
    const full = body + foot
    return add(`<< /Length ${full.length} >>\nstream\n${full}endstream`)
  })
  const pagesId = next + contentIds.length     // the /Pages object is added after the page objects
  contentIds.forEach((cid) => pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${xobj} >> /Contents ${cid} 0 R >>`)))
  const pagesObj = add(`<< /Type /Pages /Kids [${pageIds.map((id) => id + " 0 R").join(" ")}] /Count ${pageIds.length} >>`)
  if (pagesObj !== pagesId) throw new Error("PDF object numbering error")
  const catalog = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`)

  let pdf = "%PDF-1.4\n"
  const offsets = new Array<number>(next).fill(0)
  for (let id = 1; id < next; id++) { offsets[id] = pdf.length; pdf += objects[id] }
  const xref = pdf.length
  pdf += `xref\n0 ${next}\n0000000000 65535 f \n` + offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${next} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`
  return toPdfBytes(pdf)
}
