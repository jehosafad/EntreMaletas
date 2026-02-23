import React, { useState } from "react";
import { Alert, Button, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/lib/context/AuthContext";
import { DEFAULT_API_BASE } from "@/lib/config";

export default function Cuenta() {
  const router = useRouter();
  const { apiBase, setApiBase, isAuthed, user, login, register, logout } = useAuth();

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
        <Button
          title="Guardar API Base"
          onPress={async () => {
            try {
              await setApiBase(base);
              Alert.alert("Listo", "API base guardada ✅");
            } catch (e: any) {
              Alert.alert("Error", String(e.message || e));
            }
          }}
        />
        <Button title="Probar /health" onPress={testHealth} />
      </View>

      <Button
        title="Restablecer a DEFAULT"
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
          <Button title="Crear nuevo viaje" onPress={() => router.push("/nuevo-viaje")} />
          <View style={{ height: 10 }} />
          <Button title="Salir" onPress={logout} />
        </>
      ) : (
        <>
          <View style={styles.row}>
            <Button title="Login" onPress={() => setMode("login")} />
            <Button title="Registro" onPress={() => setMode("register")} />
          </View>

          {mode === "register" ? (
            <>
              <ThemedText style={styles.label}>Username</ThemedText>
              <TextInput value={username} onChangeText={setUsername} style={styles.input} />
            </>
          ) : null}

          <ThemedText style={styles.label}>Email</ThemedText>
          <TextInput value={email} onChangeText={setEmail} style={styles.input} autoCapitalize="none" />

          <ThemedText style={styles.label}>Password</ThemedText>
          <TextInput value={password} onChangeText={setPassword} style={styles.input} secureTextEntry />

          <Button
            title={mode === "login" ? "Entrar" : "Crear cuenta"}
            onPress={async () => {
              try {
                if (mode === "login") await login(email, password);
                else await register(username, email, password);
                Alert.alert("Listo", "Sesión iniciada ✅");
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
  input: { borderWidth: 1, borderRadius: 10, padding: 12 },
  row: { flexDirection: "row", gap: 10, justifyContent: "space-between" },
});