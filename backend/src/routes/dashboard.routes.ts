import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  buildCalculationExamples,
  buildFunnel,
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

    const reports = await prisma.report.findMany({
      where: {
        appId: app.id,
        date: {
          gte: fromDate,
          lte: toDate,
        },
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
        latest: null,
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
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
