import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

const appSchema = z.object({
  name: z.string().min(1),
  appStoreUrl: z.string().url().optional().or(z.literal("")),
  iconUrl: z.string().url().optional().or(z.literal("")),
});

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const apps = await prisma.app.findMany({
      where: { ownerId: req.user!.id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ apps });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = appSchema.parse(req.body);

    const app = await prisma.app.create({
      data: {
        name: payload.name,
        appStoreUrl: payload.appStoreUrl || null,
        iconUrl: payload.iconUrl || null,
        ownerId: req.user!.id,
      },
    });

    return res.status(201).json({ app });
  } catch (error) {
    return next(error);
  }
});

export default router;
