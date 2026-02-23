export const API_BASE =
  import.meta.env.VITE_API_BASE?.trim() ||
  `http://${window.location.hostname}:3000`;
