import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/lib/context/AuthContext";

type Viaje = {
  _id: string;
  titulo: string;
  lugar?: string;
  resumen?: string;
  contenido?: string;
  descripcion?: string; // legacy
  slug: string;
  fotoUrl?: string;
  fecha: string;
  author?: { username?: string };
};

export default function FeedScreen() {
  const router = useRouter();
  const { apiBase } = useAuth();

  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const resp = await fetch(`${apiBase}/viajes`);
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    setViajes(data);
  }, [apiBase]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e: any) {
        Alert.alert(
          "Error",
          "No se pudo conectar al servidor. Revisa tu API Base en Cuenta, tu WiFi y que el backend esté encendido.\n\n" +
            String(e.message || e)
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load();
    } catch {
      // silencio
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <ThemedView style={styles.container}>
      <View style={{ gap: 6, marginBottom: 10 }}>
        <ThemedText type="title">EntreMaletas</ThemedText>
        <ThemedText style={{ opacity: 0.7 }}>
          Feed público · toca un viaje para ver el detalle
        </ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator size="large" />
      ) : viajes.length === 0 ? (
        <ThemedText>No hay viajes aún.</ThemedText>
      ) : (
        <ScrollView
          contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {viajes.map((v) => (
            <Pressable
              key={v._id}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/viajes/[slug]",
                  params: { slug: v.slug },
                })
              }
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
            >
              <Image
                source={{ uri: v.fotoUrl || undefined }}
                style={styles.cover}
                contentFit="cover"
                transition={150}
              />

              <View style={styles.cardBody}>
                <ThemedText type="subtitle">{v.titulo}</ThemedText>

                <ThemedText style={styles.meta}>
                  {v.lugar ? `${v.lugar} · ` : ""}
                  {new Date(v.fecha).toLocaleDateString()} · {v.author?.username || "—"}
                </ThemedText>

                <ThemedText numberOfLines={3} style={{ opacity: 0.85 }}>
                  {v.resumen || v.descripcion || v.contenido || ""}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  cover: { width: "100%", height: 180 },
  cardBody: { padding: 12, gap: 6 },
  meta: { opacity: 0.7, fontSize: 12 },
});