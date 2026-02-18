import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../utils/jwt.js";

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/register", async (req, res, next) => {
  try {
    const payload = credentialsSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: payload.email } });
    if (existing) {
      return res.status(409).json({ message: "User already exists" });
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await prisma.user.create({
      data: {
        email: payload.email,
        passwordHash,
      },
    });

    const token = signToken({ sub: user.id, email: user.email });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const payload = credentialsSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({ sub: user.id, email: user.email });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
