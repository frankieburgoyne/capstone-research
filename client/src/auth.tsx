import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type User = {
  id: number;
  email: string;
  display_name: string;
  tokens: number;
};

type AuthState = {
  user: User | null;
  loading: boolean; // true until we know whether someone is logged in
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string, displayName: string) => Promise<string | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Sends JSON to the server. Returns the user on success, or an error message.
async function send(path: string, body?: object): Promise<{ user?: User; error?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? "Something went wrong." };
    return { user: data as User };
  } catch {
    return { error: "Could not reach the server." };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, ask the server who is logged in (the browser sends the cookie)
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await send("/api/auth/login", { email, password });
    if (result.user) setUser(result.user);
    return result.error ?? null;
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const result = await send("/api/auth/register", { email, password, displayName });
    if (result.user) setUser(result.user);
    return result.error ?? null;
  }, []);

  const logout = useCallback(async () => {
    await send("/api/auth/logout");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}