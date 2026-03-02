import app from "./app.js";
import { env } from "./lib/env.js";
import { startScheduler } from "./jobs/scheduler.js";

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
  startScheduler();
});
