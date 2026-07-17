import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export default defineConfig({
  base: env?.VITE_BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
});
