import React, { useEffect, useRef, useState } from "react";
import { Alert, Button, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/lib/context/AuthContext";

// Catálogo interno (sin selector UI) para asignar una foto por defecto si coincide.
// ✅ Requisito: el usuario escribe cualquier lugar (texto libre).
const SEEDS = [
  { match: ["cancun", "cancún"], value: "/seed_images/cancun.jpg" },
  { match: ["cdmx", "ciudad de mexico", "ciudad de méxico", "mexico city"], value: "/seed_images/cdmx.jpg" },
  { match: ["japon", "japón", "japan"], value: "/seed_images/japon.jpg" },
  { match: ["san miguel"], value: "/seed_images/sanmigueldeallende.jpg" },
  { match: ["teotihuacan", "teotihuacán"], value: "/seed_images/teotihuacan.jpg" },
];

function seedFotoFromLugar(lugar: string) {
  const t = String(lugar || "").toLowerCase();
  for (const s of SEEDS) {
    if (s.match.some((m) => t.includes(m))) return s.value;
  }
  return "/seed_images/cancun.jpg";
}

async function readApiError(resp: Response) {
  const ct = resp.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j: any = await resp.json();
      return j?.error || j?.message || JSON.stringify(j);
    }
    const t = await resp.text();
    try {
      const j = JSON.parse(t);
      return j?.error || j?.message || t;
    } catch {
      return t;
    }
  } catch {
    return `HTTP ${resp.status}`;
  }
}

export default function NuevoViaje() {
  const router = useRouter();
  const { apiBase, token, isAuthed } = useAuth();

  const [titulo, setTitulo] = useState("");
  const [lugar, setLugar] = useState("");
  const [resumen, setResumen] = useState("");
  const [contenido, setContenido] = useState("");
  const [fotoUri, setFotoUri] = useState<string | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState(""); // feedback visible

  // ✅ Mutex contra doble-tap en el mismo frame (antes de que React renderice disabled)
  const inFlight = useRef(false);

  // ✅ Pantalla protegida: si te deslogueas, sales al login sin reiniciar
  useEffect(() => {
    if (!isAuthed) {
      router.replace("/(tabs)/cuenta");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const elegirFoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permiso", "Necesito permiso para ver tus fotos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) setFotoUri(result.assets[0].uri);
  };

  const guardar = async () => {
    if (!isAuthed) return;

    if (inFlight.current) return; // ✅ bloqueo duro
    inFlight.current = true;

    const cleanTitulo = titulo.trim();
    const cleanLugar = lugar.trim();
    const cleanResumen = resumen.trim();
    const cleanContenido = contenido.trim();

    if (!cleanTitulo || !cleanLugar || !cleanResumen || !cleanContenido) {
      inFlight.current = false;
      return Alert.alert("Falta info", "Escribe título, lugar, resumen y contenido.");
    }

    try {
      setGuardando(true);
      setEstado("Guardando…");

      const form = new FormData();
      form.append("titulo", cleanTitulo);
      form.append("lugar", cleanLugar);
      form.append("resumen", cleanResumen);
      form.append("contenido", cleanContenido);

      if (fotoUri) {
        form.append("foto", { uri: fotoUri, name: "foto.jpg", type: "image/jpeg" } as any);
      } else {
        form.append("fotoUrl", seedFotoFromLugar(cleanLugar));
      }

      const resp = await fetch(`${apiBase}/viajes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!resp.ok) {
        const msg = await readApiError(resp);
        throw new Error(msg || `HTTP ${resp.status}`);
      }

      setEstado("Guardado ✅. Redirigiendo a Descubrir…");

      // ✅ Redirect obligatorio a Descubrir
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 650);
    } catch (e: any) {
      setEstado("");
      Alert.alert("Error al guardar", String(e.message || e));
    } finally {
      setGuardando(false);
      inFlight.current = false;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Nuevo viaje</ThemedText>

      <TextInput value={titulo} onChangeText={setTitulo} placeholder="Título" style={styles.input} />
      <TextInput value={lugar} onChangeText={setLugar} placeholder="Lugar (texto libre)" style={styles.input} />
      <TextInput value={resumen} onChangeText={setResumen} placeholder="Resumen" style={styles.input} />

      <TextInput
        value={contenido}
        onChangeText={setContenido}
        placeholder="Contenido"
        multiline
        style={[styles.input, { height: 150 }]}
      />

      <Button title="Elegir foto (opcional)" onPress={elegirFoto} disabled={guardando} />
      {!!fotoUri && <Image source={{ uri: fotoUri }} style={styles.preview} contentFit="cover" />}

      {!!estado && <ThemedText style={styles.status}>{estado}</ThemedText>}

      <View style={{ height: 10 }} />
      <Button title={guardando ? "Guardando…" : "Guardar"} onPress={guardar} disabled={guardando} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12 },
  preview: { width: "100%", height: 220, borderRadius: 10 },
  status: { opacity: 0.85, fontWeight: "700" },
});