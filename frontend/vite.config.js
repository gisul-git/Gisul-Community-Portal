import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const apiPort = env.VITE_API_PORT || "8000";
  const proxyTarget =
    env.VITE_API_BASE_URL ||
    env.VITE_API_BASE ||
    env.VITE_BACKEND_URL ||
    `http://localhost:${apiPort}`;

  return {
    plugins: [react()],

    server: {
      host: env.VITE_DEV_SERVER_HOST || "0.0.0.0",

      // ✅ UPDATED: Dev server port changed from 8080 → 5173
      port: 5173,
      strictPort: true,

      // SPA routing support
      fs: {
        strict: false,
      },

      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },

    // ✅ UPDATED: Preview server port also changed
    preview: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
    },

    build: {
      target: "es2015",
      minify: "esbuild",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },

    optimizeDeps: {
      esbuildOptions: {
        target: "es2015",
      },
    },
  };
});
