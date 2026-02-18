"use client";

import { FormEvent, useMemo, useState } from "react";

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
  confirmNegativeDeltas?: boolean;
}

interface Props {
  appId: string;
  onClose: () => void;
  onSubmit: (payload: ReportFormPayload) => Promise<void>;
}

function numberFrom(formData: FormData, key: string) {
  const raw = formData.get(key);
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportFormModal({ appId, onClose, onSubmit }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaults = useMemo(
    () => ({
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
    }),
    []
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);

    const payload: ReportFormPayload = {
      appId,
      date: String(formData.get("date") || defaults.date),
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

    try {
      await onSubmit(payload);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось создать отчёт");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-bg/80 px-4 py-10 backdrop-blur-sm">
      <form onSubmit={submit} className="card glass w-full max-w-3xl animate-fadeSlide p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Создать ежедневный отчёт</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1 text-sm"
          >
            Закрыть
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-muted">
            Дата
            <input
              name="date"
              type="date"
              defaultValue={defaults.date}
              required
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Инсталлы total
            <input
              name="installTotal"
              type="number"
              min={0}
              step={1}
              defaultValue={defaults.installTotal}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Показы пейвола total
            <input
              name="paywallShownTotal"
              type="number"
              min={0}
              step={1}
              defaultValue={defaults.paywallShownTotal}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Триалы total
            <input
              name="trialStartedTotal"
              type="number"
              min={0}
              step={1}
              defaultValue={defaults.trialStartedTotal}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Подписки started total
            <input
              name="subscriptionStartedTotal"
              type="number"
              min={0}
              step={1}
              defaultValue={defaults.subscriptionStartedTotal}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Подписки cancelled total
            <input
              name="subscriptionCancelledTotal"
              type="number"
              min={0}
              step={1}
              defaultValue={defaults.subscriptionCancelledTotal}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Payment failed total
            <input
              name="paymentFailedTotal"
              type="number"
              min={0}
              step={1}
              defaultValue={defaults.paymentFailedTotal}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Активные подписки total
            <input
              name="subscriptionActiveTotal"
              type="number"
              min={0}
              step={1}
              defaultValue={defaults.subscriptionActiveTotal}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Ad Spend (day)
            <input
              name="adSpend"
              type="number"
              min={0}
              step="0.01"
              defaultValue={defaults.adSpend}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Revenue (day)
            <input
              name="revenueDay"
              type="number"
              min={0}
              step="0.01"
              defaultValue={defaults.revenueDay}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
          <label className="text-sm text-muted">
            Refunds (day)
            <input
              name="refundsDay"
              type="number"
              min={0}
              step="0.01"
              defaultValue={defaults.refundsDay}
              className="mt-1 w-full rounded-lg border border-border bg-bg/60 px-3 py-2 text-text"
            />
          </label>
        </div>

        {error ? <p className="mt-4 text-sm text-warning">{error}</p> : null}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-primary px-5 py-2 font-semibold text-bg hover:bg-primarySoft disabled:opacity-60"
          >
            {loading ? "Сохранение..." : "Сохранить отчёт"}
          </button>
        </div>
      </form>
    </div>
  );
}
