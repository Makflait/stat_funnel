import type { AppsFlyerCredentials, AppsFlyerDailyMetrics, IntegrationSettings } from "./types.js";
import { formatDateOnlyUtc } from "../utils/date.js";

/**
 * STUB implementation of AppsFlyer adapter.
 *
 * TODO: Replace with real AppsFlyer Pull API call when ready.
 *
 * Real endpoint (Pull API — Aggregate Performance Report):
 *   GET https://hq1.appsflyer.com/api/raw-data/export/app/{app-id}/installs_report/v5
 *   or aggregated:
 *   GET https://hq1.appsflyer.com/api/agg-data/export/app/{app-id}/partners_by_date_report/v5
 *
 * Auth: Authorization: Bearer {api-token}
 * Params: from (YYYY-MM-DD), to (YYYY-MM-DD), timezone, additional_fields
 *
 * Field mapping:
 *   Installs        → installs
 *   In-app events "paywall_shown" (if tracked) → paywallImpressions
 */
export async function fetchAppsFlyerMetrics(
  credentials: AppsFlyerCredentials,
  _settings: IntegrationSettings,
  from: Date,
  to: Date,
): Promise<AppsFlyerDailyMetrics[]> {
  // Stub: return zeros for the requested date range.
  // Replace this block with a real HTTP call when integrating with AppsFlyer.
  const results: AppsFlyerDailyMetrics[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    results.push({
      date: formatDateOnlyUtc(cursor),
      installs: 0,
      paywallImpressions: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return results;
}

// ─── Real implementation skeleton (commented out) ──────────────────────────
//
// const APPSFLYER_API_BASE = "https://hq1.appsflyer.com";
// const REQUEST_TIMEOUT_MS = 30_000;
//
// export async function fetchAppsFlyerMetrics(
//   credentials: AppsFlyerCredentials,
//   settings: IntegrationSettings,
//   from: Date,
//   to: Date,
// ): Promise<AppsFlyerDailyMetrics[]> {
//   const params = new URLSearchParams({
//     from: formatDateOnlyUtc(from),
//     to: formatDateOnlyUtc(to),
//     timezone: settings.timezone ?? "UTC",
//   });
//
//   const url = `${APPSFLYER_API_BASE}/api/agg-data/export/app/${credentials.appId}/partners_by_date_report/v5?${params}`;
//   const controller = new AbortController();
//   const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
//
//   try {
//     const res = await fetch(url, {
//       headers: { Authorization: `Bearer ${credentials.apiToken}` },
//       signal: controller.signal,
//     });
//     if (!res.ok) throw new Error(`AppsFlyer error ${res.status}`);
//     const csv = await res.text();
//     return parseCsvToMetrics(csv);
//   } finally {
//     clearTimeout(timer);
//   }
// }
