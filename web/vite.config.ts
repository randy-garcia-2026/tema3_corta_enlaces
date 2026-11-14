import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const API = process.env["VITE_API_URL"] ?? "http://localhost:3000";

export default defineConfig({
  base: "/app/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
  server: {
    port: 5173,
    // Mismo origen que la API en desarrollo: no hace falta CORS.
    proxy: {
      "/auth": API,
      "/urls": API,
      "/dashboard": API,
      "/health": API,
    },
  },
});
