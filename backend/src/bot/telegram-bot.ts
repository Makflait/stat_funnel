import { Bot, Context } from "grammy";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";

// ─── Apphud message parser ────────────────────────────────────────────────────

/**
 * Maps Apphud Telegram notification text to an event type.
 * Apphud messages are in English, contain event name and user details.
 * We match case-insensitively on key phrases.
 */
function parseApphudMessage(text: string): ParsedEvent | null {
  const t = text.toLowerCase();

  // Determine event type
  let eventType: ParsedEvent["type"] | null = null;

  if (t.includes("trial started") || t.includes("trial_started")) {
    eventType = "trial";
  } else if (
    t.includes("subscription started") || t.includes("subscription_started") ||
    t.includes("trial converted") || t.includes("trial_converted") ||
    t.includes("intro started") || t.includes("intro_started")
  ) {
    eventType = "sub";
  } else if (
    t.includes("subscription canceled") || t.includes("subscription cancelled") ||
    t.includes("subscription_canceled") || t.includes("autorenew disabled") ||
    t.includes("trial canceled") || t.includes("trial cancelled")
  ) {
    eventType = "cancel";
  } else if (
    t.includes("subscription renewed") || t.includes("subscription_renewed") ||
    t.includes("intro renewed") || t.includes("non_renewing")
  ) {
    eventType = "renew";
  } else if (
    t.includes("refund") || t.includes("subscription_refunded")
  ) {
    eventType = "refund";
  } else if (t.includes("billing issue") || t.includes("billing_issue")) {
    eventType = "billing_issue";
  }

  if (!eventType) return null;

  // Extract country (ISO alpha-2 code)
  // Apphud usually includes country in the message
  const countryMatch =
    text.match(/\b([A-Z]{2})\b/) ??          // standalone 2-letter code
    text.match(/country[:\s]+([A-Z]{2})/i) ?? // "Country: US"
    text.match(/🏳️|🌍|country_iso[:\s]+([A-Z]{2})/i);
  const country = (countryMatch?.[1] ?? "XX").toUpperCase();

  // Extract price (USD)
  const priceMatch =
    text.match(/\$(\d+(?:\.\d+)?)/) ??       // $9.99
    text.match(/(\d+(?:\.\d+)?)\s*usd/i) ??  // 9.99 USD
    text.match(/price[:\s]+(\d+(?:\.\d+)?)/i);
  const price = priceMatch ? Number(priceMatch[1]) : 0;

  return { type: eventType, country, price };
}

interface ParsedEvent {
  type: "trial" | "sub" | "cancel" | "renew" | "refund" | "billing_issue";
  country: string;
  price: number;
}

// ─── DB writer ────────────────────────────────────────────────────────────────

async function recordEvent(appId: string, event: ParsedEvent, date: Date): Promise<void> {
  const dec = (n: number) => new Prisma.Decimal(n);
  const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const deltaTrials    = event.type === "trial" ? 1 : 0;
  const deltaSubs      = event.type === "sub" ? 1 : 0;
  const deltaCancels   = event.type === "cancel" ? 1 : 0;
  const deltaRevenue   = (event.type === "sub" || event.type === "renew") ? event.price : 0;
  const deltaRefunds   = event.type === "refund" ? event.price : 0;
  const deltaNetGrowth = deltaSubs - deltaCancels;

  await prisma.geoReport.upsert({
    where: { appId_date_country: { appId, date: dateOnly, country: event.country } },
    create: {
      appId,
      date: dateOnly,
      country: event.country,
      trialStartedDay: deltaTrials,
      subscriptionStartedDay: deltaSubs,
      subscriptionCancelledDay: deltaCancels,
      netGrowthDay: deltaNetGrowth,
      activeSubscriptionsDay: 0,
      revenueDay: dec(deltaRevenue),
      refundsDay: dec(deltaRefunds),
    },
    update: {
      trialStartedDay: { increment: deltaTrials },
      subscriptionStartedDay: { increment: deltaSubs },
      subscriptionCancelledDay: { increment: deltaCancels },
      netGrowthDay: { increment: deltaNetGrowth },
      revenueDay: { increment: dec(deltaRevenue) },
      refundsDay: { increment: dec(deltaRefunds) },
    },
  });
}

