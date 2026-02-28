import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Register() {
  const nav = useNavigate();
  const { register } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="form">
      <h1 className="h1">Registro</h1>

      <label>Username</label>
      <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />

      <label>Email</label>
      <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />

      <label>Password</label>
      <input
        className="input"
        type="password"
        minLength={8}
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {err && <p className="muted">Error: {err}</p>}

      <button
        className="btn"
        onClick={async () => {
          try {
            setErr("");
            await register(username, email, password);
            nav("/panel");
          } catch (e) {
            setErr(String(e.message || e));
          }
        }}
      >
        Crear cuenta
      </button>

      <p className="muted">
        ¿Ya tienes cuenta? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
