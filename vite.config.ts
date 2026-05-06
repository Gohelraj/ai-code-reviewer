import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: {
      // Proxies /api/gitlab/... → https://gitlab.com/...
      // Needed because GitLab does not send Access-Control-Allow-Origin: * headers.
      '/api/gitlab': {
        target: 'https://gitlab.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gitlab/, ''),
      },
    },
  }
});