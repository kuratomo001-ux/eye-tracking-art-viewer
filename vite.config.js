import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/eye-tracking-art-viewer/",
  plugins: [react()],
});
