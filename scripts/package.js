#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Build a store-ready extension zip in `dist/`.
 *
 * Zero dependencies: the ZIP container is written directly (deflate via
 * node:zlib), so the script works on any machine with Node 18+ and needs
 * no `zip` binary and no npm install.
 *
 * The package contains only what a browser store needs:
 *   manifest.json, src/** (runtime code + icons), LICENSE, NOTICE, PRIVACY.md,
 *   README.md
 * Repo-only files (scripts/, package.json, .github/) are never shipped.
 *
 * Run with: npm run package   (validates first, then builds)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;
const outDir = path.join(root, 'dist');
const outPath = path.join(outDir, `google-photos-remover-${version}.zip`);

/* ------------------------------------------------------------------ *
 * Package contents
 * ------------------------------------------------------------------ */

function listFilesRecursive(relativeDir) {
  const results = [];
  for (const entry of fs.readdirSync(path.join(root, relativeDir), { withFileTypes: true })) {
    const rel = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) results.push(...listFilesRecursive(rel));
    else if (entry.isFile()) results.push(rel);
  }
  return results;
}

function collectFiles() {
  const files = new Set(['manifest.json', 'LICENSE', 'NOTICE', 'PRIVACY.md', 'README.md']);
  for (const rel of listFilesRecursive('src')) files.add(rel);

  // Anything the manifest points at must be present (double-check beyond
  // scripts/check.js so a hand-edited manifest cannot silently drift).
  const referenced = [
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    manifest.action?.default_popup,
    manifest.background?.service_worker,
    ...((manifest.content_scripts || []).flatMap((e) => [...(e.js || []), ...(e.css || [])]))
  ].filter(Boolean);

  for (const rel of referenced) {
    if (!files.has(rel)) throw new Error(`manifest references ${rel}, which is not in src/ or the root package set`);
  }

  return [...files].sort();
}

/* ------------------------------------------------------------------ *
 * Minimal ZIP writer (local headers + central directory + EOCD)
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed DOS timestamp so repeated builds of the same tree produce
// byte-identical zips (2026-01-01 00:00:00).
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const VERSION_MADE_BY = (3 << 8) | 20; // unix + zip 2.0
const VERSION_NEEDED = 20;
const FLAGS = 0x0800; // UTF-8 filenames

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const raw = entry.data;
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const payload = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAGS, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAGS, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: -rw-r--r--
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const files = collectFiles();
const entries = files.map((name) => ({
  name,
  data: fs.readFileSync(path.join(root, name))
}));

fs.mkdirSync(outDir, { recursive: true });
const zip = buildZip(entries);
fs.writeFileSync(outPath, zip);

const totalUncompressed = entries.reduce((n, e) => n + e.data.length, 0);
console.log(`Built ${path.relative(root, outPath)}`);
console.log(`  ${entries.length} files, ${totalUncompressed} bytes raw → ${zip.length} bytes zip`);
for (const name of files) console.log(`  + ${name}`);
console.log('\nReady to upload to the Chrome Web Store Developer Dashboard (or Edge Add-ons).');
