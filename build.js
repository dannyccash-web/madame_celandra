#!/usr/bin/env node
// Copies web source files into www/ for Capacitor to bundle into the native app.
// Cloudflare Pages continues to serve from the project root — this only affects native builds.

const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const DEST = path.join(__dirname, "www");

// Files and folders to copy into www/
const ITEMS = [
  "index.html",
  "styles.css",
  "game.js",
  "cards.js",
  "sw.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "madame_celandra_question_background.webp",
  "madame_celandra_select_background.webp",
  "madame_celandra_start_background.webp",
  "madame_celandra_table.webp",
  "madame_celandre.webp",
  "madame_celandre_logo.webp",
  "oracles_spell_compressed.mp3",
  "fonts",
  "tarot card illustrations",
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Clean and recreate www/
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
let skipped = 0;

for (const item of ITEMS) {
  const src = path.join(SRC, item);
  const dest = path.join(DEST, item);
  if (fs.existsSync(src)) {
    copyRecursive(src, dest);
    copied++;
    console.log(`  ✓ ${item}`);
  } else {
    skipped++;
    console.warn(`  ⚠ skipped (not found): ${item}`);
  }
}

console.log(`\nBuild complete → www/ (${copied} items copied, ${skipped} skipped)`);
