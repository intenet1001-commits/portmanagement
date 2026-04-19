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
  build: {
    outDir: 'dist-portal',
    rollupOptions: {
      input: { index: 'portal.html', setup: 'setup.html' },
    },
  },
  optimizeDeps: {
    include: ['lucide-react', '@supabase/supabase-js', '@supabase/realtime-js'],
  },
});
