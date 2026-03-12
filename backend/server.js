// ===== Security libs
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");

// ===== DNS (tu config)
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
dns.setDefaultResultOrder("ipv4first");

// ===== Node built-ins
const path = require("path");
const fs = require("fs");

require("dotenv").config();

// ===== App libs
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

// ===== Env
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const BASE_URL_ENV = (process.env.BASE_URL || "").replace(/\/$/, "");

// ✅ IMPORTANTE: sin fallback inseguro
if (!process.env.JWT_SECRET) {
  console.error("❌ Falta JWT_SECRET en backend/.env");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// ===== Middlewares
// ===== CORS
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

app.disable("x-powered-by");

app.use(
  helmet({
    // Sirves imágenes desde /uploads y /seed_images a web/app (cross-origin)
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// JSON only (reduce superficie)
app.use(express.json({ limit: "20kb" }));

// ✅ Sanitiza keys con $ y . (body/query/params) - para JSON
app.use(mongoSanitize({ replaceWith: "_" }));

// ===== Mongo
if (!MONGO_URI) {
  console.error("❌ Falta MONGO_URI en backend/.env");
  process.exit(1);
}

// ✅ Defensa Mongoose contra selector injection
mongoose.set("sanitizeFilter", true);
mongoose.set("strictQuery", true);

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ Error Mongo:", err);
    process.exit(1);
  });

// ===== Utils
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function mustBeString(field, value, { min = 1, max = 200 } = {}) {
  if (typeof value !== "string") throw new HttpError(400, `${field} inválido`);
  const s = value.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `${field} inválido`);
  return s;
}

function optionalString(field, value, { min = 0, max = 5000 } = {}) {
  if (value === undefined || value === null || value === "") return "";
  return mustBeString(field, value, { min, max });
}

function mustBeEmail(value) {
  const email = mustBeString("email", value, { min: 5, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "email inválido");
  return email;
}

function mustBeObjectId(field, value) {
  const s = mustBeString(field, value, { min: 10, max: 64 });
  if (!mongoose.isValidObjectId(s)) throw new HttpError(400, `${field} inválido`);
  return s;
}

function mustBeSlug(value) {
  const slug = mustBeString("slug", value, { min: 1, max: 120 });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new HttpError(400, "slug inválido");
  return slug;
}

function getBaseUrl(req) {
  if (BASE_URL_ENV) return BASE_URL_ENV;

  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http")
    .toString()
    .split(",")[0]
    .trim();

  const host = (req.headers["x-forwarded-host"] || req.get("host") || "").toString().trim();

  if (host) return `${proto}://${host}`;

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

function toRelativeFotoUrl(url) {
  if (!url) return "";
  if (url.startsWith("/seed_images") || url.startsWith("/uploads")) return url;

  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/seed_images") || u.pathname.startsWith("/uploads")) return u.pathname;
  } catch {
    // ignore
  }

  return url;
}

function normalizeViajeForClient(v, req) {
  const base = getBaseUrl(req);
  const rel = toRelativeFotoUrl(v.fotoUrl || "") || "";
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
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

const User = mongoose.model("User", userSchema);

// ===== MODELO VIAJE
const viajeSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: true, trim: true },
    lugar: { type: String, default: "", trim: true },
    resumen: { type: String, default: "" },
    contenido: { type: String, default: "" },
    descripcion: { type: String, default: "" },
    fecha: { type: Date, default: Date.now },
    fotoUrl: { type: String, default: "" },
    slug: { type: String, required: true, unique: true, index: true },
    dedupeHash: { type: String, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

viajeSchema.index({ author: 1, dedupeHash: 1 }, { unique: true, sparse: true });

const Viaje = mongoose.model("Viaje", viajeSchema);

// ===== Auth middleware
async function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";

  if (!token) return next(new HttpError(401, "No token"));

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(payload.userId)
      .select("_id username email role")
      .lean();

    if (!user) return next(new HttpError(401, "Usuario no existe"));

    req.userId = String(user._id);
    req.userRole = user.role || "user";
    req.user = user;

    return next();
  } catch {
    return next(new HttpError(401, "Token inválido"));
  }
}

function requireAdmin(req, res, next) {
  if (req.userRole !== "admin") {
    return next(new HttpError(403, "Solo admin"));
  }
  return next();
}

// ===== Multer + Static
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const seedImagesDir = path.join(__dirname, "seed_images");

app.use("/uploads", express.static(uploadsDir));
if (fs.existsSync(seedImagesDir)) app.use("/seed_images", express.static(seedImagesDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) {
      return cb(new HttpError(400, "Tipo de archivo inválido"));
    }
    cb(null, true);
  },
});

