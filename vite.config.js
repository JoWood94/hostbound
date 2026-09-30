import { defineConfig } from 'vite';

export default defineConfig({
  base: '/neon-overdrift/',
  build: { target: 'es2020', sourcemap: false },
});
