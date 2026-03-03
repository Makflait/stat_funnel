import { Bot, Context } from "grammy";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";

// ─── Apphud message parser ────────────────────────────────────────────────────

/**
 * Full country name → ISO alpha-2 mapping for Apphud "Store Country" field.
 */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  "United States": "US", "United Kingdom": "GB", "Germany": "DE",
  "France": "FR", "Italy": "IT", "Spain": "ES", "Russia": "RU",
  "Canada": "CA", "Australia": "AU", "Japan": "JP", "China": "CN",
  "Brazil": "BR", "Mexico": "MX", "India": "IN", "South Korea": "KR",
  "Netherlands": "NL", "Sweden": "SE", "Norway": "NO", "Denmark": "DK",
  "Finland": "FI", "Poland": "PL", "Turkey": "TR", "Ukraine": "UA",
  "Switzerland": "CH", "Austria": "AT", "Belgium": "BE", "Portugal": "PT",
  "Czech Republic": "CZ", "Romania": "RO", "Hungary": "HU", "Greece": "GR",
  "Israel": "IL", "Saudi Arabia": "SA", "United Arab Emirates": "AE",
  "UAE": "AE", "South Africa": "ZA", "New Zealand": "NZ", "Singapore": "SG",
  "Hong Kong": "HK", "Taiwan": "TW", "Thailand": "TH", "Indonesia": "ID",
  "Malaysia": "MY", "Philippines": "PH", "Vietnam": "VN", "Argentina": "AR",
  "Chile": "CL", "Colombia": "CO", "Peru": "PE", "Egypt": "EG",
  "Nigeria": "NG", "Pakistan": "PK", "Kazakhstan": "KZ", "Azerbaijan": "AZ",
  "Belarus": "BY", "Georgia": "GE", "Armenia": "AM", "Uzbekistan": "UZ",
  "Slovakia": "SK", "Croatia": "HR", "Bulgaria": "BG", "Serbia": "RS",
  "Lithuania": "LT", "Latvia": "LV", "Estonia": "EE", "Slovenia": "SI",
  "Ireland": "IE", "Iceland": "IS", "Luxembourg": "LU", "Kenya": "KE",
  "Bangladesh": "BD",
};

/**
 * Parses Apphud Telegram notification messages.
 *
 * Real message format:
 *   [AppName] Subscription Started
 *   Premium
 *   User ID: 519B24B2-...
 *   Product ID: music_weekly
 *   Store Country: United States
 *   Revenue: 4.99 USD
 */
function parseApphudMessage(text: string): ParsedEvent | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  // First line: "[AppName] Event Type"
  const firstLine = lines[0];
  const headerMatch = firstLine.match(/^\[.+\]\s+(.+)$/);
  if (!headerMatch) return null;

  const eventText = headerMatch[1].toLowerCase();

  let eventType: ParsedEvent["type"] | null = null;
  if (eventText.includes("trial started") || eventText.includes("trial active")) {
    eventType = "trial";
  } else if (
    eventText.includes("subscription started") ||
    eventText.includes("trial converted") ||
    eventText.includes("intro started")
  ) {
    eventType = "sub";
  } else if (
    eventText.includes("subscription canceled") ||
    eventText.includes("subscription cancelled") ||
    eventText.includes("trial canceled") ||
    eventText.includes("trial cancelled") ||
    eventText.includes("autorenew disabled")
  ) {
    eventType = "cancel";
  } else if (
    eventText.includes("subscription renewed") ||
    eventText.includes("intro renewed")
  ) {
    eventType = "renew";
  } else if (eventText.includes("refund")) {
    eventType = "refund";
  } else if (eventText.includes("billing issue")) {
    eventType = "billing_issue";
  } else if (
    eventText.includes("non renewing") ||
    eventText.includes("non-renewing") ||
    eventText.includes("purchase")
  ) {
    eventType = "purchase";
  }

  if (!eventType) return null;

  // Parse "Store Country: United States" → ISO code
  let country = "XX";
  for (const line of lines) {
    const m = line.match(/^Store Country:\s*(.+)$/i);
    if (m) {
      const name = m[1].trim();
      country = COUNTRY_NAME_TO_ISO[name] ?? name.slice(0, 2).toUpperCase();
      break;
    }
  }

  // Parse "Revenue: 4.99 USD"
  let price = 0;
  for (const line of lines) {
    const m = line.match(/^Revenue:\s*([\d.]+)\s*USD/i);
    if (m) {
      price = Number(m[1]);
      break;
    }
  }

  // Parse "User ID: <uuid>" for deduplication reference
  let apphudUserId: string | undefined;
  for (const line of lines) {
    const m = line.match(/^User\s*ID:\s*([0-9A-F-]{36})/i);
    if (m) {
      apphudUserId = m[1];
      break;
    }
  }

  return { type: eventType, country, price, apphudUserId };
}

