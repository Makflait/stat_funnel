"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("changeme123");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiRequest<{ token: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(response.token);
      router.push("/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка запроса");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-primary/[0.18] blur-[100px] animate-floatPulse" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-[380px] w-[380px] rounded-full bg-accent/[0.09] blur-[90px] animate-floatPulseAlt" />
      <div className="pointer-events-none absolute left-1/3 top-2/3 h-[300px] w-[300px] rounded-full bg-primary/[0.1] blur-[80px] animate-floatPulseSlow" />

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,130,196,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,130,196,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Card */}
      <section className="card glass relative z-10 w-full max-w-[400px] p-8 shadow-glowLg animate-scaleIn">
        {/* Top glow accent */}
        <div className="absolute inset-x-0 top-0 h-px rounded-t-[20px] bg-gradient-to-r from-transparent via-primarySoft/50 to-transparent" />

        {/* Brand */}
        <div className="flex items-center gap-3 mb-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 border border-primary/28">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.22em] text-mutedDark">Analytics</p>
            <p className="text-sm font-semibold gradient-text-violet">Stat Funnel</p>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-7">
          <h1 className="text-[1.75rem] font-semibold leading-tight text-text">
            {mode === "login" ? "Добро пожаловать" : "Создать аккаунт"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {mode === "login"
              ? "Войдите, чтобы открыть дашборд"
              : "Заполните форму для регистрации"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Email</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mutedDark pointer-events-none">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </span>
              <input
                type="email"
                className="input-field py-3 pl-9"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Пароль</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mutedDark pointer-events-none">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type="password"
                className="input-field py-3 pl-9"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-danger/22 bg-danger/[0.07] px-3.5 py-2.5 text-sm text-dangerSoft animate-slideDown">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-3 text-sm mt-1"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Загрузка...
              </span>
            ) : mode === "login" ? (
              <span className="flex items-center justify-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Войти в дашборд
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                Создать аккаунт
              </span>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="divider my-6" />

        {/* Mode toggle */}
        <p className="text-center text-sm text-muted">
          {mode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?"}
          {" "}
          <button
            type="button"
            className="font-medium text-primarySoft underline underline-offset-4 hover:text-primaryGlow transition-colors"
            onClick={() => {
              setMode((prev) => (prev === "login" ? "register" : "login"));
              setError(null);
            }}
          >
            {mode === "login" ? "Зарегистрироваться" : "Войти"}
          </button>
        </p>
      </section>
    </main>
  );
}
