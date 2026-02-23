import { API_BASE } from "../config";

export async function apiFetch(path, { token, ...opts } = {}) {
  const headers = new Headers(opts.headers || {});
  const isForm = opts.body instanceof FormData;

  if (!isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // ✅ Evita token viejo en closures: siempre prioriza lo que haya en localStorage
  const storageToken = typeof localStorage !== "undefined" ? localStorage.getItem("token") || "" : "";
  const effectiveToken = storageToken || token || "";
  if (effectiveToken) headers.set("Authorization", `Bearer ${effectiveToken}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  const ct = res.headers.get("content-type") || "";

  if (!res.ok) {
    let msg = "";

    try {
      if (ct.includes("application/json")) {
        const j = await res.json();
        msg = j?.error || j?.message || JSON.stringify(j);
      } else {
        msg = await res.text();
      }
    } catch {
      msg = await res.text().catch(() => "");
    }

    throw new Error(msg || `HTTP ${res.status}`);
  }

  return ct.includes("application/json") ? res.json() : res.text();
}