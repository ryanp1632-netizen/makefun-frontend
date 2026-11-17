// Hands the entry in (Node 22, standard library only): copies app/ and screenshots/ to MAKEFUN_OUTPUT_DIR (default
// /output) and writes dossier.json with the kit's unchanged dossier library, with the scorer's own caps.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

// Refuse early, in plain words, what buildDossier or the gate would refuse later.
if (!existsSync(join(here, 'app', 'index.html'))) fail('app/index.html is missing: the frontend opens there.');
const shots = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((f) => !f.startsWith('.') && /\.(jpe?g|png)$/i.test(f)).sort()
  : [];
if (shots.length != 3) fail(`screenshots/ must hold exactly 3 JPEG or PNG images, it holds ${shots.length}.`);
for (const f of shots) {
  const bytes = statSync(join(here, 'screenshots', f)).size;
  if (bytes > 262144) fail(`screenshots/${f} is ${bytes} bytes, over the 256 KiB cap.`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
for (const f of shots) cpSync(join(here, 'screenshots', f), join(out, 'screenshots', f));

const dossier = buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 3, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 16777216 });
writeFileSync(join(out, 'dossier.json'), dossier);

const bytes = Buffer.from(dossier);
const totals = /Totals: ([^\n]*)/.exec(bytes.toString('utf8').replace(/\\n/g, '\n'))?.[1] ?? '';
console.log(`main.ts: wrote ${join(out, 'dossier.json')} (${bytes.length} bytes), cover ${shots[0]}; ${totals}`);
