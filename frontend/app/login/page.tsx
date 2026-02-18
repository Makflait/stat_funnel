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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10">
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-primary/30 blur-3xl animate-floatPulse" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-primarySoft/20 blur-3xl animate-floatPulse" />
      <section className="card glass z-10 w-full max-w-md p-8 shadow-glow animate-fadeSlide">
        <p className="mono text-xs uppercase tracking-[0.2em] text-muted">Stat Funnel</p>
        <h1 className="mt-2 text-3xl font-semibold">Вход в дашборд</h1>
        <p className="mt-2 text-sm text-muted">Войди, чтобы продолжить</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm text-muted">Email</span>
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-border bg-bg/60 px-4 py-3 outline-none ring-primary focus:ring"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm text-muted">Пароль</span>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-border bg-bg/60 px-4 py-3 outline-none ring-primary focus:ring"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="text-sm text-warning">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-bg transition hover:bg-primarySoft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Загрузка..." : mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 text-sm text-muted underline underline-offset-4"
          onClick={() => setMode((prev) => (prev === "login" ? "register" : "login"))}
        >
          {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </section>
    </main>
  );
}
