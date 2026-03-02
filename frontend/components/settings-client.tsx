"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { clearToken, getToken } from "../lib/auth";
import type { AppItem, Integration, IntegrationType, SyncResult } from "../lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function parseSpendCsv(raw: string): Array<{ date: string; spend: number }> | null {
  const lines = raw.trim().split(/\r?\n/).filter((l) => l.trim());
  const rows: Array<{ date: string; spend: number }> = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 2) return null;
    const [date, spendRaw] = parts;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const spend = parseFloat(spendRaw);
    if (!isFinite(spend) || spend < 0) return null;
    rows.push({ date, spend });
  }
  return rows.length > 0 ? rows : null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatusBadgeProps {
  integration: Integration | undefined;
}

function StatusBadge({ integration }: StatusBadgeProps) {
  if (!integration) {
    return (
      <span className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] text-mutedDark">
        не настроено
      </span>
    );
  }
  if (!integration.isEnabled) {
    return (
      <span className="rounded-full border border-border/60 px-2 py-0.5 font-mono text-[10px] text-mutedDark">
        отключено
      </span>
    );
  }
  if (integration.lastSyncError) {
    return (
      <span className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono text-[10px] text-dangerSoft">
        ошибка
      </span>
    );
  }
  if (integration.lastSyncAt) {
    const d = new Date(integration.lastSyncAt).toLocaleDateString("ru-RU");
    return (
      <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] text-successSoft">
        синк {d}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accentSoft">
      настроено
    </span>
  );
}

// ─── Integration form ─────────────────────────────────────────────────────────

interface IntegrationFormProps {
  appId: string;
  type: IntegrationType;
  existing: Integration | undefined;
  onSaved: () => void;
}

const FIELD_DEFS: Record<IntegrationType, Array<{ key: string; label: string; placeholder: string }>> = {
  APPHUD: [
    { key: "apiKey", label: "API Key", placeholder: "apphud_sk_..." },
    { key: "projectId", label: "Project ID", placeholder: "proj_..." },
  ],
  APPSFLYER: [
    { key: "apiToken", label: "API Token", placeholder: "af_..." },
    { key: "appId", label: "App ID (AppsFlyer)", placeholder: "id123456789" },
  ],
};

