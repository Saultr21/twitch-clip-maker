import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/files": "http://127.0.0.1:3001",
      // imágenes/audio subidos (overlays, marcas de agua, música) los sirve el backend
      "/assets": "http://127.0.0.1:3001",
    },
  },
});
