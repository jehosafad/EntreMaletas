import React, { createContext, useContext, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

const AuthCtx = createContext(null);

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function normUsername(username) {
  return String(username || "").trim();
}
function normPassword(password) {
  return String(password || "");
}

export function AuthProvider({ children }) {
  // memoria (no persiste)
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);

  const value = useMemo(() => {
    return {
      token,
      user,
      isAuthed: !!token,

      async login(email, password) {
        const data = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: normEmail(email),
            password: normPassword(password),
          }),
        });
        setToken(data.token);
        setUser(data.user);
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
        setToken(data.token);
        setUser(data.user);
      },

      logout() {
        setToken("");
        setUser(null);
      },
    };
  }, [token, user]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}