function IntegrationForm({ appId, type, existing, onSaved }: IntegrationFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fields = FIELD_DEFS[type];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const credentials: Record<string, string> = {};
    for (const f of fields) {
      credentials[f.key] = String(fd.get(f.key) ?? "").trim();
    }
    const timezone = String(fd.get("timezone") ?? "").trim() || undefined;

    try {
      await apiRequest("/integrations", {
        method: "POST",
        body: JSON.stringify({
          appId,
          type,
          credentials,
          settings: timezone ? { timezone } : {},
        }),
      });
      setSuccess(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{f.label}</span>
            <input
              name={f.key}
              type="password"
              required
              placeholder={existing ? "••••••••" : f.placeholder}
              className="input-field py-2 text-sm font-mono"
            />
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Timezone (опционально)</span>
          <input
            name="timezone"
            type="text"
            placeholder="UTC"
            className="input-field py-2 text-sm"
          />
        </label>
      </div>

      {error && (
        <p className="text-xs text-dangerSoft">{error}</p>
      )}
      {success && (
        <p className="text-xs text-successSoft">Сохранено</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn btn-primary py-2 px-4 text-sm"
      >
        {loading ? "Сохранение..." : existing ? "Обновить ключи" : "Сохранить"}
      </button>
    </form>
  );
}

// ─── Sync panel ───────────────────────────────────────────────────────────────

interface SyncPanelProps {
  appId: string;
}

function SyncPanel({ appId }: SyncPanelProps) {
  const [from, setFrom] = useState(yesterdayIso);
  const [to, setTo] = useState(yesterdayIso);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSync() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await apiRequest<{ result: SyncResult }>("/sync", {
        method: "POST",
        body: JSON.stringify({ appId, from, to }),
      });
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка синка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">От</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-field py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">До</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            max={todayIso()}
            className="input-field py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={runSync}
          disabled={loading}
          className="btn btn-primary py-2 px-4 text-sm"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Синхронизация...
            </span>
          ) : (
            "Синхронизировать"
          )}
        </button>
      </div>

      {error && <p className="text-xs text-dangerSoft">{error}</p>}

      {result && (
        <div className="rounded-xl border border-border/50 bg-surface/40 p-3 text-sm">
          <p className="text-text">
            Обработано дней: <span className="font-mono text-primarySoft">{result.daysProcessed}</span>
            {" · "}
            Обновлено: <span className="font-mono text-accentSoft">{result.updatedCount}</span>
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.errors.map((e, i) => (
                <li key={i} className="text-xs text-dangerSoft">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ad Spend import ──────────────────────────────────────────────────────────

interface AdSpendImportProps {
  appId: string;
}

function AdSpendImport({ appId }: AdSpendImportProps) {
  const [source, setSource] = useState("google");
  const [csv, setCsv] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function importSpend() {
    setError(null);
    setResult(null);
    const rows = parseSpendCsv(csv);
    if (!rows) {
      setError("Неверный формат CSV. Ожидается: date,spend (строка на день, дата YYYY-MM-DD)");
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<{ message: string; upsertedCount: number }>("/adspend/import", {
        method: "POST",
        body: JSON.stringify({ appId, source, rows }),
      });
      setResult(data.message);
      setCsv("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка импорта");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Источник</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="input-field py-2 text-sm"
          >
            <option value="google">Google Ads</option>
            <option value="asa">Apple Search Ads</option>
            <option value="meta">Meta</option>
            <option value="tiktok">TikTok</option>
            <option value="other">Другой</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">
          CSV данные (одна строка = один день)
        </span>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={"2024-01-01,150.00\n2024-01-02,200.50\n2024-01-03,175.25"}
          className="input-field py-2 font-mono text-xs w-full resize-y"
        />
      </label>

      {error && <p className="text-xs text-dangerSoft">{error}</p>}
      {result && <p className="text-xs text-successSoft">{result}</p>}

      <button
        type="button"
        onClick={importSpend}
        disabled={loading || !csv.trim()}
        className="btn btn-primary py-2 px-4 text-sm"
      >
        {loading ? "Импорт..." : "Импортировать"}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsClient() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [activeSection, setActiveSection] = useState<"apphud" | "appsflyer" | "sync" | "adspend">("apphud");

  const loadApps = useCallback(async () => {
    try {
      const data = await apiRequest<{ apps: AppItem[] }>("/apps");
      setApps(data.apps);
      if (data.apps.length > 0 && !selectedAppId) {
        setSelectedAppId(data.apps[0].id);
      }
    } catch {
      // Auth error — redirect to login
      if (typeof window !== "undefined") window.location.href = "/login";
    } finally {
      setLoadingApps(false);
    }
  }, [selectedAppId]);

  const loadIntegrations = useCallback(async () => {
    if (!selectedAppId) return;
    try {
      const data = await apiRequest<{ integrations: Integration[] }>(
        `/integrations?appId=${selectedAppId}`,
      );
      setIntegrations(data.integrations);
    } catch {
      setIntegrations([]);
    }
  }, [selectedAppId]);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    loadApps();
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const apphudInt = integrations.find((i) => i.type === "APPHUD");
  const appsflyerInt = integrations.find((i) => i.type === "APPSFLYER");

  const SECTIONS = [
    { key: "apphud" as const, label: "Apphud", badge: <StatusBadge integration={apphudInt} /> },
    { key: "appsflyer" as const, label: "AppsFlyer", badge: <StatusBadge integration={appsflyerInt} /> },
    { key: "sync" as const, label: "Синхронизация", badge: null },
    { key: "adspend" as const, label: "Ad Spend CSV", badge: null },
  ];

  if (loadingApps) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 text-muted hover:text-text transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span className="text-sm">Дашборд</span>
            </a>
            <span className="text-border">/</span>
            <h1 className="text-base font-semibold text-text">Настройки интеграций</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              clearToken();
              window.location.href = "/login";
            }}
            className="btn btn-ghost py-2 px-3 text-sm text-muted"
          >
            Выйти
          </button>
        </div>

        {/* App selector */}
        <div className="card glass mb-6 px-5 py-4">
          <label className="flex items-center gap-4">
            <span className="text-sm font-medium text-text whitespace-nowrap">Приложение</span>
            {apps.length === 0 ? (
              <p className="text-sm text-muted">Нет приложений. <a href="/" className="text-primarySoft underline">Создайте на дашборде.</a></p>
            ) : (
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="input-field py-2 text-sm flex-1"
              >
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        {selectedAppId && (
          <div className="card glass overflow-hidden">
            {/* Section tabs */}
            <div className="flex border-b border-border/55 px-5 pt-4 overflow-x-auto">
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActiveSection(s.key)}
                  className={`relative flex items-center gap-2 whitespace-nowrap px-4 pb-3.5 pt-1 text-sm font-medium transition-colors ${
                    activeSection === s.key ? "text-primarySoft" : "text-muted hover:text-text"
                  }`}
                >
                  {s.label}
                  {s.badge}
                  {activeSection === s.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-primary" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* Apphud */}
              {activeSection === "apphud" && (
                <div>
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold text-text">Apphud</h2>
                    <p className="mt-1 text-xs text-muted">
                      Подтягивает данные о подписках: триалы, отмены, доход, рефанды, активные подписки.
                      Apphud возвращает дневные агрегаты.
                    </p>
                    {apphudInt?.lastSyncError && (
                      <p className="mt-2 text-xs text-dangerSoft">
                        Последняя ошибка: {apphudInt.lastSyncError}
                      </p>
                    )}
                  </div>
                  <IntegrationForm
                    appId={selectedAppId}
                    type="APPHUD"
                    existing={apphudInt}
                    onSaved={loadIntegrations}
                  />
                  {apphudInt && (
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/integrations/${apphudInt.id}/toggle`, { method: "PATCH" });
                          await loadIntegrations();
                        }}
                        className="btn btn-ghost py-1.5 px-3 text-xs text-muted"
                      >
                        {apphudInt.isEnabled ? "Отключить" : "Включить"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("Удалить интеграцию Apphud?")) return;
                          await apiRequest(`/integrations/${apphudInt.id}`, { method: "DELETE" });
                          await loadIntegrations();
                        }}
                        className="btn btn-ghost py-1.5 px-3 text-xs text-dangerSoft"
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* AppsFlyer */}
              {activeSection === "appsflyer" && (
                <div>
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold text-text">AppsFlyer</h2>
                    <p className="mt-1 text-xs text-muted">
                      Подтягивает данные об инсталлах и показах paywall.
                      <span className="ml-1 rounded bg-border/50 px-1.5 py-0.5 font-mono text-[10px]">STUB</span>
                      {" "}— сейчас возвращает нули. Реальный API подключается в{" "}
                      <code className="text-[11px]">backend/src/integrations/appsflyer.ts</code>.
                    </p>
                  </div>
                  <IntegrationForm
                    appId={selectedAppId}
                    type="APPSFLYER"
                    existing={appsflyerInt}
                    onSaved={loadIntegrations}
                  />
                  {appsflyerInt && (
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/integrations/${appsflyerInt.id}/toggle`, { method: "PATCH" });
                          await loadIntegrations();
                        }}
                        className="btn btn-ghost py-1.5 px-3 text-xs text-muted"
                      >
                        {appsflyerInt.isEnabled ? "Отключить" : "Включить"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("Удалить интеграцию AppsFlyer?")) return;
                          await apiRequest(`/integrations/${appsflyerInt.id}`, { method: "DELETE" });
                          await loadIntegrations();
                        }}
                        className="btn btn-ghost py-1.5 px-3 text-xs text-dangerSoft"
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Manual sync */}
              {activeSection === "sync" && (
                <div>
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold text-text">Ручная синхронизация</h2>
                    <p className="mt-1 text-xs text-muted">
                      Запускает синк за выбранный диапазон дат. Автоматический синк выполняется ежедневно в 06:00 UTC за вчера.
                    </p>
                  </div>
                  <SyncPanel appId={selectedAppId} />
                </div>
              )}

              {/* Ad Spend CSV */}
              {activeSection === "adspend" && (
                <div>
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold text-text">Импорт рекламных расходов</h2>
                    <p className="mt-1 text-xs text-muted">
                      Загрузите CSV с дневными расходами по одному источнику. Формат:{" "}
                      <code className="font-mono text-[11px]">YYYY-MM-DD,сумма</code>
                    </p>
                  </div>
                  <AdSpendImport appId={selectedAppId} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
