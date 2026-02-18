import type { Report } from "@prisma/client";
import { formatDateOnlyUtc } from "./date.js";

export function serializeReport(report: Report) {
  return {
    id: report.id,
    appId: report.appId,
    date: formatDateOnlyUtc(report.date),
    installTotal: report.installTotal,
    paywallShownTotal: report.paywallShownTotal,
    trialStartedTotal: report.trialStartedTotal,
    subscriptionStartedTotal: report.subscriptionStartedTotal,
    subscriptionCancelledTotal: report.subscriptionCancelledTotal,
    paymentFailedTotal: report.paymentFailedTotal,
    subscriptionActiveTotal: report.subscriptionActiveTotal,
    installDay: report.installDay,
    paywallShownDay: report.paywallShownDay,
    trialStartedDay: report.trialStartedDay,
    subscriptionStartedDay: report.subscriptionStartedDay,
    subscriptionCancelledDay: report.subscriptionCancelledDay,
    paymentFailedDay: report.paymentFailedDay,
    subscriptionActiveDay: report.subscriptionActiveDay,
    netGrowthDay: report.netGrowthDay,
    adSpend: Number(report.adSpend),
    revenueDay: Number(report.revenueDay),
    refundsDay: Number(report.refundsDay),
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}
