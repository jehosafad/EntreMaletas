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
  author?: { username?: string };
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

export default function ViajeDetalleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { apiBase } = useAuth();

  // expo-router puede dar params como string | string[]
  const slug = useMemo(() => {
    const raw = (params as any)?.slug;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [v, setV] = useState<Viaje | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    (async () => {
      try {
        setLoading(true);

        const resp = await fetch(`${apiBase}/viajes/slug/${slug}`);
        if (!resp.ok) {
          const msg = await readApiError(resp);
          throw new Error(msg || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        setV(data);
      } catch (e: any) {
        Alert.alert("Error", String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [apiBase, slug]);

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

        {!!v.fotoUrl && (
          <Image source={{ uri: v.fotoUrl }} style={styles.hero} contentFit="cover" />
        )}

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
});