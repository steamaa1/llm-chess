import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate', manifest: { name: 'LLM 象棋', short_name: 'LLM 象棋', display: 'standalone', theme_color: '#8b1e1e', background_color: '#f7f0df' }, workbox: { mode: 'development', navigateFallbackDenylist: [/^\/api\//] } })],
  server: { host: '127.0.0.1', port: 4173, proxy: { '/api': 'http://127.0.0.1:8787' } }
});
