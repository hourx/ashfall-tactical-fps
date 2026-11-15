// Ashfall — the entry program for make.fun's three.js tactical FPS bounty.
//
// The game itself is game/: plain static files the browser loads as ES modules, with
// three.js 0.187.0 vendored beside them and mapped by index.html's import map. Nothing
// under game/ fetches anything at runtime; there is no build step and no package install.
//
// This program does the two things the bounty asks of an entrypoint:
//   1. copy game/ and screenshots/ to the output directory, so the hand-in is exactly the
//      files that were played in the browser;
//   2. write dossier.json, the summary the judge reads, with the kit's buildDossier.
//
// The grader mounts the repository read-only at /bot and gives a writable /output. Run
// the same program by hand with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });

// The game first: it is the whole entry, and the judge's Game block is read from it. The
// copy is replaced rather than merged, so a stale file from an earlier run cannot slip in.
const gameDir = join(out, 'game');
rmSync(gameDir, { recursive: true, force: true });
cpSync(join(root, 'game'), gameDir, { recursive: true });

// Then the screenshots. They are real renders of game/index.html in Chrome, captured by
// tools/capture.mjs; they are replaced too, so the cover is always the current game.
const shotDir = join(out, 'screenshots');
rmSync(shotDir, { recursive: true, force: true });
mkdirSync(shotDir, { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), shotDir, { recursive: true });
}

// These limits are the scorer's own (gate.json): the dossier text is cut at 160 KiB, and
// an entry is refused above four screenshots, 256 KiB each, 993 files in game/, or 48 MiB
// of game files in all. Keeping buildDossier's numbers in step with them means the file
// written here is the file the gate rebuilds and compares byte for byte.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
