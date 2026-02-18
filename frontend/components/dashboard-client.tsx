"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiRequest, buildApiUrl } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { AppItem, DashboardResponse, Kpis } from "@/lib/types";
import ReportFormModal, { ReportFormPayload } from "./report-form-modal";

type Period = "7" | "14" | "30" | "custom";

interface NegativeDeltaResponse {
  code: "NEGATIVE_DELTAS";
  message: string;
  negativeDeltas: Array<{ field: string; value: number }>;
}

interface FunnelBlock {
  key: string;
  label: string;
  value: number;
  percentFromPrevious: number | null;
  percentFromInstalls: number | null;
  widthPercent: number;
  gradientFrom: string;
  gradientTo: string;
}

const FUNNEL_LABELS: Record<string, string> = {
  install: "Инсталлы",
  paywall: "Показы пейвола",
  trial: "Старт триала",
  sub: "Старт подписки",
  active: "Активные подписки",
};

const FUNNEL_GRADIENTS: Array<[string, string]> = [
  ["#8f5cff", "#7449ff"],
  ["#6f88ff", "#4f70ff"],
  ["#31b9ff", "#1b9ff4"],
  ["#20c8a3", "#12a982"],
  ["#6fdc62", "#4dbf41"],
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rangeFromPeriod(period: Period, customFrom: string, customTo: string) {
  if (period === "custom") {
    return { from: customFrom, to: customTo };
  }
  const to = todayIso();
  const from = shiftDays(to, -Number(period) + 1);
  return { from, to };
}

function buildFunnelBlocks(funnel: DashboardResponse["funnel"] | undefined): FunnelBlock[] {
  if (!funnel?.length) return [];

  const baseValue = Math.max(funnel[0].value, 1);
  let previousWidth = 100;

  return funnel.map((stage, index) => {
    const rawWidth = index === 0 ? 100 : Math.round((stage.value / baseValue) * 100);
    const upperBound = Math.max(36, previousWidth - 2);
    const widthPercent = index === 0 ? 100 : Math.max(36, Math.min(upperBound, rawWidth));
    previousWidth = widthPercent;

    const [gradientFrom, gradientTo] = FUNNEL_GRADIENTS[index % FUNNEL_GRADIENTS.length];

    return {
      key: stage.key,
      label: FUNNEL_LABELS[stage.key] ?? stage.label,
      value: stage.value,
      percentFromPrevious: stage.percentFromPrevious,
      percentFromInstalls: stage.percentFromInstalls,
      widthPercent,
      gradientFrom,
      gradientTo,
    };
  });
}

async function parseErrorResponse(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | NegativeDeltaResponse
    | { message?: string }
    | null;
  return body;
}

function kpiCards(kpis: Kpis | null) {
  if (!kpis) return [];
  return [
    { label: "CR Install -> Paywall", value: formatPercent(kpis.crInstallToPaywall) },
    { label: "CR Paywall -> Trial", value: formatPercent(kpis.crPaywallToTrial) },
    { label: "CR Trial -> Subscription", value: formatPercent(kpis.crTrialToSubscription) },
    { label: "Net Subscription Growth", value: formatNumber(kpis.netSubscriptionGrowth) },
    { label: "Active Subscriptions", value: formatNumber(kpis.activeSubscriptions) },
    { label: "ARPU", value: formatCurrency(kpis.arpu) },
    { label: "CAC", value: formatCurrency(kpis.cac) },
  ];
}

export default function DashboardClient() {
  const router = useRouter();
  const [apps, setApps] = useState<AppItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [period, setPeriod] = useState<Period>("30");
  const [customFrom, setCustomFrom] = useState(shiftDays(todayIso(), -29));
  const [customTo, setCustomTo] = useState(todayIso());
  const [showReportForm, setShowReportForm] = useState(false);
  const [showAppForm, setShowAppForm] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => rangeFromPeriod(period, customFrom, customTo),
    [period, customFrom, customTo]
  );
  const funnelBlocks = useMemo(
    () => buildFunnelBlocks(dashboard?.funnel),
    [dashboard?.funnel]
  );

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    loadApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedAppId) return;
    loadDashboard(selectedAppId, range.from, range.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId, range.from, range.to]);

  async function loadApps() {
    try {
      const data = await apiRequest<{ apps: AppItem[] }>("/apps");
      setApps(data.apps);
      if (data.apps[0]) {
        setSelectedAppId(data.apps[0].id);
      }
    } catch (loadError) {
      handleApiError(loadError);
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard(appId: string, from: string, to: string) {
    setError(null);
    try {
      const query = new URLSearchParams({ appId, from, to });
      const data = await apiRequest<DashboardResponse>(`/dashboard?${query.toString()}`);
      setDashboard(data);
    } catch (loadError) {
      handleApiError(loadError);
    }
  }

  function handleApiError(apiError: unknown) {
    if (apiError instanceof Error) {
      if (/Unauthorized|Invalid token|401/.test(apiError.message)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError(apiError.message);
      return;
    }
    setError("Неизвестная ошибка");
  }

  async function createApp(event: FormEvent) {
    event.preventDefault();
    if (!newAppName.trim()) return;

    try {
      const response = await apiRequest<{ app: AppItem }>("/apps", {
        method: "POST",
        body: JSON.stringify({ name: newAppName.trim() }),
      });

      setApps((prev) => [response.app, ...prev]);
      setSelectedAppId(response.app.id);
      setNewAppName("");
      setShowAppForm(false);
    } catch (createError) {
      handleApiError(createError);
    }
  }

  async function createReport(payload: ReportFormPayload, forceConfirm = false): Promise<void> {
    const token = getToken();

    const response = await fetch(buildApiUrl("/reports"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        ...payload,
        confirmNegativeDeltas: forceConfirm,
      }),
    });

    if (!response.ok) {
      const body = await parseErrorResponse(response);

      if (
        body &&
        typeof body === "object" &&
        "code" in body &&
        body.code === "NEGATIVE_DELTAS" &&
        !forceConfirm
      ) {
        const details = body.negativeDeltas.map((item) => `${item.field}: ${item.value}`).join("\n");
        const accepted = window.confirm(
          `${body.message}\n\n${details}\n\nСохранить отчёт несмотря на это?`
        );
        if (accepted) {
          return createReport(payload, true);
        }
        throw new Error("Отчёт не сохранён");
      }

      const message = body && typeof body === "object" && "message" in body ? body.message : null;
      throw new Error(message || `Ошибка создания отчёта: ${response.status}`);
    }

    await loadDashboard(payload.appId, range.from, range.to);
  }

  async function exportCsv() {
    if (!selectedAppId) return;

    const token = getToken();
    const query = new URLSearchParams({
      appId: selectedAppId,
      from: range.from,
      to: range.to,
    });

    const response = await fetch(buildApiUrl(`/reports/export?${query.toString()}`), {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Ошибка экспорта: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reports-${selectedAppId}-${range.from}-${range.to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center">Загрузка...</main>;
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute left-[-120px] top-[-80px] h-80 w-80 rounded-full bg-primary/30 blur-3xl animate-floatPulse" />
      <div className="pointer-events-none absolute right-[-120px] top-[220px] h-72 w-72 rounded-full bg-primarySoft/20 blur-3xl animate-floatPulse" />

      <section className="relative z-10 mx-auto max-w-7xl space-y-6">
        <header className="card grid-lines glass p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mono text-xs uppercase tracking-[0.2em] text-muted">Stat Funnel</p>
              <h1 className="mt-2 text-3xl font-semibold">Дневной growth-дашборд</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowReportForm(true)}
                disabled={!selectedAppId}
                className="rounded-xl bg-primary px-4 py-2 font-semibold text-bg hover:bg-primarySoft disabled:opacity-50"
              >
                Создать отчёт
              </button>
              <button
                onClick={() => exportCsv().catch(handleApiError)}
                disabled={!selectedAppId}
                className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary"
              >
                Экспорт CSV
              </button>
              <button
                onClick={() => {
                  clearToken();
                  router.push("/login");
                }}
                className="rounded-xl border border-border px-4 py-2 text-sm"
              >
                Выйти
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <select
                className="rounded-lg border border-border bg-bg/70 px-3 py-2"
                value={selectedAppId}
                onChange={(event) => setSelectedAppId(event.target.value)}
              >
                {apps.length === 0 ? <option value="">Нет приложений</option> : null}
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowAppForm((prev) => !prev)}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                {showAppForm ? "Отмена" : "Добавить приложение"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["7", "14", "30", "custom"] as Period[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setPeriod(item)}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    period === item ? "bg-primary text-bg" : "border border-border"
                  }`}
                >
                  {item === "custom" ? "Свой период" : `${item}д`}
                </button>
              ))}
              {period === "custom" ? (
                <>
                  <input
                    type="date"
                    className="rounded-lg border border-border bg-bg/70 px-3 py-2"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                  />
                  <input
                    type="date"
                    className="rounded-lg border border-border bg-bg/70 px-3 py-2"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                  />
                </>
              ) : null}
            </div>
          </div>

          {showAppForm ? (
            <form onSubmit={createApp} className="mt-4 flex gap-2">
              <input
                value={newAppName}
                onChange={(event) => setNewAppName(event.target.value)}
                placeholder="Название приложения"
                className="w-56 rounded-lg border border-border bg-bg/70 px-3 py-2"
              />
              <button className="rounded-lg bg-primary px-3 py-2 text-bg" type="submit">
                Создать
              </button>
            </form>
          ) : null}

          {error ? <p className="mt-4 text-sm text-warning">{error}</p> : null}
        </header>

        <section className="card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Воронка</h2>
          <p className="mt-2 text-sm text-muted">От инсталла до активной подписки</p>

          {funnelBlocks.length > 0 ? (
            <div className="mt-6 flex flex-col items-center gap-3">
              {funnelBlocks.map((block) => (
                <div key={block.key} className="flex w-full justify-center">
                  <article
                    className="relative overflow-hidden border border-white/15 text-white shadow-glow"
                    style={{
                      width: `${block.widthPercent}%`,
                      clipPath: "polygon(4% 0, 96% 0, 100% 100%, 0 100%)",
                      background: `linear-gradient(120deg, ${block.gradientFrom}, ${block.gradientTo})`,
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                    <div className="relative z-10 flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="mono text-[11px] uppercase tracking-[0.16em] text-white/85">
                          {block.label}
                        </p>
                        <p className="mt-1 text-3xl font-semibold">{formatNumber(block.value)}</p>
                      </div>
                      <div className="text-xs text-white/90 sm:text-sm">
                        <p>От предыдущего: {formatPercent(block.percentFromPrevious)}</p>
                        <p>От инсталлов: {formatPercent(block.percentFromInstalls)}</p>
                      </div>
                    </div>
                  </article>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">Нет данных за выбранный период</p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpiCards(dashboard?.kpis ?? null).map((item) => (
            <article key={item.label} className="card p-4">
              <p className="text-sm text-muted">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold">{item.value}</p>
            </article>
          ))}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Динамика инсталлов и подписок</h2>
          <div className="mt-4 h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboard?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b2343" />
                <XAxis dataKey="date" stroke="#9f96c9" />
                <YAxis stroke="#9f96c9" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#130f22",
                    border: "1px solid #2b2343",
                    borderRadius: 12,
                  }}
                />
                <Line type="monotone" dataKey="installs" stroke="#8f5cff" strokeWidth={2.5} dot={false} />
                <Line
                  type="monotone"
                  dataKey="subscriptions"
                  stroke="#21c67a"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card overflow-x-auto p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Ежедневные отчёты</h2>
          <table className="mt-4 w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="pb-3 pr-4">Дата</th>
                <th className="pb-3 pr-4">Инсталлы (daily)</th>
                <th className="pb-3 pr-4">Подписки (daily)</th>
                <th className="pb-3 pr-4">Отмены (daily)</th>
                <th className="pb-3 pr-4">Revenue</th>
                <th className="pb-3 pr-4">Ad Spend</th>
                <th className="pb-3 pr-4">Net Growth</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard?.table ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="py-3 pr-4">{row.date}</td>
                  <td className="py-3 pr-4">{formatNumber(row.installDay)}</td>
                  <td className="py-3 pr-4">{formatNumber(row.subscriptionStartedDay)}</td>
                  <td className="py-3 pr-4">{formatNumber(row.subscriptionCancelledDay)}</td>
                  <td className="py-3 pr-4">{formatCurrency(row.revenueDay)}</td>
                  <td className="py-3 pr-4">{formatCurrency(row.adSpend)}</td>
                  <td className={`py-3 pr-4 ${row.netGrowthDay >= 0 ? "text-positive" : "text-warning"}`}>
                    {formatNumber(row.netGrowthDay)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>

      {showReportForm && selectedAppId ? (
        <ReportFormModal
          appId={selectedAppId}
          onClose={() => setShowReportForm(false)}
          onSubmit={(payload) => createReport(payload)}
        />
      ) : null}
    </main>
  );
}
