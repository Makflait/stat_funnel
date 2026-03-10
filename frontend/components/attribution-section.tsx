"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { AttributionRow } from "@/lib/types";

interface AttributionSectionProps {
  appId: string;
  from: string;
  to: string;
}

function fmt(value: number | null, type: "number" | "currency" | "percent"): string {
  if (value === null) return "—";
  if (type === "currency") return formatCurrency(value);
  if (type === "percent") return formatPercent(value);
  return formatNumber(value);
}

export default function AttributionSection({ appId, from, to }: AttributionSectionProps) {
  const [rows, setRows] = useState<AttributionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    apiRequest<{ rows: AttributionRow[] }>(
      `/attribution?appId=${encodeURIComponent(appId)}&from=${from}&to=${to}`,
    )
      .then((data) => setRows(data.rows))
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [appId, from, to]);

  // Group rows by mediaSource, aggregate totals per source
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        mediaSource: string;
        totals: Omit<AttributionRow, "mediaSource" | "campaign">;
        campaigns: AttributionRow[];
      }
    >();

    for (const row of rows) {
      const existing = map.get(row.mediaSource);
      if (!existing) {
        map.set(row.mediaSource, {
          mediaSource: row.mediaSource,
          totals: {
            installs: row.installs,
            trials: row.trials,
            subscriptions: row.subscriptions,
            spend: row.spend,
            crInstallToTrial: null,
            crTrialToSub: null,
            cpi: null,
            costPerTrial: null,
            costPerPaidTrial: null,
          },
          campaigns: [row],
        });
      } else {
        existing.totals.installs += row.installs;
        existing.totals.trials += row.trials;
        existing.totals.subscriptions += row.subscriptions;
        existing.totals.spend += row.spend;
        existing.campaigns.push(row);
      }
    }

    // Recompute derived metrics for source totals
    for (const entry of map.values()) {
      const t = entry.totals;
      t.crInstallToTrial = t.installs > 0 ? (t.trials / t.installs) * 100 : null;
      t.crTrialToSub = t.trials > 0 ? (t.subscriptions / t.trials) * 100 : null;
      t.cpi = t.installs > 0 && t.spend > 0 ? t.spend / t.installs : null;
      t.costPerTrial = t.trials > 0 && t.spend > 0 ? t.spend / t.trials : null;
      t.costPerPaidTrial = t.subscriptions > 0 && t.spend > 0 ? t.spend / t.subscriptions : null;
    }

    return Array.from(map.values()).sort((a, b) =>
      b.totals.installs - a.totals.installs,
    );
  }, [rows]);

  function toggleSource(source: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  }

  return (
    <section className="card overflow-hidden section-enter" style={{ animationDelay: "380ms" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/55 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold">Атрибуция по источникам</h2>
          <p className="mt-0.5 text-sm text-muted">
            {loading
              ? "Загрузка..."
              : grouped.length > 0
              ? `${grouped.length} ${grouped.length === 1 ? "источник" : "источников"}`
              : "Нет данных"}
          </p>
        </div>
        {grouped.length > 0 && (
          <span className="badge badge-violet">{from} → {to}</span>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : error ? (
        <div className="px-5 py-8 text-center text-sm text-dangerSoft">{error}</div>
      ) : grouped.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted">
          Нет данных по источникам — запустите синк
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/55 bg-panel/40">
                <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  Источник / Кампания
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  Инсталлы
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  Триалы
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  Подписки
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  CR inst→trial
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  CR trial→sub
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  Расход
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  CPI
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  Цена триала
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-mutedDark">
                  Цена платн.
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => {
                const isOpen = expanded.has(group.mediaSource);
                const hasCampaigns = group.campaigns.length > 1 || (group.campaigns.length === 1 && group.campaigns[0].campaign !== "");
                const t = group.totals;
                return (
                  <Fragment key={group.mediaSource}>
                    {/* Source row */}
                    <tr
                      className="border-b border-border/30 bg-white/[0.025] transition-colors hover:bg-white/[0.04] cursor-pointer"
                      onClick={() => hasCampaigns && toggleSource(group.mediaSource)}
                    >
                      <td className="px-5 py-3 font-medium text-text">
                        <span className="flex items-center gap-2">
                          {hasCampaigns && (
                            <span className="text-mutedDark text-xs select-none">
                              {isOpen ? "▼" : "▶"}
                            </span>
                          )}
                          {group.mediaSource}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-text">{fmt(t.installs, "number")}</td>
                      <td className="px-3 py-3 text-right font-mono text-text">{fmt(t.trials, "number")}</td>
                      <td className="px-3 py-3 text-right font-mono text-text">{fmt(t.subscriptions, "number")}</td>
                      <td className="px-3 py-3 text-right font-mono text-accentSoft">{fmt(t.crInstallToTrial, "percent")}</td>
                      <td className="px-3 py-3 text-right font-mono text-accentSoft">{fmt(t.crTrialToSub, "percent")}</td>
                      <td className="px-3 py-3 text-right font-mono text-muted">{t.spend > 0 ? fmt(t.spend, "currency") : "—"}</td>
                      <td className="px-3 py-3 text-right font-mono text-muted">{fmt(t.cpi, "currency")}</td>
                      <td className="px-3 py-3 text-right font-mono text-muted">{fmt(t.costPerTrial, "currency")}</td>
                      <td className="px-5 py-3 text-right font-mono text-muted">{fmt(t.costPerPaidTrial, "currency")}</td>
                    </tr>

                    {/* Campaign rows (expanded) */}
                    {isOpen &&
                      group.campaigns.map((c) => (
                        <tr
                          key={`camp-${group.mediaSource}-${c.campaign}`}
                          className="border-b border-border/20 bg-panel/20 transition-colors hover:bg-white/[0.02]"
                        >
                          <td className="py-2.5 pl-10 pr-3 text-muted text-[13px]">
                            {c.campaign || <span className="italic text-mutedDark">(без кампании)</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted">{fmt(c.installs, "number")}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted">{fmt(c.trials, "number")}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted">{fmt(c.subscriptions, "number")}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted">{fmt(c.crInstallToTrial, "percent")}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted">{fmt(c.crTrialToSub, "percent")}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted">{c.spend > 0 ? fmt(c.spend, "currency") : "—"}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted">{fmt(c.cpi, "currency")}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted">{fmt(c.costPerTrial, "currency")}</td>
                          <td className="px-5 py-2.5 text-right font-mono text-[13px] text-muted">{fmt(c.costPerPaidTrial, "currency")}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
