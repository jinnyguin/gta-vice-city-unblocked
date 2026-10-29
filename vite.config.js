import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: './',
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'My Offline Game',
        short_name: 'OfflineGame',
        description: 'Playable offline at school',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './index.html',
        icons: [] // Emptied out so you don't need asset images
      }
    })
  ]
});
