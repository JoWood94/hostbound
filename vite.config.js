import { defineConfig } from 'vite';

export default defineConfig({
  base: '/hostbound/',
  build: { target: 'es2020', sourcemap: false },
});
