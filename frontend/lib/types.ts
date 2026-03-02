export interface AppItem {
  id: string;
  name: string;
  appStoreUrl: string | null;
  iconUrl: string | null;
  createdAt: string;
}

export interface Report {
  id: string;
  appId: string;
  date: string;
  installTotal: number;
  paywallShownTotal: number;
  trialStartedTotal: number;
  subscriptionStartedTotal: number;
  subscriptionCancelledTotal: number;
  paymentFailedTotal: number;
  subscriptionActiveTotal: number;
  installDay: number;
  paywallShownDay: number;
  trialStartedDay: number;
  subscriptionStartedDay: number;
  subscriptionCancelledDay: number;
  paymentFailedDay: number;
  subscriptionActiveDay: number;
  netGrowthDay: number;
  adSpend: number;
  revenueDay: number;
  refundsDay: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  percentFromPrevious: number | null;
  percentFromInstalls: number | null;
}

export interface Kpis {
  crInstallToPaywall: number | null;
  crPaywallToTrial: number | null;
  crTrialToSubscription: number | null;
  netSubscriptionGrowth: number;
  activeSubscriptions: number;
  revenueDay: number;
  arpu: number | null;
  cac: number | null;
}

export interface DashboardResponse {
  app: AppItem;
  funnel: FunnelStage[];
  kpis: Kpis | null;
  trend: Array<{ date: string; installs: number; subscriptions: number }>;
  table: Report[];
  latest: Report | null;
  availableCountries: string[];
  activeCountry: string | null;
}

export type IntegrationType = "APPHUD" | "APPSFLYER";

export interface Integration {
  id: string;
  appId: string;
  type: IntegrationType;
  isEnabled: boolean;
  settings: Record<string, unknown>;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncResult {
  daysProcessed: number;
  updatedCount: number;
  geoRowsUpdated: number;
  errors: string[];
}

export interface AdSpendRow {
  id: string;
  date: string;
  source: string;
  spend: number;
}
