const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
dns.setDefaultResultOrder("ipv4first");

require("dotenv").config();
const mongoose = require("mongoose");
const slugify = require("slugify");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const MONGO_URI = process.env.MONGO_URI;

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true },
    email: { type: String, unique: true },
    passwordHash: String,
  },
  { timestamps: true, versionKey: false }
);

const viajeSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: true },
    lugar: { type: String, default: "", trim: true },
    resumen: String,
    contenido: String,
    descripcion: String,
    fecha: Date,
    fotoUrl: String,
    slug: { type: String, unique: true },
    dedupeHash: { type: String },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { versionKey: false }
);

// ✅ Evita "viajes exactamente iguales" por autor+contenido (sparse para no romper docs antiguos)
viajeSchema.index({ author: 1, dedupeHash: 1 }, { unique: true, sparse: true });

const User = mongoose.model("User", userSchema);
const Viaje = mongoose.model("Viaje", viajeSchema);

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

function makeSlug(titulo) {
  const base = slugify(titulo, { lower: true, strict: true });
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

async function main() {
  if (!MONGO_URI) throw new Error("Falta MONGO_URI en backend/.env");

  await mongoose.connect(MONGO_URI);
  console.log("✅ Conectado para seed");

  // Usuario "system" (no expone credenciales)
  // - se crea si no existe
  // - contraseña aleatoria NO se imprime
  const email = "system@entremaletas.local";
  let systemUser = await User.findOne({ email });

  if (!systemUser) {
    const randomPass = crypto.randomBytes(24).toString("hex");
    const passwordHash = await bcrypt.hash(randomPass, 10);
    systemUser = await User.create({ username: "system", email, passwordHash });
    console.log("✅ Usuario system creado (password aleatoria no mostrada)");
  } else {
    console.log("ℹ️ Usuario system ya existe");
  }

  // ✅ borra solo seeds del usuario system (no toca viajes reales de otros usuarios)
  await Viaje.deleteMany({
    author: systemUser._id,
    fotoUrl: { $regex: "^/seed_images/" },
  });

  const now = new Date();

  const viajesSeed = [
    {
      titulo: "Cancún",
      resumen: "Playas turquesa, atardeceres y tacos de pescado 🌮🌊",
      contenido:
        "Día 1: llegamos y nos fuimos directo a la playa...\n\nDía 2: tour, cenotes, y cierre con tacos.\n\nTip: ve temprano para evitar filas.",
      fotoUrl: "/seed_images/cancun.jpg",
    },
    {
      titulo: "CDMX",
      resumen: "Museos, comida callejera y noches con mezcal 🌆✨",
      contenido:
        "Imperdibles: Centro Histórico, Chapultepec, museos.\n\nComida: tacos al pastor y esquites.\n\nNoche: mezcal y caminata por Reforma.",
      fotoUrl: "/seed_images/cdmx.jpg",
    },
    {
      titulo: "Japón",
      resumen: "Templos, ramen y calles llenas de neón 🍜🏯",
      contenido:
        "Tokio: Shibuya y Akihabara.\n\nKioto: templos y calles tradicionales.\n\nComida: ramen, sushi y snacks en konbini.",
      fotoUrl: "/seed_images/japon.jpg",
    },
    {
      titulo: "San Miguel de Allende",
      resumen: "Callecitas, arte y cafés con vistas increíbles ☕🎨",
      contenido:
        "Plan tranquilo: caminar, galerías, miradores.\n\nCafé con pan dulce y fotos al atardecer.\n\nTip: lleva zapatos cómodos por las subidas.",
      fotoUrl: "/seed_images/sanmigueldeallende.jpg",
    },
    {
      titulo: "Teotihuacán",
      resumen: "Pirámides, historia y una caminata épica 🏜️🗿",
      contenido:
        "Llega temprano, sube la Pirámide del Sol y recorre la Calzada.\n\nTip: gorra, agua y bloqueador.\n\nCierre perfecto: comida típica cerca de la zona.",
      fotoUrl: "/seed_images/teotihuacan.jpg",
    },
  ].map((v) => {
    const lugar = v.lugar && String(v.lugar).trim() ? String(v.lugar).trim() : v.titulo;

    return {
      ...v,
      lugar,
      slug: makeSlug(v.titulo),
      author: systemUser._id,
      dedupeHash: makeDedupeHash({
        authorId: systemUser._id.toString(),
        titulo: v.titulo,
        lugar,
        resumen: v.resumen,
        contenido: v.contenido,
      }),
      fecha: now,
      descripcion: v.contenido, // legacy por si tu UI usa "descripcion"
    };
  });

  // ✅ Asegura creación de índices antes de insertar
  await Viaje.createIndexes();

  // ✅ Inserta tolerando duplicados puntuales (no detiene todo el batch)
  const inserted = await Viaje.insertMany(viajesSeed, { ordered: false });
  console.log("✅ Seed insertado:", inserted.length);

  await mongoose.disconnect();
  console.log("✅ Listo");
}

main().catch((e) => {
  console.error("❌ Seed error:", e);
  process.exit(1);
});