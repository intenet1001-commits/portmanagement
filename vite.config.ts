import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    mainFields: ['module', 'browser', 'main'],
    alias: {
      'lucide-react': path.resolve('node_modules/lucide-react/dist/cjs/lucide-react.js'),
    },
  },
  optimizeDeps: {
    include: ['lucide-react', '@supabase/supabase-js', '@supabase/realtime-js'],
  },
  server: {
    port: 9000,
    watch: {
      ignored: ['**/src-tauri/**', '**/dist/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
