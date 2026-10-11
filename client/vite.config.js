import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        bypass(req) {
          const pathname = (req.url ?? "").split("?")[0];
          if (pathname.startsWith("/api/") && pathname.endsWith(".js")) return req.url;
        }
      }
    }
  }
});