interface ParsedEvent {
  type: "trial" | "sub" | "cancel" | "renew" | "refund" | "billing_issue" | "purchase";
  country: string;
  price: number;
  apphudUserId?: string;
}

// ─── DB writer ────────────────────────────────────────────────────────────────

/**
 * Record a Telegram Apphud event.
 * @param messageId - Telegram message_id used for deduplication (skip if already seen)
 */
async function recordEvent(
  appId: string,
  event: ParsedEvent,
  date: Date,
  messageId: string,
): Promise<boolean> {
  // ── Deduplication ────────────────────────────────────────────────────────
  // Skip if we have already processed this Telegram message.
  const alreadySeen = await prisma.telegramEventLog.findUnique({
    where: { appId_messageId: { appId, messageId } },
    select: { id: true },
  });
  if (alreadySeen) {
    console.log(`[telegram] Duplicate message skipped: ${messageId}`);
    return false;
  }

  const dec = (n: number) => new Prisma.Decimal(n);
  const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const deltaTrials    = event.type === "trial" ? 1 : 0;
  const deltaSubs      = event.type === "sub" ? 1 : 0;
  const deltaCancels   = event.type === "cancel" ? 1 : 0;
  const deltaRevenue   = (event.type === "sub" || event.type === "renew") ? event.price : 0;
  const deltaRefunds   = event.type === "refund" ? event.price : 0;
  const deltaPurchases = event.type === "purchase" ? 1 : 0;
  const deltaPurchaseRev = event.type === "purchase" ? event.price : 0;
  const deltaNetGrowth = deltaSubs - deltaCancels;

  await prisma.$transaction([
    prisma.geoReport.upsert({
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
        purchasesDay: deltaPurchases,
        purchasesRevenueDay: dec(deltaPurchaseRev),
      },
      update: {
        trialStartedDay: { increment: deltaTrials },
        subscriptionStartedDay: { increment: deltaSubs },
        subscriptionCancelledDay: { increment: deltaCancels },
        netGrowthDay: { increment: deltaNetGrowth },
        revenueDay: { increment: dec(deltaRevenue) },
        refundsDay: { increment: dec(deltaRefunds) },
        purchasesDay: { increment: deltaPurchases },
        purchasesRevenueDay: { increment: dec(deltaPurchaseRev) },
      },
    }),
    prisma.telegramEventLog.create({
      data: {
        appId,
        messageId,
        eventType: event.type,
        apphudUserId: event.apphudUserId,
      },
    }),
  ]);

  return true;
}

// ─── Reply helpers ─────────────────────────────────────────────────────────────

const EVENT_EMOJI: Record<ParsedEvent["type"], string> = {
  trial: "🔬",
  sub: "✅",
  cancel: "❌",
  renew: "🔄",
  refund: "💸",
  billing_issue: "⚠️",
  purchase: "🛒",
};