// ─── Reply helpers ─────────────────────────────────────────────────────────────

const EVENT_EMOJI: Record<ParsedEvent["type"], string> = {
  trial: "🔬",
  sub: "✅",
  cancel: "❌",
  renew: "🔄",
  refund: "💸",
  billing_issue: "⚠️",
};

const EVENT_LABEL: Record<ParsedEvent["type"], string> = {
  trial: "Trial",
  sub: "Subscription",
  cancel: "Cancellation",
  renew: "Renewal",
  refund: "Refund",
  billing_issue: "Billing issue",
};

function eventReply(event: ParsedEvent): string {
  const emoji = EVENT_EMOJI[event.type];
  const label = EVENT_LABEL[event.type];
  const price = event.price > 0 ? ` · $${event.price.toFixed(2)}` : "";
  return `${emoji} Записано: ${label} · ${event.country}${price}`;
}

function helpText(): string {
  return `📊 *Stat Funnel Bot*

Ручные команды:
\`/trial [страна]\` — триал запущен
\`/sub [страна] [цена]\` — подписка оформлена
\`/cancel [страна]\` — подписка отменена
\`/renew [страна] [цена]\` — подписка продлена
\`/refund [страна] [сумма]\` — возврат
\`/today\` — статистика за сегодня

*Страна* — ISO-код: US, GB, DE, RU и т.д. (по умолчанию XX)
*Цена* — в USD (по умолчанию 0)

Бот также автоматически читает сообщения от @ApphudBot.`;
}

// ─── Bot factory ──────────────────────────────────────────────────────────────

