import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the API server runs on :3000 (npm run dev:server in the root folder)
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