// ===== Routes
app.get("/health", (_req, res) => res.json({ ok: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// ===== Auth
app.post("/auth/register", authLimiter, async (req, res, next) => {
  try {
    const username = mustBeString("username", req.body?.username, { min: 3, max: 30 });
    const email = mustBeEmail(req.body?.email);
    const password = mustBeString("password", req.body?.password, { min: 8, max: 128 });

    const exists = await User.findOne({ $or: [{ email }, { username }] }).lean();
    if (exists) return res.status(409).json({ error: "Usuario o email ya existe" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      passwordHash,
      role: "user",
    });

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      token,
      user: {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ error: "Usuario o email ya existe" });
    }
    return next(e);
  }
});

app.post("/auth/login", authLimiter, async (req, res, next) => {
  try {
    const email = mustBeEmail(req.body?.email);
    const password = mustBeString("password", req.body?.password, { min: 8, max: 128 });

    const user = await User.findOne({ email }).select("+passwordHash username email role");
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      token,
      user: {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
      },
    });
  } catch (e) {
    return next(e);
  }
});

app.get("/auth/me", authRequired, async (req, res, next) => {
  try {
    return res.json({
      user: {
        _id: req.user._id,
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (e) {
    return next(e);
  }
});

// ===== Viajes list (público)
app.get("/viajes", async (req, res, next) => {
  try {
    const viajes = await Viaje.find({})
      .populate("author", "username")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(viajes.map((v) => normalizeViajeForClient(v, req)));
  } catch (e) {
    return next(e);
  }
});

// ===== Viaje por slug (público)
app.get("/viajes/slug/:slug", async (req, res, next) => {
  try {
    const slug = mustBeSlug(req.params.slug);

    const v = await Viaje.findOne({ slug }).populate("author", "username").lean();
    if (!v) return res.status(404).json({ error: "No encontrado" });

    return res.json(normalizeViajeForClient(v, req));
  } catch (e) {
    return next(e);
  }
});

// ===== Crear viaje
app.post(
  "/viajes",
  authRequired,
  upload.single("foto"),
  mongoSanitize({ replaceWith: "_" }),
  async (req, res, next) => {
    try {
      const titulo = mustBeString("titulo", req.body?.titulo, { min: 1, max: 120 });
      const lugar = mustBeString("lugar", req.body?.lugar, { min: 1, max: 80 });

      const resumenIn = optionalString("resumen", req.body?.resumen, { max: 500 });
      const contenidoIn = optionalString("contenido", req.body?.contenido, { max: 5000 });
      const descripcionIn = optionalString("descripcion", req.body?.descripcion, { max: 5000 });

      const finalResumen = resumenIn || descripcionIn;
      const finalContenido = contenidoIn || descripcionIn;

      if (!finalResumen || !finalContenido) {
        throw new HttpError(400, "Faltan resumen/contenido");
      }

      const fotoUrlRaw = optionalString("fotoUrl", req.body?.fotoUrl, { max: 2000 });

      let finalFotoUrl = "";
      if (req.file) finalFotoUrl = `/uploads/${req.file.filename}`;
      else if (fotoUrlRaw) finalFotoUrl = toRelativeFotoUrl(fotoUrlRaw);

      const slug = makeSlugUnique(titulo);

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
        lugar,
        resumen: finalResumen,
        contenido: finalContenido,
        descripcion: descripcionIn || finalContenido,
        slug,
        fotoUrl: finalFotoUrl,
        author: req.userId,
        dedupeHash,
      });

      const populated = await Viaje.findById(doc._id).populate("author", "username").lean();
      return res.status(201).json(normalizeViajeForClient(populated, req));
    } catch (e) {
      if (e && e.code === 11000) return res.status(409).json({ error: "Ya existe un viaje igual" });
      return next(e);
    }
  }
);

// ===== Editar (autor o admin)
app.put(
  "/viajes/:id",
  authRequired,
  upload.single("foto"),
  mongoSanitize({ replaceWith: "_" }),
  async (req, res, next) => {
    try {
      const id = mustBeObjectId("id", req.params.id);

      const v = await Viaje.findById(id);
      if (!v) return res.status(404).json({ error: "No encontrado" });

      const rawOwnerId = v.author ? String(v.author) : "";
const ownerId = mongoose.isValidObjectId(rawOwnerId) ? rawOwnerId : "";
const isOwner = ownerId === req.userId;
const isAdmin = req.userRole === "admin";

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "No permitido" });
      }

      const titulo =
        req.body?.titulo !== undefined
          ? mustBeString("titulo", req.body.titulo, { min: 1, max: 120 })
          : "";

      const lugar =
        req.body?.lugar !== undefined
          ? mustBeString("lugar", req.body.lugar, { min: 1, max: 80 })
          : "";

      const resumen =
        req.body?.resumen !== undefined
          ? optionalString("resumen", req.body.resumen, { max: 500 })
          : "";

      const contenido =
        req.body?.contenido !== undefined
          ? optionalString("contenido", req.body.contenido, { max: 5000 })
          : "";

      const descripcion =
        req.body?.descripcion !== undefined
          ? optionalString("descripcion", req.body.descripcion, { max: 5000 })
          : "";

      const fotoUrlRaw =
        req.body?.fotoUrl !== undefined
          ? optionalString("fotoUrl", req.body.fotoUrl, { max: 2000 })
          : "";

      if (titulo) v.titulo = titulo;

      if (req.body?.lugar !== undefined) {
        if (!lugar) throw new HttpError(400, "Lugar no puede estar vacío");
        v.lugar = lugar;
      }

      if (req.body?.resumen !== undefined) v.resumen = resumen;
      if (req.body?.contenido !== undefined) v.contenido = contenido;
      if (req.body?.descripcion !== undefined) v.descripcion = descripcion;

      if (req.body?.resumen === undefined && descripcion) v.resumen = descripcion;
      if (req.body?.contenido === undefined && descripcion) v.contenido = descripcion;

      if (req.file) v.fotoUrl = `/uploads/${req.file.filename}`;
      else if (fotoUrlRaw) v.fotoUrl = toRelativeFotoUrl(fotoUrlRaw);

      if (titulo) v.slug = makeSlugUnique(titulo);

      const dedupeAuthorId = ownerId || req.userId;

if (!ownerId && isAdmin) {
  v.author = req.userId;
}

const nextHash = makeDedupeHash({
  authorId: dedupeAuthorId,
  titulo: v.titulo,
  lugar: v.lugar,
  resumen: v.resumen,
  contenido: v.contenido,
});

const dupe = await Viaje.findOne({
  author: dedupeAuthorId,
  dedupeHash: nextHash,
  _id: mongoose.trusted({ $ne: v._id }),
})
  .select("_id")
  .lean();

      if (dupe) return res.status(409).json({ error: "Ya existe un viaje igual" });

      v.dedupeHash = nextHash;

      await v.save();

      const populated = await Viaje.findById(v._id).populate("author", "username").lean();
      return res.json(normalizeViajeForClient(populated, req));
    } catch (e) {
      if (e && e.code === 11000) return res.status(409).json({ error: "Ya existe un viaje igual" });
      return next(e);
    }
  }
);

