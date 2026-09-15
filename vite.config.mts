import { createRequire } from 'node:module';
import { copyFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('./', import.meta.url));
const player = new URL('./packages/player/', import.meta.url);
const core = new URL('./packages/playercore/', import.meta.url);
const coreRequire = createRequire(new URL('package.json', core));
const { version: coreVersion } = coreRequire('./package.json');

// Retain a convenient root dist artifact for static URLs and existing AQ overrides.
function mirrorPlayer(): Plugin {
  return {
    name: 'streamcanvasx-root-artifact',
    async writeBundle(_options, bundle) {
      const output = new URL('./dist/', import.meta.url);
      await mkdir(output, { recursive: true });
      for (const name of [...Object.keys(bundle), 'streamcanvasx.d.ts', 'licenses/playercore-LICENSE.txt']) {
        const temporary = new URL(`${name}.tmp`, output);
        await mkdir(new URL('./', temporary), { recursive: true });
        await copyFile(new URL(`dist/${name}`, player), temporary);
        await rename(temporary, new URL(name, output));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const playground = mode === 'playground';
  return {
    root,
    base: './',
    publicDir: playground ? false : fileURLToPath(new URL('public/', player)),
    plugins: playground ? [] : [mirrorPlayer()],
    resolve: {
      alias: {
        // The public player package keeps dist exports for npm consumers.
        '@break_happy/streamcanvasx': fileURLToPath(new URL('src/index.ts', player)),
        events: coreRequire.resolve('events/'),
      },
    },
    // The workspace core exports src/index.js directly, so edits also invalidate
    // its worker module graph without a prebuild or dependency optimizer cache.
    optimizeDeps: { exclude: ['@break_happy/streamcanvasx', '@break_happy/streamcanvasx-core'] },
    define: {
      __VERSION__: JSON.stringify(coreVersion),
      'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
    },
    worker: { format: 'iife' },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
    build: {
      target: 'esnext',
      sourcemap: mode === 'development',
      minify: mode === 'development' ? false : 'oxc',
      outDir: playground ? 'dist/playground' : 'packages/player/dist',
      emptyOutDir: true,
      lib: playground ? false : {
        entry: fileURLToPath(new URL('src/index.ts', player)),
        formats: ['es'],
        fileName: () => 'streamcanvasx.js',
      },
      rolldownOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'UNRESOLVED_IMPORT') throw new Error(warning.message);
          warn(warning);
        },
      },
    },
  };
});
