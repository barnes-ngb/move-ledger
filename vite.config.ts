import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/@firebase") || id.includes("node_modules/firebase")) {
            return "firebase";
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) {
            return "react";
          }
          // Same reason as the other two. Dexie is a dependency that does not
          // change, and left in the application chunk it doubles the bytes an
          // app update re-downloads.
          if (id.includes("node_modules/dexie")) {
            return "dexie";
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Move Ledger",
        short_name: "Boxes",
        description: "Box tracking for one household move.",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        // Firestore and Storage traffic must never be intercepted. The SDK
        // has its own offline layer and a cached response would fight it.
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [
          {
            // Photo bytes, and nothing else on that host. An uploaded photo's
            // local blob is deleted once Storage has it, so offline the only
            // copy this phone could show is the download URL, which needs the
            // network. Cached on first view, a photo seen once stays viewable
            // in a basement. Matched on `alt=media` and an image destination
            // so the SDK's own calls to the same host, the upload and the
            // metadata read behind getDownloadURL, are never answered from
            // here. Doc 04 section 9.
            urlPattern: ({ url, request }) =>
              url.hostname === "firebasestorage.googleapis.com" &&
              url.searchParams.get("alt") === "media" &&
              request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "photos",
              // An <img> from another origin is fetched without CORS, so the
              // response is opaque and reports status 0. Caching it is the
              // only way to keep it; a download URL names one object and its
              // token, so the bytes behind it never change.
              cacheableResponse: { statuses: [0, 200] },
              // Roughly a move's worth of contents photos. Browsers count an
              // opaque response at a padded size against the quota, so the
              // cache gives way rather than failing when the quota runs out.
              expiration: { maxEntries: 600, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
});
