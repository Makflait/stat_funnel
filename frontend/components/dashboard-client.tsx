"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiRequest, buildApiUrl } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { AppItem, DashboardResponse, Kpis, Report } from "@/lib/types";
import ReportFormModal, { ReportFormPayload } from "./report-form-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "7" | "14" | "30" | "custom";
type ValueType = "percent" | "currency" | "number";

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

interface KpiCardData {
  label: string;
  rawValue: number;
  formatted: string;
  valueType: ValueType;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  description: string;
  delay: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FUNNEL_LABELS: Record<string, string> = {
  install: "Инсталлы",
  paywall: "Пейвол показан",
  trial: "Старт триала",
  sub: "Старт подписки",
  active: "Активные подписки",
};

// Funnel colour progression: teal → ocean blue → indigo → violet → fuchsia
const FUNNEL_GRADIENTS: Array<[string, string]> = [
  ["#0d9488", "#0f766e"],
  ["#0284c7", "#0369a1"],
  ["#6366f1", "#4f46e5"],
  ["#9333ea", "#7c3aed"],
  ["#c026d3", "#a21caf"],
];

// ─── Utilities ───────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rangeFromPeriod(period: Period, customFrom: string, customTo: string) {
  if (period === "custom") return { from: customFrom, to: customTo };
  const to = todayIso();
  const from = shiftDays(to, -Number(period) + 1);
  return { from, to };
}

function buildFunnelBlocks(funnel: DashboardResponse["funnel"] | undefined): FunnelBlock[] {
  if (!funnel?.length) return [];
  const baseValue = Math.max(funnel[0].value, 1);

  return funnel.map((stage, index) => {
    // Real percentage for visual width, min 12% so last stages are still visible
    const rawWidth = index === 0 ? 100 : Math.round((stage.value / baseValue) * 100);
    const widthPercent = index === 0 ? 100 : Math.max(12, rawWidth);
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

// ─── Custom hook: lightweight count-up animation ──────────────────────────────

function useCountUp(target: number, duration = 350, decimals = 0): number {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === 0) {
      setCount(0);
      return;
    }
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const val = target * eased;
      setCount(Number(val.toFixed(decimals)));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, decimals]);

  return count;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconDownload = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconCreditCard = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

const IconClock = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconTrendUp = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const IconTrendDown = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);

