#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Zero-dependency sanity checks for the extension package.
 * Run with: npm run check
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const problems = [];
const checked = new Set();

function fail(message) {
  problems.push(message);
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function checkFile(relativePath) {
  if (!relativePath || checked.has(relativePath)) return;
  checked.add(relativePath);

  if (!fileExists(relativePath)) {
    fail(`Missing file referenced by manifest: ${relativePath}`);
    return;
  }

  if (relativePath.endsWith('.js')) {
    try {
      execFileSync(process.execPath, ['--check', path.join(root, relativePath)], {
        stdio: 'pipe'
      });
    } catch (error) {
      fail(`Syntax error in ${relativePath}:\n${error.stderr}`);
    }
  }
}

let manifest;

try {
  manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
} catch (error) {
  console.error('manifest.json is not valid JSON:', error.message);
  process.exit(1);
}

if (manifest.manifest_version !== 3) {
  fail('manifest_version must be 3');
}

if (!/^\d+(\.\d+){0,3}$/.test(manifest.version || '')) {
  fail(`Invalid version: ${manifest.version}`);
}

if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version !== manifest.version) {
  fail('package.json version does not match manifest.json');
}

if (manifest.version_name && !String(manifest.version_name).startsWith(manifest.version)) {
  fail(`version_name (${manifest.version_name}) does not match version (${manifest.version})`);
}

for (const legal of ['LICENSE', 'NOTICE']) {
  if (!fileExists(legal)) fail(`Missing ${legal} file`);
}

// Chrome Web Store listing constraints.
if ((manifest.name || '').length > 45) {
  fail(`name is ${(manifest.name || '').length} chars; the Chrome Web Store allows 45`);
}
if ((manifest.short_name || '').length > 12) {
  fail(`short_name is ${(manifest.short_name || '').length} chars; Chrome truncates over 12`);
}
if ((manifest.description || '').length > 132) {
  fail(`description is ${(manifest.description || '').length} chars; the Chrome Web Store allows 132`);
}
if (!manifest.icons || !manifest.icons['128']) {
  fail('manifest.icons must include a 128x128 icon (required by the Chrome Web Store)');
}

for (const icon of Object.values(manifest.icons || {})) checkFile(icon);
for (const icon of Object.values(manifest.action?.default_icon || {})) checkFile(icon);
checkFile(manifest.action?.default_popup);
checkFile(manifest.background?.service_worker);

for (const entry of manifest.content_scripts || []) {
  for (const file of [...(entry.js || []), ...(entry.css || [])]) checkFile(file);
  if (!entry.matches || entry.matches.length === 0) {
    fail('content_scripts entry has no matches');
  }
}

for (const entry of manifest.web_accessible_resources || []) {
  for (const file of entry.resources || []) checkFile(file);
}

for (const page of [manifest.action?.default_popup]) {
  if (!page) continue;

  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const base = path.dirname(page);

  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) {
    fail(`${page} contains an inline <script>, which Manifest V3 blocks.`);
  }

  for (const match of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
    const target = path.posix.normalize(path.posix.join(base, match[1]));
    if (target.startsWith('..')) continue;
    checkFile(target);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) found:\n`);
  for (const problem of problems) console.error(` - ${problem}\n`);
  process.exit(1);
}

console.log(`OK — ${checked.size} files verified, manifest v${manifest.version} is packaged correctly.`);
