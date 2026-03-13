import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/lib/context/AuthContext";

type UserItem = {
  _id: string;
  username: string;
  email: string;
  role?: "user" | "admin";
};

type Viaje = {
  _id: string;
  titulo: string;
  lugar?: string;
  resumen?: string;
  contenido?: string;
  descripcion?: string;
  slug: string;
  fotoUrl?: string;
  fecha: string;
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

export default function PanelAdminScreen() {
  const router = useRouter();
  const { apiBase, token, isAdmin, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [viajes, setViajes] = useState<Viaje[]>([]);

  const loadAll = useCallback(async () => {
    const [usersResp, viajesResp] = await Promise.all([
      fetch(`${apiBase}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${apiBase}/viajes`),
    ]);

    if (!usersResp.ok) throw new Error(await readApiError(usersResp));
    if (!viajesResp.ok) throw new Error(await readApiError(viajesResp));

    const [usersData, viajesData] = await Promise.all([usersResp.json(), viajesResp.json()]);
    setUsers(usersData);
    setViajes(viajesData);
  }, [apiBase, token]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      (async () => {
        try {
          setLoading(true);
          await loadAll();
        } catch (e: any) {
          if (alive) Alert.alert("Error", String(e.message || e));
        } finally {
          if (alive) setLoading(false);
        }
      })();

      return () => {
        alive = false;
      };
    }, [loadAll])
  );

  async function onRefresh() {
    try {
      setRefreshing(true);
      await loadAll();
    } catch (e: any) {
      Alert.alert("Error", String(e.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  async function removeUser(target: UserItem) {
    Alert.alert("Borrar usuario", `¿Seguro que quieres borrar a ${target.username}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          try {
            const resp = await fetch(`${apiBase}/admin/users/${target._id}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (!resp.ok) throw new Error(await readApiError(resp));

            await loadAll();
            Alert.alert("Listo", "Usuario borrado");
          } catch (e: any) {
            Alert.alert("Error", String(e.message || e));
          }
        },
      },
    ]);
  }

  async function removeViaje(v: Viaje) {
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

            if (!resp.ok) throw new Error(await readApiError(resp));

            await loadAll();
            Alert.alert("Listo", "Publicación borrada");
          } catch (e: any) {
            Alert.alert("Error", String(e.message || e));
          }
        },
      },
    ]);
  }

  if (!isAdmin) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Panel admin</ThemedText>
        <ThemedText>No tienes permisos para entrar aquí.</ThemedText>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ gap: 14, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ThemedText type="title">Panel admin</ThemedText>
        <ThemedText style={{ opacity: 0.7 }}>
          Moderación de publicaciones y usuarios
        </ThemedText>

        <ThemedText type="subtitle">Usuarios</ThemedText>

        {users.map((u) => {
          const isMe = u._id === user?._id;

          return (
            <View key={u._id} style={styles.card}>
              <ThemedText style={styles.cardTitle}>@{u.username}</ThemedText>
              <ThemedText style={styles.meta}>
                {u.email} · rol: {u.role || "user"}
              </ThemedText>

              {!isMe ? (
                <View style={{ marginTop: 10 }}>
                  <ActionButton title="Borrar usuario" variant="danger" onPress={() => removeUser(u)} />
                </View>
              ) : (
                <View style={{ marginTop: 10 }}>
                  <ActionButton title="Tu cuenta" variant="ghost" onPress={() => {}} />
                </View>
              )}
            </View>
          );
        })}

        <ThemedText type="subtitle" style={{ marginTop: 6 }}>
          Publicaciones
        </ThemedText>

        {viajes.map((v) => (
          <View key={v._id} style={styles.card}>
            <ThemedText style={styles.cardTitle}>{v.titulo}</ThemedText>
            <ThemedText style={styles.meta}>
              {v.lugar ? `${v.lugar} · ` : ""}
              {new Date(v.fecha).toLocaleDateString()} · autor: {v.author?.username || "—"}
            </ThemedText>

            <ThemedText numberOfLines={3} style={{ opacity: 0.85, marginTop: 8 }}>
              {v.resumen || v.descripcion || v.contenido || ""}
            </ThemedText>

            <View style={styles.actions}>
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
              <ActionButton title="Borrar" variant="danger" onPress={() => removeViaje(v)} />
            </View>
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  meta: {
    opacity: 0.7,
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
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