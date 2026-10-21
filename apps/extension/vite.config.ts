import { defineConfig } from 'vite';

// One build per LC_TARGET (see scripts/build.mjs): rollup cannot mix ES and IIFE outputs in one run.
//   app             background.js (ES module service worker) + sidepanel.html, plus public/ copied to dist/
//   content-main    content-main.js      (IIFE, MAIN world)
//   content-isolated content-isolated.js (IIFE, isolated world)
export default defineConfig(({ mode }) => {
  const target = process.env.LC_TARGET ?? 'app';
  const define = { __E2E__: JSON.stringify(mode === 'e2e') };
  const common = { target: 'chrome116', minify: false as const, sourcemap: false };

  if (target === 'app') {
    return {
      define,
      build: {
        ...common,
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
          input: { background: 'src/background/index.ts', sidepanel: 'sidepanel.html' },
          output: {
            format: 'es' as const,
            entryFileNames: '[name].js',
            chunkFileNames: 'chunks/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash][extname]',
          },
        },
      },
    };
  }

  const entry = target === 'content-main' ? 'src/content-main.ts' : 'src/content-isolated.ts';
  return {
    define,
    publicDir: false as const,
    build: {
      ...common,
      outDir: 'dist',
      emptyOutDir: false,
      lib: { entry, name: 'LangCoach', formats: ['iife' as const], fileName: () => `${target}.js` },
    },
  };
});
