"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Report } from "@/lib/types";
import { formatNumber } from "@/lib/format";

export interface ReportFormPayload {
  appId: string;
  date: string;
  installTotal: number;
  paywallShownTotal: number;
  trialStartedTotal: number;
  subscriptionStartedTotal: number;
  subscriptionCancelledTotal: number;
  paymentFailedTotal: number;
  subscriptionActiveTotal: number;
  adSpend: number;
  revenueDay: number;
  refundsDay: number;
}

interface Props {
  appId: string;
  onClose: () => void;
  onSubmit: (payload: ReportFormPayload) => Promise<void>;
  initialData?: Report;
  /** Latest saved report — used in CREATE mode to show previous cumulative totals as hints */
  latestReport?: Report | null;
}

function numberFrom(formData: FormData, key: string) {
  const raw = formData.get(key);
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Field definitions ────────────────────────────────────────────────────────

/**
 * CREATE mode  → user enters cumulative totals (e.g. installTotal = 10 500)
 * EDIT mode    → user sees and edits DAILY values (e.g. installDay = 50),
 *               because that's what the table shows. We convert back to totals
 *               on submit: newTotal = (currentTotal - currentDay) + newDayValue
 */

interface FieldDef {
  name: string;          // maps to FormData key AND to initialData key
  label: string;
  hint: string;
  icon: React.ReactNode;
  color: string;
}

const FUNNEL_FIELDS_CREATE: FieldDef[] = [
  {
    name: "installTotal",
    label: "Инсталлы total",
    hint: "Кумулятивное кол-во установок",
    color: "#2dd4bf",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
  {
    name: "paywallShownTotal",
    label: "Показы пейвола total",
    hint: "Кумулятивное число показов пейвола",
    color: "#38bdf8",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    name: "trialStartedTotal",
    label: "Триалы total",
    hint: "Кумулятивное кол-во запущенных триалов",
    color: "#a78bfa",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    name: "subscriptionStartedTotal",
    label: "Подписки started total",
    hint: "Кумулятивное кол-во запущенных подписок",
    color: "#4ade80",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  {
    name: "subscriptionCancelledTotal",
    label: "Подписки cancelled total",
    hint: "Кумулятивное кол-во отменённых подписок",
    color: "#f87171",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    name: "paymentFailedTotal",
    label: "Payment failed total",
    hint: "Кумулятивное кол-во неудачных платежей",
    color: "#fbbf24",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    name: "subscriptionActiveTotal",
    label: "Активные подписки total",
    hint: "Текущее число активных подписок (снэпшот)",
    color: "#818cf8",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

/**
 * In edit mode the user edits DAY values (matching what the table displays).
 * subscriptionActiveTotal stays as a "snapshot" total — it's not a flow metric.
 */
const FUNNEL_FIELDS_EDIT: FieldDef[] = [
  {
    name: "installTotal", // we reuse the same `name` key; conversion happens in submit
    label: "Инсталлы за день",
    hint: "Кол-во установок за этот день (не кумулятив)",
    color: "#2dd4bf",
    icon: FUNNEL_FIELDS_CREATE[0].icon,
  },
  {
    name: "paywallShownTotal",
    label: "Показы пейвола за день",
    hint: "Показы пейвола за этот день",
    color: "#38bdf8",
    icon: FUNNEL_FIELDS_CREATE[1].icon,
  },
  {
    name: "trialStartedTotal",
    label: "Триал за день",
    hint: "Запущено триалов за этот день",
    color: "#a78bfa",
    icon: FUNNEL_FIELDS_CREATE[2].icon,
  },
  {
    name: "subscriptionStartedTotal",
    label: "Подписки за день",
    hint: "Новых подписок за этот день",
    color: "#4ade80",
    icon: FUNNEL_FIELDS_CREATE[3].icon,
  },
  {
    name: "subscriptionCancelledTotal",
    label: "Отмены за день",
    hint: "Отменено подписок за этот день",
    color: "#f87171",
    icon: FUNNEL_FIELDS_CREATE[4].icon,
  },
  {
    name: "paymentFailedTotal",
    label: "Payment failed за день",
    hint: "Неудачных платежей за этот день",
    color: "#fbbf24",
    icon: FUNNEL_FIELDS_CREATE[5].icon,
  },
  {
    name: "subscriptionActiveTotal",
    label: "Активные подписки (всего)",
    hint: "Текущее число активных подписок (снэпшот, не дельта)",
    color: "#818cf8",
    icon: FUNNEL_FIELDS_CREATE[6].icon,
  },
];

const FINANCIAL_FIELDS: FieldDef[] = [
  {
    name: "adSpend",
    label: "Ad Spend (день)",
    hint: "Расходы на рекламу за день",
    color: "#2dd4bf",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    name: "revenueDay",
    label: "Revenue (день)",
    hint: "Доход за день",
    color: "#4ade80",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    name: "refundsDay",
    label: "Refunds (день)",
    hint: "Возвраты за день",
    color: "#fbbf24",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
      </svg>
    ),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

type TabKey = "funnel" | "financial";

// Map field name → key on the Report object for prev-day hint lookup
const FIELD_TO_TOTAL_KEY: Record<string, keyof Report> = {
  installTotal: "installTotal",
  paywallShownTotal: "paywallShownTotal",
  trialStartedTotal: "trialStartedTotal",
  subscriptionStartedTotal: "subscriptionStartedTotal",
  subscriptionCancelledTotal: "subscriptionCancelledTotal",
  paymentFailedTotal: "paymentFailedTotal",
  subscriptionActiveTotal: "subscriptionActiveTotal",
};

export default function ReportFormModal({ appId, onClose, onSubmit, initialData, latestReport }: Props) {
  const isEditMode = !!initialData;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("funnel");

  const funnelFields = isEditMode ? FUNNEL_FIELDS_EDIT : FUNNEL_FIELDS_CREATE;

  /**
   * defaults: in edit mode pre-fill with DAY values (matching what the table shows),
   * except subscriptionActiveTotal which is always a snapshot total.
   */
  const defaults = useMemo(
    () =>
      isEditMode && initialData
        ? {
            date: initialData.date,
            // Funnel: daily values so the user edits what they see in the table
            installTotal: initialData.installDay,
            paywallShownTotal: initialData.paywallShownDay,
            trialStartedTotal: initialData.trialStartedDay,
            subscriptionStartedTotal: initialData.subscriptionStartedDay,
            subscriptionCancelledTotal: initialData.subscriptionCancelledDay,
            paymentFailedTotal: initialData.paymentFailedDay,
            // Active subscriptions: snapshot total (not a flow, edit directly)
            subscriptionActiveTotal: initialData.subscriptionActiveTotal,
            // Financial: already per-day
            adSpend: initialData.adSpend,
            revenueDay: initialData.revenueDay,
            refundsDay: initialData.refundsDay,
          }
        : {
            date: todayIso(),
            installTotal: 0,
            paywallShownTotal: 0,
            trialStartedTotal: 0,
            subscriptionStartedTotal: 0,
            subscriptionCancelledTotal: 0,
            paymentFailedTotal: 0,
            subscriptionActiveTotal: 0,
            adSpend: 0,
            revenueDay: 0,
            refundsDay: 0,
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Convert a form's day-value back to the cumulative total needed by the API:
   *   newTotal = (currentTotal - currentDay) + newDayValue
   * This keeps all previous days intact and only changes the contribution of this day.
   */
  function dayToTotal(fieldTotal: number, fieldDay: number, formDayValue: number): number {
    const prevTotal = fieldTotal - fieldDay;
    return prevTotal + formDayValue;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);

    const dateValue = isEditMode
      ? defaults.date
      : ((formData.get("date") as string) || defaults.date);

    let payload: ReportFormPayload;

    if (isEditMode && initialData) {
      // Edit mode: form has DAY values → convert back to cumulative totals
      payload = {
        appId,
        date: dateValue,
        installTotal: dayToTotal(
          initialData.installTotal,
          initialData.installDay,
          numberFrom(formData, "installTotal")
        ),
        paywallShownTotal: dayToTotal(
          initialData.paywallShownTotal,
          initialData.paywallShownDay,
          numberFrom(formData, "paywallShownTotal")
        ),
        trialStartedTotal: dayToTotal(
          initialData.trialStartedTotal,
          initialData.trialStartedDay,
          numberFrom(formData, "trialStartedTotal")
        ),
        subscriptionStartedTotal: dayToTotal(
          initialData.subscriptionStartedTotal,
          initialData.subscriptionStartedDay,
          numberFrom(formData, "subscriptionStartedTotal")
        ),
        subscriptionCancelledTotal: dayToTotal(
          initialData.subscriptionCancelledTotal,
          initialData.subscriptionCancelledDay,
          numberFrom(formData, "subscriptionCancelledTotal")
        ),
        paymentFailedTotal: dayToTotal(
          initialData.paymentFailedTotal,
          initialData.paymentFailedDay,
          numberFrom(formData, "paymentFailedTotal")
        ),
        // subscriptionActiveTotal: edited directly as a snapshot
        subscriptionActiveTotal: numberFrom(formData, "subscriptionActiveTotal"),
        adSpend: numberFrom(formData, "adSpend"),
        revenueDay: numberFrom(formData, "revenueDay"),
        refundsDay: numberFrom(formData, "refundsDay"),
      };
    } else {
      // Create mode: form has cumulative totals
      payload = {
        appId,
        date: dateValue,
        installTotal: numberFrom(formData, "installTotal"),
        paywallShownTotal: numberFrom(formData, "paywallShownTotal"),
        trialStartedTotal: numberFrom(formData, "trialStartedTotal"),
        subscriptionStartedTotal: numberFrom(formData, "subscriptionStartedTotal"),
        subscriptionCancelledTotal: numberFrom(formData, "subscriptionCancelledTotal"),
        paymentFailedTotal: numberFrom(formData, "paymentFailedTotal"),
        subscriptionActiveTotal: numberFrom(formData, "subscriptionActiveTotal"),
        adSpend: numberFrom(formData, "adSpend"),
        revenueDay: numberFrom(formData, "revenueDay"),
        refundsDay: numberFrom(formData, "refundsDay"),
      };
    }

    try {
      await onSubmit(payload);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : isEditMode
          ? "Не удалось сохранить изменения"
          : "Не удалось создать отчёт"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg/75 px-4 py-8 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="card glass w-full max-w-2xl animate-scaleIn shadow-glowLg"
        style={{ transformOrigin: "top center" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-border/55 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 border border-primary/25">
              {isEditMode ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">
                {isEditMode ? "Редактировать отчёт" : "Создать ежедневный отчёт"}
              </h2>
              <p className="text-xs text-muted">
                {isEditMode
                  ? `Дневные значения за ${defaults.date}`
                  : "Введите кумулятивные данные из аналитики"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted transition-colors hover:border-borderLight hover:text-text"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Date field */}
        <div className="border-b border-border/55 px-6 py-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm font-medium text-text">Дата отчёта</p>
              <p className="text-xs text-muted mt-0.5">За какой день вносятся данные</p>
            </div>
            {isEditMode ? (
              <div className="ml-auto flex items-center gap-2 rounded-xl border border-border/60 bg-panel/60 px-4 py-2.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="mono text-sm text-text">{defaults.date}</span>
              </div>
            ) : (
              <input
                name="date"
                type="date"
                defaultValue={defaults.date}
                required
                className="input-field max-w-[200px] ml-auto py-2.5"
              />
            )}
          </div>
        </div>

        {/* Edit-mode info banner */}
        {isEditMode && (
          <div className="mx-6 mt-4 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs text-primarySoft/80 leading-relaxed">
              В режиме редактирования поля воронки показывают{" "}
              <span className="font-semibold text-primarySoft">дневные значения</span> — именно то,
              что отображается в таблице. Кумулятивные тоталы пересчитываются автоматически.
            </p>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex border-b border-border/55 px-6 pt-4 mt-2">
          {(
            [
              { key: "funnel" as TabKey, label: isEditMode ? "Воронка (за день)" : "Воронка (тоталы)", count: funnelFields.length },
              { key: "financial" as TabKey, label: "Финансы (за день)", count: FINANCIAL_FIELDS.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-4 pb-3.5 pt-1 text-sm font-medium transition-colors ${
                activeTab === tab.key ? "text-primarySoft" : "text-muted hover:text-text"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                  activeTab === tab.key ? "bg-primary/20 text-primarySoft" : "bg-border/60 text-mutedDark"
                }`}
              >
                {tab.count}
              </span>
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Fields — BOTH tab panels stay in DOM (CSS display:none) so FormData
            captures all values regardless of which tab is currently active */}
        <div className="px-6 py-5">
          <div style={{ display: activeTab === "funnel" ? undefined : "none" }}>
            {/* In CREATE mode show a banner explaining what "total" means */}
            {!isEditMode && latestReport && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.05] px-3.5 py-2.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-[11px] text-primarySoft/75 leading-relaxed">
                  Введи <span className="font-semibold text-primarySoft">кумулятивные тоталы</span> из AppStore / AppsFlyer.
                  Подсказка «Вчера» — последнее сохранённое значение.
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {funnelFields.map((field) => {
                const prevValue = !isEditMode && latestReport
                  ? (latestReport[FIELD_TO_TOTAL_KEY[field.name]] as number | undefined)
                  : undefined;
                return (
                  <label key={field.name} className="block group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: field.color }} className="opacity-75">
                          {field.icon}
                        </span>
                        <span className="text-xs font-medium text-text">{field.label}</span>
                      </div>
                      {prevValue !== undefined && prevValue > 0 && (
                        <span className="text-[10px] text-mutedDark">
                          Вчера: <span className="mono text-primarySoft/70">{formatNumber(prevValue)}</span>
                        </span>
                      )}
                    </div>
                    <input
                      name={field.name}
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={defaults[field.name as keyof typeof defaults]}
                      className="input-field py-2.5"
                      placeholder={prevValue !== undefined && prevValue > 0 ? String(prevValue) : "0"}
                    />
                    <p className="mt-1 text-[11px] text-mutedDark">{field.hint}</p>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: activeTab === "financial" ? undefined : "none" }}>
            <div className="grid gap-3 sm:grid-cols-3">
              {FINANCIAL_FIELDS.map((field) => (
                <label key={field.name} className="block">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span style={{ color: field.color }} className="opacity-75">
                      {field.icon}
                    </span>
                    <span className="text-xs font-medium text-text">{field.label}</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mutedDark pointer-events-none">
                      $
                    </span>
                    <input
                      name={field.name}
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={defaults[field.name as keyof typeof defaults]}
                      className="input-field py-2.5 pl-7"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-mutedDark">{field.hint}</p>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 flex items-start gap-2.5 rounded-xl border border-danger/22 bg-danger/[0.07] px-4 py-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-dangerSoft">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/55 px-6 py-4">
          <div className="flex gap-2">
            {(["funnel", "financial"] as TabKey[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  activeTab === tab ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-borderLight"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <button type="button" onClick={onClose} className="btn btn-ghost py-2.5 px-4 text-sm">
              Отмена
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary py-2.5 px-5 text-sm">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Сохранение...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {isEditMode ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {isEditMode ? "Сохранить изменения" : "Сохранить отчёт"}
                </span>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
