const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
dns.setDefaultResultOrder("ipv4first");

const path = require("path");
const fs = require("fs");

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const slugify = require("slugify");
const crypto = require("crypto");

const app = express();

// Render/Railway/etc. suelen ir detrás de un proxy (x-forwarded-*)
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const BASE_URL_ENV = (process.env.BASE_URL || "").replace(/\/$/, "");

// ===== Middlewares
// ===== CORS
// En dev puede ir abierto, pero en prod conviene fijar dominios.
// CORS_ORIGIN admite lista separada por comas:
//   https://tuweb.netlify.app,https://tuweb.vercel.app,http://localhost:5173
const rawCors = (process.env.CORS_ORIGIN || "").trim();
const allowlist = rawCors
  ? rawCors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

app.use(
  cors({
    origin(origin, cb) {
      // requests sin origin (curl, mobile apps) -> permitir
      if (!origin) return cb(null, true);
      if (allowlist.length === 0) return cb(null, true);
      return cb(null, allowlist.includes(origin));
    },
    credentials: false,
  })
);
app.use(express.json());

// ===== Estáticos
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/seed_images", express.static(path.join(__dirname, "seed_images")));

// ===== Mongo
if (!MONGO_URI) {
  console.error("❌ Falta MONGO_URI en backend/.env");
  process.exit(1);
}
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ Error Mongo:", err);
    process.exit(1);
  });

// ===== Utils
function getBaseUrl(req) {
  // 1) si lo fijas en env para producción
  if (BASE_URL_ENV) return BASE_URL_ENV;

  // 2) si viene detrás de proxy (Render)
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http")
    .toString()
    .split(",")[0]
    .trim();
  const host = (req.headers["x-forwarded-host"] || req.get("host") || "").toString().trim();

  if (host) return `${proto}://${host}`;

  // 3) fallback
  return `http://localhost:${PORT}`;
}

function makeSlugUnique(titulo) {
  const base = slugify(titulo || "viaje", { lower: true, strict: true });
  const rand = Math.random().toString(36).slice(2, 7);
  return `${base}-${rand}`;
}

function normalizeText(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function makeDedupeHash({ authorId, titulo, lugar, resumen, contenido }) {
  const payload = [
    authorId || "",
    normalizeText(titulo),
    normalizeText(lugar),
    normalizeText(resumen),
    normalizeText(contenido),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

// Convierte fotoUrl absoluta -> relativa si es de /seed_images o /uploads
function toRelativeFotoUrl(url) {
  if (!url) return "";
  // ya es relativa
  if (url.startsWith("/seed_images") || url.startsWith("/uploads")) return url;

  // URL absoluta
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/seed_images") || u.pathname.startsWith("/uploads")) return u.pathname;
  } catch {
    // ignore
  }
  return url; // fallback: no tocamos si es algo externo
}

function normalizeViajeForClient(v, req) {
  const base = getBaseUrl(req);

  // ✅ Arregla records antiguos que guardaron URL ABSOLUTA con IP vieja.
  // Convertimos a RELATIVO (si podemos) y rearmamos según el host real.
  const rel = toRelativeFotoUrl(v.fotoUrl || "") || "";
  const fotoUrl = rel ? base + rel : "";

  // compat: si tu frontend manda/usa "descripcion"
  const resumen = v.resumen || v.descripcion || "";
  const contenido = v.contenido || v.descripcion || "";
  const descripcion = v.descripcion || v.resumen || "";

  const { dedupeHash, ...safe } = v;

  return {
    ...safe,
    fotoUrl: rel ? `${base}${rel}` : "",
    author: v.author || null,
    resumen: v.resumen ?? v.descripcion ?? "",
    contenido: v.contenido ?? v.descripcion ?? "",
  };
}

// ===== MODELO USUARIO
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);
const User = mongoose.model("User", userSchema);

// ===== MODELO VIAJE
const viajeSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: true, trim: true },

    // ✅ Lugar libre (ya NO enum/lista cerrada)
    lugar: { type: String, default: "", trim: true },

    resumen: { type: String, default: "" },
    contenido: { type: String, default: "" },
    descripcion: { type: String, default: "" },
    fecha: { type: Date, default: Date.now },
    fotoUrl: { type: String, default: "" }, // /uploads/... o /seed_images/...
    slug: { type: String, required: true, unique: true, index: true },

    // ✅ Para bloquear "viajes exactamente iguales" por autor+contenido
    dedupeHash: { type: String, index: true },

    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Índice único "sparse" para no romper documentos antiguos sin dedupeHash
viajeSchema.index({ author: 1, dedupeHash: 1 }, { unique: true, sparse: true });

const Viaje = mongoose.model("Viaje", viajeSchema);

// ===== Auth middleware
function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

// ===== Multer
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({ storage });

// ===== Routes

app.get("/health", (req, res) => res.json({ ok: true }));

