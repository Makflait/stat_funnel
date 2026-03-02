import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { syncApp } from "../jobs/sync.js";
import { toDateOnlyUtc } from "../utils/date.js";

const router = Router();
router.use(authMiddleware);

// ─── POST /api/sync ────────────────────────────────────────────────────────────

const syncSchema = z.object({
  appId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post("/sync", async (req, res, next) => {
  try {
    const payload = syncSchema.parse(req.body);

    const app = await prisma.app.findFirst({
      where: { id: payload.appId, ownerId: req.user!.id },
    });
    if (!app) return res.status(404).json({ message: "App not found" });

    const from = toDateOnlyUtc(payload.from);
    const to = toDateOnlyUtc(payload.to);

    if (from > to) {
      return res.status(400).json({ message: "'from' must be before or equal to 'to'" });
    }

    const result = await syncApp(payload.appId, from, to);
    return res.status(200).json({ result });
  } catch (error) {
    return next(error);
  }
});

// ─── POST /api/adspend/import ──────────────────────────────────────────────────

const adSpendRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  spend: z.number().nonnegative(),
});

const adSpendImportSchema = z.object({
  appId: z.string().min(1),
  source: z.string().min(1).max(50),
  rows: z.array(adSpendRowSchema).min(1).max(1000),
});

router.post("/adspend/import", async (req, res, next) => {
  try {
    const payload = adSpendImportSchema.parse(req.body);

    const app = await prisma.app.findFirst({
      where: { id: payload.appId, ownerId: req.user!.id },
    });
    if (!app) return res.status(404).json({ message: "App not found" });

    // Bulk upsert using a transaction
    let upsertedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of payload.rows) {
        const date = toDateOnlyUtc(row.date);
        await tx.adSpendDaily.upsert({
          where: {
            appId_date_source: {
              appId: payload.appId,
              date,
              source: payload.source,
            },
          },
          create: {
            appId: payload.appId,
            date,
            source: payload.source,
            spend: new Prisma.Decimal(row.spend),
          },
          update: {
            spend: new Prisma.Decimal(row.spend),
          },
        });
        upsertedCount++;
      }
    });

    return res.status(200).json({
      message: `Imported ${upsertedCount} ad spend rows`,
      upsertedCount,
    });
  } catch (error) {
    return next(error);
  }
});

// ─── GET /api/adspend?appId= ───────────────────────────────────────────────────

router.get("/adspend", async (req, res, next) => {
  try {
    const query = z
      .object({
        appId: z.string().min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(req.query);

    const app = await prisma.app.findFirst({
      where: { id: query.appId, ownerId: req.user!.id },
    });
    if (!app) return res.status(404).json({ message: "App not found" });

    const rows = await prisma.adSpendDaily.findMany({
      where: {
        appId: query.appId,
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: toDateOnlyUtc(query.from) } : {}),
                ...(query.to ? { lte: toDateOnlyUtc(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ date: "desc" }, { source: "asc" }],
    });

    return res.status(200).json({
      rows: rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        source: r.source,
        spend: Number(r.spend),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
