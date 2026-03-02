import type { ApphudCredentials, ApphudDailyMetrics, ApphudGeoMetrics, IntegrationSettings } from "./types.js";
import { formatDateOnlyUtc } from "../utils/date.js";

const APPHUD_API_BASE = "https://api.apphud.com/v1";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Response shape from Apphud charts API.
 * Adjust field names if Apphud changes their API response format.
 *
 * Endpoint: GET https://api.apphud.com/v1/charts
 * Docs: https://docs.apphud.com/docs/api
 */
interface ApphudChartRow {
  date: string;            // "2024-01-15"
  country?: string;        // "US" — present when group_by=country
  trials?: number;
  new_subscriptions?: number;
  churned_subscriptions?: number;
  failed_renewals?: number;
  active_subscriptions?: number;
  revenue?: number;        // in USD
  refunds?: number;        // in USD
}

interface ApphudChartsResponse {
  data: {
    results: ApphudChartRow[];
  };
}

/**
 * Fetches daily subscription metrics from Apphud for the given date range.
 *
 * Apphud API key must be passed in the X-Api-Key header.
 * Project (app) is identified by project_id query param.
 */
export async function fetchApphudMetrics(
  credentials: ApphudCredentials,
  settings: IntegrationSettings,
  from: Date,
  to: Date,
): Promise<ApphudDailyMetrics[]> {
  const fromStr = formatDateOnlyUtc(from);
  const toStr = formatDateOnlyUtc(to);

  const params = new URLSearchParams({
    project_id: credentials.projectId,
    date_from: fromStr,
    date_to: toStr,
    group_by: "date",
    ...(settings.timezone ? { timezone: settings.timezone } : {}),
  });

  const url = `${APPHUD_API_BASE}/charts?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "X-Api-Key": credentials.apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `Apphud API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Apphud API error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as ApphudChartsResponse;
  const rows = json?.data?.results ?? [];

  return rows.map((row): ApphudDailyMetrics => ({
    date: row.date,
    trials: row.trials ?? 0,
    subscriptions: row.new_subscriptions ?? 0,
    cancellations: row.churned_subscriptions ?? 0,
    paymentFailures: row.failed_renewals ?? 0,
    activeSubscriptions: row.active_subscriptions ?? 0,
    revenueDay: row.revenue ?? 0,
    refundsDay: row.refunds ?? 0,
  }));
}

/**
 * Fetches daily subscription metrics from Apphud broken down by country.
 * Uses group_by=country to get per-country data for the given date range.
 */
export async function fetchApphudGeoMetrics(
  credentials: ApphudCredentials,
  settings: IntegrationSettings,
  from: Date,
  to: Date,
): Promise<ApphudGeoMetrics[]> {
  const fromStr = formatDateOnlyUtc(from);
  const toStr = formatDateOnlyUtc(to);

  const params = new URLSearchParams({
    project_id: credentials.projectId,
    date_from: fromStr,
    date_to: toStr,
    group_by: "country",
    ...(settings.timezone ? { timezone: settings.timezone } : {}),
  });

  const url = `${APPHUD_API_BASE}/charts?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "X-Api-Key": credentials.apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `Apphud geo API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Apphud geo API error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as ApphudChartsResponse;
  const rows = json?.data?.results ?? [];

  return rows
    .filter((row) => row.country && row.country.length === 2)
    .map((row): ApphudGeoMetrics => ({
      date: row.date,
      country: row.country!.toUpperCase(),
      trials: row.trials ?? 0,
      subscriptions: row.new_subscriptions ?? 0,
      cancellations: row.churned_subscriptions ?? 0,
      activeSubscriptions: row.active_subscriptions ?? 0,
      revenueDay: row.revenue ?? 0,
      refundsDay: row.refunds ?? 0,
    }));
}
