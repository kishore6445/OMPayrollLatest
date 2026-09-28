import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ── Type ─────────────────────────────────────────────────────────────────────

export interface ClientUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
  mustChangePassword: boolean;
  permissions: string[];
  // Compatibility aliases so existing layout/nav components keep working
  name: string;       // = fullName || username
  email: string;      // = username
  roleName: string;   // = role
}

interface AuthContextType {
  user: ClientUser | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
  hasPermission: (module: string, action: string) => boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOKEN_KEY = "payroll_nexus_token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function fetchMe(token: string): Promise<ClientUser> {
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`/auth/me returned ${res.status}`);
  const data = await res.json();
  return {
    ...data,
    name: data.fullName || data.username,
    email: data.username,
    roleName: data.role,
  } as ClientUser;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getToken);
  const qc = useQueryClient();

  const { data: user, isLoading: isUserLoading } = useQuery({
    queryKey: ["auth/me", token],
    queryFn: () => fetchMe(token!),
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  });

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) setToken(e.newValue);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Central session-expiry handling. Most screens use fetch() directly; without
  // this guard an expired 8-hour token could surface raw API text such as
  // "Token expired or invalid" inside whichever form happened to make the next
  // request. Intercept authenticated API 401s, clear the stale token, and let the
  // existing ProtectedRoute redirect cleanly to /login.
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const authAwareFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const isApiRequest = url.startsWith("/api/") || url.includes("/api/");
      const isLoginRequest = url.includes("/api/auth/login");

      if (response.status === 401 && isApiRequest && !isLoginRequest && localStorage.getItem(TOKEN_KEY)) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        qc.clear();
      }

      return response;
    };

    window.fetch = authAwareFetch;
    return () => {
      if (window.fetch === authAwareFetch) window.fetch = originalFetch;
    };
  }, [qc]);

  const login = (newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    qc.invalidateQueries({ queryKey: ["auth/me"] });
  };

  const logout = () => {
    // Best-effort server-side logout
    if (token) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    qc.clear();
  };

  const isLoading = token ? isUserLoading : false;

  const hasPermission = (module: string, action: string): boolean => {
    if (!user) return false;
    if (user.role === "Admin") return true;
    const perms = user.permissions ?? [];
    return (
      perms.includes(`${module}:${action}`) ||
      perms.includes(`${module}:all`) ||
      perms.includes("admin:all")
    );
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
