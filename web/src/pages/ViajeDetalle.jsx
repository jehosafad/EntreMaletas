import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

export default function ViajeDetalle() {
  const { slug } = useParams();
  const [v, setV] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch(`/viajes/slug/${slug}`)
      .then(setV)
      .catch((e) => setErr(String(e.message || e)));
  }, [slug]);

  if (err) return <p className="muted">Error: {err}</p>;
  if (!v) return <p className="muted">Cargando…</p>;

  return (
    <div className="stack">
      <Link className="back" to="/">← Volver</Link>

      <h1 className="h1">{v.titulo}</h1>
      <div className="muted">
        {v.lugar ? `${v.lugar} · ` : ""}{new Date(v.fecha).toLocaleDateString()} · {v.author?.username || "—"}
      </div>

      <img className="hero" src={v.fotoUrl} alt={v.titulo} />

      <p className="content">{v.contenido}</p>
    </div>
  );
}
