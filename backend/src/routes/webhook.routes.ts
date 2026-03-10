import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { toDateOnlyUtc } from "../utils/date.js";

const router = Router();

// ─── Apphud event names ───────────────────────────────────────────────────────

/** Events that count as a new trial start */
const TRIAL_START_EVENTS = new Set(["trial_started"]);

/** Events that count as a new paid subscription start */
const SUB_START_EVENTS = new Set([
  "subscription_started",
  "trial_converted",
  "intro_started",
  "intro_converted",
  "promo_started",
  "promo_converted",
]);

/** Events that count as a cancellation */
const SUB_CANCEL_EVENTS = new Set([
  "subscription_canceled",
  "trial_canceled",
  "intro_expired",
  "promo_expired",
]);

/** Events that carry revenue (price is in event.properties.usd_price) */
const REVENUE_EVENTS = new Set([
  "subscription_started",
  "subscription_renewed",
  "trial_converted",
  "intro_started",
  "intro_renewed",
  "intro_converted",
  "promo_started",
  "promo_renewed",
  "promo_converted",
  "non_renewing_purchase",
]);

/** Events that carry a refund amount */
const REFUND_EVENTS = new Set([
  "subscription_refunded",
  "intro_refunded",
  "promo_refunded",
  "non_renewing_purchase_refunded",
]);

// ─── Payload types ────────────────────────────────────────────────────────────

interface ApphudWebhookPayload {
  app?: { uid?: string; bundle_id?: string };
  event: {
    id: string;
    created_at?: string;       // ISO 8601
    name: string;
    properties?: {
      usd_price?: number;      // revenue / refund amount in USD
      proceeds_usd?: number;
      [key: string]: unknown;
    };
    receipt?: {
      price_usd?: number;
      proceeds_usd?: number;
      [key: string]: unknown;
    };
  };
  user: {
    country_iso_code?: string; // ISO alpha-2 e.g. "US"
    [key: string]: unknown;
  };
}

// ─── Webhook route ────────────────────────────────────────────────────────────

/**
 * POST /webhook/apphud/:appId
 *
 * Apphud sends one event per request. We upsert into GeoReport
 * using Prisma increment so duplicate delivery is not catastrophic
 * (idempotency via event log can be added later).
 *
 * Configure in Apphud dashboard:
 *   URL: https://funnel.grebalux.com/webhook/apphud/<your-app-id>
 *   Secret token (optional): any random string → set same value in
 *   Integration settings as webhookSecret
 */
router.post("/apphud/:appId", async (req, res, next) => {
  try {
    const { appId } = req.params;

    // ── 1. Find app (no auth middleware, but verify the app exists) ──────────
    const app = await prisma.app.findUnique({ where: { id: appId } });
    if (!app) {
      return res.status(404).json({ message: "App not found" });
    }

    // ── 2. Optional token verification ────────────────────────────────────────
    const integration = await prisma.integration.findUnique({
      where: { appId_type: { appId, type: "APPHUD" } },
    });
    if (integration) {
      const settings = integration.settings as Record<string, unknown>;
      const webhookSecret = settings?.webhookSecret as string | undefined;
      if (webhookSecret) {
        const incoming = req.headers["x-apphud-token"];
        if (incoming !== webhookSecret) {
          return res.status(401).json({ message: "Invalid webhook token" });
        }
      }
    }

    // ── 3. Parse payload ──────────────────────────────────────────────────────
    const payload = req.body as ApphudWebhookPayload;
    if (!payload?.event?.name) {
      return res.status(400).json({ message: "Missing event.name" });
    }

    const eventName = payload.event.name;
    const rawDate = payload.event.created_at ?? new Date().toISOString();
    const eventDate = toDateOnlyUtc(rawDate.slice(0, 10));
    const rawCountry = payload.user?.country_iso_code ?? "XX";
    const country = (rawCountry === "null" ? "XX" : rawCountry).toUpperCase().slice(0, 2);

    // Extract USD price from event properties or receipt
    const rawPrice =
      payload.event.properties?.usd_price ??
      payload.event.properties?.proceeds_usd ??
      payload.event.receipt?.price_usd ??
      payload.event.receipt?.proceeds_usd ??
      0;
    const usdPrice = isFinite(Number(rawPrice)) ? Number(rawPrice) : 0;

    // ── 4. Build delta values ─────────────────────────────────────────────────
    const deltaTrials      = TRIAL_START_EVENTS.has(eventName) ? 1 : 0;
    const deltaSubs        = SUB_START_EVENTS.has(eventName) ? 1 : 0;
    const deltaCancels     = SUB_CANCEL_EVENTS.has(eventName) ? 1 : 0;
    const deltaRevenue     = REVENUE_EVENTS.has(eventName) ? usdPrice : 0;
    const deltaRefunds     = REFUND_EVENTS.has(eventName) ? usdPrice : 0;
    const deltaNetGrowth   = deltaSubs - deltaCancels;

    // Skip events we don't track
    if (!deltaTrials && !deltaSubs && !deltaCancels && !deltaRevenue && !deltaRefunds) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const dec = (n: number) => new Prisma.Decimal(n);

    // ── 5. Upsert GeoReport ───────────────────────────────────────────────────
    await prisma.geoReport.upsert({
      where: { appId_date_country: { appId, date: eventDate, country } },
      create: {
        appId,
        date: eventDate,
        country,
        trialStartedDay:          deltaTrials,
        subscriptionStartedDay:   deltaSubs,
        subscriptionCancelledDay: deltaCancels,
        netGrowthDay:             deltaNetGrowth,
        activeSubscriptionsDay:   0,
        revenueDay:               dec(deltaRevenue),
        refundsDay:               dec(deltaRefunds),
      },
      update: {
        trialStartedDay:          { increment: deltaTrials },
        subscriptionStartedDay:   { increment: deltaSubs },
        subscriptionCancelledDay: { increment: deltaCancels },
        netGrowthDay:             { increment: deltaNetGrowth },
        revenueDay:               { increment: dec(deltaRevenue) },
        refundsDay:               { increment: dec(deltaRefunds) },
      },
    });

    return res.status(200).json({ ok: true, event: eventName, country, date: eventDate });
  } catch (err) {
    return next(err);
  }
});

export default router;
