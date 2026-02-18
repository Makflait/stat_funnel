import { getToken } from "./auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export async function apiRequest<T>(path: string, init?: RequestInit & { tokenOverride?: string | null }): Promise<T> {
  const token = init?.tokenOverride ?? getToken();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorBody?.message ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function buildApiUrl(path: string) {
  return `${apiUrl}${path}`;
}
