import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

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
  const { token, user, isAdmin } = useAuth();

  const [viajes, setViajes] = useState([]);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);

  const inFlight = useRef(false);
  const editorRef = useRef(null);

  async function loadViajes() {
    const data = await apiFetch("/viajes");
    setViajes(data);
  }

  async function loadUsers() {
    if (!isAdmin) {
      setUsers([]);
      return;
    }
    const data = await apiFetch("/admin/users", { token });
    setUsers(data);
  }

  useEffect(() => {
    loadViajes().catch((e) => setErr(String(e.message || e)));
  }, []);

  useEffect(() => {
    loadUsers().catch((e) => setErr(String(e.message || e)));
  }, [isAdmin, token]);

  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editing]);

  const mine = useMemo(() => {
    const myId = user?._id;
    return viajes.filter((v) => v.author?._id === myId);
  }, [viajes, user]);

  const visibleViajes = useMemo(() => {
    return isAdmin ? viajes : mine;
  }, [isAdmin, viajes, mine]);

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
      fd.append("descripcion", cleanDesc);

      if (form.fotoFile) fd.append("foto", form.fotoFile);
      else fd.append("fotoUrl", seedFotoFromLugar(cleanLugar));

      const isEdit = Boolean(editing && editing._id);

      if (isEdit) {
        await apiFetch(`/viajes/${editing._id}`, { method: "PUT", body: fd, token });
        setFlash("Guardado ✅");
        setEditing(null);
        await loadViajes();
        setTimeout(() => setFlash(""), 2000);
      } else {
        await apiFetch(`/viajes`, { method: "POST", body: fd, token });
        setFlash("Guardado ✅. Redirigiendo a Descubrir…");
        setEditing(null);
        await loadViajes();
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

  async function removeViaje(v) {
    if (saving || inFlight.current) return;
    inFlight.current = true;

    setErr("");
    setSaving(true);
    setFlash("Borrando publicación…");

    try {
      if (!v?._id) throw new Error("ID inválido para borrar");

      await apiFetch(`/viajes/${v._id}`, { method: "DELETE", token });
      await loadViajes();

      if (editing?._id === v._id) {
        setEditing(null);
      }

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

  async function removeUser(u) {
    if (!isAdmin) return;
    if (!u?._id) return;
    if (u._id === user?._id) return;

    const ok = window.confirm(`¿Seguro que quieres borrar a ${u.username}?`);
    if (!ok) return;

    if (saving || inFlight.current) return;
    inFlight.current = true;

    setErr("");
    setSaving(true);
    setFlash("Borrando usuario…");

    try {
      await apiFetch(`/admin/users/${u._id}`, { method: "DELETE", token });
      await Promise.all([loadUsers(), loadViajes()]);
      setFlash("Usuario borrado ✅");
      setTimeout(() => setFlash(""), 2000);
    } catch (e) {
      setFlash("");
      setErr(String(e.message || e));
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  function startEdit(v) {
    setEditing(v);
    setFlash("");
    setErr("");
  }

  return (
    <div className="stack">
      <h1 className="h1">{isAdmin ? "Panel de administración" : "Panel"}</h1>

      {flash ? (
        <div className="toast" role="status" aria-live="polite">
          {flash}
        </div>
      ) : null}

      {err && <p className="muted">Error: {err}</p>}

      <div ref={editorRef}>
        <Editor
          key={editing?._id || "new"}
          initial={editing}
          saving={saving}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      </div>

      <div className="row space">
        <h2 className="h2" style={{ margin: 0 }}>
          {isAdmin ? "Todas las publicaciones" : "Mis viajes"}
        </h2>

        {isAdmin ? <span className="pill">Acciones exclusivas de admin</span> : null}
      </div>

      {visibleViajes.length === 0 ? (
        <p className="muted">
          {isAdmin ? "No hay publicaciones aún." : "Aún no has creado viajes."}
        </p>
      ) : (
        <div className="grid">
          {visibleViajes.map((v) => {
            const isEditingThis = editing?._id === v._id;

            return (
              <div
                className="card"
                key={v._id}
                style={{
                  cursor: "default",
                  outline: isEditingThis ? "2px solid #111" : "none",
                  outlineOffset: "2px",
                }}
              >
                <img src={v.fotoUrl} alt={v.titulo} />
                <div className="p">
                  <h3 className="h2">{v.titulo}</h3>

                  <div className="muted">
                    {v.lugar ? `${v.lugar} · ` : ""}
                    {new Date(v.fecha).toLocaleDateString()}
                    {isAdmin ? ` · autor: ${v.author?.username || "—"}` : ""}
                  </div>

                  <p className="snippet">{v.resumen || v.descripcion || ""}</p>

                  <div className="row">
                    <button className="btn ghost" onClick={() => startEdit(v)} disabled={saving}>
                      {isEditingThis ? "Editando..." : "Editar"}
                    </button>

                    <button className="btn danger" onClick={() => removeViaje(v)} disabled={saving}>
                      Borrar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAdmin ? (
        <>
          <h2 className="h2" style={{ marginTop: 18 }}>
            Usuarios
          </h2>

          {users.length === 0 ? (
            <p className="muted">No hay usuarios cargados.</p>
          ) : (
            <div className="stack">
              {users.map((u) => {
                const isMe = u._id === user?._id;

                return (
                  <div key={u._id} className="panelCard">
                    <div className="row space">
                      <div style={{ textAlign: "left" }}>
                        <div className="h2" style={{ marginBottom: 4 }}>
                          @{u.username}
                        </div>
                        <div className="muted">
                          {u.email} · rol: {u.role}
                        </div>
                      </div>

                      <div className="row">
                        {isMe ? <span className="pill">Tu cuenta</span> : null}

                        {!isMe ? (
                          <button
                            className="btn danger"
                            onClick={() => removeUser(u)}
                            disabled={saving}
                          >
                            Borrar usuario
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
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
        <div>
          <h2 className="h2" style={{ margin: 0 }}>
            {isEdit ? "Editar viaje" : "Nuevo viaje"}
          </h2>
          {isEdit ? (
            <div className="muted" style={{ marginTop: 6 }}>
              Editando: <strong>{initial?.titulo}</strong>
            </div>
          ) : null}
        </div>

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
        {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar"}
      </button>
    </div>
  );
}