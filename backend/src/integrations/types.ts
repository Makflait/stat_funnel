/**
 * Normalized daily metrics from Apphud (subscription events).
 * All values are daily (not cumulative).
 */
export interface ApphudDailyMetrics {
  date: string; // YYYY-MM-DD
  trials: number;
  subscriptions: number;
  cancellations: number;
  paymentFailures: number;
  activeSubscriptions: number;
  revenueDay: number;
  refundsDay: number;
}

/**
 * Normalized daily metrics from AppsFlyer (attribution / installs).
 * All values are daily.
 */
export interface AppsFlyerDailyMetrics {
  date: string; // YYYY-MM-DD
  installs: number;
  paywallImpressions: number;
}

export interface ApphudCredentials {
  apiKey: string;
  projectId: string;
}

export interface AppsFlyerCredentials {
  apiToken: string;
  appId: string;
}

export interface IntegrationSettings {
  timezone?: string;
  [key: string]: unknown;
}

/**
 * Apphud daily metrics broken down by country.
 * Returned when fetching with group_by=country.
 */
export interface ApphudGeoMetrics {
  date: string;    // YYYY-MM-DD
  country: string; // ISO 3166-1 alpha-2: "US", "GB", "DE"
  trials: number;
  subscriptions: number;
  cancellations: number;
  activeSubscriptions: number;
  revenueDay: number;
  refundsDay: number;
}

export interface SyncResult {
  daysProcessed: number;
  updatedCount: number;
  geoRowsUpdated: number;
  errors: string[];
}
