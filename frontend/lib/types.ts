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
  geo: string;
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
  arpu: number | null;
  cac: number | null;
}

export interface GeoBreakdown {
  geo: string;
  kpis: Kpis | null;
  avgDailyInstalls: number;
}

export interface DashboardResponse {
  app: AppItem;
  geos: string[];
  geoBreakdown: GeoBreakdown[];
  funnel: FunnelStage[];
  kpis: Kpis | null;
  trend: Array<{ date: string; installs: number; subscriptions: number }>;
  table: Report[];
  latest: Report | null;
}
