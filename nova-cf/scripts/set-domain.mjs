/**
 * scripts/set-domain.mjs - writes YOUR real website address into the SEO files
 *
 *   npm run seo -- https://nova.pieca.workers.dev/
 *
 * Replaces the previous address (kept in seo.config.json, initially https://YOUR-DOMAIN.com) in:
 * every page of public/ (canonical link, Open Graph, structured data), public/robots.txt and
 * public/sitemap.xml. Safe to run again when the domain changes. Run it BEFORE `npm run deploy`.
 */
import { readFile, writeFile, readdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const next = (process.argv[2] || "").replace(/\/+$/, "")
if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(next)) {
  console.error("Usage: npm run seo -- https://nova.pieca.workers.dev/   (https, no path)"); process.exit(1)
}
const cfgPath = join(root, "seo.config.json")
const prev = JSON.parse(await readFile(cfgPath, "utf8")).domain.replace(/\/+$/, "")   // no trailing slash, or every link would lose its "/"

// Collect every .html / robots.txt / sitemap.xml under public/
async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...await walk(p))
    else if (/\.html$|^robots\.txt$|^sitemap\.xml$/.test(e.name)) out.push(p)
  }
  return out
}
let changed = 0
for (const f of await walk(join(root, "public"))) {
  const s = await readFile(f, "utf8")
  if (s.includes(prev)) { await writeFile(f, s.split(prev).join(next)); changed++ }
}
await writeFile(cfgPath, JSON.stringify({ domain: next }, null, 2) + "\n")
console.log(`Domain set to ${next} in ${changed} file(s).`)
