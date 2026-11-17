// Hands the entry in (Node 22, standard library only, no network): copies app/ and screenshots/ into
// MAKEFUN_OUTPUT_DIR (default /output) and writes dossier.json there with the kit's own dossier library, under the
// scorer's caps. Two runs over the same tree write the same bytes.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SHOT_MAX_BYTES = 256 * 1024;

function stop(why: string): never {
  console.error(`main.ts: ${why}`);
  process.exit(1);
}

// Say plainly, before anything is copied, what buildDossier or the gate would refuse later.
const app = join(repo, 'app');
if (!existsSync(join(app, 'index.html'))) stop('app/index.html is missing: the frontend opens there.');
for (const name of readdirSync(app, { recursive: true }) as string[]) {
  if (lstatSync(join(app, name)).isSymbolicLink()) stop(`app/${name} is a symbolic link: app/ must hold plain files only.`);
}
const shotDir = join(repo, 'screenshots');
const shots = existsSync(shotDir) ? readdirSync(shotDir).filter((f) => !f.startsWith('.') && /\.(jpe?g|png)$/i.test(f)).sort() : [];
if (shots.length != 3) stop(`screenshots/ must hold exactly 3 JPEG or PNG images; it holds ${shots.length}.`);
for (const f of shots) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(f)) stop(`screenshots/${f}: use letters, digits and . _ - only.`);
  const bytes = statSync(join(shotDir, f)).size;
  if (bytes > SHOT_MAX_BYTES) stop(`screenshots/${f} is ${bytes} bytes, over the 256 KiB cap.`);
}

mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(app, join(out, 'app'), { recursive: true });
for (const f of shots) cpSync(join(shotDir, f), join(out, 'screenshots', f));

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: SHOT_MAX_BYTES },
  app_max_files: 993,
  app_max_bytes: 16 * 1024 * 1024,
});
writeFileSync(join(out, 'dossier.json'), dossier);

const totals = /Totals: ([^\n]*)/.exec(Buffer.from(dossier).toString('utf8').replace(/\\n/g, '\n'))?.[1] ?? '';
console.log(`main.ts: wrote ${join(out, 'dossier.json')} (${dossier.length} bytes); cover ${shots[0]}; ${totals}`);
