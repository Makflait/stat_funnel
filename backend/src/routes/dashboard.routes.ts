import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  buildCalculationExamples,
  buildFunnel,
  buildGeoFunnel,
  buildGeoKpis,
  buildKpis,
  extractTotals,
  type CumulativeTotals,
} from "../utils/calculations.js";
import { toDateOnlyUtc } from "../utils/date.js";
import { serializeReport } from "../utils/serializers.js";

const router = Router();

const dashboardQuerySchema = z.object({
  appId: z.string().min(1),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Optional geo filter for Report.geo field (manual entry geo segments). */
  geo: z.string().optional(),
  /** Optional country filter for Apphud GeoReport data (ISO alpha-2). */
  country: z
    .string()
    .length(2)
    .transform((v) => v.toUpperCase())
    .optional(),
});

router.use(authMiddleware);

router.get("/examples", (_req, res) => {
  return res.status(200).json(buildCalculationExamples());
});

router.get("/", async (req, res, next) => {
  try {
    const query = dashboardQuerySchema.parse(req.query);
    const geoFilter = query.geo?.trim() || "";

    const app = await prisma.app.findFirst({
      where: {
        id: query.appId,
        ownerId: req.user!.id,
      },
    });

    if (!app) {
      return res.status(404).json({ message: "App not found" });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const fromDate = query.from
      ? toDateOnlyUtc(query.from)
      : new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    const toDate = query.to ? toDateOnlyUtc(query.to) : today;

    // ── 1. Fetch available Apphud countries (for Apphud geo dropdown) ─────────
    const distinctGeo = await prisma.geoReport.findMany({
      where: { appId: app.id, date: { gte: fromDate, lte: toDate } },
      select: { country: true },
      distinct: ["country"],
      orderBy: { country: "asc" },
    });
    const availableCountries = distinctGeo.map((r) => r.country);

    // ── 2. Handle Apphud country filter (GeoReport-based) ────────────────────
    if (query.country) {
      const country = query.country;

      const geoRows = await prisma.geoReport.findMany({
        where: { appId: app.id, country, date: { gte: fromDate, lte: toDate } },
        orderBy: { date: "asc" },
      });

      if (!geoRows.length) {
        return res.status(200).json({
          app,
          geos: [],
          geoBreakdown: [],
          funnel: [],
          kpis: null,
          trend: [],
          table: [],
          latest: null,
          availableCountries,
          activeCountry: country,
        });
      }

      const sumTrials = geoRows.reduce((s, r) => s + r.trialStartedDay, 0);
      const sumSubs = geoRows.reduce((s, r) => s + r.subscriptionStartedDay, 0);
      const sumCancels = geoRows.reduce((s, r) => s + r.subscriptionCancelledDay, 0);
      const latestActive = geoRows[geoRows.length - 1].activeSubscriptionsDay;
      const sumRevenue = geoRows.reduce((s, r) => s + Number(r.revenueDay), 0);

      return res.status(200).json({
        app,
        geos: [],
        geoBreakdown: [],
        funnel: buildGeoFunnel({ trials: sumTrials, subscriptions: sumSubs, active: latestActive }),
        kpis: buildGeoKpis({
          trials: sumTrials,
          subscriptions: sumSubs,
          cancellations: sumCancels,
          active: latestActive,
          revenue: sumRevenue,
        }),
        trend: geoRows.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          installs: 0,
          subscriptions: r.subscriptionStartedDay,
        })),
        table: [],
        latest: null,
        availableCountries,
        activeCountry: country,
      });
    }

    // ── 3. Fetch all distinct geo segments from Report model ──────────────────
    const geoRows = await prisma.report.findMany({
      where: { appId: app.id },
      select: { geo: true },
      distinct: ["geo"],
      orderBy: { geo: "asc" },
    });
    const geos = geoRows.map((r) => r.geo);

    // ── 4. Fetch reports for the selected date range ──────────────────────────
    const reportWhere = {
      appId: app.id,
      date: { gte: fromDate, lte: toDate },
      ...(geoFilter ? { geo: geoFilter } : {}),
    };

    const reports = await prisma.report.findMany({
      where: reportWhere,
      orderBy: [{ date: "asc" }, { geo: "asc" }],
    });

    // ── 5. No Report data → fallback to GeoReport aggregate ──────────────────
    if (!reports.length) {
      const allGeoRows = await prisma.geoReport.findMany({
        where: { appId: app.id, date: { gte: fromDate, lte: toDate } },
        orderBy: [{ country: "asc" }, { date: "asc" }],
      });

      if (!allGeoRows.length) {
        return res.status(200).json({
          app, geos, geoBreakdown: [], funnel: [], kpis: null,
          trend: [], table: [], latest: null, availableCountries, activeCountry: null,
        });
      }

      const sumTrials = allGeoRows.reduce((s, r) => s + r.trialStartedDay, 0);
      const sumSubs = allGeoRows.reduce((s, r) => s + r.subscriptionStartedDay, 0);
      const sumCancels = allGeoRows.reduce((s, r) => s + r.subscriptionCancelledDay, 0);
      const sumRevenue = allGeoRows.reduce((s, r) => s + Number(r.revenueDay), 0);
      const sumActive = allGeoRows.reduce((s, r) => s + r.activeSubscriptionsDay, 0);
      const sumPurchasesRev = allGeoRows.reduce((s, r) => s + Number(r.purchasesRevenueDay), 0);

      const trendByDate = new Map<string, number>();
      for (const r of allGeoRows) {
        const dk = r.date.toISOString().slice(0, 10);
        trendByDate.set(dk, (trendByDate.get(dk) ?? 0) + r.subscriptionStartedDay);
      }
      const trend = Array.from(trendByDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, subs]) => ({ date, installs: 0, subscriptions: subs }));

      const countryAgg = new Map<string, { trials: number; subs: number; cancels: number; revenue: number; active: number }>();
      for (const r of allGeoRows) {
        const e = countryAgg.get(r.country) ?? { trials: 0, subs: 0, cancels: 0, revenue: 0, active: 0 };
        e.trials += r.trialStartedDay;
        e.subs += r.subscriptionStartedDay;
        e.cancels += r.subscriptionCancelledDay;
        e.revenue += Number(r.revenueDay);
        e.active += r.activeSubscriptionsDay;
        countryAgg.set(r.country, e);
      }
      const geoBreakdownFromGeo = Array.from(countryAgg.entries()).map(([country, d]) => ({
        geo: country,
        kpis: buildGeoKpis({ trials: d.trials, subscriptions: d.subs, cancellations: d.cancels, active: d.active, revenue: d.revenue }),
        avgDailyInstalls: 0,
        avgSubPrice: d.subs > 0 ? d.revenue / d.subs : null,
      }));

      return res.status(200).json({
        app,
        geos,
        geoBreakdown: geoBreakdownFromGeo,
        funnel: buildGeoFunnel({ trials: sumTrials, subscriptions: sumSubs, active: sumActive }),
        kpis: buildGeoKpis({ trials: sumTrials, subscriptions: sumSubs, cancellations: sumCancels, active: sumActive, revenue: sumRevenue, purchasesRevenue: sumPurchasesRev }),
        trend,
        table: [],
        latest: null,
        availableCountries,
        activeCountry: null,
      });
    }

    // ── 6. Compute per-geo breakdown (for predict block) ──────────────────────
    const geoBreakdown = await Promise.all(
      geos.map(async (geo) => {
        const geoReports = await prisma.report.findMany({
          where: {
            appId: app.id,
            geo,
            date: { gte: fromDate, lte: toDate },
          },
          orderBy: { date: "asc" },
        });

        if (!geoReports.length) {
          return { geo, kpis: null, avgDailyInstalls: 0, avgSubPrice: null };
        }

        const latestGeo = geoReports[geoReports.length - 1];
        const installSum = geoReports.reduce((sum, r) => sum + r.installDay, 0);
        const avgDailyInstalls = installSum / geoReports.length;
        const revenueSum = geoReports.reduce((s, r) => s + Number(r.revenueDay), 0);
        const subsSum = geoReports.reduce((s, r) => s + r.subscriptionStartedDay, 0);

        return {
          geo,
          kpis: buildKpis(latestGeo),
          avgDailyInstalls,
          avgSubPrice: subsSum > 0 ? revenueSum / subsSum : null,
        };
      })
    );

    // ── 7. Build funnel, kpis, trend, table, latest ───────────────────────────

    if (geoFilter) {
      // ─── Specific geo mode: single segment ──────────────────────────────────
      const latest = reports[reports.length - 1];
      const installSum = reports.reduce((sum, r) => sum + r.installDay, 0);
      const avgDailyInstalls = reports.length > 0 ? installSum / reports.length : 0;

      return res.status(200).json({
        app,
        geos,
        geoBreakdown,
        funnel: buildFunnel(extractTotals(latest)),
        kpis: buildKpis(latest),
        trend: reports.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          installs: r.installDay,
          subscriptions: r.subscriptionStartedDay,
        })),
        table: reports.map(serializeReport),
        latest: serializeReport(latest),
        avgDailyInstalls,
        availableCountries,
        activeCountry: null,
      });
    }

    // ─── Aggregate mode: sum across all geo segments ─────────────────────────

    const latestPerGeo = new Map<string, (typeof reports)[0]>();
    for (const r of reports) {
      const existing = latestPerGeo.get(r.geo);
      if (!existing || r.date > existing.date) {
        latestPerGeo.set(r.geo, r);
      }
    }

    const aggregateTotals: CumulativeTotals = {
      installTotal: 0,
      paywallShownTotal: 0,
      trialStartedTotal: 0,
      subscriptionStartedTotal: 0,
      subscriptionCancelledTotal: 0,
      paymentFailedTotal: 0,
      subscriptionActiveTotal: 0,
    };

    for (const r of latestPerGeo.values()) {
      const t = extractTotals(r);
      aggregateTotals.installTotal += t.installTotal;
      aggregateTotals.paywallShownTotal += t.paywallShownTotal;
      aggregateTotals.trialStartedTotal += t.trialStartedTotal;
      aggregateTotals.subscriptionStartedTotal += t.subscriptionStartedTotal;
      aggregateTotals.subscriptionCancelledTotal += t.subscriptionCancelledTotal;
      aggregateTotals.paymentFailedTotal += t.paymentFailedTotal;
      aggregateTotals.subscriptionActiveTotal += t.subscriptionActiveTotal;
    }

    const latestByDate = reports.reduce((best, r) => (r.date > best.date ? r : best), reports[0]);
    let aggRevenueDay = 0;
    let aggAdSpend = 0;
    let aggSubscriptionStartedDay = 0;
    for (const r of latestPerGeo.values()) {
      aggRevenueDay += Number(r.revenueDay);
      aggAdSpend += Number(r.adSpend);
      aggSubscriptionStartedDay += r.subscriptionStartedDay;
    }

    const aggKpisInput = {
      ...latestByDate,
      ...aggregateTotals,
      revenueDay: aggRevenueDay,
      adSpend: aggAdSpend,
      subscriptionStartedDay: aggSubscriptionStartedDay,
    };

    const trendByDate = new Map<string, { installs: number; subscriptions: number }>();
    for (const r of reports) {
      const dateKey = r.date.toISOString().slice(0, 10);
      const existing = trendByDate.get(dateKey) ?? { installs: 0, subscriptions: 0 };
      existing.installs += r.installDay;
      existing.subscriptions += r.subscriptionStartedDay;
      trendByDate.set(dateKey, existing);
    }
    const trend = Array.from(trendByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return res.status(200).json({
      app,
      geos,
      geoBreakdown,
      funnel: buildFunnel(aggregateTotals),
      kpis: buildKpis(aggKpisInput as unknown as typeof latestByDate),
      trend,
      table: reports.map(serializeReport),
      latest: null, // no single "latest" in aggregate mode — form hints disabled
      availableCountries,
      activeCountry: null,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
