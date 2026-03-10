"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubType = "week" | "3months" | "year";
type ViewMode = "table" | "chart";
type PeriodMode = "3" | "6" | "12" | "quarterly";

export interface PredictLiveData {
  /** Actual CR: paywall → trial (%), from cumulative report totals */
  crPaywallToTrial: number | null;
  /** Actual CR: trial → subscription (%), from cumulative report totals */
  crTrialToSub: number | null;
  /** Average daily installs from the current selected period */
  avgDailyInstalls: number;
  /** Average subscription price derived from revenue / new subs (Apphud geo mode) */
  subscriptionPrice?: number | null;
}

interface PredictInputs {
  installsPerMonth: number;
  paywallCR: number;
  trialToSubCR: number;
  subscriptionType: SubType;
  subscriptionPrice: number;
  creditsUserPercent: number;
  avgCreditSpend: number;
  adBudget: number;
}

interface MonthRow {
  month: number;
  label: string;
  newPayers: number;
  cumulativePayers: number;
  subscriptionRevenue: number;
  creditsRevenue: number;
  totalRevenue: number;
  adSpend: number;
  monthlyBalance: number;
  cumulativeBalance: number;
  isBreakEven: boolean;
}

interface QuarterRow {
  quarter: string;
  months: string;
  newPayers: number;
  totalRevenue: number;
  adSpend: number;
  quarterlyBalance: number;
  cumulativeBalance: number;
}

