import fs from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const httpsCertDir = path.resolve(import.meta.dirname, ".certs")

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
    https: {
      key: fs.readFileSync(path.join(httpsCertDir, "localhost+lan-key.pem")),
      cert: fs.readFileSync(path.join(httpsCertDir, "localhost+lan.pem")),
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
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
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
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
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
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
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
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
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
})
