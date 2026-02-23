import type { Report } from "@prisma/client";

export interface CumulativeTotals {
  installTotal: number;
  paywallShownTotal: number;
  trialStartedTotal: number;
  subscriptionStartedTotal: number;
  subscriptionCancelledTotal: number;
  paymentFailedTotal: number;
  subscriptionActiveTotal: number;
}

export interface DailyDeltas {
  installDay: number;
  paywallShownDay: number;
  trialStartedDay: number;
  subscriptionStartedDay: number;
  subscriptionCancelledDay: number;
  paymentFailedDay: number;
  subscriptionActiveDay: number;
}

export interface NegativeDelta {
  field: keyof DailyDeltas;
  value: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  percentFromPrevious: number | null;
  percentFromInstalls: number | null;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function pct(numerator: number, denominator: number): number | null {
  const value = ratio(numerator, denominator);
  if (value === null) return null;
  return value * 100;
}

export function extractTotals(report: Pick<
  Report,
  | "installTotal"
  | "paywallShownTotal"
  | "trialStartedTotal"
  | "subscriptionStartedTotal"
  | "subscriptionCancelledTotal"
  | "paymentFailedTotal"
  | "subscriptionActiveTotal"
>): CumulativeTotals {
  return {
    installTotal: report.installTotal,
    paywallShownTotal: report.paywallShownTotal,
    trialStartedTotal: report.trialStartedTotal,
    subscriptionStartedTotal: report.subscriptionStartedTotal,
    subscriptionCancelledTotal: report.subscriptionCancelledTotal,
    paymentFailedTotal: report.paymentFailedTotal,
    subscriptionActiveTotal: report.subscriptionActiveTotal,
  };
}

export function calculateDeltas(
  current: CumulativeTotals,
  previous: CumulativeTotals | null
): { deltas: DailyDeltas; negativeDeltas: NegativeDelta[]; netGrowthDay: number } {
  const deltas: DailyDeltas = {
    installDay: previous ? current.installTotal - previous.installTotal : current.installTotal,
    paywallShownDay: previous
      ? current.paywallShownTotal - previous.paywallShownTotal
      : current.paywallShownTotal,
    trialStartedDay: previous
      ? current.trialStartedTotal - previous.trialStartedTotal
      : current.trialStartedTotal,
    subscriptionStartedDay: previous
      ? current.subscriptionStartedTotal - previous.subscriptionStartedTotal
      : current.subscriptionStartedTotal,
    subscriptionCancelledDay: previous
      ? current.subscriptionCancelledTotal - previous.subscriptionCancelledTotal
      : current.subscriptionCancelledTotal,
    paymentFailedDay: previous
      ? current.paymentFailedTotal - previous.paymentFailedTotal
      : current.paymentFailedTotal,
    subscriptionActiveDay: previous
      ? current.subscriptionActiveTotal - previous.subscriptionActiveTotal
      : current.subscriptionActiveTotal,
  };

  const negativeDeltas = (Object.entries(deltas) as [keyof DailyDeltas, number][])
    .filter(([, value]) => value < 0)
    .map(([field, value]) => ({ field, value }));

  const netGrowthDay = deltas.subscriptionStartedDay - deltas.subscriptionCancelledDay;

  return { deltas, negativeDeltas, netGrowthDay };
}

export function buildFunnel(report: CumulativeTotals): FunnelStage[] {
  const stages = [
    { key: "install", label: "Install", value: report.installTotal },
    { key: "paywall", label: "Paywall shown", value: report.paywallShownTotal },
    { key: "trial", label: "Trial started", value: report.trialStartedTotal },
    { key: "sub", label: "Subscription started", value: report.subscriptionStartedTotal },
    { key: "active", label: "Active subscription", value: report.subscriptionActiveTotal },
  ];

  return stages.map((stage, index) => {
    const prev = index === 0 ? null : stages[index - 1];
    return {
      ...stage,
      percentFromPrevious: prev ? pct(stage.value, prev.value) : null,
      percentFromInstalls: pct(stage.value, stages[0].value),
    };
  });
}

export function buildKpis(report: Pick<
  Report,
  | "installTotal"
  | "paywallShownTotal"
  | "trialStartedTotal"
  | "subscriptionStartedTotal"
  | "subscriptionActiveTotal"
  | "netGrowthDay"
  | "revenueDay"
  | "adSpend"
  | "installDay"
  | "subscriptionStartedDay"
>) {
  const revenue = Number(report.revenueDay);
  const adSpend = Number(report.adSpend);

  return {
    crInstallToPaywall: pct(report.paywallShownTotal, report.installTotal),
    crPaywallToTrial: pct(report.trialStartedTotal, report.paywallShownTotal),
    crTrialToSubscription: pct(report.subscriptionStartedTotal, report.trialStartedTotal),
    netSubscriptionGrowth: report.netGrowthDay,
    activeSubscriptions: report.subscriptionActiveTotal,
    // ARPU = daily revenue ÷ active subscribers (not daily installs)
    arpu: report.subscriptionActiveTotal > 0 ? revenue / report.subscriptionActiveTotal : null,
    // CAC = ad spend ÷ new paying customers that day (installs → CPI, not CAC)
    cac: report.subscriptionStartedDay > 0 && adSpend > 0 ? adSpend / report.subscriptionStartedDay : null,
  };
}

export function buildCalculationExamples() {
  return {
    deltaExample: {
      yesterday: { subscriptionStartedTotal: 20 },
      today: { subscriptionStartedTotal: 21 },
      formula: "delta_today = total_today - total_yesterday",
      result: { subscriptionStartedDay: 1 },
    },
    funnelExample: {
      totals: {
        installTotal: 1000,
        paywallShownTotal: 700,
        trialStartedTotal: 210,
        subscriptionStartedTotal: 84,
        subscriptionActiveTotal: 60,
      },
      conversion: {
        cr1: "700 / 1000 = 70%",
        cr2: "210 / 700 = 30%",
        cr3: "84 / 210 = 40%",
      },
    },
  };
}
