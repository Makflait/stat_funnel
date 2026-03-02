import cron from "node-cron";
import { syncAllApps } from "./sync.js";
import { formatDateOnlyUtc } from "../utils/date.js";

/**
 * Starts the nightly cron scheduler.
 * Runs every day at 06:00 UTC to sync the previous day's data.
 */
export function startScheduler(): void {
  // "0 6 * * *" = at 06:00 UTC every day
  cron.schedule("0 6 * * *", async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    console.log(`[scheduler] nightly sync started for ${formatDateOnlyUtc(yesterday)}`);
    try {
      await syncAllApps(yesterday, yesterday);
      console.log(`[scheduler] nightly sync completed`);
    } catch (err) {
      console.error(`[scheduler] nightly sync failed:`, err instanceof Error ? err.message : err);
    }
  });

  console.log("[scheduler] nightly sync scheduled at 06:00 UTC");
}
