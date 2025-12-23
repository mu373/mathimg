import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for macOS app bundle
  build: {
    outDir: 'dist',
    // Embed all assets inline for bundling into macOS app
    assetsInlineLimit: 100000000, // 100MB - inline everything
    rollupOptions: {
      output: {
        // Single bundle file for easy embedding
        manualChunks: undefined,
        // Flat structure for macOS bundle Resources folder
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]',
      },
    },
  },
  server: {
    port: 5173,
  },
});
