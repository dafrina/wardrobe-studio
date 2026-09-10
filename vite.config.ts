import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this project beneath /wardrobe-studio/. Keep local
  // development at / while making the published asset URLs project-relative.
  base: process.env.GITHUB_ACTIONS ? '/wardrobe-studio/' : '/',
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: { target: 'es2022' },
});
