import cors from "cors";
import express from "express";
import { env } from "./lib/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import appsRoutes from "./routes/apps.routes.js";
import authRoutes from "./routes/auth.routes.js";
import attributionRoutes from "./routes/attribution.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import integrationsRoutes from "./routes/integrations.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import syncRoutes from "./routes/sync.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

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
app.use("/api/attribution", attributionRoutes);
app.use("/api/integrations", integrationsRoutes);
app.use("/api/webhook", webhookRoutes);
app.use("/api", syncRoutes);
app.use("/webhook", webhookRoutes);

app.use(errorHandler);

export default app;
