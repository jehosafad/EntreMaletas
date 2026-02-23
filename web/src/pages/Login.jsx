import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="form">
      <h1 className="h1">Login</h1>

      <label>Email</label>
      <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />

      <label>Password</label>
      <input
        className="input"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {err && <p className="muted">Error: {err}</p>}

      <button
        className="btn"
        onClick={async () => {
          try {
            setErr("");
            await login(email, password);
            nav("/panel");
          } catch (e) {
            setErr(String(e.message || e));
          }
        }}
      >
        Entrar
      </button>

      <p className="muted">
        ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
      </p>
    </div>
  );
}
