import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { toDateOnlyUtc } from "../utils/date.js";

const router = Router();
router.use(authMiddleware);

// GET /api/attribution?appId=&from=&to=
router.get("/", async (req, res, next) => {
  try {
    const query = z.object({
      appId: z.string().min(1),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      country: z.string().length(2).toUpperCase().optional(),
    }).parse(req.query);

    const app = await prisma.app.findFirst({ where: { id: query.appId, ownerId: req.user!.id } });
    if (!app) return res.status(404).json({ message: "App not found" });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const fromDate = query.from ? toDateOnlyUtc(query.from) : new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    const toDate = query.to ? toDateOnlyUtc(query.to) : today;

    // Fetch campaign reports, optionally filtered by country
    const rows = await prisma.campaignReport.findMany({
      where: {
        appId: query.appId,
        date: { gte: fromDate, lte: toDate },
        ...(query.country ? { country: query.country } : {}),
      },
      orderBy: [{ mediaSource: "asc" }, { campaign: "asc" }, { date: "asc" }],
    });

    // Fetch spend (join by source/campaign)
    const spends = await prisma.adSpendDaily.findMany({
      where: { appId: query.appId, date: { gte: fromDate, lte: toDate } },
    });

    // Aggregate by (mediaSource, campaign)
    type SourceAgg = {
      mediaSource: string;
      campaign: string;
      installs: number;
      trials: number;
      subscriptions: number;
      spend: number;
    };

    const aggMap = new Map<string, SourceAgg>();
    for (const r of rows) {
      const key = `${r.mediaSource}\0${r.campaign}`;
      const existing = aggMap.get(key) ?? {
        mediaSource: r.mediaSource,
        campaign: r.campaign,
        installs: 0,
        trials: 0,
        subscriptions: 0,
        spend: 0,
      };
      existing.installs += r.installs;
      existing.trials += r.trials;
      existing.subscriptions += r.subscriptions;
      aggMap.set(key, existing);
    }

    // Add spend — exact match by source+campaign
    for (const s of spends) {
      const key = `${s.source}\0${s.campaign ?? ""}`;
      if (aggMap.has(key)) {
        aggMap.get(key)!.spend += Number(s.spend);
      }
    }

    // Compute metrics
    const result = Array.from(aggMap.values()).map((agg) => ({
      mediaSource: agg.mediaSource,
      campaign: agg.campaign,
      installs: agg.installs,
      trials: agg.trials,
      subscriptions: agg.subscriptions,
      spend: agg.spend,
      crInstallToTrial: agg.installs > 0 ? (agg.trials / agg.installs) * 100 : null,
      crTrialToSub: agg.trials > 0 ? (agg.subscriptions / agg.trials) * 100 : null,
      cpi: agg.installs > 0 && agg.spend > 0 ? agg.spend / agg.installs : null,
      costPerTrial: agg.trials > 0 && agg.spend > 0 ? agg.spend / agg.trials : null,
      costPerPaidTrial: agg.subscriptions > 0 && agg.spend > 0 ? agg.spend / agg.subscriptions : null,
    }));

    return res.status(200).json({ rows: result, country: query.country ?? null });
  } catch (error) {
    return next(error);
  }
});

// POST /api/attribution/spend — manual spend entry per campaign
router.post("/spend", async (req, res, next) => {
  try {
    const body = z.object({
      appId: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      source: z.string().min(1),
      campaign: z.string().default(""),
      spend: z.number().min(0),
    }).parse(req.body);

    const app = await prisma.app.findFirst({ where: { id: body.appId, ownerId: req.user!.id } });
    if (!app) return res.status(404).json({ message: "App not found" });

    const date = toDateOnlyUtc(body.date);
    const row = await prisma.adSpendDaily.upsert({
      where: { appId_date_source_campaign: { appId: body.appId, date, source: body.source, campaign: body.campaign } },
      create: { appId: body.appId, date, source: body.source, campaign: body.campaign, spend: new Prisma.Decimal(body.spend) },
      update: { spend: new Prisma.Decimal(body.spend) },
    });

    return res.status(200).json({ row });
  } catch (error) {
    return next(error);
  }
});

// GET /api/attribution/spend?appId=
router.get("/spend", async (req, res, next) => {
  try {
    const query = z.object({ appId: z.string().min(1) }).parse(req.query);
    const app = await prisma.app.findFirst({ where: { id: query.appId, ownerId: req.user!.id } });
    if (!app) return res.status(404).json({ message: "App not found" });

    const rows = await prisma.adSpendDaily.findMany({
      where: { appId: query.appId },
      orderBy: [{ date: "desc" }, { source: "asc" }],
    });

    return res.status(200).json({
      rows: rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        source: r.source,
        campaign: r.campaign,
        spend: Number(r.spend),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/attribution/spend/:id
router.delete("/spend/:id", async (req, res, next) => {
  try {
    const row = await prisma.adSpendDaily.findFirst({
      where: { id: req.params.id, app: { ownerId: req.user!.id } },
    });
    if (!row) return res.status(404).json({ message: "Not found" });
    await prisma.adSpendDaily.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Deleted" });
  } catch (error) {
    return next(error);
  }
});

export default router;
