import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

export default function Home() {
  const [viajes, setViajes] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch("/viajes")
      .then(setViajes)
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  return (
    <>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <h1 className="h1">Descubre viajes que inspiran</h1>
        <div className="muted">
          Historias reales, fotos bonitas y rutas rápidas para tu próxima escapada.
        </div>
        {err && <p className="muted">Error: {err}</p>}
      </div>

      <div className="grid">
        {viajes.map((v) => (
          <Link key={v._id} to={`/viaje/${v.slug}`} className="card">
            <img src={v.fotoUrl} alt={v.titulo} />
            <div className="p">
              <h2 className="h2">{v.titulo}</h2>
              <div className="muted">
                {v.lugar ? `${v.lugar} · ` : ""}{new Date(v.fecha).toLocaleDateString()} · {v.author?.username || "—"}
              </div>
              <p className="snippet">{v.resumen}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
