import type { AppsFlyerCredentials, AppsFlyerDailyMetrics, IntegrationSettings } from "./types.js";
import { formatDateOnlyUtc } from "../utils/date.js";

/**
 * AppsFlyer Pull API v5 — Raw Data endpoints.
 *
 * Base URL: https://hq1.appsflyer.com/api/raw-data/export/app/{app_id}/
 * Endpoints:
 *   installs_report/v5         — non-organic installs (real-time)
 *   organic_installs_report/v5 — organic installs (real-time)
 *
 * Each row in the CSV is one install. The "Install Time" column gives the
 * timestamp; we extract the date part and count rows per day.
 *
 * Auth: Authorization: Bearer {api_v2_token}  OR  ?api_token={api_v1_token}
 * Both are sent so either token format works.
 *
 * Docs: https://support.appsflyer.com/hc/en-us/articles/207034346-Pull-API
 */

const APPSFLYER_API_BASE = "https://hq1.appsflyer.com/api/raw-data/export/app";
const REQUEST_TIMEOUT_MS = 45_000;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchAppsFlyerMetrics(
  credentials: AppsFlyerCredentials,
  settings: IntegrationSettings,
  from: Date,
  to: Date,
): Promise<AppsFlyerDailyMetrics[]> {
  const timezone = String(settings.timezone || "UTC");
  const params = new URLSearchParams({
    api_token: credentials.apiToken, // V1 token
    from: formatDateOnlyUtc(from),
    to: formatDateOnlyUtc(to),
    timezone,
  });

  const base = `${APPSFLYER_API_BASE}/${credentials.appId}`;

  // Fetch non-organic and organic in parallel; gracefully handle one failing
  const [nonOrganic, organic] = await Promise.allSettled([
    fetchAndCount(`${base}/installs_report/v5?${params}`, credentials.apiToken),
    fetchAndCount(`${base}/organic_installs_report/v5?${params}`, credentials.apiToken),
  ]);

  const combined = new Map<string, number>();

  if (nonOrganic.status === "fulfilled") {
    for (const [date, count] of nonOrganic.value) {
      combined.set(date, (combined.get(date) ?? 0) + count);
    }
  } else {
    console.warn(`[appsflyer] non-organic fetch failed: ${nonOrganic.reason}`);
  }

  if (organic.status === "fulfilled") {
    for (const [date, count] of organic.value) {
      combined.set(date, (combined.get(date) ?? 0) + count);
    }
  } else {
    console.warn(`[appsflyer] organic fetch failed: ${organic.reason}`);
  }

  if (combined.size === 0) {
    const reasons = [
      nonOrganic.status === "rejected" ? String(nonOrganic.reason) : null,
      organic.status === "rejected" ? String(organic.reason) : null,
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`AppsFlyer: both endpoints failed — ${reasons}`);
  }

  return Array.from(combined.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, installs]) => ({ date, installs, paywallImpressions: 0 }));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Fetch one AppsFlyer raw-data endpoint and return installs-per-date counts. */
async function fetchAndCount(url: string, token: string): Promise<Map<string, number>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let csv: string;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`, // V2 JWT token
        Accept: "text/plain,text/csv,*/*",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AppsFlyer API error ${res.status}: ${body.slice(0, 300)}`);
    }

    csv = await res.text();
  } finally {
    clearTimeout(timer);
  }

  return parseRawInstallsCsv(csv);
}

/**
 * Parse raw installs CSV.
 * Each row = 1 install. Extract date from "Install Time" column and count per day.
 */
function parseRawInstallsCsv(csv: string): Map<string, number> {
  const byDate = new Map<string, number>();
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return byDate;

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  // AppsFlyer raw data uses "Install Time" (format: "YYYY-MM-DD HH:MM:SS")
  let timeIdx = headers.indexOf("install time");
  if (timeIdx === -1) timeIdx = headers.indexOf("event time"); // fallback

  if (timeIdx === -1) {
    console.warn(
      `[appsflyer] CSV missing "Install Time" column. Got: ${headers.slice(0, 10).join(", ")}`,
    );
    return byDate;
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const rawTime = cols[timeIdx]?.trim() ?? "";
    // "YYYY-MM-DD HH:MM:SS" → take first 10 chars
    const date = rawTime.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }

  return byDate;
}

/** Minimal CSV line parser handling double-quoted fields with embedded commas. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
