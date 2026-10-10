import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, projectRoot, "");
  const apiPort = Number(process.env.PORT || fileEnv.PORT) || 3000;

  return {
    root: __dirname,
    server: {
      port: 5174,
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          bypass(req) {
            const pathname = (req.url ?? "").split("?")[0];
            if (pathname.startsWith("/api/") && pathname.endsWith(".js")) return req.url;
          }
        }
      }
    }
  };
});
