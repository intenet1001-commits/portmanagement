import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-portal',
    rollupOptions: {
      input: { index: 'portal.html' },
    },
  },
  optimizeDeps: {
    include: ['@supabase/supabase-js', '@supabase/realtime-js'],
  },
});
