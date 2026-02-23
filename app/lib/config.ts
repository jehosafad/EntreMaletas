export const ENV_API_BASE = (process.env.EXPO_PUBLIC_API_BASE || "").trim().replace(/\/$/, "");

// En físico (Expo Go / dev build), usa tu IP local del PC.
// Ej: EXPO_PUBLIC_API_BASE=http://192.168.1.26:3000
export const DEFAULT_API_BASE = ENV_API_BASE || "http://192.168.1.26:3000";