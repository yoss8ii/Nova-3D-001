/**
 * NOVA 3D — modern A4 invoice PDF generator.
 *
 * Runtime: Cloudflare Workers / browser-compatible TypeScript.
 * No external PDF library.
 *
 * Logo source in the project: public/images/NOVA_3D_logo_black.png
 * Pass the decoded image as `logo` when calling buildInvoicePdf().
 * PNG files are not decoded automatically by this module.
 */
import type { OrderLine } from "../repo/types.ts"
import { colorLabel, rgbOf } from "./colors.ts"

export interface InvoiceLogo {
  width: number
  height: number
  /** RGB pixel data: width * height * 3 bytes */
  rgb: Uint8Array
  /** Optional alpha data: width * height bytes */
  alpha?: Uint8Array
  /** Same pixels, zlib-compressed (made by decodePngLogo): the PDF then embeds them with /FlateDecode and stays small */
  rgbDeflate?: Uint8Array
  alphaDeflate?: Uint8Array
}

// zlib-compress bytes (CompressionStream: Workers, Node 18+, browsers). The result is exactly what the PDF /FlateDecode filter reads.
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer())
}

export interface InvoiceData {
  no: string
  date: string
  cur: string
  customer: {
    name: string
    email: string
    phone: string
    address: string
  }
  lines: OrderLine[]
  delivery: number
  total: number
  /** Promo code used and the amount it took off the products (optional) */
  discount?: number
  promo?: string
  /** Decoded pixels of the invoice logo (public/images/NOVA_3D_logo_invoice.png) */
  logo?: InvoiceLogo
  /** Shop contacts printed in the footer (from public/data/site.json); empty ones are skipped */
  contacts?: { phone?: string; facebook?: string; instagram?: string }
}

// "https://www.instagram.com/nova3d/" -> "instagram.com/nova3d" (short text for the footer)
const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "")

// WinAnsi bytes supported by the built-in Helvetica PDF fonts.
const WIN: Record<string, number> = {
  "’": 0x92, "‘": 0x91, "“": 0x93, "”": 0x94,
  "–": 0x96, "—": 0x97, "€": 0x80, "œ": 0x9c,
  "Œ": 0x8c, "…": 0x85, "•": 0x95, "\u202f": 0x20,
}

export const C = {
  ink: "0.10 0.12 0.16",
  body: "0.22 0.25 0.30",
  muted: "0.40 0.44 0.49",
  faint: "0.91 0.92 0.94",
  panel: "0.96 0.97 0.98",
  white: "1 1 1",
  accent: "0.10 0.16 0.24",
}

export function enc(value: string): string {
  let out = ""
  for (const ch of value) {
    const code = ch.codePointAt(0)!
    const byte = WIN[ch] ??
      ((code >= 32 && code < 127) || (code >= 160 && code <= 255) ? code : 63)
    out += byte === 40 || byte === 41 || byte === 92
      ? "\\" + String.fromCharCode(byte)
      : String.fromCharCode(byte)
  }
  return out
}

export function safe(value: unknown): string {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim()
}

export function cut(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "…" : value
}