// Auth
app.post("/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ error: "Faltan campos" });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(409).json({ error: "Usuario o email ya existe" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, passwordHash });

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: { _id: user._id, id: user._id, username: user.username, email: user.email },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Faltan campos" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: { _id: user._id, id: user._id, username: user.username, email: user.email },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Viajes list
app.get("/viajes", async (req, res) => {
  try {
    const viajes = await Viaje.find({})
      .populate("author", "username email")
      .sort({ createdAt: -1 })
      .lean();

    res.json(viajes.map((v) => normalizeViajeForClient(v, req)));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Viaje por slug
app.get("/viajes/slug/:slug", async (req, res) => {
  try {
    const v = await Viaje.findOne({ slug: req.params.slug }).populate("author", "username email").lean();
    if (!v) return res.status(404).json({ error: "No encontrado" });
    res.json(normalizeViajeForClient(v, req));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Crear (protegida, multipart, foto opcional)
app.post("/viajes", authRequired, upload.single("foto"), async (req, res) => {
  try {
    const { titulo, lugar, resumen, contenido, descripcion, fotoUrl } = req.body || {};

    if (!titulo) return res.status(400).json({ error: "Falta titulo" });
    if (!lugar || !String(lugar).trim()) return res.status(400).json({ error: "Falta lugar" });

    // compat legacy: si mandan descripcion en vez de resumen+contenido
    const finalResumen = resumen || descripcion || "";
    const finalContenido = contenido || descripcion || "";

    if (!finalResumen || !finalContenido) {
      return res.status(400).json({ error: "Faltan resumen/contenido" });
    }

    let finalFotoUrl = "";
    if (req.file) finalFotoUrl = `/uploads/${req.file.filename}`;
    else if (fotoUrl) finalFotoUrl = toRelativeFotoUrl(fotoUrl);

    const slug = makeSlugUnique(titulo);

    // 👇 Bloqueo backend de duplicados exactos (por autor + contenido normalizado)
    const dedupeHash = makeDedupeHash({
      authorId: req.userId,
      titulo,
      lugar,
      resumen: finalResumen,
      contenido: finalContenido,
    });

    const dupe = await Viaje.findOne({ author: req.userId, dedupeHash }).select("_id").lean();
    if (dupe) return res.status(409).json({ error: "Ya existe un viaje igual" });

    const doc = await Viaje.create({
      titulo,
      lugar: String(lugar).trim(),
      resumen: finalResumen,
      contenido: finalContenido,
      descripcion: descripcion || finalContenido,
      slug,
      fotoUrl: finalFotoUrl,
      author: req.userId,
      dedupeHash,
    });

    const populated = await Viaje.findById(doc._id).populate("author", "username email").lean();
    res.status(201).json(normalizeViajeForClient(populated, req));
  } catch (e) {
    // índice único (race condition)
    if (e && e.code === 11000) return res.status(409).json({ error: "Ya existe un viaje igual" });
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Editar (protegida, solo autor)
app.put("/viajes/:id", authRequired, upload.single("foto"), async (req, res) => {
  try {
    const v = await Viaje.findById(req.params.id);
    if (!v) return res.status(404).json({ error: "No encontrado" });

    if (!v.author || v.author.toString() !== req.userId) return res.status(403).json({ error: "No permitido" });

    const { titulo, lugar, resumen, contenido, descripcion, fotoUrl } = req.body || {};

    if (titulo) v.titulo = titulo;

    // 👇 Lugar libre (texto)
    if (lugar !== undefined) {
      const cleanLugar = String(lugar).trim();
      if (!cleanLugar) return res.status(400).json({ error: "Lugar no puede estar vacío" });
      v.lugar = cleanLugar;
    }

    if (resumen) v.resumen = resumen;
    if (contenido) v.contenido = contenido;
    if (descripcion) v.descripcion = descripcion;

    // compat legacy
    if (!resumen && descripcion) v.resumen = descripcion;
    if (!contenido && descripcion) v.contenido = descripcion;

    if (req.file) v.fotoUrl = `/uploads/${req.file.filename}`;
    else if (fotoUrl) v.fotoUrl = toRelativeFotoUrl(fotoUrl);

    // si cambian título, regen slug
    if (titulo) v.slug = makeSlugUnique(titulo);

    // 👇 Bloqueo backend de duplicados exactos (también en edición)
    const nextHash = makeDedupeHash({
      authorId: req.userId,
      titulo: v.titulo,
      lugar: v.lugar,
      resumen: v.resumen,
      contenido: v.contenido,
    });

    const dupe = await Viaje.findOne({ author: req.userId, dedupeHash: nextHash, _id: { $ne: v._id } })
      .select("_id")
      .lean();
    if (dupe) return res.status(409).json({ error: "Ya existe un viaje igual" });

    v.dedupeHash = nextHash;

    await v.save();

    const populated = await Viaje.findById(v._id).populate("author", "username email").lean();
    res.json(normalizeViajeForClient(populated, req));
  } catch (e) {
    if (e && e.code === 11000) return res.status(409).json({ error: "Ya existe un viaje igual" });
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Borrar (protegida, solo autor)
app.delete("/viajes/:id", authRequired, async (req, res) => {
  try {
    const v = await Viaje.findById(req.params.id);
    if (!v) return res.status(404).json({ error: "No encontrado" });

    if (!v.author || v.author.toString() !== req.userId) return res.status(403).json({ error: "No permitido" });

    await v.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend escuchando en http://0.0.0.0:${PORT}`);
});


