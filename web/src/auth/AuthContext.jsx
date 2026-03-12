import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

const AuthCtx = createContext(null);

const TOKEN_KEY = "token";
const USER_KEY = "user";

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function normUsername(username) {
  return String(username || "").trim();
}
function normPassword(password) {
  return String(password || "");
}

function readStoredAuth() {
  try {
    const token = localStorage.getItem(TOKEN_KEY) || "";
    const rawUser = localStorage.getItem(USER_KEY) || "";
    const user = rawUser ? JSON.parse(rawUser) : null;
    return { token, user };
  } catch {
    return { token: "", user: null };
  }
}

function writeStoredAuth(token, user) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);

    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return readStoredAuth().token;
  });

  const [user, setUser] = useState(() => {
    if (typeof window === "undefined") return null;
    return readStoredAuth().user;
  });

  useEffect(() => {
    writeStoredAuth(token, user);
  }, [token, user]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key !== TOKEN_KEY && e.key !== USER_KEY) return;
      const next = readStoredAuth();
      setToken(next.token);
      setUser(next.user);
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => {
    const isAdmin = user?.role === "admin";

    return {
      token,
      user,
      isAuthed: !!token,
      isAdmin,

      async login(email, password) {
        const data = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: normEmail(email),
            password: normPassword(password),
          }),
        });

        setToken(data.token || "");
        setUser(data.user || null);
        writeStoredAuth(data.token || "", data.user || null);
      },

      async register(username, email, password) {
        const data = await apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            username: normUsername(username),
            email: normEmail(email),
            password: normPassword(password),
          }),
        });

        setToken(data.token || "");
        setUser(data.user || null);
        writeStoredAuth(data.token || "", data.user || null);
      },

      logout() {
        setToken("");
        setUser(null);
        writeStoredAuth("", null);
      },
    };
  }, [token, user]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}