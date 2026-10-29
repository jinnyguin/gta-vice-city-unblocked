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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,data,wasm,js.metadata}'],
        maximumFileSizeToCacheInBytes: 500 * 1024 * 1024, 
        dontCacheBustURLsMatching: new RegExp('.*'),
      },
      manifest: {
        name: 'GTA Vice City',
        short_name: 'GTAVC',
        description: 'Playable offline at school',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './index.html',
        icons: [] 
      }
    })
  ]
});
