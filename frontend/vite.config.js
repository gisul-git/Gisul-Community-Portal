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
      // CRITICAL FIX: Must match NGINX proxy port
      port: Number(env.VITE_DEV_SERVER_PORT || 8080),
      strictPort: true, 
      
      // CRITICAL: Configure for SPA routing
      // This prevents Vite from issuing redirects for routes
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
    
    // CRITICAL: Preview server must also use port 8080
    preview: {
      host: "0.0.0.0",
      port: 8080,
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