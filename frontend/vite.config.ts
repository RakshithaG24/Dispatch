import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs on :4000. Proxying keeps the browser on a single
// origin, so the session cookie works without any CORS configuration.
const api = process.env.VITE_API_PROXY ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": api, "/admin": api },
  },
});