export function createTelegramBot(): Bot | null {
  const token = env.telegramBotToken;
  const allowedChatId = env.telegramAllowedChatId;
  const appId = env.telegramAppId;

  if (!token || !appId) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_APP_ID not set — bot disabled");
    return null;
  }

  const bot = new Bot(token);
  const allowedId = allowedChatId ? String(allowedChatId) : null;

  // Guard: only process messages from the configured chat
  function isAllowed(ctx: Context): boolean {
    if (!allowedId) return true; // no restriction set
    return String(ctx.chat?.id) === allowedId;
  }

  // ── /start, /help ──────────────────────────────────────────────────────────
  bot.command(["start", "help"], async (ctx) => {
    if (!isAllowed(ctx)) return;
    await ctx.reply(helpText(), { parse_mode: "Markdown" });
  });

  // ── /today ─────────────────────────────────────────────────────────────────
  bot.command("today", async (ctx) => {
    if (!isAllowed(ctx)) return;
    const today = new Date();
    const dateOnly = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    const rows = await prisma.geoReport.findMany({
      where: { appId, date: dateOnly },
      orderBy: { country: "asc" },
    });

    if (!rows.length) {
      await ctx.reply("📭 За сегодня данных пока нет.");
      return;
    }

    const totals = rows.reduce(
      (acc, r) => ({
        trials: acc.trials + r.trialStartedDay,
        subs: acc.subs + r.subscriptionStartedDay,
        cancels: acc.cancels + r.subscriptionCancelledDay,
        revenue: acc.revenue + Number(r.revenueDay),
      }),
      { trials: 0, subs: 0, cancels: 0, revenue: 0 }
    );

    const lines = [
      `📊 *Сегодня* (${dateOnly.toISOString().slice(0, 10)})`,
      `🔬 Триалы: ${totals.trials}`,
      `✅ Подписки: ${totals.subs}`,
      `❌ Отмены: ${totals.cancels}`,
      `💰 Revenue: $${totals.revenue.toFixed(2)}`,
      "",
      ...rows.map(
        (r) =>
          `${r.country}: ${r.trialStartedDay}tr / ${r.subscriptionStartedDay}sub / ${r.subscriptionCancelledDay}cancel`
      ),
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  // ── /trial [country] ───────────────────────────────────────────────────────
  bot.command("trial", async (ctx) => {
    if (!isAllowed(ctx)) return;
    const args = ctx.match.trim().toUpperCase().split(/\s+/);
    const event: ParsedEvent = { type: "trial", country: args[0] || "XX", price: 0 };
    await recordEvent(appId, event, new Date());
    await ctx.reply(eventReply(event));
  });

  // ── /sub [country] [price] ─────────────────────────────────────────────────
  bot.command("sub", async (ctx) => {
    if (!isAllowed(ctx)) return;
    const args = ctx.match.trim().split(/\s+/);
    const event: ParsedEvent = {
      type: "sub",
      country: (args[0] ?? "XX").toUpperCase(),
      price: Number(args[1] ?? 0),
    };
    await recordEvent(appId, event, new Date());
    await ctx.reply(eventReply(event));
  });

  // ── /cancel [country] ──────────────────────────────────────────────────────
  bot.command("cancel", async (ctx) => {
    if (!isAllowed(ctx)) return;
    const args = ctx.match.trim().toUpperCase().split(/\s+/);
    const event: ParsedEvent = { type: "cancel", country: args[0] || "XX", price: 0 };
    await recordEvent(appId, event, new Date());
    await ctx.reply(eventReply(event));
  });

  // ── /renew [country] [price] ───────────────────────────────────────────────
  bot.command("renew", async (ctx) => {
    if (!isAllowed(ctx)) return;
    const args = ctx.match.trim().split(/\s+/);
    const event: ParsedEvent = {
      type: "renew",
      country: (args[0] ?? "XX").toUpperCase(),
      price: Number(args[1] ?? 0),
    };
    await recordEvent(appId, event, new Date());
    await ctx.reply(eventReply(event));
  });

  // ── /refund [country] [amount] ─────────────────────────────────────────────
  bot.command("refund", async (ctx) => {
    if (!isAllowed(ctx)) return;
    const args = ctx.match.trim().split(/\s+/);
    const event: ParsedEvent = {
      type: "refund",
      country: (args[0] ?? "XX").toUpperCase(),
      price: Number(args[1] ?? 0),
    };
    await recordEvent(appId, event, new Date());
    await ctx.reply(eventReply(event));
  });

  // ── Auto-parse Apphud messages ─────────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    if (!isAllowed(ctx)) return;

    const from = ctx.from?.username ?? "";
    const text = ctx.message.text;

    // Only parse messages from @ApphudBot or forwarded from it
    const isApphudBot =
      from.toLowerCase() === "apphudbot" ||
      (ctx.message.forward_origin as { sender_user?: { username?: string } } | undefined)
        ?.sender_user?.username?.toLowerCase() === "apphudbot";

    if (!isApphudBot) return;

    const event = parseApphudMessage(text);
    if (!event) {
      console.log(`[telegram] Apphud message not parsed: ${text.slice(0, 80)}`);
      return;
    }

    const msgDate = ctx.message.date
      ? new Date(ctx.message.date * 1000)
      : new Date();

    await recordEvent(appId, event, msgDate);
    console.log(`[telegram] Apphud event recorded: ${event.type} ${event.country} $${event.price}`);

    // Silent acknowledgement (no reply spam for auto-parsed messages)
    await ctx.react("👍").catch(() => {});
  });

  bot.catch((err) => {
    console.error("[telegram] Bot error:", err.message);
  });

  return bot;
}

export async function startTelegramBot(): Promise<void> {
  const bot = createTelegramBot();
  if (!bot) return;

  // Use long polling (no webhook setup needed)
  bot.start({
    onStart: () => console.log("[telegram] Bot started (long polling)"),
    drop_pending_updates: true,
  }).catch((err) => {
    console.error("[telegram] Failed to start bot:", err.message);
  });
}
