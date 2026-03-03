import type { AppsFlyerCredentials, AppsFlyerDailyMetrics, IntegrationSettings } from "./types.js";
import { formatDateOnlyUtc } from "../utils/date.js";

const APPSFLYER_API_BASE = "https://hq.appsflyer.com";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Fetch daily install metrics from AppsFlyer Pull API v5.
 *
 * Endpoint: GET /export/{app_id}/partners_by_date_report/v5
 * Auth: api_token query param (V1) or Authorization: Bearer (V2 JWT).
 *       Both are sent — AppsFlyer will use whichever is valid.
 * Response: CSV with one row per (date, media_source, campaign).
 *           We group by date and sum installs.
 *
 * Docs: https://dev.appsflyer.com/hc/reference/get_app-id-partners-by-date-report-v5-1
 */
export async function fetchAppsFlyerMetrics(
  credentials: AppsFlyerCredentials,
  settings: IntegrationSettings,
  from: Date,
  to: Date,
): Promise<AppsFlyerDailyMetrics[]> {
  const timezone = String(settings.timezone || "UTC");

  const params = new URLSearchParams({
    api_token: credentials.apiToken, // V1 token auth
    from: formatDateOnlyUtc(from),
    to: formatDateOnlyUtc(to),
    timezone,
  });

  const url = `${APPSFLYER_API_BASE}/export/${credentials.appId}/partners_by_date_report/v5?${params}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let csv: string;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`, // V2 JWT token auth
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

  return parseCsvToMetrics(csv);
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

/** Parse AppsFlyer CSV and aggregate installs by date (sum across all media sources). */
function parseCsvToMetrics(csv: string): AppsFlyerDailyMetrics[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  const dateIdx = headers.indexOf("date");
  const installsIdx = headers.indexOf("installs");

  if (dateIdx === -1) {
    throw new Error(
      `AppsFlyer CSV missing "Date" column. Got columns: ${headers.slice(0, 12).join(", ")}`,
    );
  }

  // Group installs by YYYY-MM-DD (multiple rows per date — one per media source)
  const byDate = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);

    const rawDate = cols[dateIdx]?.trim() ?? "";
    // Take first 10 chars to normalize "2025-03-03 00:00:00" → "2025-03-03"
    const date = rawDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const installs =
      installsIdx !== -1
        ? Math.max(0, parseInt(cols[installsIdx]?.trim() || "0", 10) || 0)
        : 0;

    byDate.set(date, (byDate.get(date) ?? 0) + installs);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, installs]) => ({
      date,
      installs,
      paywallImpressions: 0, // not tracked in aggregate report
    }));
}

/** Minimal CSV line parser that handles double-quoted fields with embedded commas. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'; // escaped quote
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
