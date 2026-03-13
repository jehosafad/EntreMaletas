import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
}: {
  title: string;
  onPress: () => void | Promise<void>;
  variant?: "solid" | "ghost" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        variant === "solid" && styles.btnSolid,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        pressed && { opacity: 0.9 },
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

export default function ViajeDetalleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { apiBase, token, user, isAuthed, isAdmin } = useAuth();

  const slug = useMemo(() => {
    const raw = (params as any)?.slug;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [v, setV] = useState<Viaje | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!slug) return;
    const resp = await fetch(`${apiBase}/viajes/slug/${slug}`);
    if (!resp.ok) {
      const msg = await readApiError(resp);
      throw new Error(msg || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    setV(data);
  }

  useEffect(() => {
    if (!slug) return;

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
  }, [apiBase, slug]);

  const isOwner = !!v?.author?._id && !!user?._id && v.author._id === user._id;
  const canManage = isAuthed && (isAdmin || isOwner);

  async function handleDelete() {
    if (!v?._id) return;

    Alert.alert("Borrar publicación", `¿Seguro que quieres borrar "${v.titulo}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          try {
            const resp = await fetch(`${apiBase}/viajes/${v._id}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (!resp.ok) {
              const msg = await readApiError(resp);
              throw new Error(msg || `HTTP ${resp.status}`);
            }

            Alert.alert("Listo", "Publicación borrada");
            router.replace("/(tabs)");
          } catch (e: any) {
            Alert.alert("Error", String(e.message || e));
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!v) {
    return (
      <ThemedView style={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <ThemedText style={{ opacity: 0.75 }}>← Volver</ThemedText>
        </Pressable>
        <ThemedText>No encontrado.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <ThemedText style={{ opacity: 0.75 }}>← Volver</ThemedText>
      </Pressable>

      <ScrollView contentContainerStyle={{ paddingBottom: 18 }}>
        <ThemedText type="title">{v.titulo}</ThemedText>

        <ThemedText style={styles.meta}>
          {v.lugar ? `${v.lugar} · ` : ""}
          {new Date(v.fecha).toLocaleDateString()} · {v.author?.username || "—"}
        </ThemedText>

        {!!v.fotoUrl && <Image source={{ uri: v.fotoUrl }} style={styles.hero} contentFit="cover" />}

        {canManage ? (
          <View style={styles.actionRow}>
            <ActionButton
              title="Editar"
              variant="ghost"
              onPress={() =>
                router.push({
                  pathname: "/editar-viaje",
                  params: { slug: v.slug },
                })
              }
            />
            <ActionButton title="Borrar" variant="danger" onPress={handleDelete} />
          </View>
        ) : null}

        <View style={{ height: 10 }} />
        <ThemedText style={styles.text}>{v.contenido || v.descripcion || ""}</ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  back: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  hero: { width: "100%", height: 260, borderRadius: 16, marginTop: 12 },
  meta: { opacity: 0.65, marginTop: 6 },
  text: { lineHeight: 22, opacity: 0.9 },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  btn: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
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