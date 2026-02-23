import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_API_BASE, ENV_API_BASE } from "@/lib/config";

type User = { _id?: string; id?: string; username: string; email: string };

type Ctx = {
  apiBase: string;
  setApiBase: (v: string) => Promise<void>;
  token: string;
  user: User | null;
  isAuthed: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

function sanitizeApiBase(raw: string) {
  let s = String(raw || "").trim();
  if (!s) return "";
  // si el usuario pone "192.168.1.26:3000" sin http, lo arreglamos
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  s = s.replace(/\/+$/, "");
  return s;
}

function isBadBase(base: string) {
  // hosts típicos que NO sirven en móvil físico
  return /\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:|\/|$)/i.test(base);
}

function safeJsonParse(s: string | null) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [apiBase, _setApiBase] = useState(sanitizeApiBase(DEFAULT_API_BASE) || DEFAULT_API_BASE);
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      const envProvided = !!ENV_API_BASE; // si hay .env, preferimos SIEMPRE ese valor
      const envBase = sanitizeApiBase(DEFAULT_API_BASE);

      const storedRaw = await AsyncStorage.getItem("apiBase");
      const storedBase = sanitizeApiBase(storedRaw || "");

      // ✅ Regla:
      // - Si hay ENV_API_BASE => usarlo (y pisa lo guardado)
      // - Si NO hay ENV_API_BASE => usar lo guardado SOLO si no es localhost-like
      let finalBase = envBase;

      if (!envProvided && storedBase && !isBadBase(storedBase)) {
        finalBase = storedBase;
      }

      _setApiBase(finalBase);
      await AsyncStorage.setItem("apiBase", finalBase);

      const t = await AsyncStorage.getItem("token");
      const u = await AsyncStorage.getItem("user");
      if (t) setToken(t);
      const parsed = safeJsonParse(u);
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

      async login(email, password) {
        const r = await fetch(`${apiBase}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        setToken(data.token);
        setUser(data.user);
        await AsyncStorage.setItem("token", data.token);
        await AsyncStorage.setItem("user", JSON.stringify(data.user));
      },

      async register(username, email, password) {
        const r = await fetch(`${apiBase}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        setToken(data.token);
        setUser(data.user);
        await AsyncStorage.setItem("token", data.token);
        await AsyncStorage.setItem("user", JSON.stringify(data.user));
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