import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/lib/context/AuthContext";

type Viaje = {
  _id: string;
  titulo: string;
  resumen?: string;
  contenido?: string;
  descripcion?: string;
  lugar?: string;
  fecha: string;
  slug: string;
  fotoUrl?: string;
  author?: { _id?: string; username?: string };
};

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

function ActionButton({
  title,
  onPress,
  variant = "solid",
  disabled = false,
}: {
  title: string;
  onPress: () => void | Promise<void>;
  variant?: "solid" | "ghost" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        variant === "solid" && styles.btnSolid,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        disabled && styles.btnDisabled,
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <ThemedText
        style={[
          styles.btnText,
          variant === "ghost" ? styles.btnGhostText : styles.btnSolidText,
        ]}
      >
        {title}
      </ThemedText>
    </Pressable>
  );
}

export default function EditarViajeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { apiBase, token, user, isAdmin, isAuthed } = useAuth();

  const slug = useMemo(() => {
    const raw = (params as any)?.slug;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [v, setV] = useState<Viaje | null>(null);
  const [titulo, setTitulo] = useState("");
  const [lugar, setLugar] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function elegirFoto() {
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
  }

  async function load() {
    if (!slug) return;

    const resp = await fetch(`${apiBase}/viajes/slug/${slug}`);
    if (!resp.ok) throw new Error(await readApiError(resp));

    const data: Viaje = await resp.json();
    setV(data);
    setTitulo(data.titulo || "");
    setLugar(data.lugar || "");
    setDescripcion(data.contenido || data.descripcion || "");
  }

  useEffect(() => {
    if (!isAuthed) {
      router.replace("/(tabs)/cuenta");
      return;
    }

    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e: any) {
        Alert.alert("Error", String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, apiBase, isAuthed]);

  const isOwner = !!v?.author?._id && !!user?._id && v.author._id === user._id;
  const canManage = isAuthed && (isAdmin || isOwner);

  async function guardar() {
    if (!v?._id) return;

    const cleanTitulo = titulo.trim();
    const cleanLugar = lugar.trim();
    const cleanDesc = descripcion.trim();

    if (!cleanTitulo || !cleanLugar || !cleanDesc) {
      return Alert.alert("Falta info", "Escribe título, lugar y descripción.");
    }

    try {
      setSaving(true);

      const form = new FormData();
      form.append("titulo", cleanTitulo);
      form.append("lugar", cleanLugar);
      form.append("descripcion", cleanDesc);

      if (fotoUri) {
        form.append("foto", { uri: fotoUri, name: "foto.jpg", type: "image/jpeg" } as any);
      }

      const resp = await fetch(`${apiBase}/viajes/${v._id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      if (!resp.ok) {
        throw new Error(await readApiError(resp));
      }

      const data = await resp.json();
      Alert.alert("Listo", "Cambios guardados");
      router.replace({
        pathname: "/(tabs)/viajes/[slug]",
        params: { slug: data.slug },
      });
    } catch (e: any) {
      Alert.alert("Error", String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { justifyContent: "center" }]}>
        <ThemedText>Cargando…</ThemedText>
      </ThemedView>
    );
  }

  if (!v) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>No encontrado.</ThemedText>
      </ThemedView>
    );
  }

  if (!canManage) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>No tienes permisos para editar esta publicación.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Editar viaje</ThemedText>
      <ThemedText style={{ opacity: 0.7 }}>Editando: {v.titulo}</ThemedText>

      <TextInput value={titulo} onChangeText={setTitulo} placeholder="Título" style={styles.input} />
      <TextInput value={lugar} onChangeText={setLugar} placeholder="Lugar" style={styles.input} />

      <TextInput
        value={descripcion}
        onChangeText={setDescripcion}
        placeholder="Descripción"
        multiline
        style={[styles.input, { height: 180, textAlignVertical: "top" }]}
      />

      {!!v.fotoUrl && !fotoUri ? (
        <Image source={{ uri: v.fotoUrl }} style={styles.preview} contentFit="cover" />
      ) : null}

      {!!fotoUri ? <Image source={{ uri: fotoUri }} style={styles.preview} contentFit="cover" /> : null}

      <ActionButton title="Elegir foto (opcional)" variant="ghost" onPress={elegirFoto} />
      <View style={{ height: 6 }} />
      <ActionButton title={saving ? "Guardando..." : "Guardar cambios"} onPress={guardar} disabled={saving} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12 },
  preview: { width: "100%", height: 220, borderRadius: 12 },
  btn: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSolid: {
    backgroundColor: "#111111",
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: "#111111",
    backgroundColor: "transparent",
  },
  btnDanger: {
    backgroundColor: "#111111",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontWeight: "700",
  },
  btnSolidText: {
    color: "#FFFFFF",
  },
  btnGhostText: {
    color: "#111111",
  },
});