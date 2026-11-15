import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: { format: "es" },
  server: {
    // Pages Functions run under `wrangler pages dev` (see `bun run dev`).
    proxy: { "/api": "http://localhost:8788" },
  },
});
