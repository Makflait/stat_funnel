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

interface PredictInputs {
  installsPerMonth: number;
  /** % of installs who start trial (paywall conversion) */
  paywallCR: number;
  /** % of trial starters who convert to paid subscription */
  trialToSubCR: number;
  subscriptionType: SubType;
  subscriptionPrice: number;
  /** % of paying users who also buy credits each month */
  creditsUserPercent: number;
  /** Average credit purchase value */
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
  /** True on the first month cumulative balance crosses from negative to non-negative */
  isBreakEven: boolean;
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

const STORAGE_KEY = "predict_scenarios_v1";

// ─── Pure math ────────────────────────────────────────────────────────────────

/**
 * Monthly revenue contribution per active subscriber depending on subscription billing cycle.
 * Week:   user pays every ~4.33 weeks  → 4.33 payments/month
 * 3-month: user pays once per quarter  → price / 3 per month
 * Year:   user pays once per year      → price / 12 per month
 */
function monthlyRevenuePerUser(type: SubType, price: number): number {
  if (type === "week") return price * 4.333;
  if (type === "3months") return price / 3;
  return price / 12;
}

function computeRows(inputs: PredictInputs): MonthRow[] {
  // New paying users per month = installs * paywall_CR * trial_CR
  const newPayersPerMonth =
    inputs.installsPerMonth * (inputs.paywallCR / 100) * (inputs.trialToSubCR / 100);

  const subPerUser = monthlyRevenuePerUser(inputs.subscriptionType, inputs.subscriptionPrice);

  let cumPayers = 0;
  let cumBalance = 0;
  let breakFound = false;

  return MONTH_LABELS.map((label, i) => {
    cumPayers += newPayersPerMonth;

    // Revenue from subscriptions = all active (cumulative) users × monthly rate
    const subRev = cumPayers * subPerUser;
    // Revenue from credits = subset of active users × average credit spend
    const credRev = cumPayers * (inputs.creditsUserPercent / 100) * inputs.avgCreditSpend;
    const totalRev = subRev + credRev;

    const prevCumBalance = cumBalance;
    const monthlyBal = totalRev - inputs.adBudget;
    cumBalance += monthlyBal;

    // Break-even = first month where cumulative balance turns non-negative from negative
    const isBreakEven = !breakFound && prevCumBalance < 0 && cumBalance >= 0;
    if (isBreakEven) breakFound = true;

    return {
      month: i + 1,
      label,
      newPayers: Math.round(newPayersPerMonth),
      cumulativePayers: Math.round(cumPayers),
      subscriptionRevenue: subRev,
      creditsRevenue: credRev,
      totalRevenue: totalRev,
      adSpend: inputs.adBudget,
      monthlyBalance: monthlyBal,
      cumulativeBalance: cumBalance,
      isBreakEven,
    };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NumInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-3 z-10 text-sm text-muted">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              onChange(Math.min(max ?? Infinity, Math.max(min, v)));
            }
          }}
          className={`input-field py-2 text-sm ${prefix ? "pl-7" : ""} ${suffix ? "pr-9" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 z-10 text-sm text-muted">
            {suffix}
          </span>
        )}
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
        <p className="mt-0.5 text-[11px] text-muted">
          Итого за 12 мес:{" "}
          <span className="font-medium text-green-400">
            {formatCurrency(last?.cumulativeBalance)}
          </span>
        </p>
      </div>
    );
  }

  if (breakRow) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/[0.07] p-3.5">
        <p className="text-xs font-semibold text-green-400">
          Выход в плюс: {breakRow.label} (мес. {breakRow.month})
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          Итого за 12 мес:{" "}
          <span className="font-medium text-green-400">
            {formatCurrency(last?.cumulativeBalance)}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3.5">
      <p className="text-xs font-semibold text-red-400">Не выходит в плюс за 12 месяцев</p>
      <p className="mt-0.5 text-[11px] text-muted">
        Итого:{" "}
        <span className="font-medium text-red-400">{formatCurrency(last?.cumulativeBalance)}</span>
      </p>
    </div>
  );
}

function ResultTable({ rows, scenarioLabel }: { rows: MonthRow[]; scenarioLabel?: string }) {
  return (
    <div>
      {scenarioLabel && (
        <div className="mb-2">
          <span className="badge badge-violet">{scenarioLabel}</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-panel/30">
              {[
                "Месяц",
                "Новых платящих",
                "Всего платящих",
                "Доход · подписки",
                "Доход · кредиты",
                "Доход итого",
                "Расход (реклама)",
                "Баланс / мес",
                "Баланс накоп.",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 font-medium uppercase tracking-wider text-mutedDark"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.month}
                className={`border-b border-border/30 text-xs transition-colors hover:bg-white/[0.025] ${
                  r.isBreakEven
                    ? "border-amber-500/30 bg-amber-500/[0.07]"
                    : r.cumulativeBalance >= 0 && r.month > 1
                    ? "bg-green-500/[0.04]"
                    : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="mono font-medium text-text">{r.label}</span>
                    {r.isBreakEven && (
                      <span className="rounded-full border border-amber-500/35 bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400">
                        BREAK-EVEN
                      </span>
                    )}
                  </div>
                </td>
                <td className="mono px-3 py-2.5 text-muted">{formatNumber(r.newPayers)}</td>
                <td className="mono px-3 py-2.5 text-text">{formatNumber(r.cumulativePayers)}</td>
                <td className="mono px-3 py-2.5 text-teal-400">
                  {formatCurrency(r.subscriptionRevenue)}
                </td>
                <td className="mono px-3 py-2.5 text-cyan-400">
                  {formatCurrency(r.creditsRevenue)}
                </td>
                <td className="mono px-3 py-2.5 font-semibold text-green-400">
                  {formatCurrency(r.totalRevenue)}
                </td>
                <td className="mono px-3 py-2.5 text-red-400/80">
                  {formatCurrency(r.adSpend)}
                </td>
                <td
                  className={`mono px-3 py-2.5 font-semibold ${
                    r.monthlyBalance >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {r.monthlyBalance >= 0 ? "+" : ""}
                  {formatCurrency(r.monthlyBalance)}
                </td>
                <td
                  className={`mono px-3 py-2.5 font-semibold ${
                    r.cumulativeBalance >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {r.cumulativeBalance >= 0 ? "+" : ""}
                  {formatCurrency(r.cumulativeBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Chart tooltip
interface PredictTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}

const CHART_LINE_LABELS: Record<string, string> = {
  revenue: "Доход (А)",
  expenses: "Расход (А)",
  balance: "Баланс накоп. (А)",
  revenue2: "Доход (Б)",
  expenses2: "Расход (Б)",
  balance2: "Баланс накоп. (Б)",
};

function PredictTooltip({ active, payload, label }: PredictTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card glass min-w-[190px] p-3 shadow-glow">
      <p className="mono mb-2 text-[11px] text-muted">{label}</p>
      {payload.map((e) => (
        <div key={e.name} className="mt-1 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
            {CHART_LINE_LABELS[e.name] ?? e.name}
          </span>
          <span className="mono text-xs font-semibold text-text">{formatCurrency(e.value)}</span>
        </div>
      ))}
    </div>
  );
}

type ChartDataPoint = {
  label: string;
  isBreakEven: boolean;
  revenue: number;
  expenses: number;
  balance: number;
  revenue2?: number;
  expenses2?: number;
  balance2?: number;
};

function ResultChart({
  rows,
  compareRows,
}: {
  rows: MonthRow[];
  compareRows?: MonthRow[];
}) {
  const breakRow = rows.find((r) => r.isBreakEven);

  const data: ChartDataPoint[] = rows.map((r, i) => ({
    label: r.label,
    isBreakEven: r.isBreakEven,
    revenue: r.totalRevenue,
    expenses: r.adSpend,
    balance: r.cumulativeBalance,
    ...(compareRows
      ? {
          revenue2: compareRows[i].totalRevenue,
          expenses2: compareRows[i].adSpend,
          balance2: compareRows[i].cumulativeBalance,
        }
      : {}),
  }));

  type DotProps = {
    cx: number;
    cy: number;
    index: number;
    payload: ChartDataPoint;
  };

  const breakEvenDot = (props: DotProps) => {
    const { cx, cy, index, payload } = props;
    if (payload.isBreakEven) {
      return (
        <circle
          key={`be-${index}`}
          cx={cx}
          cy={cy}
          r={8}
          fill="#fbbf24"
          stroke="#050d0d"
          strokeWidth={2.5}
        />
      );
    }
    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={0} fill="none" />;
  };

  return (
    <div>
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(15,46,46,0.8)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#5f9ea0", fontFamily: "var(--font-plex-mono)" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(15,46,46,0.6)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#5f9ea0", fontFamily: "var(--font-plex-mono)" }}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(v: number) => {
                const abs = Math.abs(v);
                const sign = v < 0 ? "-" : "";
                if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
                if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
                return `${sign}$${abs}`;
              }}
            />
            <Tooltip content={<PredictTooltip />} />

            {/* Zero reference */}
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.13)" strokeWidth={1} />

            {/* Break-even vertical marker */}
            {breakRow && (
              <ReferenceLine
                x={breakRow.label}
                stroke="#fbbf24"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                label={{
                  value: "break-even ★",
                  position: "insideTopRight",
                  fill: "#fbbf24",
                  fontSize: 10,
                  fontFamily: "var(--font-plex-mono)",
                }}
              />
            )}

            {/* ── Scenario A lines ── */}
            {/* Revenue — green solid */}
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: "#10b981", stroke: "#050d0d", strokeWidth: 2 }}
            />
            {/* Expenses — red dashed */}
            <Line
              type="monotone"
              dataKey="expenses"
              stroke="#ef4444"
              strokeWidth={2.5}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 5, fill: "#ef4444", stroke: "#050d0d", strokeWidth: 2 }}
            />
            {/* Cumulative balance — teal, with break-even dot */}
            <Line
              type="monotone"
              dataKey="balance"
              stroke="#14b8a6"
              strokeWidth={2.5}
              dot={(props: unknown) => breakEvenDot(props as DotProps)}
              activeDot={{ r: 5, fill: "#14b8a6", stroke: "#050d0d", strokeWidth: 2 }}
            />

            {/* ── Scenario B lines (dashed, thinner) ── */}
            {compareRows && (
              <>
                <Line
                  type="monotone"
                  dataKey="revenue2"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  activeDot={{ r: 4, fill: "#10b981" }}
                />
                <Line
                  type="monotone"
                  dataKey="expenses2"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  activeDot={{ r: 4, fill: "#ef4444" }}
                />
                <Line
                  type="monotone"
                  dataKey="balance2"
                  stroke="#14b8a6"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  activeDot={{ r: 4, fill: "#14b8a6" }}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-5">
        {[
          { color: "#10b981", label: compareRows ? "Доход (А)" : "Доход", dash: false },
          { color: "#ef4444", label: compareRows ? "Расход (А)" : "Расход", dash: true },
          { color: "#14b8a6", label: compareRows ? "Баланс (А)" : "Баланс накоп.", dash: false },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
            <svg width="22" height="4">
              <line
                x1="0"
                y1="2"
                x2="22"
                y2="2"
                stroke={l.color}
                strokeWidth="2.5"
                strokeDasharray={l.dash ? "6 3" : undefined}
              />
            </svg>
            {l.label}
          </span>
        ))}
        {compareRows &&
          [
            { color: "#10b981", label: "Доход (Б)" },
            { color: "#ef4444", label: "Расход (Б)" },
            { color: "#14b8a6", label: "Баланс (Б)" },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
              <svg width="22" height="4">
                <line
                  x1="0"
                  y1="2"
                  x2="22"
                  y2="2"
                  stroke={l.color}
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              </svg>
              {l.label}
            </span>
          ))}
        {/* Break-even indicator */}
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-400" />
          Break-even
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PredictBlock() {
  const [inputs, setInputs] = useState<PredictInputs>(DEFAULT_INPUTS);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);

  // Persist scenarios in localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setScenarios(JSON.parse(raw) as Scenario[]);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const persist = useCallback((list: Scenario[]) => {
    setScenarios(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // localStorage unavailable
    }
  }, []);

  const rows = useMemo(() => computeRows(inputs), [inputs]);

  const compareScenario = useMemo(
    () => scenarios.find((s) => s.id === compareId) ?? null,
    [scenarios, compareId]
  );

  const compareRows = useMemo(
    () => (compareScenario ? computeRows(compareScenario.inputs) : null),
    [compareScenario]
  );

  function setField<K extends keyof PredictInputs>(key: K, val: PredictInputs[K]) {
    setInputs((p) => ({ ...p, [key]: val }));
  }

  function handleSave() {
    if (!scenarioName.trim()) return;
    const s: Scenario = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: scenarioName.trim(),
      inputs: { ...inputs },
    };
    persist([s, ...scenarios].slice(0, 10));
    setScenarioName("");
    setShowSaveForm(false);
  }

  function handleDelete(id: string) {
    persist(scenarios.filter((s) => s.id !== id));
    if (compareId === id) setCompareId(null);
  }

  return (
    <section
      className="card p-5 sm:p-6 section-enter"
      style={{ animationDelay: "480ms" }}
    >
      {/* ── Header ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="2"
              >
                <polyline points="22 7 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 7 22 7 22 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Предикт</h2>
            <span className="badge badge-warning">12 месяцев</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Прогноз финансов — чистая математика, без AI
          </p>
        </div>

        {/* View-mode toggle */}
        <div className="flex items-center gap-0.5 rounded-xl border border-border/60 p-0.5">
          {(["table", "chart"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
                viewMode === m
                  ? "bg-teal-700/70 text-white"
                  : "text-muted hover:text-text"
              }`}
            >
              {m === "table" ? "Таблица" : "График"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Layout: inputs ← | → results ── */}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">

        {/* ═══ Inputs panel ═══ */}
        <aside className="space-y-3.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Параметры
          </p>

          <NumInput
            label="Установок в месяц"
            value={inputs.installsPerMonth}
            onChange={(v) => setField("installsPerMonth", v)}
          />
          <NumInput
            label="Конверсия пейволла → триал"
            value={inputs.paywallCR}
            onChange={(v) => setField("paywallCR", Math.min(100, v))}
            max={100}
            suffix="%"
          />
          <NumInput
            label="Конверсия триала → подписка"
            value={inputs.trialToSubCR}
            onChange={(v) => setField("trialToSubCR", Math.min(100, v))}
            max={100}
            suffix="%"
          />

          {/* Subscription type */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
              Тип подписки
            </p>
            <div className="flex gap-1.5">
              {(["week", "3months", "year"] as SubType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setField("subscriptionType", t)}
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

          <NumInput
            label="Цена подписки"
            value={inputs.subscriptionPrice}
            onChange={(v) => setField("subscriptionPrice", v)}
            step={0.01}
            prefix="$"
          />
          <NumInput
            label="% юзеров покупают кредиты"
            value={inputs.creditsUserPercent}
            onChange={(v) => setField("creditsUserPercent", Math.min(100, v))}
            max={100}
            suffix="%"
          />
          <NumInput
            label="Средний чек кредитов"
            value={inputs.avgCreditSpend}
            onChange={(v) => setField("avgCreditSpend", v)}
            step={0.01}
            prefix="$"
          />
          <NumInput
            label="Бюджет на рекламу / мес"
            value={inputs.adBudget}
            onChange={(v) => setField("adBudget", v)}
            prefix="$"
          />

          {/* Break-even card */}
          <BreakEvenSummary rows={rows} />

          {/* ── Scenarios ── */}
          <div className="space-y-2 border-t border-border/40 pt-3">
            <button
              onClick={() => setShowSaveForm((p) => !p)}
              className="btn btn-ghost w-full py-2 text-xs"
            >
              {showSaveForm ? "Отмена" : "Сохранить сценарий"}
            </button>

            {showSaveForm && (
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 py-2 text-sm"
                  placeholder="Название сценария"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={!scenarioName.trim()}
                  className="btn btn-primary px-3 py-2 text-xs"
                >
                  ОК
                </button>
              </div>
            )}

            {scenarios.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider text-muted">
                  Сценарии ({scenarios.length})
                </p>
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
                  {scenarios.map((s) => (
                    <div
                      key={s.id}
                      className={`flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs transition-all ${
                        compareId === s.id
                          ? "border-amber-500/40 bg-amber-500/10"
                          : "border-border/50 bg-panel/30"
                      }`}
                    >
                      <span className="flex-1 truncate text-text">{s.name}</span>

                      {/* Load */}
                      <button
                        title="Загрузить в редактор"
                        onClick={() => setInputs({ ...s.inputs })}
                        className="px-1 text-muted transition-colors hover:text-teal-400"
                      >
                        ↑
                      </button>

                      {/* Compare toggle */}
                      <button
                        title={compareId === s.id ? "Убрать сравнение" : "Сравнить с текущим"}
                        onClick={() => setCompareId((p) => (p === s.id ? null : s.id))}
                        className={`px-1 transition-colors ${
                          compareId === s.id
                            ? "text-amber-400"
                            : "text-muted hover:text-amber-400"
                        }`}
                      >
                        ⇄
                      </button>

                      {/* Delete */}
                      <button
                        title="Удалить"
                        onClick={() => handleDelete(s.id)}
                        className="px-1 text-muted transition-colors hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {compareId && (
                  <p className="text-[11px] text-amber-400/80">
                    ⇄ Сравнение с «{compareScenario?.name}»
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ═══ Results panel ═══ */}
        <div>
          {viewMode === "table" ? (
            compareRows ? (
              <div className="space-y-6">
                <ResultTable rows={rows} scenarioLabel="Сценарий А — текущий" />
                <div className="divider" />
                <ResultTable
                  rows={compareRows}
                  scenarioLabel={`Сценарий Б — ${compareScenario?.name ?? ""}`}
                />
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