const EVENT_LABEL: Record<ParsedEvent["type"], string> = {
  trial: "Trial",
  sub: "Subscription",
  cancel: "Cancellation",
  renew: "Renewal",
  refund: "Refund",
  billing_issue: "Billing issue",
  purchase: "Purchase",
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
        purchases: acc.purchases + r.purchasesDay,
        purchasesRev: acc.purchasesRev + Number(r.purchasesRevenueDay),
      }),
      { trials: 0, subs: 0, cancels: 0, revenue: 0, purchases: 0, purchasesRev: 0 }
    );

    const lines = [
      `📊 *Сегодня* (${dateOnly.toISOString().slice(0, 10)})`,
      `🔬 Триалы: ${totals.trials}`,
      `✅ Подписки: ${totals.subs}`,
      `❌ Отмены: ${totals.cancels}`,
      `💰 Revenue: $${totals.revenue.toFixed(2)}`,
      ...(totals.purchases > 0 ? [`🛒 Кредиты: ${totals.purchases} · $${totals.purchasesRev.toFixed(2)}`] : []),
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
    const msgId = `manual-${ctx.message?.message_id ?? Date.now()}`;
    await recordEvent(appId, event, new Date(), msgId);
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
    const msgId = `manual-${ctx.message?.message_id ?? Date.now()}`;
    await recordEvent(appId, event, new Date(), msgId);
    await ctx.reply(eventReply(event));
  });

  // ── /cancel [country] ──────────────────────────────────────────────────────
  bot.command("cancel", async (ctx) => {
    if (!isAllowed(ctx)) return;
    const args = ctx.match.trim().toUpperCase().split(/\s+/);
    const event: ParsedEvent = { type: "cancel", country: args[0] || "XX", price: 0 };
    const msgId = `manual-${ctx.message?.message_id ?? Date.now()}`;
    await recordEvent(appId, event, new Date(), msgId);
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
    const msgId = `manual-${ctx.message?.message_id ?? Date.now()}`;
    await recordEvent(appId, event, new Date(), msgId);
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
    const msgId = `manual-${ctx.message?.message_id ?? Date.now()}`;
    await recordEvent(appId, event, new Date(), msgId);
    await ctx.reply(eventReply(event));
  });

  // ── Auto-parse Apphud messages (group — human-forwarded only) ──────────────
  bot.on("message:text", async (ctx) => {
    if (!isAllowed(ctx)) return;

    const from = ctx.from?.username ?? "";
    const text = ctx.message.text;

    // Only parse messages forwarded from @ApphudBot by a human
    // Note: bots cannot receive messages sent directly by other bots in groups.
    // Direct @ApphudBot posts in a group will be invisible to us.
    // Use a Telegram channel (channel_post handler below) for auto-parsing.
    const isForwardedFromApphud =
      (ctx.message.forward_origin as { sender_user?: { username?: string } } | undefined)
        ?.sender_user?.username?.toLowerCase() === "apphudbot";

    const isSentByApphud = from.toLowerCase() === "apphudbot"; // only works in channels

    if (!isForwardedFromApphud && !isSentByApphud) return;

    const event = parseApphudMessage(text);
    if (!event) {
      console.log(`[telegram] Apphud message not parsed: ${text.slice(0, 80)}`);
      return;
    }

    const msgDate = ctx.message.date
      ? new Date(ctx.message.date * 1000)
      : new Date();

    const msgId = `msg-${ctx.message.message_id}`;
    const recorded = await recordEvent(appId, event, msgDate, msgId);
    if (recorded) {
      console.log(`[telegram] Apphud event recorded: ${event.type} ${event.country} $${event.price}`);
      await ctx.react("👍").catch(() => {});
    }
  });

  // ── Auto-parse Apphud messages (channel — preferred method) ────────────────
  // When our bot is a channel admin, it receives all posts as channel_post events,
  // including posts from other bots (@ApphudBot). This is the correct setup.
  bot.on("channel_post:text", async (ctx) => {
    if (!isAllowed(ctx)) return;

    const text = ctx.channelPost.text;

    // Log all channel posts for debugging
    console.log(`[telegram] Channel post received: ${text.slice(0, 100)}`);

    const event = parseApphudMessage(text);
    if (!event) return; // Not an Apphud event — skip silently

    const msgDate = ctx.channelPost.date
      ? new Date(ctx.channelPost.date * 1000)
      : new Date();

    const msgId = `ch-${ctx.channelPost.message_id}`;
    const recorded = await recordEvent(appId, event, msgDate, msgId);
    if (recorded) {
      console.log(`[telegram] Channel event recorded: ${event.type} ${event.country} $${event.price} (apphudUser=${event.apphudUserId ?? "?"})`);
    }
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
