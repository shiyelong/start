"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  username: string;
  email: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  role: string;
  verify_count: number;
  reputation: number;
  like_count: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE
    ? process.env.NEXT_PUBLIC_API_BASE
    : "";

const TOKEN_KEY = "starhub_token";
const USER_KEY = "starhub_user";

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  localStorage.removeItem(USER_KEY);
}

// ---------------------------------------------------------------------------
// fetchWithAuth — auto-attaches Bearer token, handles 401
// ---------------------------------------------------------------------------

export async function fetchWithAuth(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    clearUser();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  return res;
}

// ---------------------------------------------------------------------------
// useAuth hook
// ---------------------------------------------------------------------------

export function useAuth() {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setTokenState(getToken());
    setUserState(getUser());
  }, []);

  const isLoggedIn = !!token;

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { error?: string }).error || "登录失败",
      );
    }

    const data = (await res.json()) as { token: string; user: User };
    setToken(data.token);
    setUser(data.user);
    setTokenState(data.token);
    setUserState(data.user);
    return data;
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "注册失败",
        );
      }

      const data = (await res.json()) as { token: string; user: User };
      setToken(data.token);
      setUser(data.user);
      setTokenState(data.token);
      setUserState(data.user);
      return data;
    },
    [],
  );

  const logout = useCallback(() => {
    clearToken();
    clearUser();
    setTokenState(null);
    setUserState(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await fetchWithAuth("/api/auth/me");
    if (!res.ok) return;
    const data = (await res.json()) as { user: User };
    setUser(data.user);
    setUserState(data.user);
  }, []);

  return { user, token, isLoggedIn, login, register, logout, refreshUser };
}

// ---------------------------------------------------------------------------
// useRequireAuth — redirects to /login if not authenticated
// ---------------------------------------------------------------------------

/**
 * Hook that redirects unauthenticated users to /login with a return URL.
 * Use this when you want an immediate redirect instead of showing a prompt.
 *
 * Returns `{ isReady, user }` — `isReady` is false until auth state is
 * determined (prevents flash of content before redirect).
 */
export function useRequireAuth() {
  const { user, isLoggedIn } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait one tick for localStorage hydration
    const token = getToken();
    if (!token) {
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "/";
      window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
    } else {
      setIsReady(true);
    }
  }, []);

  return { isReady, user, isLoggedIn };
}
