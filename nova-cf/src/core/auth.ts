/**
 * src/core/auth.ts - admin authentication
 *
 * No session or cookie. The admin page keeps the password in memory and sends it in the
 * "x-admin-password" header (URL-encoded, so any character is allowed, e.g. Arabic or accents).
 *
 * Expected password, in this order:
 *   1. the ADMIN_PASSWORD secret (Cloudflare). If set it WINS and cannot be changed from the admin page.
 *   2. the hash saved in the database (settings table, key "pwhash"): PBKDF2-SHA256 with a random salt,
 *      format  pbkdf2$<iterations>$<salt base64>$<hash base64>.
 *      (Older installs stored a plain SHA-256 hex: it is still accepted and upgraded at the next successful login.)
 *   3. the factory default "admin" - ONLY until the first password is saved. While it is in use ("isDefault"),
 *      the API refuses everything except setting a new password (see guard() in src/app.ts): the admin page
 *      forces the change at the first login.
 *
 * Brute force: after MAX_FAILS wrong passwords from the same IP within LOGIN_WINDOW seconds, that IP gets
 * HTTP 429 until the window ends (counters live in the database, see Repo.hit).
 */
import type { Repo } from "../repo/types.ts"

export const MIN_PASSWORD = 8
const ITERATIONS = 100_000          // the maximum Cloudflare Workers allows for PBKDF2
const MAX_FAILS = 8
const LOGIN_WINDOW = 15 * 60

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

// SHA-256 as a hex string (Web Crypto: available on Workers, Node 18+, Deno, browsers)
export async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("")
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256))
}

// Constant-time comparison: does not stop at the first different character
function same(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// New salted hash of a password (what is stored in settings "pwhash")
export async function hashPassword(p: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(p, salt, ITERATIONS))}`
}

// Does the typed password match a stored hash (new PBKDF2 format or legacy SHA-256 hex)?
async function verifyPassword(p: string, stored: string) {
  if (stored.startsWith("pbkdf2$")) {
    const [, it, salt, hash] = stored.split("$")
    return same(b64(await pbkdf2(p, unb64(salt), Number(it))), hash)
  }
  return same(await sha(p), stored)
}

// The password sent by the browser (URL-decoded; falls back to the raw header if not encoded)
export function readPassword(req: Request) {
  const raw = req.headers.get("x-admin-password") || ""
  try { return decodeURIComponent(raw) } catch { return raw }
}

// IP of the visitor (Cloudflare header; "local" when running elsewhere / in tests)
export const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") || "local"

export interface AdminCheck { ok: boolean; isDefault: boolean; locked: number }   // locked = seconds to wait (0 = not locked)

// Checks the admin password of a request (and applies the brute-force limit).
export async function checkAdmin(req: Request, adminPassword: string | undefined, repo: Repo): Promise<AdminCheck> {
  const key = "login:" + clientIp(req)
  const before = await repo.peekHits(key, LOGIN_WINDOW)
  if (before.n >= MAX_FAILS) return { ok: false, isDefault: false, locked: before.retry }

  const typed = readPassword(req)
  let ok = false, isDefault = false
  if (adminPassword) {
    ok = same(await sha(typed), await sha(adminPassword))
  } else {
    const stored = await repo.getSetting("pwhash")
    if (stored) {
      ok = await verifyPassword(typed, stored)
      // Legacy SHA-256 hash: replace it by a salted PBKDF2 hash now that we know the password
      if (ok && !stored.startsWith("pbkdf2$")) await repo.setSetting("pwhash", await hashPassword(typed))
    } else {
      ok = same(await sha(typed), await sha("admin"))
      isDefault = ok
    }
  }
  if (!ok) await repo.hit(key, LOGIN_WINDOW)
  else if (before.n > 0) await repo.resetHits(key)
  return { ok, isDefault, locked: 0 }
}

// Save a new admin password (salted hash only)
export async function setPassword(repo: Repo, p: string) {
  await repo.setSetting("pwhash", await hashPassword(p))
}
