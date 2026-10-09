import fs from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const bundleDiagnostics = {
  name: "temporary-bundle-diagnostics",
  apply: "build" as const,
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== "chunk" || !output.isEntry || output.code.length < 500_000) {
        continue
      }
      const largestModules = Object.entries(output.modules)
        .sort(([, a], [, b]) => b.renderedLength - a.renderedLength)
        .slice(0, 30)
        .map(([id, info]) => ({
          module: path.relative(import.meta.dirname, id).replaceAll("\\", "/"),
          renderedBytes: info.renderedLength,
          originalBytes: info.originalLength,
        }))
      console.log("[bundle-diagnostics] large entry modules:")
      console.log(JSON.stringify(largestModules, null, 2))
    }
  },
}

const httpsCertDir = path.resolve(import.meta.dirname, ".certs")
const httpsKeyPath = path.join(httpsCertDir, "localhost+lan-key.pem")
const httpsCertPath = path.join(httpsCertDir, "localhost+lan.pem")
const httpsOptions =
  fs.existsSync(httpsKeyPath) && fs.existsSync(httpsCertPath)
    ? {
        key: fs.readFileSync(httpsKeyPath),
        cert: fs.readFileSync(httpsCertPath),
      }
    : undefined

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: "../backend/app/frontend",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: true,
    https: httpsOptions,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    bundleDiagnostics,
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["assets/images/favicon.png"],
      manifest: {
        name: "Event Attendance Tracker",
        short_name: "Attendance",
        description: "Event attendance tracking with offline-capable scanner",
        theme_color: "#3b82f6",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "assets/images/favicon.png",
            sizes: "144x144",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        importScripts: ["sw-sync.js"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\/v1\/attendance\/scan/,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*\/api\/v1\/events/,
            handler: "NetworkFirst",
            options: {
              cacheName: "events-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/.*\/api\/v1\/students/,
            handler: "NetworkFirst",
            options: {
              cacheName: "students-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/.*\/api\/v1\/attendee-credentials/,
            handler: "NetworkFirst",
            options: {
              cacheName: "credentials-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "assets-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
        type: "module",
      },
    }),
  ],
})
