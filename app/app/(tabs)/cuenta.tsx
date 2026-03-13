import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/lib/context/AuthContext";
import { DEFAULT_API_BASE } from "@/lib/config";

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

export default function Cuenta() {
  const router = useRouter();
  const { apiBase, setApiBase, isAuthed, isAdmin, user, login, register, logout } = useAuth();

  const [base, setBase] = useState(apiBase);
  const [mode, setMode] = useState<"login" | "register">("login");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function testHealth() {
    try {
      const url = `${apiBase}/health`;
      const r = await fetch(url);
      const txt = await r.text();
      Alert.alert("Health", `URL: ${url}\nStatus: ${r.status}\n\n${txt}`);
    } catch (e: any) {
      Alert.alert("Health (falló)", `API Base actual: ${apiBase}\n\n${String(e.message || e)}`);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Cuenta</ThemedText>

      <ThemedText style={styles.label}>API Base (si cambias de IP)</ThemedText>
      <TextInput
        value={base}
        onChangeText={setBase}
        style={styles.input}
        autoCapitalize="none"
        placeholder="http://192.168.1.26:3000"
      />

      <View style={styles.row}>
        <ActionButton
          title="Guardar API Base"
          onPress={async () => {
            try {
              await setApiBase(base);
              Alert.alert("Listo", "API base guardada");
            } catch (e: any) {
              Alert.alert("Error", String(e.message || e));
            }
          }}
        />
        <ActionButton title="Probar /health" variant="ghost" onPress={testHealth} />
      </View>

      <ActionButton
        title="Restablecer a DEFAULT"
        variant="ghost"
        onPress={async () => {
          await setApiBase(DEFAULT_API_BASE);
          setBase(DEFAULT_API_BASE);
          Alert.alert("Listo", `API base = ${DEFAULT_API_BASE}`);
        }}
      />

      <View style={{ height: 16 }} />

      {isAuthed ? (
        <>
          <ThemedText type="subtitle">@{user?.username}</ThemedText>
          <ThemedText style={styles.roleText}>
            Rol: {isAdmin ? "admin" : user?.role || "user"}
          </ThemedText>

          <ActionButton title="Crear nuevo viaje" onPress={() => router.push("/nuevo-viaje")} />

          {isAdmin ? (
            <>
              <View style={{ height: 10 }} />
              <ActionButton title="Abrir panel admin" onPress={() => router.push("/panel-admin")} />
            </>
          ) : null}

          <View style={{ height: 10 }} />
          <ActionButton title="Salir" variant="danger" onPress={logout} />
        </>
      ) : (
        <>
          <View style={styles.row}>
            <ActionButton title="Login" onPress={() => setMode("login")} />
            <ActionButton title="Registro" variant="ghost" onPress={() => setMode("register")} />
          </View>

          {mode === "register" ? (
            <>
              <ThemedText style={styles.label}>Username</ThemedText>
              <TextInput value={username} onChangeText={setUsername} style={styles.input} />
            </>
          ) : null}

          <ThemedText style={styles.label}>Email</ThemedText>
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            autoCapitalize="none"
          />

          <ThemedText style={styles.label}>Password</ThemedText>
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry
          />

          <ActionButton
            title={mode === "login" ? "Entrar" : "Crear cuenta"}
            onPress={async () => {
              try {
                if (mode === "login") await login(email, password);
                else await register(username, email, password);
                Alert.alert("Listo", "Sesión iniciada");
              } catch (e: any) {
                Alert.alert("Error", String(e.message || e));
              }
            }}
          />
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  label: { opacity: 0.7 },
  roleText: { opacity: 0.8, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 12, padding: 12 },
  row: { flexDirection: "row", gap: 10, justifyContent: "space-between" },
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