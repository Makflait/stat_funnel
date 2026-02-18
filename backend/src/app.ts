import cors from "cors";
import express from "express";
import { env } from "./lib/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import appsRoutes from "./routes/apps.routes.js";
import authRoutes from "./routes/auth.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import reportsRoutes from "./routes/reports.routes.js";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/apps", appsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(errorHandler);

export default app;