export function money(value: number, currency: string): string {
  const amount = (Number.isFinite(value) ? value : 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${amount} ${currency}`.replace(/[\u202f\u00a0]/g, " ")
}

// Convert a byte-string to bytes without UTF-8 changing WinAnsi characters.
export function toPdfBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code > 255) throw new Error(`Invalid PDF byte at index ${i}`)
    bytes[i] = code
  }
  return bytes
}

export function bytesToBinary(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return out
}


/**
 * Decode an 8-bit RGB/RGBA PNG into pixels for the PDF image object.
 * Works in Cloudflare Workers (uses the built-in DecompressionStream).
 * Pass the bytes of public/images/NOVA_3D_logo_black.png.
 */
export async function decodePngLogo(png: Uint8Array): Promise<InvoiceLogo> {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (png.length < 33 || !signature.every((v, i) => png[i] === v)) {
    throw new Error("Invalid PNG logo file")
  }

  const readU32 = (i: number) =>
    (((png[i] << 24) | (png[i + 1] << 16) | (png[i + 2] << 8) | png[i + 3]) >>> 0)

  const width = readU32(16)
  const height = readU32(20)
  const bitDepth = png[24]
  const colorType = png[25]
  const interlace = png[28]

  if (!width || !height || bitDepth !== 8 || interlace !== 0 ||
      (colorType !== 2 && colorType !== 6)) {
    throw new Error("Logo PNG must be non-interlaced 8-bit RGB or RGBA")
  }

  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const idat: Uint8Array[] = []
  let idatLength = 0
  let offset = 8

  while (offset + 12 <= png.length) {
    const length = readU32(offset)
    const type = String.fromCharCode(
      png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7],
    )
    const start = offset + 8
    const end = start + length
    if (end + 4 > png.length) throw new Error("Corrupt PNG chunk")

    if (type === "IDAT") {
      const chunk = png.slice(start, end)
      idat.push(chunk)
      idatLength += chunk.length
    }
    offset = end + 4
    if (type === "IEND") break
  }

  const compressed = new Uint8Array(idatLength)
  let pos = 0
  for (const chunk of idat) {
    compressed.set(chunk, pos)
    pos += chunk.length
  }

  // PNG IDAT stores a zlib-wrapped DEFLATE stream.
  const decompressed = new Uint8Array(
    await new Response(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate")),
    ).arrayBuffer(),
  )

  const expectedLength = height * (stride + 1)
  if (decompressed.length !== expectedLength) {
    throw new Error("Unexpected PNG pixel data length")
  }

  const raw = new Uint8Array(height * stride)
  let input = 0

  // Reverse PNG scanline filters (None, Sub, Up, Average and Paeth).
  const paeth = (a: number, b: number, c: number) => {
    const estimate = a + b - c
    const da = Math.abs(estimate - a)
    const db = Math.abs(estimate - b)
    const dc = Math.abs(estimate - c)
    return da <= db && da <= dc ? a : db <= dc ? b : c
  }

  for (let y = 0; y < height; y++) {
    const filter = decompressed[input++]
    const rowStart = y * stride
    for (let x = 0; x < stride; x++) {
      const value = decompressed[input++]
      const left = x >= channels ? raw[rowStart + x - channels] : 0
      const up = y > 0 ? raw[rowStart + x - stride] : 0
      const upperLeft = y > 0 && x >= channels
        ? raw[rowStart + x - stride - channels]
        : 0

      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = Math.floor((left + up) / 2)
      else if (filter === 4) predictor = paeth(left, up, upperLeft)
      else if (filter !== 0) throw new Error("Unsupported PNG filter")

      raw[rowStart + x] = (value + predictor) & 255
    }
  }

  const rgb = new Uint8Array(width * height * 3)
  const alpha = colorType === 6 ? new Uint8Array(width * height) : undefined

  for (let pixel = 0; pixel < width * height; pixel++) {
    const source = pixel * channels
    const target = pixel * 3
    rgb[target] = raw[source]
    rgb[target + 1] = raw[source + 1]
    rgb[target + 2] = raw[source + 2]
    if (alpha) alpha[pixel] = raw[source + 3]
  }

  return {
    width, height, rgb, ...(alpha ? { alpha } : {}),
    rgbDeflate: await deflate(rgb), ...(alpha ? { alphaDeflate: await deflate(alpha) } : {}),
  }
}

export function buildInvoicePdf(d: InvoiceData): Uint8Array {
  const objects: string[] = [""]
  let content = ""
  let nextObject = 1

  const addObject = (body: string): number => {
    const id = nextObject++
    objects[id] = `${id} 0 obj\n${body}\nendobj\n`
    return id
  }

  const text = (
    x: number,
    y: number,
    value: string,
    size = 10,
    font: "F1" | "F2" = "F1",
    color = C.body,
  ) => {
    content += `BT ${color} rg /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${enc(value)}) Tj ET\n`
  }

  // Helvetica text width approximation, suitable for short invoice labels.
  const rightText = (
    right: number,
    y: number,
    value: string,
    size = 10,
    font: "F1" | "F2" = "F1",
    color = C.body,
  ) => {
    text(right - value.length * size * 0.50, y, value, size, font, color)
  }

  const line = (
    x1: number, y: number, x2: number,
    color = C.faint, width = 0.7,
  ) => {
    content += `${color} RG ${width} w ${x1} ${y} m ${x2} ${y} l S\n`
  }

  const rect = (
    x: number, y: number, width: number, height: number, color: string,
  ) => {
    content += `${color} rg ${x} ${y} ${width} ${height} re f\n`
  }

  // Add the logo as a proper PDF image object. Keep alpha using a soft mask.
  let logoName = ""
  if (
    d.logo &&
    d.logo.width > 0 &&
    d.logo.height > 0 &&
    d.logo.rgb.length === d.logo.width * d.logo.height * 3
  ) {
    const logo = d.logo
    let mask = ""
    if (logo.alpha && logo.alpha.length === logo.width * logo.height) {
      const a = logo.alphaDeflate || logo.alpha
      const maskId = addObject(
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} ` +
        `/ColorSpace /DeviceGray /BitsPerComponent 8${logo.alphaDeflate ? " /Filter /FlateDecode" : ""} /Length ${a.length} >>\nstream\n` +
        bytesToBinary(a) + "\nendstream",
      )
      mask = ` /SMask ${maskId} 0 R`
    }

    const px = logo.rgbDeflate || logo.rgb
    const logoId = addObject(
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8${logo.rgbDeflate ? " /Filter /FlateDecode" : ""} /Length ${px.length}${mask} >>\nstream\n` +
      bytesToBinary(px) + "\nendstream",
    )
    logoName = `/Logo ${logoId} 0 R`
  }

  const tx = 62      // x of the product name column

  // Header: white space, a restrained dark accent and a clean logo area.
  rect(0, 824, 595, 18, C.accent)
  if (logoName) {
    const logo = d.logo!
    const maxW = 125
    const maxH = 48
    const scale = Math.min(maxW / logo.width, maxH / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale
    content += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 50 ${(790 - h / 2).toFixed(2)} cm /Logo Do Q\n`
  } else {
    // High-contrast fallback; never show an empty colored placeholder.
    text(50, 773, "NOVA 3D", 25, "F2", C.ink)
  }

  text(50, 746, "IMPRESSION 3D  /  FACTURATION", 8, "F2", C.muted)
  rightText(545, 785, "FACTURE", 22, "F2", C.ink)
  rightText(545, 762, `N° ${cut(safe(d.no), 36)}`, 9, "F2", C.body)
  rightText(545, 746, `Date : ${cut(safe(d.date), 28)}`, 9, "F1", C.muted)
  line(50, 727, 545, C.ink, 1.1)

  // Customer panel.
  rect(50, 634, 495, 76, C.panel)
  text(64, 691, "FACTURÉ À", 8, "F2", C.muted)
  text(64, 672, cut(safe(d.customer.name), 48), 12, "F2", C.ink)
  text(64, 656, cut(safe(d.customer.email), 62), 9, "F1", C.body)
  const contact = [safe(d.customer.phone), safe(d.customer.address)].filter(Boolean).join("  ·  ")
  text(64, 642, cut(contact, 78), 8.5, "F1", C.muted)

  // Items table.
  text(50, 605, "DÉTAIL DE LA COMMANDE", 10, "F2", C.ink)
  text(50, 590, "Articles et prestations facturés", 8.5, "F1", C.muted)

  const tableTop = 566
  rect(50, tableTop - 24, 495, 28, C.accent)
  text(62, tableTop - 7, "PRODUIT", 8, "F2", C.white)
  rightText(350, tableTop - 7, "QTÉ", 8, "F2", C.white)
  rightText(440, tableTop - 7, "PRIX UNIT.", 8, "F2", C.white)
  rightText(533, tableTop - 7, "TOTAL", 8, "F2", C.white)

  const maxRows = 11
  let y = tableTop - 45
  for (let i = 0; i < Math.min(d.lines.length, maxRows); i++) {
    const item = d.lines[i]
    if (i % 2 === 1) rect(50, y - 16, 495, 28, "0.975 0.978 0.982")
    text(tx, y, cut(safe(item.n), 38), 9.5, "F1", C.body)
    // Second line: the colour chosen by the customer (a little swatch + name + hex), or "identical to the photo"
    if (item.c) {
      const [r, g, b] = rgbOf(item.c)
      rect(tx, y - 14, 6, 6, `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`)
      text(tx + 10, y - 13, cut(safe(`Couleur : ${colorLabel(item.c, item.cn)}`), 60), 7.5, "F1", C.muted)
    } else text(tx, y - 13, "Pièce identique à la photo", 7.5, "F1", C.muted)
    rightText(350, y, String(item.q), 9.5, "F1", C.body)
    rightText(440, y, money(item.p, d.cur), 9, "F1", C.body)
    rightText(533, y, money(item.p * item.q, d.cur), 9.5, "F2", C.ink)
    y -= 28
  }

  if (d.lines.length > maxRows) {
    text(62, y, `Et ${d.lines.length - maxRows} autre(s) article(s)`, 8.5, "F1", C.muted)
    y -= 22
  }

  // Totals sit in a subtle panel with strong contrast on the final amount.
  y -= 4
  const disc = d.discount && d.discount > 0 ? d.discount : 0
  const subtotal = Math.round((d.total - d.delivery + disc) * 100) / 100
  const off = disc ? 21 : 0
  const totalPanelHeight = 91 + off
  const panelBottom = Math.max(88, y - totalPanelHeight + 18)
  rect(315, panelBottom, 230, totalPanelHeight, C.panel)

  const row = (dy: number, label: string, value: string) => {
    text(332, panelBottom + dy, label, 9, "F1", C.muted)
    rightText(530, panelBottom + dy, value, 9, "F1", C.body)
  }
  const deliveryText = d.delivery > 0 ? money(d.delivery, d.cur) : "Gratuite"
  const totalY = panelBottom + 13
  row(68 + off, "Sous-total", money(subtotal, d.cur))
  if (disc) row(47 + off, `Code promo ${safe(d.promo || "")}`, "- " + money(disc, d.cur))
  row(47, "Livraison", deliveryText)
  line(330, panelBottom + 34, 530, C.ink, 0.8)
  text(332, totalY, "TOTAL À PAYER", 9, "F2", C.ink)
  rightText(530, totalY - 1, money(d.total, d.cur), 12, "F2", C.ink)

  // Footer.
  line(50, 66, 545, C.faint, 0.8)
  text(50, 48, "Merci pour votre confiance.", 9.5, "F2", C.ink)
  text(50, 32, "NOVA 3D  ·  Impression 3D sur mesure", 8, "F1", C.muted)
  // Contacts (right side, one per line, only the ones filled in site.json)
  const ct = d.contacts || {}
  const contactLines = [
    ct.phone && safe(ct.phone).replace(/\D/g, "") ? `WhatsApp : +${safe(ct.phone).replace(/\D/g, "")}` : "",
    ct.instagram ? `Instagram : ${cut(shortUrl(safe(ct.instagram)), 40)}` : "",
    ct.facebook ? `Facebook : ${cut(shortUrl(safe(ct.facebook)), 40)}` : "",
  ].filter(Boolean)
  contactLines.forEach((v, i) => text(390, 52 - i * 12, v, 8, "F1", C.muted))

  const contentId = addObject(
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  )

  const fontRegular = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  )
  const fontBold = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  )

  const xo = [logoName].filter(Boolean)
  const xObjects = xo.length ? `/XObject << ${xo.join(" ")} >>` : ""
  const pageId = addObject(
    `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 595 842] ` +
    `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> ${xObjects} >> ` +
    `/Contents ${contentId} 0 R >>`,
  )
  const pagesId = addObject(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`)
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  // Fill in the page parent now that the Pages object has its final ID.
  objects[pageId] = objects[pageId].replace("PAGES_REF", `${pagesId} 0 R`)

  // PDF objects are byte strings; offsets therefore remain correct for accents and images.
  let pdf = "%PDF-1.4\n"
  const offsets = new Array<number>(nextObject).fill(0)
  for (let id = 1; id < nextObject; id++) {
    if (!objects[id]) continue
    offsets[id] = pdf.length
    pdf += objects[id]
  }

  const xrefStart = pdf.length
  pdf += `xref\n0 ${nextObject}\n0000000000 65535 f \n`
  for (let id = 1; id < nextObject; id++) {
    pdf += offsets[id]
      ? `${String(offsets[id]).padStart(10, "0")} 00000 n \n`
      : "0000000000 00000 f \n"
  }
  pdf += `trailer\n<< /Size ${nextObject} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return toPdfBytes(pdf)
}

/** Convert PDF bytes to base64 for the existing preview/download flow. */
export function toBase64(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes))
}
