import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  // ✅ SIEMPRE inicia cerrado (no leer localStorage)
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    // ✅ por si quedó algo viejo guardado
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }, []);

  const value = useMemo(() => {
    return {
      token,
      user,
      isAuthed: !!token,

      async login(email, password) {
        const data = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setToken(data.token);
        setUser(data.user);
      },

      async register(username, email, password) {
        const data = await apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify({ username, email, password }),
        });
        setToken(data.token);
        setUser(data.user);
      },

      logout() {
        setToken("");
        setUser(null);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      },
    };
  }, [token, user]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}