import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_API_BASE, ENV_API_BASE } from "@/lib/config";

type User = {
  _id?: string;
  id?: string;
  username: string;
  email: string;
  role?: "user" | "admin";
};

type Ctx = {
  apiBase: string;
  setApiBase: (v: string) => Promise<void>;
  token: string;
  user: User | null;
  isAuthed: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

function sanitizeApiBase(raw: string) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  s = s.replace(/\/+$/, "");
  return s;
}

function isBadBase(base: string) {
  return /\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:|\/|$)/i.test(base);
}

function safeJsonParse<T = any>(s: string | null): T | null {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function normEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}
function normUsername(username: string) {
  return String(username || "").trim();
}
function normPassword(password: string) {
  return String(password || "");
}

async function readApiError(resp: Response) {
  const ct = resp.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j: any = await resp.json();
      return j?.error || j?.message || JSON.stringify(j);
    }
    const t = await resp.text();
    try {
      const j = JSON.parse(t);
      return j?.error || j?.message || t;
    } catch {
      return t;
    }
  } catch {
    return `HTTP ${resp.status}`;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [apiBase, _setApiBase] = useState(
    sanitizeApiBase(ENV_API_BASE || DEFAULT_API_BASE) || DEFAULT_API_BASE
  );
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      const envProvided = !!ENV_API_BASE;
      const envBase = sanitizeApiBase(ENV_API_BASE || DEFAULT_API_BASE);

      const storedRaw = await AsyncStorage.getItem("apiBase");
      const storedBase = sanitizeApiBase(storedRaw || "");

      let finalBase = envBase;

      if (!envProvided && storedBase && !isBadBase(storedBase)) {
        finalBase = storedBase;
      }

      _setApiBase(finalBase);
      await AsyncStorage.setItem("apiBase", finalBase);

      const t = await AsyncStorage.getItem("token");
      const u = await AsyncStorage.getItem("user");

      if (t) setToken(t);

      const parsed = safeJsonParse<User>(u);
      if (parsed) setUser(parsed);
    })();
  }, []);

  const value = useMemo<Ctx>(() => {
    return {
      apiBase,

      async setApiBase(v) {
        const clean = sanitizeApiBase(v);
        if (!clean) throw new Error("API Base vacía");
        _setApiBase(clean);
        await AsyncStorage.setItem("apiBase", clean);
      },

      token,
      user,
      isAuthed: !!token,
      isAdmin: user?.role === "admin",

      async login(email, password) {
        const r = await fetch(`${apiBase}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: normEmail(email),
            password: normPassword(password),
          }),
        });

        if (!r.ok) throw new Error(await readApiError(r));

        const data = await r.json();
        setToken(data.token || "");
        setUser(data.user || null);

        await AsyncStorage.setItem("token", data.token || "");
        await AsyncStorage.setItem("user", JSON.stringify(data.user || null));
      },

      async register(username, email, password) {
        const r = await fetch(`${apiBase}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: normUsername(username),
            email: normEmail(email),
            password: normPassword(password),
          }),
        });

        if (!r.ok) throw new Error(await readApiError(r));

        const data = await r.json();
        setToken(data.token || "");
        setUser(data.user || null);

        await AsyncStorage.setItem("token", data.token || "");
        await AsyncStorage.setItem("user", JSON.stringify(data.user || null));
      },

      async logout() {
        setToken("");
        setUser(null);
        await AsyncStorage.removeItem("token");
        await AsyncStorage.removeItem("user");
      },
    };
  }, [apiBase, token, user]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}