const IconUsers = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconDollar = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const IconTarget = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconExport = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconLogout = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const IconWarning = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, rawValue, formatted, valueType, icon, iconBg, iconColor, description, delay }: KpiCardData) {
  const decimals = valueType === "currency" ? 2 : valueType === "percent" ? 1 : 0;
  const count = useCountUp(rawValue, 350, decimals);

  const displayValue =
    formatted === "-"
      ? "-"
      : valueType === "currency"
      ? formatCurrency(count)
      : valueType === "percent"
      ? formatPercent(count)
      : formatNumber(count);

  return (
    <article
      className="card card-hover p-5 section-enter"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div className="badge badge-violet text-[10px] opacity-60">KPI</div>
      </div>
      <div className="mt-3.5">
        <p className="text-xs text-muted leading-snug">{label}</p>
        <p
          className="mono mt-1.5 text-[1.65rem] font-semibold stat-number leading-none"
          style={{ color: iconColor }}
        >
          {displayValue}
        </p>
        <p className="mt-1.5 text-[11px] text-mutedDark leading-tight">{description}</p>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="card p-5">
      <div className="skeleton h-10 w-10 rounded-xl" />
      <div className="mt-4 space-y-2.5">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-8 w-24" />
        <div className="skeleton h-2.5 w-32" />
      </div>
    </div>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card glass p-3 min-w-[148px] shadow-glow">
      <p className="mono text-[11px] text-muted mb-2.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 mt-1">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
            {entry.name === "installs" ? "Инсталлы" : "Подписки"}
          </span>
          <span className="mono text-xs font-semibold text-text">{formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Funnel Component ─────────────────────────────────────────────────────────

function FunnelChart({ blocks, visible }: { blocks: FunnelBlock[]; visible: boolean }) {
  if (!blocks.length) return null;

  return (
    <div className="mt-6 flex flex-col items-center gap-0">
      {blocks.map((block, index) => {
        const nextBlock = blocks[index + 1];
        const dropOffCount = nextBlock ? block.value - nextBlock.value : null;
        const dropOffPct = nextBlock && block.value > 0
          ? Math.round((dropOffCount! / block.value) * 100)
          : null;

        return (
          <div key={block.key} className="flex w-full flex-col items-center">
            {/* ── Funnel bar ── */}
            <div
              className="relative overflow-hidden text-white"
              style={{
                width: visible ? `${block.widthPercent}%` : "10%",
                minWidth: "200px",
                background: `linear-gradient(135deg, ${block.gradientFrom}f0, ${block.gradientTo})`,
                borderRadius: index === 0 ? "12px 12px 0 0" : index === blocks.length - 1 ? "0 0 12px 12px" : "0",
                transition: `width 450ms cubic-bezier(0.22, 1, 0.36, 1) ${index * 70}ms, opacity 280ms ease ${index * 55}ms`,
                opacity: visible ? 1 : 0,
                boxShadow: visible ? `0 2px 16px ${block.gradientFrom}45` : "none",
                borderLeft: "1px solid rgba(255,255,255,0.12)",
                borderRight: "1px solid rgba(255,255,255,0.12)",
                borderTop: index === 0 ? "1px solid rgba(255,255,255,0.18)" : "none",
                borderBottom: index === blocks.length - 1 ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* Top-shine overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.14] via-transparent to-black/[0.08] pointer-events-none" />

              <div className="relative z-10 flex items-center justify-between px-5 py-3.5 gap-4">
                {/* Left: stage info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px] font-bold text-white flex-shrink-0">
                      {index + 1}
                    </span>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-white/65 truncate">
                      {block.label}
                    </p>
                  </div>
                  <p className="mt-1 text-[1.5rem] font-semibold leading-none stat-number">
                    {formatNumber(block.value)}
                  </p>
                </div>

                {/* Right: conversion from previous step only */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {block.percentFromPrevious !== null ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
                        <path d="M20 12l-8 8-8-8" />
                      </svg>
                      {formatPercent(block.percentFromPrevious)}
                      <span className="text-[9px] text-white/45 font-normal">от пред.</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-white/40 italic">старт</span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Connector: drop-off info ── */}
            {index < blocks.length - 1 && (
              <div
                className="flex flex-col items-center py-1"
                style={{
                  opacity: visible ? 1 : 0,
                  transition: `opacity 300ms ease ${(index + 1) * 70 + 200}ms`,
                }}
              >
                {/* Drop-off pill */}
                {dropOffCount !== null && dropOffCount > 0 && (
                  <div className="flex items-center gap-1.5 rounded-full border border-danger/20 bg-danger/[0.06] px-3 py-0.5 text-[11px] text-dangerSoft/75">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <polyline points="19 12 12 19 5 12" />
                    </svg>
                    <span>−{formatNumber(dropOffCount)}</span>
                    {dropOffPct !== null && (
                      <span className="opacity-60">({dropOffPct}% отсеялись)</span>
                    )}
                  </div>
                )}
                {/* Arrow */}
                <svg width="10" height="7" viewBox="0 0 10 7" fill="currentColor" className="text-border/40 mt-0.5">
                  <path d="M5 7L0 0h10z" />
                </svg>
              </div>
            )}
          </div>
        );
      })}

      {/* Summary row */}
      <div className="mt-4 flex w-full items-center justify-center gap-6 flex-wrap">
        {blocks.map((block) => (
          <div key={block.key} className="flex items-center gap-2 text-xs text-muted">
            <span
              className="h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: block.gradientFrom }}
            />
            <span>{block.label}</span>
            <span className="mono font-medium text-text">{formatNumber(block.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardClient() {
  const router = useRouter();
  const [apps, setApps] = useState<AppItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [period, setPeriod] = useState<Period>("30");
  const [customFrom, setCustomFrom] = useState(shiftDays(todayIso(), -29));
  const [customTo, setCustomTo] = useState(todayIso());
  const [showReportForm, setShowReportForm] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [showAppForm, setShowAppForm] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funnelVisible, setFunnelVisible] = useState(false);

  const range = useMemo(
    () => rangeFromPeriod(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const funnelBlocks = useMemo(() => buildFunnelBlocks(dashboard?.funnel), [dashboard?.funnel]);

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

  useEffect(() => {
    setFunnelVisible(false);
    if (funnelBlocks.length > 0) {
      const t = setTimeout(() => setFunnelVisible(true), 80);
      return () => clearTimeout(t);
    }
  }, [funnelBlocks.length, dashboard]);

  async function loadApps() {
    try {
      const data = await apiRequest<{ apps: AppItem[] }>("/apps");
      setApps(data.apps);
      if (data.apps[0]) setSelectedAppId(data.apps[0].id);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard(appId: string, from: string, to: string) {
    setError(null);
    setDashboardLoading(true);
    try {
      const query = new URLSearchParams({ appId, from, to });
      const data = await apiRequest<DashboardResponse>(`/dashboard?${query.toString()}`);
      setDashboard(data);
    } catch (err) {
      handleApiError(err);
    } finally {
      setDashboardLoading(false);
    }
  }

  function handleApiError(err: unknown) {
    if (err instanceof Error) {
      if (/Unauthorized|Invalid token|401/.test(err.message)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError(err.message);
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
    } catch (err) {
      handleApiError(err);
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
      body: JSON.stringify({ ...payload, confirmNegativeDeltas: forceConfirm }),
    });

    if (!response.ok) {
      const body = await parseErrorResponse(response);
      if (body && "code" in body && body.code === "NEGATIVE_DELTAS" && !forceConfirm) {
        const details = body.negativeDeltas.map((d) => `${d.field}: ${d.value}`).join("\n");
        const accepted = window.confirm(
          `${body.message}\n\n${details}\n\nСохранить отчёт несмотря на это?`
        );
        if (accepted) return createReport(payload, true);
        throw new Error("Отчёт не сохранён");
      }
      const message = body && "message" in body ? body.message : null;
      throw new Error(message || `Ошибка создания отчёта: ${response.status}`);
    }

    await loadDashboard(payload.appId, range.from, range.to);
  }

  async function updateReport(
    reportId: string,
    payload: ReportFormPayload,
    forceConfirm = false
  ): Promise<void> {
    const token = getToken();
    const response = await fetch(buildApiUrl(`/reports/${reportId}`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...payload, confirmNegativeDeltas: forceConfirm }),
    });

    if (!response.ok) {
      const body = await parseErrorResponse(response);
      if (body && "code" in body && body.code === "NEGATIVE_DELTAS" && !forceConfirm) {
        const details = body.negativeDeltas.map((d) => `${d.field}: ${d.value}`).join("\n");
        const accepted = window.confirm(
          `${body.message}\n\n${details}\n\nСохранить изменения несмотря на это?`
        );
        if (accepted) return updateReport(reportId, payload, true);
        throw new Error("Изменения не сохранены");
      }
      const message = body && "message" in body ? body.message : null;
      throw new Error(message || `Ошибка обновления отчёта: ${response.status}`);
    }

    await loadDashboard(payload.appId, range.from, range.to);
  }

  async function exportCsv() {
    if (!selectedAppId) return;
    const token = getToken();
    const query = new URLSearchParams({ appId: selectedAppId, from: range.from, to: range.to });
    const response = await fetch(buildApiUrl(`/reports/export?${query.toString()}`), {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) throw new Error(`Ошибка экспорта: ${response.status}`);
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

  // Build KPI card data
  const kpiCards = useMemo<KpiCardData[] | null>(() => {
    const kpis: Kpis | null = dashboard?.kpis ?? null;
    if (!kpis) return null;

    const netIsPositive = kpis.netSubscriptionGrowth >= 0;

    return [
      {
        label: "CR Install → Paywall",
        rawValue: kpis.crInstallToPaywall ?? 0,
        formatted: formatPercent(kpis.crInstallToPaywall),
        valueType: "percent",
        icon: <IconDownload />,
        iconBg: "rgba(124, 58, 237, 0.16)",
        iconColor: "#a78bfa",
        description: "Конверсия: установка → пейвол",
        delay: 0,
      },
      {
        label: "CR Paywall → Trial",
        rawValue: kpis.crPaywallToTrial ?? 0,
        formatted: formatPercent(kpis.crPaywallToTrial),
        valueType: "percent",
        icon: <IconCreditCard />,
        iconBg: "rgba(6, 182, 212, 0.14)",
        iconColor: "#22d3ee",
        description: "Конверсия: пейвол → триал",
        delay: 60,
      },
      {
        label: "CR Trial → Subscription",
        rawValue: kpis.crTrialToSubscription ?? 0,
        formatted: formatPercent(kpis.crTrialToSubscription),
        valueType: "percent",
        icon: <IconClock />,
        iconBg: "rgba(16, 185, 129, 0.14)",
        iconColor: "#34d399",
        description: "Конверсия: триал → подписка",
        delay: 120,
      },
      {
        label: "Net Subscription Growth",
        rawValue: kpis.netSubscriptionGrowth,
        formatted: formatNumber(kpis.netSubscriptionGrowth),
        valueType: "number",
        icon: netIsPositive ? <IconTrendUp /> : <IconTrendDown />,
        iconBg: netIsPositive ? "rgba(16, 185, 129, 0.14)" : "rgba(239, 68, 68, 0.13)",
        iconColor: netIsPositive ? "#34d399" : "#f87171",
        description: "Новые − отменённые подписки",
        delay: 180,
      },
      {
        label: "Активные подписки",
        rawValue: kpis.activeSubscriptions,
        formatted: formatNumber(kpis.activeSubscriptions),
        valueType: "number",
        icon: <IconUsers />,
        iconBg: "rgba(99, 102, 241, 0.14)",
        iconColor: "#818cf8",
        description: "Всего активных подписок",
        delay: 240,
      },
      {
        label: "ARPU",
        rawValue: kpis.arpu ?? 0,
        formatted: formatCurrency(kpis.arpu),
        valueType: "currency",
        icon: <IconDollar />,
        iconBg: "rgba(245, 158, 11, 0.14)",
        iconColor: "#fbbf24",
        description: "Средний доход на пользователя",
        delay: 300,
      },
      {
        label: "CAC",
        rawValue: kpis.cac ?? 0,
        formatted: formatCurrency(kpis.cac),
        valueType: "currency",
        icon: <IconTarget />,
        iconBg: "rgba(239, 68, 68, 0.12)",
        iconColor: "#f87171",
        description: "Стоимость привлечения (CAC)",
        delay: 360,
      },
    ];
  }, [dashboard?.kpis]);

  // ─── Loading screen ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primaryBright animate-spin" />
          </div>
          <p className="text-sm text-muted">Загрузка дашборда...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-6 sm:px-6 lg:px-10">
      {/* Background ambient blobs — static, no animation to avoid GPU lag */}
      <div className="pointer-events-none fixed left-[-180px] top-[-120px] h-[560px] w-[560px] rounded-full bg-primary/[0.10] blur-[100px]" />
      <div className="pointer-events-none fixed right-[-120px] top-[300px] h-[450px] w-[450px] rounded-full bg-accent/[0.05] blur-[90px]" />

      <section className="relative z-10 mx-auto max-w-7xl space-y-5">

        {/* ╔══════════════════════════╗
            ║         HEADER           ║
            ╚══════════════════════════╝ */}
        <header className="card glass grid-lines p-5 sm:p-6 section-enter">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            {/* Title */}
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 border border-primary/30">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <span className="mono text-[11px] uppercase tracking-[0.22em] text-muted">Stat Funnel</span>
                <span className="badge badge-violet">v1.0</span>
              </div>
              <h1 className="mt-2.5 text-[2rem] font-semibold leading-tight gradient-text-violet">
                Growth Dashboard
              </h1>
              <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                <p className="text-sm text-muted">
                  {range.from} — {range.to}
                </p>
                {dashboard?.table.length ? (
                  <span className="badge badge-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-successSoft animate-pulseGlow" />
                    {dashboard.table.length} дней
                  </span>
                ) : null}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowReportForm(true)}
                disabled={!selectedAppId}
                className="btn btn-primary"
              >
                <IconPlus />
                Создать отчёт
              </button>
              <button
                onClick={() => exportCsv().catch(handleApiError)}
                disabled={!selectedAppId}
                className="btn btn-ghost"
              >
                <IconExport />
                Экспорт CSV
              </button>
              <button
                onClick={() => {
                  clearToken();
                  router.push("/login");
                }}
                className="btn btn-ghost"
              >
                <IconLogout />
                Выйти
              </button>
            </div>
          </div>

          {/* ── Controls row ── */}
          <div className="mt-5 pt-5 border-t border-border/50 flex flex-col gap-3 lg:flex-row">
            {/* App selector */}
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <select
                className="input-field max-w-[260px] py-2.5"
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
              >
                {apps.length === 0 ? <option value="">Нет приложений</option> : null}
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowAppForm((p) => !p)}
                className="btn btn-ghost py-2.5 px-3 text-xs"
              >
                {showAppForm ? "Отмена" : "+ Приложение"}
              </button>
            </div>

            {/* Period pills */}
            <div className="flex flex-wrap items-center gap-2">
              {(["7", "14", "30", "custom"] as Period[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setPeriod(item)}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                    period === item
                      ? "bg-primary text-white shadow-glowSm border-transparent"
                      : "btn-ghost text-muted hover:text-text"
                  }`}
                  style={period === item ? { border: "1px solid transparent" } : {}}
                >
                  {item === "custom" ? "Свой период" : `${item} дней`}
                </button>
              ))}

              {period === "custom" && (
                <>
                  <input
                    type="date"
                    className="input-field max-w-[160px] py-2"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                  <span className="text-muted text-sm">—</span>
                  <input
                    type="date"
                    className="input-field max-w-[160px] py-2"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </>
              )}
            </div>
          </div>

          {/* New app form */}
          {showAppForm && (
            <form
              onSubmit={createApp}
              className="mt-4 flex gap-2 animate-slideDown"
            >
              <input
                value={newAppName}
                onChange={(e) => setNewAppName(e.target.value)}
                placeholder="Название приложения"
                className="input-field max-w-[240px] py-2"
              />
              <button className="btn btn-primary py-2" type="submit">
                Создать
              </button>
            </form>
          )}

          {/* Error banner */}
          {error && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-sm text-warningSoft animate-slideDown">
              <IconWarning />
              {error}
            </div>
          )}
        </header>

        {/* ╔══════════════════════════╗
            ║        KPI CARDS         ║
            ╚══════════════════════════╝ */}
        {dashboardLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : kpiCards ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map((card) => (
              <KpiCard key={card.label} {...card} />
            ))}
          </div>
        ) : null}

        {/* ╔══════════════════════════╗
            ║          FUNNEL          ║
            ╚══════════════════════════╝ */}
        <section
          className="card p-5 sm:p-6 section-enter"
          style={{ animationDelay: "200ms" }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold">Воронка конверсии</h2>
              <p className="mt-0.5 text-sm text-muted">
                От инсталла до активной подписки
              </p>
            </div>
            {funnelBlocks.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="badge badge-violet">{funnelBlocks.length} этапов</span>
                {dashboard?.latest && (
                  <span className="badge badge-success">
                    CR: {formatPercent(
                      funnelBlocks.length >= 4
                        ? (funnelBlocks[3].value / Math.max(funnelBlocks[0].value, 1)) * 100
                        : null
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {funnelBlocks.length > 0 ? (
            <FunnelChart blocks={funnelBlocks} visible={funnelVisible} />
          ) : (
            <div className="mt-8 flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-panel/70">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                  <path d="M3 3h18v4H3z" />
                  <path d="M5 7h14v4H5z" />
                  <path d="M7 11h10v4H7z" />
                  <path d="M9 15h6v4H9z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-text">Нет данных за период</p>
                <p className="mt-1 text-xs text-muted">Создайте первый ежедневный отчёт</p>
              </div>
              <button
                onClick={() => setShowReportForm(true)}
                disabled={!selectedAppId}
                className="btn btn-primary py-2.5 text-sm"
              >
                <IconPlus />
                Добавить отчёт
              </button>
            </div>
          )}
        </section>

        {/* ╔══════════════════════════╗
            ║          CHART           ║
            ╚══════════════════════════╝ */}
        <section
          className="card p-5 sm:p-6 section-enter"
          style={{ animationDelay: "320ms" }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold">Динамика инсталлов и подписок</h2>
              <p className="mt-0.5 text-sm text-muted">Ежедневные значения за период</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2 text-xs text-muted">
                <span className="h-2.5 w-2.5 rounded-full bg-primaryBright" />
                Инсталлы
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                <span className="h-2.5 w-2.5 rounded-full bg-success" />
                Подписки
              </span>
            </div>
          </div>

          <div className="mt-5 h-[300px] w-full">
            {dashboardLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="relative h-9 w-9">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primaryBright animate-spin" />
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dashboard?.trend ?? []}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="colorInstalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="colorSubs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(36,29,63,0.55)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#8b82c4", fontFamily: "var(--font-plex-mono)" }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(36,29,63,0.5)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#8b82c4", fontFamily: "var(--font-plex-mono)" }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="installs"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    fill="url(#colorInstalls)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#8b5cf6", strokeWidth: 2.5, stroke: "#130f22" }}
                    animationDuration={500}
                  />
                  <Area
                    type="monotone"
                    dataKey="subscriptions"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#colorSubs)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#10b981", strokeWidth: 2.5, stroke: "#130f22" }}
                    animationDuration={600}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ╔══════════════════════════╗
            ║          TABLE           ║
            ╚══════════════════════════╝ */}
        <section
          className="card overflow-hidden section-enter"
          style={{ animationDelay: "440ms" }}
        >
          {/* Table header */}
          <div className="flex items-center justify-between border-b border-border/55 px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold">Ежедневные отчёты</h2>
              <p className="mt-0.5 text-sm text-muted">
                {dashboard?.table.length
                  ? `${dashboard.table.length} ${dashboard.table.length === 1 ? "запись" : "записей"}`
                  : "Нет данных"}
              </p>
            </div>
            {dashboard?.table.length ? (
              <span className="badge badge-violet">{range.from} → {range.to}</span>
            ) : null}
          </div>

          {/* Table body */}
          <div className="overflow-x-auto">
            {dashboardLoading ? (
              <div className="p-5 space-y-2.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonBlock key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : (
              <table className="w-full min-w-[1080px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/55 bg-panel/40">
                    <th className="px-5 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                      Дата
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                      Инсталлы
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                      Пейвол
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                      Триал
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                      Подписки
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                      Активные
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                      Отмены
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                      Revenue
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                      Net Growth
                    </th>
                    <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-widest text-mutedDark w-10" />
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.table ?? []).map((row, rowIndex) => {
                    // Mini funnel conversion for this row
                    const crInstall2Sub =
                      row.installDay > 0 && row.subscriptionStartedDay > 0
                        ? Math.round((row.subscriptionStartedDay / row.installDay) * 100)
                        : null;

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-border/35 table-row-hover text-sm group ${
                          rowIndex % 2 === 0 ? "" : "bg-white/[0.013]"
                        }`}
                      >
                        {/* Date */}
                        <td className="px-5 py-3">
                          <p className="mono text-[12px] text-muted">{row.date}</p>
                          {crInstall2Sub !== null && (
                            <p className="mt-0.5 text-[10px] text-primary/70">
                              CR {crInstall2Sub}%
                            </p>
                          )}
                        </td>
                        {/* Installs */}
                        <td className="px-4 py-3 font-medium text-text">
                          {formatNumber(row.installDay)}
                        </td>
                        {/* Paywall */}
                        <td className="px-4 py-3 text-primarySoft/80">
                          <span className="font-medium">{formatNumber(row.paywallShownDay)}</span>
                          {row.installDay > 0 && row.paywallShownDay > 0 && (
                            <span className="ml-1.5 text-[10px] text-mutedDark">
                              {Math.round((row.paywallShownDay / row.installDay) * 100)}%
                            </span>
                          )}
                        </td>
                        {/* Trial */}
                        <td className="px-4 py-3 text-primarySoft/60">
                          <span className="font-medium">{formatNumber(row.trialStartedDay)}</span>
                          {row.paywallShownDay > 0 && row.trialStartedDay > 0 && (
                            <span className="ml-1.5 text-[10px] text-mutedDark">
                              {Math.round((row.trialStartedDay / row.paywallShownDay) * 100)}%
                            </span>
                          )}
                        </td>
                        {/* Subscriptions */}
                        <td className="px-4 py-3 font-semibold text-successSoft">
                          <span>{formatNumber(row.subscriptionStartedDay)}</span>
                          {row.trialStartedDay > 0 && row.subscriptionStartedDay > 0 && (
                            <span className="ml-1.5 text-[10px] font-normal text-mutedDark">
                              {Math.round((row.subscriptionStartedDay / row.trialStartedDay) * 100)}%
                            </span>
                          )}
                        </td>
                        {/* Active total */}
                        <td className="px-4 py-3">
                          <span className="mono font-medium text-primarySoft">
                            {formatNumber(row.subscriptionActiveTotal)}
                          </span>
                          <span className="ml-1 text-[10px] text-mutedDark">total</span>
                        </td>
                        {/* Cancels */}
                        <td className="px-4 py-3 text-warningSoft">
                          {row.subscriptionCancelledDay > 0 ? (
                            <span className="text-dangerSoft/80">−{formatNumber(row.subscriptionCancelledDay)}</span>
                          ) : (
                            <span className="text-mutedDark">—</span>
                          )}
                        </td>
                        {/* Revenue */}
                        <td className="mono px-4 py-3 text-successSoft">
                          {formatCurrency(row.revenueDay)}
                          {row.refundsDay > 0 && (
                            <p className="text-[10px] text-dangerSoft/60">
                              −{formatCurrency(row.refundsDay)} ref
                            </p>
                          )}
                        </td>
                        {/* Net Growth */}
                        <td
                          className={`mono px-4 py-3 font-semibold ${
                            row.netGrowthDay >= 0 ? "text-successSoft" : "text-dangerSoft"
                          }`}
                        >
                          {row.netGrowthDay >= 0 ? "+" : ""}
                          {formatNumber(row.netGrowthDay)}
                        </td>
                        {/* Edit */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setEditingReport(row)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 text-mutedDark opacity-0 transition-all duration-150 hover:border-primary/40 hover:bg-primary/10 hover:text-primarySoft group-hover:opacity-100"
                            title="Редактировать"
                          >
                            <IconEdit />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {(dashboard?.table ?? []).length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-5 py-14 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-12 w-12 rounded-2xl border border-border bg-panel/50 flex items-center justify-center">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-mutedDark">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <line x1="3" y1="9" x2="21" y2="9" />
                              <line x1="3" y1="15" x2="21" y2="15" />
                              <line x1="9" y1="9" x2="9" y2="21" />
                            </svg>
                          </div>
                          <p className="text-sm text-muted">Нет данных за выбранный период</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Bottom spacer */}
        <div className="h-6" />
      </section>

      {/* ── Create Report Modal ── */}
      {showReportForm && selectedAppId ? (
        <ReportFormModal
          appId={selectedAppId}
          onClose={() => setShowReportForm(false)}
          onSubmit={(payload) => createReport(payload)}
        />
      ) : null}

      {/* ── Edit Report Modal ── */}
      {editingReport ? (
        <ReportFormModal
          appId={editingReport.appId}
          initialData={editingReport}
          onClose={() => setEditingReport(null)}
          onSubmit={(payload) => updateReport(editingReport.id, payload)}
        />
      ) : null}
    </main>
  );
}
