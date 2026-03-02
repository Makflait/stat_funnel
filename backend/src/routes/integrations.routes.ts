import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { encrypt } from "../lib/crypto.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

const upsertSchema = z.object({
  appId: z.string().min(1),
  type: z.enum(["APPHUD", "APPSFLYER"]),
  credentials: z.record(z.string()),
  settings: z.record(z.unknown()).optional(),
});

// ─── Verify app ownership helper ──────────────────────────────────────────────

async function findOwnedApp(appId: string, userId: string) {
  return prisma.app.findFirst({ where: { id: appId, ownerId: userId } });
}

async function findOwnedIntegration(id: string, userId: string) {
  return prisma.integration.findFirst({
    where: { id, app: { ownerId: userId } },
  });
}

// ─── GET /api/integrations?appId= ─────────────────────────────────────────────

router.get("/", async (req, res, next) => {
  try {
    const appId = z.string().min(1).parse(req.query.appId);
    const app = await findOwnedApp(appId, req.user!.id);
    if (!app) return res.status(404).json({ message: "App not found" });

    const integrations = await prisma.integration.findMany({
      where: { appId },
      orderBy: { createdAt: "asc" },
    });

    // Return integrations without decrypted credentials
    return res.status(200).json({
      integrations: integrations.map((i) => ({
        id: i.id,
        appId: i.appId,
        type: i.type,
        isEnabled: i.isEnabled,
        settings: i.settings,
        lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
        lastSyncError: i.lastSyncError,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// ─── POST /api/integrations ────────────────────────────────────────────────────

router.post("/", async (req, res, next) => {
  try {
    const payload = upsertSchema.parse(req.body);
    const app = await findOwnedApp(payload.appId, req.user!.id);
    if (!app) return res.status(404).json({ message: "App not found" });

    const credentialsEncrypted = encrypt(JSON.stringify(payload.credentials));

    const settingsJson = (payload.settings ?? {}) as Prisma.InputJsonValue;

    const integration = await prisma.integration.upsert({
      where: { appId_type: { appId: payload.appId, type: payload.type } },
      create: {
        appId: payload.appId,
        type: payload.type,
        credentialsEncrypted,
        settings: settingsJson,
        isEnabled: true,
      },
      update: {
        credentialsEncrypted,
        settings: settingsJson,
        isEnabled: true,
        lastSyncError: null,
      },
    });

    return res.status(200).json({
      integration: {
        id: integration.id,
        appId: integration.appId,
        type: integration.type,
        isEnabled: integration.isEnabled,
        settings: integration.settings,
        lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
        lastSyncError: integration.lastSyncError,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// ─── DELETE /api/integrations/:id ─────────────────────────────────────────────

router.delete("/:id", async (req, res, next) => {
  try {
    const integration = await findOwnedIntegration(req.params.id, req.user!.id);
    if (!integration) return res.status(404).json({ message: "Integration not found" });

    await prisma.integration.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: "Deleted" });
  } catch (error) {
    return next(error);
  }
});

// ─── PATCH /api/integrations/:id/toggle ───────────────────────────────────────

router.patch("/:id/toggle", async (req, res, next) => {
  try {
    const integration = await findOwnedIntegration(req.params.id, req.user!.id);
    if (!integration) return res.status(404).json({ message: "Integration not found" });

    const updated = await prisma.integration.update({
      where: { id: req.params.id },
      data: { isEnabled: !integration.isEnabled },
    });

    return res.status(200).json({ isEnabled: updated.isEnabled });
  } catch (error) {
    return next(error);
  }
});

export default router;