// ===== Borrar (autor o admin)
app.delete("/viajes/:id", authRequired, async (req, res, next) => {
  try {
    const id = mustBeObjectId("id", req.params.id);

    const v = await Viaje.findById(id);
    if (!v) return res.status(404).json({ error: "No encontrado" });

    const ownerId = v.author ? v.author.toString() : "";
    const isOwner = ownerId === req.userId;
    const isAdmin = req.userRole === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "No permitido" });
    }

    await v.deleteOne();
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
});

// ===== ADMIN: listar usuarios
app.get("/admin/users", authRequired, requireAdmin, async (_req, res, next) => {
  try {
    const users = await User.find({})
      .select("_id username email role createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(
      users.map((u) => ({
        _id: u._id,
        id: u._id,
        username: u.username,
        email: u.email,
        role: u.role || "user",
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }))
    );
  } catch (e) {
    return next(e);
  }
});

// ===== ADMIN: cambiar rol
app.patch("/admin/users/:id/role", authRequired, requireAdmin, async (req, res, next) => {
  try {
    const id = mustBeObjectId("id", req.params.id);
    const role = mustBeString("role", req.body?.role, { min: 4, max: 5 }).toLowerCase();

    if (!["user", "admin"].includes(role)) {
      throw new HttpError(400, "role inválido");
    }

    if (id === req.userId && role !== "admin") {
      throw new HttpError(400, "No puedes quitarte el rol admin a ti mismo");
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: { role } },
      { new: true, runValidators: true }
    )
      .select("_id username email role")
      .lean();

    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    return res.json({
      ok: true,
      user: {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    return next(e);
  }
});

// ===== ADMIN: borrar usuario y sus viajes
app.delete("/admin/users/:id", authRequired, requireAdmin, async (req, res, next) => {
  try {
    const id = mustBeObjectId("id", req.params.id);

    if (id === req.userId) {
      throw new HttpError(400, "No puedes borrarte a ti mismo");
    }

    const user = await User.findById(id).select("_id role username email").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    if (user.role === "admin") {
      throw new HttpError(400, "No puedes borrar otro admin");
    }

    await Viaje.deleteMany({ author: user._id });
    await User.deleteOne({ _id: user._id });

    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
});

// ===== Global error handler
app.use((err, _req, res, _next) => {
  const status = Number(err?.status) || (err?.name === "CastError" ? 400 : 500);

  if (status >= 500) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }

  return res.status(status).json({ error: String(err?.message || "Solicitud inválida") });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend escuchando en http://0.0.0.0:${PORT}`);
});