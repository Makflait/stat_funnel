import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  calculateDeltas,
  extractTotals,
  type CumulativeTotals,
} from "../utils/calculations.js";
import { formatDateOnlyUtc, toDateOnlyUtc } from "../utils/date.js";
import { serializeReport } from "../utils/serializers.js";

const router = Router();

const reportSchema = z.object({
  appId: z.string().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  installTotal: z.number().int().nonnegative(),
  paywallShownTotal: z.number().int().nonnegative(),
  trialStartedTotal: z.number().int().nonnegative(),
  subscriptionStartedTotal: z.number().int().nonnegative(),
  subscriptionCancelledTotal: z.number().int().nonnegative(),
  paymentFailedTotal: z.number().int().nonnegative(),
  subscriptionActiveTotal: z.number().int().nonnegative(),
  adSpend: z.number().nonnegative().default(0),
  revenueDay: z.number().nonnegative().default(0),
  refundsDay: z.number().nonnegative().default(0),
});

const reportsQuerySchema = z.object({
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

function buildRange(from?: string, to?: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const fromDate = from
    ? toDateOnlyUtc(from)
    : new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  const toDate = to ? toDateOnlyUtc(to) : today;

  return { fromDate, toDate };
}

async function assertAppOwnership(appId: string, userId: string) {
  const app = await prisma.app.findFirst({
    where: { id: appId, ownerId: userId },
    select: { id: true },
  });

  if (!app) {
    throw new Error("App not found");
  }
}

async function recalculateFromDate(tx: Prisma.TransactionClient, appId: string, startDate: Date) {
  const reports = await tx.report.findMany({
    where: {
      appId,
      date: {
        gte: startDate,
      },
    },
    orderBy: { date: "asc" },
  });

  if (!reports.length) {
    return;
  }

  const previous = await tx.report.findFirst({
    where: {
      appId,
      date: { lt: reports[0].date },
    },
    orderBy: { date: "desc" },
  });

  let previousTotals: CumulativeTotals | null = previous ? extractTotals(previous) : null;

  for (const report of reports) {
    const currentTotals = extractTotals(report);
    const { deltas, netGrowthDay } = calculateDeltas(currentTotals, previousTotals);

    await tx.report.update({
      where: { id: report.id },
      data: {
        ...deltas,
        netGrowthDay,
      },
    });

    previousTotals = currentTotals;
  }
}

router.get("/", async (req, res, next) => {
  try {
    const query = reportsQuerySchema.parse(req.query);
    await assertAppOwnership(query.appId, req.user!.id);

    const { fromDate, toDate } = buildRange(query.from, query.to);

    const reports = await prisma.report.findMany({
      where: {
        appId: query.appId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: "asc" },
    });

    return res.status(200).json({
      reports: reports.map(serializeReport),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "App not found") {
      return res.status(404).json({ message: error.message });
    }
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = reportSchema.parse(req.body);
    await assertAppOwnership(payload.appId, req.user!.id);

    const reportDate = toDateOnlyUtc(payload.date);

    const existing = await prisma.report.findUnique({
      where: {
        appId_date: {
          appId: payload.appId,
          date: reportDate,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return res.status(409).json({ message: "Report for this date already exists" });
    }

    const previousReport = await prisma.report.findFirst({
      where: {
        appId: payload.appId,
        date: { lt: reportDate },
      },
      orderBy: { date: "desc" },
    });

    const currentTotals: CumulativeTotals = {
      installTotal: payload.installTotal,
      paywallShownTotal: payload.paywallShownTotal,
      trialStartedTotal: payload.trialStartedTotal,
      subscriptionStartedTotal: payload.subscriptionStartedTotal,
      subscriptionCancelledTotal: payload.subscriptionCancelledTotal,
      paymentFailedTotal: payload.paymentFailedTotal,
      subscriptionActiveTotal: payload.subscriptionActiveTotal,
    };

    const previousTotals = previousReport ? extractTotals(previousReport) : null;
    const { deltas, netGrowthDay } = calculateDeltas(currentTotals, previousTotals);

    const report = await prisma.$transaction(async (tx) => {
      const created = await tx.report.create({
        data: {
          appId: payload.appId,
          date: reportDate,
          installTotal: payload.installTotal,
          paywallShownTotal: payload.paywallShownTotal,
          trialStartedTotal: payload.trialStartedTotal,
          subscriptionStartedTotal: payload.subscriptionStartedTotal,
          subscriptionCancelledTotal: payload.subscriptionCancelledTotal,
          paymentFailedTotal: payload.paymentFailedTotal,
          subscriptionActiveTotal: payload.subscriptionActiveTotal,
          ...deltas,
          netGrowthDay,
          adSpend: payload.adSpend,
          revenueDay: payload.revenueDay,
          refundsDay: payload.refundsDay,
        },
      });

      await recalculateFromDate(tx, payload.appId, reportDate);

      return created;
    });

    const latest = await prisma.report.findUnique({ where: { id: report.id } });

    return res.status(201).json({
      report: serializeReport(latest ?? report),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "App not found") {
      return res.status(404).json({ message: error.message });
    }
    return next(error);
  }
});

const updateReportSchema = z.object({
  installTotal: z.number().int().nonnegative(),
  paywallShownTotal: z.number().int().nonnegative(),
  trialStartedTotal: z.number().int().nonnegative(),
  subscriptionStartedTotal: z.number().int().nonnegative(),
  subscriptionCancelledTotal: z.number().int().nonnegative(),
  paymentFailedTotal: z.number().int().nonnegative(),
  subscriptionActiveTotal: z.number().int().nonnegative(),
  adSpend: z.number().nonnegative().default(0),
  revenueDay: z.number().nonnegative().default(0),
  refundsDay: z.number().nonnegative().default(0),
});

router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = updateReportSchema.parse(req.body);

    const existing = await prisma.report.findUnique({
      where: { id },
      select: { id: true, appId: true, date: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Report not found" });
    }

    await assertAppOwnership(existing.appId, req.user!.id);

    const currentTotals: CumulativeTotals = {
      installTotal: payload.installTotal,
      paywallShownTotal: payload.paywallShownTotal,
      trialStartedTotal: payload.trialStartedTotal,
      subscriptionStartedTotal: payload.subscriptionStartedTotal,
      subscriptionCancelledTotal: payload.subscriptionCancelledTotal,
      paymentFailedTotal: payload.paymentFailedTotal,
      subscriptionActiveTotal: payload.subscriptionActiveTotal,
    };

    const previousReport = await prisma.report.findFirst({
      where: {
        appId: existing.appId,
        date: { lt: existing.date },
      },
      orderBy: { date: "desc" },
    });

    const previousTotals = previousReport ? extractTotals(previousReport) : null;
    const { deltas, netGrowthDay } = calculateDeltas(currentTotals, previousTotals);

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.report.update({
        where: { id },
        data: {
          installTotal: payload.installTotal,
          paywallShownTotal: payload.paywallShownTotal,
          trialStartedTotal: payload.trialStartedTotal,
          subscriptionStartedTotal: payload.subscriptionStartedTotal,
          subscriptionCancelledTotal: payload.subscriptionCancelledTotal,
          paymentFailedTotal: payload.paymentFailedTotal,
          subscriptionActiveTotal: payload.subscriptionActiveTotal,
          ...deltas,
          netGrowthDay,
          adSpend: payload.adSpend,
          revenueDay: payload.revenueDay,
          refundsDay: payload.refundsDay,
        },
      });

      await recalculateFromDate(tx, existing.appId, existing.date);

      return upd;
    });

    const latest = await prisma.report.findUnique({ where: { id: updated.id } });

    return res.status(200).json({
      report: serializeReport(latest ?? updated),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "App not found") {
      return res.status(404).json({ message: error.message });
    }
    return next(error);
  }
});

router.get("/export", async (req, res, next) => {
  try {
    const query = reportsQuerySchema.parse(req.query);
    await assertAppOwnership(query.appId, req.user!.id);

    const { fromDate, toDate } = buildRange(query.from, query.to);

    const reports = await prisma.report.findMany({
      where: {
        appId: query.appId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: "asc" },
    });

    const csvHeader = [
      "date",
      "installs_daily",
      "subscriptions_daily",
      "cancellations_daily",
      "revenue_day",
      "ad_spend",
      "net_growth",
    ].join(",");

    const csvRows = reports.map((report) => {
      return [
        formatDateOnlyUtc(report.date),
        report.installDay,
        report.subscriptionStartedDay,
        report.subscriptionCancelledDay,
        Number(report.revenueDay).toFixed(2),
        Number(report.adSpend).toFixed(2),
        report.netGrowthDay,
      ].join(",");
    });

    const csv = [csvHeader, ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=reports-${query.appId}.csv`);

    return res.status(200).send(csv);
  } catch (error) {
    if (error instanceof Error && error.message === "App not found") {
      return res.status(404).json({ message: error.message });
    }
    return next(error);
  }
});

export default router;
