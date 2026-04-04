/**
 * Build script for E2E test fixture extension.
 * Compiles TypeScript sources to JS and copies manifest into fixture-dist/.
 */

import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const fixtureDir = path.join(root, '__tests__/e2e/fixture');
const outDir = path.join(root, '__tests__/e2e/fixture-dist');

// Clean output dir
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Copy manifest
fs.copyFileSync(
  path.join(fixtureDir, 'manifest.json'),
  path.join(outDir, 'manifest.json'),
);

// Bundle background + content-script
await esbuild.build({
  entryPoints: {
    background: path.join(fixtureDir, 'background.ts'),
    'content-script': path.join(fixtureDir, 'content-script.ts'),
  },
  bundle: true,
  outdir: outDir,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  minify: false,
  sourcemap: true,
  // Make chrome APIs available without bundling
  external: [],
  define: {
    'process.env.NODE_ENV': '"test"',
  },
});

console.log(`✅ E2E fixture built → ${path.relative(root, outDir)}/`);
