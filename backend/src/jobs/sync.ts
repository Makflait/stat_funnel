import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/crypto.js";
import { fetchApphudGeoMetrics, fetchApphudMetrics } from "../integrations/apphud.js";
import { fetchAppsFlyerMetrics } from "../integrations/appsflyer.js";
import type {
  ApphudCredentials,
  AppsFlyerCredentials,
  IntegrationSettings,
  SyncResult,
} from "../integrations/types.js";
import { formatDateOnlyUtc, toDateOnlyUtc } from "../utils/date.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eachDayInRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function prevDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

// ─── Core sync logic ──────────────────────────────────────────────────────────

/**
 * Syncs one app for the given date range.
 * - Fetches Apphud + AppsFlyer metrics
 * - Merges with AdSpendDaily
 * - Upserts Report rows (idempotent)
 */
export async function syncApp(appId: string, from: Date, to: Date): Promise<SyncResult> {
  const result: SyncResult = { daysProcessed: 0, updatedCount: 0, geoRowsUpdated: 0, errors: [] };

  // Load integrations
  const integrations = await prisma.integration.findMany({
    where: { appId, isEnabled: true },
  });

  const apphudInt = integrations.find((i) => i.type === "APPHUD");
  const appsflyerInt = integrations.find((i) => i.type === "APPSFLYER");

  // Fetch Apphud data
  let apphudByDate = new Map<string, Awaited<ReturnType<typeof fetchApphudMetrics>>[number]>();
  if (apphudInt) {
    try {
      const creds = JSON.parse(decrypt(apphudInt.credentialsEncrypted)) as ApphudCredentials;
      const settings = (apphudInt.settings as IntegrationSettings) ?? {};
      const rows = await fetchApphudMetrics(creds, settings, from, to);
      apphudByDate = new Map(rows.map((r) => [r.date, r]));
    } catch (err) {
      const msg = `Apphud fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error(`[sync] ${appId} — ${msg}`);
      await prisma.integration.update({
        where: { id: apphudInt.id },
        data: { lastSyncError: msg },
      });
    }
  }

  // Fetch AppsFlyer data
  let appsflyerByDate = new Map<
    string,
    Awaited<ReturnType<typeof fetchAppsFlyerMetrics>>[number]
  >();
  if (appsflyerInt) {
    try {
      const creds = JSON.parse(
        decrypt(appsflyerInt.credentialsEncrypted),
      ) as AppsFlyerCredentials;
      const settings = (appsflyerInt.settings as IntegrationSettings) ?? {};
      const rows = await fetchAppsFlyerMetrics(creds, settings, from, to);
      appsflyerByDate = new Map(rows.map((r) => [r.date, r]));
    } catch (err) {
      const msg = `AppsFlyer fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error(`[sync] ${appId} — ${msg}`);
      await prisma.integration.update({
        where: { id: appsflyerInt.id },
        data: { lastSyncError: msg },
      });
    }
  }

  // Process each day in chronological order
  const days = eachDayInRange(from, to);

  for (const day of days) {
    const dateStr = formatDateOnlyUtc(day);

    try {
      // Get ad spend for the day (sum across all sources)
      const adSpendAgg = await prisma.adSpendDaily.aggregate({
        where: { appId, date: day },
        _sum: { spend: true },
      });
      const adSpend = Number(adSpendAgg._sum.spend ?? 0);

      // Get previous day's report for running totals
      const prevDate = prevDay(day);
      const prevReport = await prisma.report.findUnique({
        where: { appId_date_geo: { appId, date: prevDate, geo: "ALL" } },
      });

      const apphud = apphudByDate.get(dateStr);
      const af = appsflyerByDate.get(dateStr);

      // Daily values
      const installDay = af?.installs ?? 0;
      const paywallShownDay = af?.paywallImpressions ?? 0;
      const trialStartedDay = apphud?.trials ?? 0;
      const subscriptionStartedDay = apphud?.subscriptions ?? 0;
      const subscriptionCancelledDay = apphud?.cancellations ?? 0;
      const paymentFailedDay = apphud?.paymentFailures ?? 0;
      const subscriptionActiveDay = apphud?.activeSubscriptions ?? 0;
      const revenueDay = new Prisma.Decimal(apphud?.revenueDay ?? 0);
      const refundsDay = new Prisma.Decimal(apphud?.refundsDay ?? 0);
      const netGrowthDay = subscriptionStartedDay - subscriptionCancelledDay;

      // Running cumulative totals
      const installTotal = (prevReport?.installTotal ?? 0) + installDay;
      const paywallShownTotal = (prevReport?.paywallShownTotal ?? 0) + paywallShownDay;
      const trialStartedTotal = (prevReport?.trialStartedTotal ?? 0) + trialStartedDay;
      const subscriptionStartedTotal =
        (prevReport?.subscriptionStartedTotal ?? 0) + subscriptionStartedDay;
      const subscriptionCancelledTotal =
        (prevReport?.subscriptionCancelledTotal ?? 0) + subscriptionCancelledDay;
      const paymentFailedTotal = (prevReport?.paymentFailedTotal ?? 0) + paymentFailedDay;
      // activeSubscriptions is a snapshot, not additive — use day value directly as total
      const subscriptionActiveTotal = subscriptionActiveDay;

      await prisma.report.upsert({
        where: { appId_date_geo: { appId, date: day, geo: "ALL" } },
        create: {
          appId,
          date: day,
          geo: "ALL",
          installTotal,
          paywallShownTotal,
          trialStartedTotal,
          subscriptionStartedTotal,
          subscriptionCancelledTotal,
          paymentFailedTotal,
          subscriptionActiveTotal,
          installDay,
          paywallShownDay,
          trialStartedDay,
          subscriptionStartedDay,
          subscriptionCancelledDay,
          paymentFailedDay,
          subscriptionActiveDay,
          netGrowthDay,
          adSpend: new Prisma.Decimal(adSpend),
          revenueDay,
          refundsDay,
        },
        update: {
          installTotal,
          paywallShownTotal,
          trialStartedTotal,
          subscriptionStartedTotal,
          subscriptionCancelledTotal,
          paymentFailedTotal,
          subscriptionActiveTotal,
          installDay,
          paywallShownDay,
          trialStartedDay,
          subscriptionStartedDay,
          subscriptionCancelledDay,
          paymentFailedDay,
          subscriptionActiveDay,
          netGrowthDay,
          adSpend: new Prisma.Decimal(adSpend),
          revenueDay,
          refundsDay,
        },
      });

      result.daysProcessed++;
      result.updatedCount++;
    } catch (err) {
      const msg = `Day ${dateStr} failed: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error(`[sync] ${appId} — ${msg}`);
    }
  }

  // ── Geo sync: fetch Apphud data broken down by country ──────────────────────
  if (apphudInt) {
    try {
      const creds = JSON.parse(decrypt(apphudInt.credentialsEncrypted)) as ApphudCredentials;
      const settings = (apphudInt.settings as IntegrationSettings) ?? {};
      const geoRows = await fetchApphudGeoMetrics(creds, settings, from, to);

      for (const row of geoRows) {
        const date = new Date(row.date + "T00:00:00.000Z");
        const netGrowthDay = row.subscriptions - row.cancellations;

        await prisma.geoReport.upsert({
          where: { appId_date_country: { appId, date, country: row.country } },
          create: {
            appId,
            date,
            country: row.country,
            trialStartedDay: row.trials,
            subscriptionStartedDay: row.subscriptions,
            subscriptionCancelledDay: row.cancellations,
            activeSubscriptionsDay: row.activeSubscriptions,
            netGrowthDay,
            revenueDay: new Prisma.Decimal(row.revenueDay),
            refundsDay: new Prisma.Decimal(row.refundsDay),
          },
          update: {
            trialStartedDay: row.trials,
            subscriptionStartedDay: row.subscriptions,
            subscriptionCancelledDay: row.cancellations,
            activeSubscriptionsDay: row.activeSubscriptions,
            netGrowthDay,
            revenueDay: new Prisma.Decimal(row.revenueDay),
            refundsDay: new Prisma.Decimal(row.refundsDay),
          },
        });
        result.geoRowsUpdated++;
      }

      console.log(`[sync] app=${appId} geo rows upserted: ${result.geoRowsUpdated}`);
    } catch (err) {
      const msg = `Apphud geo fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error(`[sync] ${appId} — ${msg}`);
    }
  }

  // Update lastSyncAt for successful integrations
  const now = new Date();
  for (const integ of integrations) {
    const hadError = result.errors.some((e) => e.includes(integ.type === "APPHUD" ? "Apphud" : "AppsFlyer"));
    if (!hadError) {
      await prisma.integration.update({
        where: { id: integ.id },
        data: { lastSyncAt: now, lastSyncError: null },
      });
    }
  }

  console.log(
    `[sync] app=${appId} from=${formatDateOnlyUtc(from)} to=${formatDateOnlyUtc(to)} ` +
      `processed=${result.daysProcessed} errors=${result.errors.length}`,
  );

  return result;
}

/**
 * Syncs all apps that have at least one enabled integration.
 * Called by the nightly cron scheduler.
 */
export async function syncAllApps(from: Date, to: Date): Promise<void> {
  const apps = await prisma.app.findMany({
    where: {
      integrations: { some: { isEnabled: true } },
    },
    select: { id: true, name: true },
  });

  console.log(`[scheduler] syncing ${apps.length} apps for ${formatDateOnlyUtc(from)}–${formatDateOnlyUtc(to)}`);

  for (const app of apps) {
    try {
      await syncApp(app.id, from, to);
    } catch (err) {
      console.error(
        `[scheduler] app ${app.id} (${app.name}) sync failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
