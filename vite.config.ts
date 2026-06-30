
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'react': path.resolve(process.cwd(), 'node_modules/react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
      '@': path.resolve(process.cwd(), './')
    },
    dedupe: [
      'react',
      'react-dom',
      '@firebase/app',
      'firebase',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage'
    ]
  },
  optimizeDeps: {
    include: ['recharts', 'react', 'react-dom']
  },
  server: {
    port: 3000,
    host: true, // Listen on all network interfaces
    strictPort: true, // Fail if port 3000 is taken, instead of trying another
    open: true,
    cors: true,
    hmr: { 
      protocol: 'wss', 
      clientPort: 443 
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
