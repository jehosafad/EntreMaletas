import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

// Catálogo interno SOLO para elegir una foto por defecto si no subes archivo.
// (No es un selector “limitado” para lugar: el lugar es texto libre)
const SEEDS = [
  { label: "Cancún", value: "/seed_images/cancun.jpg" },
  { label: "CDMX", value: "/seed_images/cdmx.jpg" },
  { label: "Japón", value: "/seed_images/japon.jpg" },
  { label: "San Miguel", value: "/seed_images/sanmigueldeallende.jpg" },
  { label: "Teotihuacán", value: "/seed_images/teotihuacan.jpg" },
];

function seedFotoFromLugar(lugar) {
  const t = String(lugar || "").toLowerCase();
  const found = SEEDS.find((s) => t.includes(s.label.toLowerCase()));
  return found?.value || "/seed_images/cancun.jpg";
}

export default function Panel() {
  const nav = useNavigate();
  const { token, user } = useAuth();

  const [viajes, setViajes] = useState([]);
  const [editing, setEditing] = useState(null); // null = creando
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);

  // Mutex duro anti-doble click (por si React tarda en deshabilitar)
  const inFlight = useRef(false);

  async function load() {
    const data = await apiFetch("/viajes");
    setViajes(data);
  }

  useEffect(() => {
    load().catch((e) => setErr(String(e.message || e)));
  }, []);

  const mine = useMemo(() => {
    const myId = user?._id;
    return viajes.filter((v) => v.author?._id === myId);
  }, [viajes, user]);

  async function save(form) {
    if (saving || inFlight.current) return;
    inFlight.current = true;

    setErr("");
    setSaving(true);
    setFlash("Guardando…");

    try {
      const cleanTitulo = String(form.titulo || "").trim();
      const cleanLugar = String(form.lugar || "").trim();
      const cleanDesc = String(form.descripcion || "").trim();

      if (!cleanTitulo) throw new Error("Falta título");
      if (!cleanLugar) throw new Error("Falta lugar");
      if (!cleanDesc) throw new Error("Falta descripción");

      const fd = new FormData();
      fd.append("titulo", cleanTitulo);
      fd.append("lugar", cleanLugar);

      // compat con tu backend (acepta descripcion legacy)
      fd.append("descripcion", cleanDesc);

      if (form.fotoFile) fd.append("foto", form.fotoFile);
      else fd.append("fotoUrl", seedFotoFromLugar(cleanLugar));

      // ✅ FIX CLAVE: solo es EDIT si hay _id
      const isEdit = Boolean(editing && editing._id);

      if (isEdit) {
        await apiFetch(`/viajes/${editing._id}`, { method: "PUT", body: fd, token });
        setFlash("Guardado ✅");
        setEditing(null);
        await load();
        setTimeout(() => setFlash(""), 2000);
      } else {
        await apiFetch(`/viajes`, { method: "POST", body: fd, token });
        setFlash("Guardado ✅. Redirigiendo a Descubrir…");
        setEditing(null);
        await load();
        setTimeout(() => nav("/", { replace: true }), 650);
      }
    } catch (e) {
      setFlash("");
      setErr(String(e.message || e));
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  async function remove(v) {
    if (saving || inFlight.current) return;
    inFlight.current = true;

    setErr("");
    setSaving(true);
    setFlash("Borrando…");

    try {
      // ✅ Si por lo que sea llega undefined, esto evita pegarle al backend mal
      if (!v?._id) throw new Error("ID inválido para borrar");

      await apiFetch(`/viajes/${v._id}`, { method: "DELETE", token });
      await load();
      setFlash("Borrado ✅");
      setTimeout(() => setFlash(""), 2000);
    } catch (e) {
      setFlash("");
      setErr(String(e.message || e));
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  return (
    <div className="stack">
      <h1 className="h1">Panel</h1>

      {flash ? (
        <div className="toast" role="status" aria-live="polite">
          {flash}
        </div>
      ) : null}

      {err && <p className="muted">Error: {err}</p>}

      <Editor
        key={editing?._id || "new"}
        initial={editing}
        saving={saving}
        onSave={save}
        onCancel={() => setEditing(null)}
      />

      <h2 className="h2">Mis viajes</h2>

      {mine.length === 0 ? (
        <p className="muted">Aún no has creado viajes.</p>
      ) : (
        <div className="grid">
          {mine.map((v) => (
            <div className="card" key={v._id} style={{ cursor: "default" }}>
              <img src={v.fotoUrl} alt={v.titulo} />
              <div className="p">
                <h3 className="h2">{v.titulo}</h3>
                <div className="muted">
                  {v.lugar ? `${v.lugar} · ` : ""}
                  {new Date(v.fecha).toLocaleDateString()}
                </div>
                <p className="snippet">{v.resumen || v.descripcion || ""}</p>

                <div className="row">
                  <button className="btn ghost" onClick={() => setEditing(v)} disabled={saving}>
                    Editar
                  </button>
                  <button className="btn danger" onClick={() => remove(v)} disabled={saving}>
                    Borrar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Editor({ initial, saving, onSave, onCancel }) {
  const isEdit = Boolean(initial && initial._id);

  const [titulo, setTitulo] = useState(initial?.titulo || "");
  const [lugar, setLugar] = useState(initial?.lugar || "");
  const [descripcion, setDescripcion] = useState(
    initial?.descripcion || initial?.contenido || ""
  );
  const [fotoFile, setFotoFile] = useState(null);

  useEffect(() => {
    setTitulo(initial?.titulo || "");
    setLugar(initial?.lugar || "");
    setDescripcion(initial?.descripcion || initial?.contenido || "");
    setFotoFile(null);
  }, [initial]);

  return (
    <div className="panelCard">
      <div className="row space">
        <h2 className="h2" style={{ margin: 0 }}>
          {isEdit ? "Editar viaje" : "Nuevo viaje"}
        </h2>

        {isEdit ? (
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        ) : null}
      </div>

      <label>Título</label>
      <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />

      <label>Lugar (texto libre)</label>
      <input
        className="input"
        value={lugar}
        onChange={(e) => setLugar(e.target.value)}
        placeholder="Ej: Oaxaca, MX"
      />

      <label>Descripción</label>
      <textarea
        className="input"
        rows={7}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />

      <label>Foto (opcional)</label>
      <input
        className="input"
        type="file"
        accept="image/*"
        onChange={(e) => setFotoFile(e.target.files?.[0] || null)}
      />

      <button
        className="btn"
        onClick={() => onSave({ titulo, lugar, descripcion, fotoFile })}
        disabled={saving}
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}