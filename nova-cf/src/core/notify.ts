/**
 * src/core/notify.ts - instant push notification to the shop owner's phone when an order is placed
 *
 * Two optional channels (both can be active at once), each a plain HTTPS call that works on Cloudflare Workers:
 *   - ntfy.sh (free, no account): install the "ntfy" app, subscribe to a topic, then
 *       npx wrangler secret put NTFY_TOPIC      (a long random name, e.g. nova-k7q2x9-a83jf02md: anyone who knows it can read it)
 *     Optional: NTFY_SERVER (your own server, default https://ntfy.sh).
 *   - Telegram (private): create a bot with @BotFather, send it a message, then
 *       npx wrangler secret put TELEGRAM_BOT_TOKEN
 *       npx wrangler secret put TELEGRAM_CHAT_ID
 * The message never contains the customer's e-mail, phone or address: only the invoice number, total, first name and items.
 * A failed notification never blocks or cancels an order (see handleOrder).
 */
export interface PushConfig { ntfyTopic?: string; ntfyServer?: string; telegramToken?: string; telegramChat?: string; adminUrl?: string }
export interface NewOrderInfo { no: string; total: number; cur: string; name: string; lines: { n: string; q: number }[] }

export const hasPush = (c?: PushConfig) => !!c && (!!c.ntfyTopic || (!!c.telegramToken && !!c.telegramChat))

export function orderMessage(o: NewOrderInfo): string {
  const first = o.name.trim().split(/\s+/)[0]?.slice(0, 30) || "Client"
  const items = o.lines.slice(0, 8).map((l) => `${l.q} x ${l.n.slice(0, 40)}`).join("\n") + (o.lines.length > 8 ? `\n+ ${o.lines.length - 8} autre(s)` : "")
  return `${o.no}\nTotal : ${o.total} ${o.cur}\nClient : ${first}\n${items}`
}

export async function pushNewOrder(cfg: PushConfig | undefined, o: NewOrderInfo): Promise<void> {
  if (!cfg) return
  const text = orderMessage(o), jobs: Promise<unknown>[] = []
  if (cfg.ntfyTopic) {
    const server = (cfg.ntfyServer || "https://ntfy.sh").replace(/\/+$/, "")
    jobs.push(fetch(`${server}/${encodeURIComponent(cfg.ntfyTopic)}`, {
      method: "POST", signal: AbortSignal.timeout(10000), body: text,
      // HTTP headers must be plain ASCII: accents go in the body only
      headers: { Title: "Nouvelle commande NOVA 3D", Priority: "high", Tags: "package,tada" },
    }).then((r) => { if (!r.ok) throw new Error("ntfy answered " + r.status) }))
  }
  if (cfg.telegramToken && cfg.telegramChat) {
    jobs.push(fetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
      method: "POST", signal: AbortSignal.timeout(10000), headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.telegramChat, text: "🛒 Nouvelle commande\n" + text, disable_web_page_preview: true }),
    }).then((r) => { if (!r.ok) throw new Error("Telegram answered " + r.status) }))
  }
  const res = await Promise.allSettled(jobs)
  for (const r of res) if (r.status === "rejected") console.error("Push notification failed", r.reason)
}
