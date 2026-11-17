// Hands this entry in: copies app/ and screenshots/ into the output
// directory and writes the dossier there with the kit's library.
// Node 22, standard library only. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR
  ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
  : '/output';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve(root, 'app'), resolve(out, 'app'), { recursive: true });
cpSync(resolve(root, 'screenshots'), resolve(out, 'screenshots'), {
  recursive: true,
});

const dossierPath = resolve(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 3, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 16777216,
  }),
);
console.log(`wrote ${dossierPath}`);
