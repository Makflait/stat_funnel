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

    // Always fetch available countries for the period (for the dropdown)
    const distinctGeo = await prisma.geoReport.findMany({
      where: { appId: app.id, date: { gte: fromDate, lte: toDate } },
      select: { country: true },
      distinct: ["country"],
      orderBy: { country: "asc" },
    });
    const availableCountries = distinctGeo.map((r) => r.country);

    // ── Geo filter branch ─────────────────────────────────────────────────────
    if (query.country) {
      const country = query.country;

      const geoRows = await prisma.geoReport.findMany({
        where: { appId: app.id, country, date: { gte: fromDate, lte: toDate } },
        orderBy: { date: "asc" },
      });

      if (!geoRows.length) {
        return res.status(200).json({
          app,
          funnel: [],
          kpis: null,
          trend: [],
          table: [],
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

    // ── Aggregate branch (no geo filter) ──────────────────────────────────────
    const reports = await prisma.report.findMany({
      where: {
        appId: app.id,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: "asc" },
    });

    if (!reports.length) {
      return res.status(200).json({
        app,
        funnel: [],
        kpis: null,
        trend: [],
        table: [],
        availableCountries,
        activeCountry: null,
      });
    }

    const latest = reports[reports.length - 1];

    return res.status(200).json({
      app,
      funnel: buildFunnel(extractTotals(latest)),
      kpis: buildKpis(latest),
      trend: reports.map((report) => ({
        date: report.date.toISOString().slice(0, 10),
        installs: report.installDay,
        subscriptions: report.subscriptionStartedDay,
      })),
      table: reports.map(serializeReport),
      latest: serializeReport(latest),
      availableCountries,
      activeCountry: null,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
