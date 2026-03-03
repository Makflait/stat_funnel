import app from "./app.js";
import { env } from "./lib/env.js";
import { startScheduler } from "./jobs/scheduler.js";
import { startTelegramBot } from "./bot/telegram-bot.js";

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
  startScheduler();
  startTelegramBot();
});