interface Scenario {
  id: string;
  name: string;
  inputs: PredictInputs;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

const SUB_LABELS: Record<SubType, string> = {
  week: "Неделя",
  "3months": "3 мес",
  year: "Год",
};

const PERIOD_LABELS: Record<PeriodMode, string> = {
  "3": "3 мес",
  "6": "6 мес",
  "12": "12 мес",
  quarterly: "Кварталы",
};

const DEFAULT_INPUTS: PredictInputs = {
  installsPerMonth: 10000,
  paywallCR: 60,
  trialToSubCR: 40,
  subscriptionType: "year",
  subscriptionPrice: 49.99,
  creditsUserPercent: 10,
  avgCreditSpend: 5,
  adBudget: 5000,
};

const STORAGE_KEY = "predict_scenarios_v2";

// ─── Pure math ────────────────────────────────────────────────────────────────

function monthlyRevenuePerUser(type: SubType, price: number): number {
  if (type === "week") return price * 4.333;
  if (type === "3months") return price / 3;
  return price / 12;
}

function computeAllRows(inputs: PredictInputs): MonthRow[] {
  const newPayersPerMonth =
    inputs.installsPerMonth * (inputs.paywallCR / 100) * (inputs.trialToSubCR / 100);
  const subPerUser = monthlyRevenuePerUser(inputs.subscriptionType, inputs.subscriptionPrice);
  let cumPayers = 0;
  let cumBalance = 0;
  let breakFound = false;

  return MONTH_LABELS.map((label, i) => {
    cumPayers += newPayersPerMonth;
    const subRev = cumPayers * subPerUser;
    const credRev = cumPayers * (inputs.creditsUserPercent / 100) * inputs.avgCreditSpend;
    const totalRev = subRev + credRev;
    const prevCumBalance = cumBalance;
    const monthlyBal = totalRev - inputs.adBudget;
    cumBalance += monthlyBal;
    const isBreakEven = !breakFound && prevCumBalance < 0 && cumBalance >= 0;
    if (isBreakEven) breakFound = true;
    return {
      month: i + 1, label, newPayers: Math.round(newPayersPerMonth),
      cumulativePayers: Math.round(cumPayers),
      subscriptionRevenue: subRev, creditsRevenue: credRev, totalRevenue: totalRev,
      adSpend: inputs.adBudget, monthlyBalance: monthlyBal, cumulativeBalance: cumBalance, isBreakEven,
    };
  });
}

function rowsToQuarters(rows: MonthRow[]): QuarterRow[] {
  const quarterDefs = [
    { quarter: "Q1", months: "Янв–Мар", indices: [0, 1, 2] },
    { quarter: "Q2", months: "Апр–Июн", indices: [3, 4, 5] },
    { quarter: "Q3", months: "Июл–Сен", indices: [6, 7, 8] },
    { quarter: "Q4", months: "Окт–Дек", indices: [9, 10, 11] },
  ];
  let runningCumBalance = 0;
  return quarterDefs.map(({ quarter, months, indices }) => {
    const qRows = indices.map((i) => rows[i]).filter(Boolean);
    const newPayers = qRows.reduce((s, r) => s + r.newPayers, 0);
    const totalRevenue = qRows.reduce((s, r) => s + r.totalRevenue, 0);
    const adSpend = qRows.reduce((s, r) => s + r.adSpend, 0);
    const quarterlyBalance = totalRevenue - adSpend;
    runningCumBalance += quarterlyBalance;
    return { quarter, months, newPayers, totalRevenue, adSpend, quarterlyBalance, cumulativeBalance: runningCumBalance };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NumInput({
  label, value, onChange, min = 0, max, step = 1, prefix, suffix, liveValue,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; prefix?: string; suffix?: string;
  liveValue?: number | null;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-[11px] font-medium uppercase tracking-wider text-muted">{label}</label>
        {liveValue != null && (
          <span className="flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] text-teal-400">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
            {suffix ? `${liveValue.toFixed(1)}${suffix}` : String(Math.round(liveValue))}
          </span>
        )}
      </div>
      <div className="relative flex items-center">
        {prefix && <span className="pointer-events-none absolute left-3 z-10 text-sm text-muted">{prefix}</span>}
        <input
          type="number" value={value} min={min} max={max} step={step}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(Math.min(max ?? Infinity, Math.max(min, v))); }}
          className={`input-field py-2 text-sm ${prefix ? "pl-7" : ""} ${suffix ? "pr-9" : ""}`}
        />
        {suffix && <span className="pointer-events-none absolute right-3 z-10 text-sm text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function BreakEvenSummary({ rows }: { rows: MonthRow[] }) {
  const last = rows[rows.length - 1];
  const breakRow = rows.find((r) => r.isBreakEven);
  const alwaysPositive = rows[0]?.cumulativeBalance >= 0;
  if (alwaysPositive) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/[0.07] p-3.5">
        <p className="text-xs font-semibold text-green-400">В плюсе с первого месяца</p>
        <p className="mt-0.5 text-[11px] text-muted">Итого за {rows.length} мес.: <span className="font-medium text-green-400">{formatCurrency(last?.cumulativeBalance)}</span></p>
      </div>
    );
  }
  if (breakRow) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/[0.07] p-3.5">
        <p className="text-xs font-semibold text-green-400">Выход в плюс: {breakRow.label} (мес. {breakRow.month})</p>
        <p className="mt-0.5 text-[11px] text-muted">Итого за {rows.length} мес.: <span className="font-medium text-green-400">{formatCurrency(last?.cumulativeBalance)}</span></p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3.5">
      <p className="text-xs font-semibold text-red-400">Не выходит в плюс за {rows.length} мес.</p>
      <p className="mt-0.5 text-[11px] text-muted">Итого: <span className="font-medium text-red-400">{formatCurrency(last?.cumulativeBalance)}</span></p>
    </div>
  );
}

function ResultTable({ rows, scenarioLabel }: { rows: MonthRow[]; scenarioLabel?: string }) {
  return (
    <div>
      {scenarioLabel && <div className="mb-2"><span className="badge badge-violet">{scenarioLabel}</span></div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-panel/30">
              {["Месяц","Новых платящих","Всего платящих","Доход · подписки","Доход · кредиты","Доход итого","Расход (реклама)","Баланс / мес","Баланс накоп."].map((h) => (
                <th key={h} className="px-3 py-2.5 font-medium uppercase tracking-wider text-mutedDark">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className={`border-b border-border/30 text-xs transition-colors hover:bg-white/[0.025] ${r.isBreakEven ? "border-amber-500/30 bg-amber-500/[0.07]" : r.cumulativeBalance >= 0 && r.month > 1 ? "bg-green-500/[0.04]" : ""}`}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="mono font-medium text-text">{r.label}</span>
                    {r.isBreakEven && <span className="rounded-full border border-amber-500/35 bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400">BREAK-EVEN</span>}
                  </div>
                </td>
                <td className="mono px-3 py-2.5 text-muted">{formatNumber(r.newPayers)}</td>
                <td className="mono px-3 py-2.5 text-text">{formatNumber(r.cumulativePayers)}</td>
                <td className="mono px-3 py-2.5 text-teal-400">{formatCurrency(r.subscriptionRevenue)}</td>
                <td className="mono px-3 py-2.5 text-blue-400">{formatCurrency(r.creditsRevenue)}</td>
                <td className="mono px-3 py-2.5 font-medium text-text">{formatCurrency(r.totalRevenue)}</td>
                <td className="mono px-3 py-2.5 text-red-400">{formatCurrency(r.adSpend)}</td>
                <td className={`mono px-3 py-2.5 font-medium ${r.monthlyBalance >= 0 ? "text-green-400" : "text-red-400"}`}>{r.monthlyBalance >= 0 ? "+" : ""}{formatCurrency(r.monthlyBalance)}</td>
                <td className={`mono px-3 py-2.5 font-semibold ${r.cumulativeBalance >= 0 ? "text-green-400" : "text-red-400"}`}>{r.cumulativeBalance >= 0 ? "+" : ""}{formatCurrency(r.cumulativeBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuarterTable({ quarters, scenarioLabel }: { quarters: QuarterRow[]; scenarioLabel?: string }) {
  return (
    <div>
      {scenarioLabel && <div className="mb-2"><span className="badge badge-violet">{scenarioLabel}</span></div>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-panel/30">
              {["Квартал","Месяцы","Новых платящих","Доход","Расход","Баланс / кв.","Баланс накоп."].map((h) => (
                <th key={h} className="px-4 py-3 font-medium uppercase tracking-wider text-mutedDark text-[11px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quarters.map((q) => (
              <tr key={q.quarter} className={`border-b border-border/40 transition-colors hover:bg-white/[0.025] ${q.cumulativeBalance >= 0 ? "bg-green-500/[0.03]" : ""}`}>
                <td className="px-4 py-3 font-semibold text-text">{q.quarter}</td>
                <td className="px-4 py-3 text-muted text-xs">{q.months}</td>
                <td className="mono px-4 py-3 text-muted">{formatNumber(q.newPayers)}</td>
                <td className="mono px-4 py-3 text-teal-400">{formatCurrency(q.totalRevenue)}</td>
                <td className="mono px-4 py-3 text-red-400">{formatCurrency(q.adSpend)}</td>
                <td className={`mono px-4 py-3 font-medium ${q.quarterlyBalance >= 0 ? "text-green-400" : "text-red-400"}`}>{q.quarterlyBalance >= 0 ? "+" : ""}{formatCurrency(q.quarterlyBalance)}</td>
                <td className={`mono px-4 py-3 font-semibold ${q.cumulativeBalance >= 0 ? "text-green-400" : "text-red-400"}`}>{q.cumulativeBalance >= 0 ? "+" : ""}{formatCurrency(q.cumulativeBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface DotProps { cx?: number; cy?: number; payload?: MonthRow; }

function ResultChart({ rows, compareRows }: { rows: MonthRow[]; compareRows?: MonthRow[] }) {
  const breakRow = rows.find((r) => r.isBreakEven);
  const chartData = rows.map((r, i) => ({
    label: r.label, revenue: r.totalRevenue, expenses: r.adSpend, balance: r.cumulativeBalance,
    ...(compareRows ? { revenue2: compareRows[i]?.totalRevenue, expenses2: compareRows[i]?.adSpend, balance2: compareRows[i]?.cumulativeBalance } : {}),
  }));
  function breakEvenDot(props: DotProps) {
    const { cx, cy, payload } = props;
    if (!payload?.isBreakEven || cx == null || cy == null) return <g key="empty" />;
    return <g key="be"><circle cx={cx} cy={cy} r={8} fill="#f59e0b" stroke="#050d0d" strokeWidth={2} /><circle cx={cx} cy={cy} r={3} fill="#050d0d" /></g>;
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(36,29,63,0.55)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8b82c4" }} tickLine={false} axisLine={{ stroke: "rgba(36,29,63,0.5)" }} />
          <YAxis tick={{ fontSize: 11, fill: "#8b82c4" }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip contentStyle={{ background: "#0e0a1f", border: "1px solid #2a2158", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [formatCurrency(v)]} />
          {breakRow && <ReferenceLine x={breakRow.label} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "Break-even", fill: "#f59e0b", fontSize: 10 }} />}
          <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#10b981", stroke: "#050d0d", strokeWidth: 2 }} />
          <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4, fill: "#ef4444" }} />
          <Line type="monotone" dataKey="balance" stroke="#14b8a6" strokeWidth={2.5} dot={(props: unknown) => breakEvenDot(props as DotProps)} activeDot={{ r: 5, fill: "#14b8a6", stroke: "#050d0d", strokeWidth: 2 }} />
          {compareRows && (
            <>
              <Line type="monotone" dataKey="revenue2" stroke="#10b981" strokeWidth={1.5} strokeDasharray="3 3" dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
              <Line type="monotone" dataKey="expenses2" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" dot={false} activeDot={{ r: 4, fill: "#ef4444" }} />
              <Line type="monotone" dataKey="balance2" stroke="#14b8a6" strokeWidth={1.5} strokeDasharray="3 3" dot={false} activeDot={{ r: 4, fill: "#14b8a6" }} />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-5">
        {[{ color: "#10b981", label: compareRows ? "Доход (А)" : "Доход", dash: false }, { color: "#ef4444", label: compareRows ? "Расход (А)" : "Расход", dash: true }, { color: "#14b8a6", label: compareRows ? "Баланс (А)" : "Баланс накоп.", dash: false }].map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
            <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dash ? "6 3" : undefined} /></svg>
            {l.label}
          </span>
        ))}
        {compareRows && [{ color: "#10b981", label: "Доход (Б)" }, { color: "#ef4444", label: "Расход (Б)" }, { color: "#14b8a6", label: "Баланс (Б)" }].map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
            <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke={l.color} strokeWidth="1.5" strokeDasharray="3 3" /></svg>
            {l.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-muted"><span className="inline-block h-3 w-3 rounded-full bg-amber-400" />Break-even</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type GeoLiveData = PredictLiveData & { geo: string };

interface PredictBlockProps {
  liveDataByGeo?: GeoLiveData[] | null;
}

/** Compute aggregate liveData from all GEOs (weighted by installs, or simple avg if no installs) */
function aggregateLiveData(byGeo: GeoLiveData[]): PredictLiveData {
  const totalInstalls = byGeo.reduce((s, g) => s + g.avgDailyInstalls, 0);

  // When no install data (e.g. Apphud-only mode), use simple average of available CRs
  if (totalInstalls === 0) {
    const withPaywall = byGeo.filter((g) => g.crPaywallToTrial != null);
    const withTrial = byGeo.filter((g) => g.crTrialToSub != null);
    const withPrice = byGeo.filter((g) => (g.subscriptionPrice ?? 0) > 0);
    return {
      avgDailyInstalls: 0,
      crPaywallToTrial: withPaywall.length > 0
        ? withPaywall.reduce((s, g) => s + g.crPaywallToTrial!, 0) / withPaywall.length
        : null,
      crTrialToSub: withTrial.length > 0
        ? withTrial.reduce((s, g) => s + g.crTrialToSub!, 0) / withTrial.length
        : null,
      subscriptionPrice: withPrice.length > 0 ? withPrice[0].subscriptionPrice : null,
    };
  }

  let crPaywall = 0, crTrial = 0, hasPaywall = false, hasTrial = false;
  for (const g of byGeo) {
    const w = g.avgDailyInstalls / totalInstalls;
    if (g.crPaywallToTrial != null) { crPaywall += g.crPaywallToTrial * w; hasPaywall = true; }
    if (g.crTrialToSub != null) { crTrial += g.crTrialToSub * w; hasTrial = true; }
  }
  return {
    avgDailyInstalls: totalInstalls,
    crPaywallToTrial: hasPaywall ? crPaywall : null,
    crTrialToSub: hasTrial ? crTrial : null,
  };
}

export default function PredictBlock({ liveDataByGeo }: PredictBlockProps) {
  const [selectedGeo, setSelectedGeo] = useState<string>("ALL");

  // The effective liveData for the currently selected GEO (or aggregate)
  const liveData = useMemo<PredictLiveData | null>(() => {
    if (!liveDataByGeo?.length) return null;
    if (selectedGeo === "ALL") {
      // Prefer pre-computed "ALL" entry (computed from overall kpis/funnel in dashboard)
      const allEntry = liveDataByGeo.find((g) => g.geo === "ALL");
      if (allEntry) return allEntry;
      return aggregateLiveData(liveDataByGeo.filter((g) => g.geo !== "ALL"));
    }
    return liveDataByGeo.find((g) => g.geo === selectedGeo) ?? null;
  }, [liveDataByGeo, selectedGeo]);

  const [inputs, setInputs] = useState<PredictInputs>(DEFAULT_INPUTS);

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("12");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  // track if user has manually overridden live values per geo
  const [liveAppliedKey, setLiveAppliedKey] = useState<string | null>(null);

  // Pre-fill from real data when GEO changes or data first arrives
  useEffect(() => {
    if (!liveData) return;
    const key = `${selectedGeo}:${liveData.avgDailyInstalls}:${liveData.crPaywallToTrial}:${liveData.crTrialToSub}:${liveData.subscriptionPrice ?? ""}`;
    if (liveAppliedKey === key) return;
    setInputs((prev) => {
      const next = { ...prev };
      if (liveData.avgDailyInstalls > 0) next.installsPerMonth = Math.round(liveData.avgDailyInstalls * 30);
      if (liveData.crPaywallToTrial != null) next.paywallCR = Math.round(liveData.crPaywallToTrial * 10) / 10;
      if (liveData.crTrialToSub != null) next.trialToSubCR = Math.round(liveData.crTrialToSub * 10) / 10;
      // Auto-fill subscription price and detect billing period from price magnitude
      if (liveData.subscriptionPrice != null && liveData.subscriptionPrice > 0) {
        next.subscriptionPrice = Math.round(liveData.subscriptionPrice * 100) / 100;
        // Heuristic: weekly ≤ $8, 3-month ≤ $25, annual > $25
        if (liveData.subscriptionPrice <= 8) next.subscriptionType = "week";
        else if (liveData.subscriptionPrice <= 25) next.subscriptionType = "3months";
        else next.subscriptionType = "year";
      }
      return next;
    });
    setLiveAppliedKey(key);
  }, [liveData, liveAppliedKey, selectedGeo]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setScenarios(JSON.parse(raw) as Scenario[]);
    } catch { /* ok */ }
  }, []);

  const persist = useCallback((list: Scenario[]) => {
    setScenarios(list);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ok */ }
  }, []);

  const monthCount = periodMode === "quarterly" ? 12 : Number(periodMode);
  const allRows = useMemo(() => computeAllRows(inputs), [inputs]);
  const rows = useMemo(() => allRows.slice(0, monthCount), [allRows, monthCount]);
  const quarters = useMemo(() => rowsToQuarters(allRows), [allRows]);

  const compareScenario = useMemo(() => scenarios.find((s) => s.id === compareId) ?? null, [scenarios, compareId]);
  const compareAllRows = useMemo(() => compareScenario ? computeAllRows(compareScenario.inputs) : null, [compareScenario]);
  const compareRows = useMemo(() => compareAllRows ? compareAllRows.slice(0, monthCount) : null, [compareAllRows, monthCount]);

  function setField<K extends keyof PredictInputs>(key: K, val: PredictInputs[K]) {
    setInputs((p) => ({ ...p, [key]: val }));
  }

  function handleSave() {
    if (!scenarioName.trim()) return;
    const s: Scenario = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: scenarioName.trim(), inputs: { ...inputs } };
    persist([s, ...scenarios].slice(0, 10));
    setScenarioName("");
    setShowSaveForm(false);
  }

  function handleDelete(id: string) {
    persist(scenarios.filter((s) => s.id !== id));
    if (compareId === id) setCompareId(null);
  }

  const hasLiveData = liveData != null && (liveData.crTrialToSub != null || liveData.crPaywallToTrial != null || (liveData.subscriptionPrice ?? 0) > 0);
  // Show geo selector only when there are named country entries (exclude synthetic "ALL")
  const hasGeoSelector = (liveDataByGeo?.filter((g) => g.geo !== "ALL").length ?? 0) >= 1;

  return (
    <section className="card p-5 sm:p-6 section-enter" style={{ animationDelay: "480ms" }}>
      {/* ── Header ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                <polyline points="22 7 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 7 22 7 22 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Предикт</h2>
            {hasLiveData ? (
              <span className="badge badge-success flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                Из отчётов {selectedGeo !== "ALL" ? `· ${selectedGeo}` : "· All"}
              </span>
            ) : (
              <span className="badge badge-warning">Ручной ввод</span>
            )}

            {/* GEO selector */}
            {hasGeoSelector && liveDataByGeo && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedGeo("ALL")}
                  className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-medium mono transition-colors ${
                    selectedGeo === "ALL"
                      ? "border-primary/60 bg-primary/15 text-primarySoft"
                      : "border-border/50 text-mutedDark hover:border-borderLight hover:text-text"
                  }`}
                >
                  All
                </button>
                {liveDataByGeo.filter((g) => g.geo !== "ALL").map((g) => (
                  <button
                    key={g.geo}
                    onClick={() => setSelectedGeo(g.geo)}
                    className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-medium mono transition-colors ${
                      selectedGeo === g.geo
                        ? "border-primary/60 bg-primary/15 text-primarySoft"
                        : "border-border/50 text-mutedDark hover:border-borderLight hover:text-text"
                    }`}
                  >
                    {g.geo}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {hasLiveData
              ? "Конверсии и инсталлы заполнены из ваших отчётов — скорректируй цену и бюджет"
              : "Прогноз финансов — добавь отчёты для автозаполнения конверсий"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border/60 p-0.5">
            {(["3", "6", "12", "quarterly"] as PeriodMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setPeriodMode(m)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  periodMode === m ? "bg-amber-700/60 text-white" : "text-muted hover:text-text"
                }`}
              >
                {PERIOD_LABELS[m]}
              </button>
            ))}
          </div>
          {/* View-mode toggle */}
          {periodMode !== "quarterly" && (
            <div className="flex items-center gap-0.5 rounded-xl border border-border/60 p-0.5">
              {(["table", "chart"] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
                    viewMode === m ? "bg-teal-700/70 text-white" : "text-muted hover:text-text"
                  }`}
                >
                  {m === "table" ? "Таблица" : "График"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Layout ── */}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* ═══ Inputs panel ═══ */}
        <aside className="space-y-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Параметры</p>

          {hasLiveData && (
            <div className="flex items-start gap-2 rounded-xl border border-teal-500/20 bg-teal-500/[0.06] px-3.5 py-3">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" className="mt-0.5 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-[11px] leading-relaxed text-teal-300/80">
                Зелёная метка = реальное значение из ваших отчётов. Можно скорректировать вручную.
              </p>
            </div>
          )}

          <NumInput
            label="Установок в месяц"
            value={inputs.installsPerMonth}
            onChange={(v) => setField("installsPerMonth", v)}
            liveValue={hasLiveData && liveData.avgDailyInstalls > 0 ? Math.round(liveData.avgDailyInstalls * 30) : null}
          />
          <NumInput
            label="Paywall → Триал, %"
            value={inputs.paywallCR}
            onChange={(v) => setField("paywallCR", Math.min(100, v))}
            max={100} suffix="%" liveValue={hasLiveData ? liveData.crPaywallToTrial : null}
          />
          <NumInput
            label="Триал → Подписка, %"
            value={inputs.trialToSubCR}
            onChange={(v) => setField("trialToSubCR", Math.min(100, v))}
            max={100} suffix="%" liveValue={hasLiveData ? liveData.crTrialToSub : null}
          />

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Тип подписки</p>
            <div className="flex gap-1.5">
              {(["week", "3months", "year"] as SubType[]).map((t) => (
                <button
                  key={t} onClick={() => setField("subscriptionType", t)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-all duration-200 ${
                    inputs.subscriptionType === t
                      ? "border-teal-500/50 bg-teal-700/60 text-white"
                      : "border-border/60 text-muted hover:border-teal-700/50 hover:text-text"
                  }`}
                >
                  {SUB_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <NumInput label="Цена подписки" value={inputs.subscriptionPrice} onChange={(v) => setField("subscriptionPrice", v)} step={0.01} prefix="$" />
          <NumInput label="% юзеров покупают кредиты" value={inputs.creditsUserPercent} onChange={(v) => setField("creditsUserPercent", Math.min(100, v))} max={100} suffix="%" />
          <NumInput label="Средний чек кредитов" value={inputs.avgCreditSpend} onChange={(v) => setField("avgCreditSpend", v)} step={0.01} prefix="$" />
          <NumInput label="Бюджет на рекламу / мес" value={inputs.adBudget} onChange={(v) => setField("adBudget", v)} prefix="$" />

          <BreakEvenSummary rows={rows} />

          <div className="space-y-2 border-t border-border/40 pt-3">
            <button onClick={() => setShowSaveForm((p) => !p)} className="btn btn-ghost w-full py-2 text-xs">
              {showSaveForm ? "Отмена" : "Сохранить сценарий"}
            </button>
            {showSaveForm && (
              <div className="flex gap-2">
                <input className="input-field flex-1 py-2 text-sm" placeholder="Название сценария" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} autoFocus />
                <button onClick={handleSave} disabled={!scenarioName.trim()} className="btn btn-primary px-3 py-2 text-xs">ОК</button>
              </div>
            )}
            {scenarios.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider text-muted">Сценарии ({scenarios.length})</p>
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
                  {scenarios.map((s) => (
                    <div key={s.id} className={`flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs transition-all ${compareId === s.id ? "border-amber-500/40 bg-amber-500/10" : "border-border/50 bg-panel/30"}`}>
                      <span className="flex-1 truncate text-text">{s.name}</span>
                      <button title="Загрузить" onClick={() => setInputs({ ...s.inputs })} className="px-1 text-muted transition-colors hover:text-teal-400">↑</button>
                      <button title={compareId === s.id ? "Убрать сравнение" : "Сравнить"} onClick={() => setCompareId((p) => (p === s.id ? null : s.id))} className={`px-1 transition-colors ${compareId === s.id ? "text-amber-400" : "text-muted hover:text-amber-400"}`}>⇄</button>
                      <button title="Удалить" onClick={() => handleDelete(s.id)} className="px-1 text-muted transition-colors hover:text-red-400">×</button>
                    </div>
                  ))}
                </div>
                {compareId && <p className="text-[11px] text-amber-400/80">⇄ Сравнение с «{compareScenario?.name}»</p>}
              </div>
            )}
          </div>
        </aside>

        {/* ═══ Results panel ═══ */}
        <div>
          {periodMode === "quarterly" ? (
            compareAllRows ? (
              <div className="space-y-6">
                <QuarterTable quarters={rowsToQuarters(allRows)} scenarioLabel="Сценарий А — текущий" />
                <div className="h-px bg-border/40" />
                <QuarterTable quarters={rowsToQuarters(compareAllRows)} scenarioLabel={`Сценарий Б — ${compareScenario?.name ?? ""}`} />
              </div>
            ) : (
              <QuarterTable quarters={quarters} />
            )
          ) : viewMode === "table" ? (
            compareRows ? (
              <div className="space-y-6">
                <ResultTable rows={rows} scenarioLabel="Сценарий А — текущий" />
                <div className="h-px bg-border/40" />
                <ResultTable rows={compareRows} scenarioLabel={`Сценарий Б — ${compareScenario?.name ?? ""}`} />
              </div>
            ) : (
              <ResultTable rows={rows} />
            )
          ) : (
            <ResultChart rows={rows} compareRows={compareRows ?? undefined} />
          )}
        </div>
      </div>
    </section>
  );
}
