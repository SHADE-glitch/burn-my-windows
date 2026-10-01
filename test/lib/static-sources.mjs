// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — shared static-source readers for burn-my-windows@local tests.
//
// Everything here reads the repository or the already-compiled artifacts it ships.
// The GSettings probe is the only one that spawns into a GLib tool, and it refuses to
// run without GSETTINGS_BACKEND=memory: without that, `gsettings` reads the live
// dconf database, and a future edit that reaches for `gsettings set` would write to
// the user's real session from inside a unit test.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

import {ROOT, SRC, PREFS_SRC, readRepo} from './extension-slices.mjs';

export const BUNDLE = 'resources/burn-my-windows.gresource';
export const MANIFEST = 'resources/burn-my-windows.gresource.xml';
export const SCHEMA_DIR = path.join(ROOT, 'schemas');
export const MAIN_SCHEMA = 'org.gnome.shell.extensions.burn-my-windows';
export const PROFILE_SCHEMA = `${MAIN_SCHEMA}-profile`;

/** Environment for every gsettings/glib tool, pinned to the memory backend. */
export function probeEnv() {
  const env = {
    ...process.env,
    GSETTINGS_BACKEND: 'memory',
    GSETTINGS_SCHEMA_DIR: SCHEMA_DIR,
  };
  // Asserted at the point of use rather than documented in a comment, because this
  // single string is the only thing standing between this file and the user's
  // ~/.config/dconf/user.
  assert.equal(env.GSETTINGS_BACKEND, 'memory',
    'refusing to query GSettings without the memory backend');
  return env;
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

export function bundlePaths() {
  return execFileSync('gresource', ['list', path.join(ROOT, BUNDLE)],
    {encoding: 'utf8'}).trim().split('\n').sort();
}

/** Raw bytes of one bundle member, as the compiled artifact stores them. */
export function bundleExtract(resourcePath) {
  return execFileSync('gresource',
    ['extract', path.join(ROOT, BUNDLE), resourcePath],
    {encoding: 'buffer', maxBuffer: 1 << 28});
}

export const sourceBytes = (relPath) => readFileSync(path.join(ROOT, 'resources', relPath));

/** The `<file>` entries of the manifest, in manifest order. */
export function manifestPaths() {
  const xml = readFileSync(path.join(ROOT, MANIFEST), 'utf8');
  return [...xml.matchAll(/<file[^>]*>\s*([^<\s][^<]*?)\s*<\/file>/g)].map(([, p]) => p);
}

export function compiledKeys(schemaId) {
  return execFileSync('gsettings', ['list-keys', schemaId],
    {env: probeEnv(), encoding: 'utf8'}).trim().split('\n').filter(Boolean).sort();
}

/** `{key, value}` for every key of a schema, read from the compiled artifact. */
export function compiledDefaults(schemaId) {
  const out = execFileSync('gsettings', ['list-recursively', schemaId],
    {env: probeEnv(), encoding: 'utf8'});
  return out.trim().split('\n').filter(Boolean).map((line) => {
    // "<schema> <key> <value>" -- the value may contain spaces, so split only twice.
    const [, key, ...rest] = line.split(/\s+/);
    return {key, value: rest.join(' ')};
  });
}

/** `<key name="...">` of one schema source file. */
export function xmlKeys(schemaFile) {
  const xml = readFileSync(path.join(SCHEMA_DIR, schemaFile), 'utf8');
  return [...xml.matchAll(/<key\s+name="([^"]+)"/g)].map(([, name]) => name).sort();
}

/** `<default>...</default>` of one schema source file, keyed by name. */
export function xmlDefaults(schemaFile) {
  const xml = readFileSync(path.join(SCHEMA_DIR, schemaFile), 'utf8');
  const out = {};
  for (const [, name, body] of xml.matchAll(
    /<key\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/key>/g)) {
    const def = body.match(/<default>([\s\S]*?)<\/default>/);
    out[name] = def ? def[1].trim() : null;
  }
  return out;
}

// ---------------------------------------------------------------- effect registry

// `this._ALL_EFFECTS = [` occurs more than once per file: _doDisable() resets it to an
// empty array, and _ensureEffects()/fillPreferencesWindow() assign the real list. The
// literal itself cannot tell them apart, so the candidate regions are compared by
// length -- the registration list is always the longest one, and a reset that ever
// grew a member would show up as the wrong region being picked, not as a silent pass.
const sliceArray = (src, opener) => {
  const regions = [];
  for (let at = src.indexOf(opener); at !== -1; at = src.indexOf(opener, at + 1)) {
    // Start after the opener: it contains the uppercase identifier
    // `_ALL_EFFECTS` itself, which a class-name regex would otherwise harvest.
    const from = at + opener.length;
    const end = src.indexOf('];', from);
    if (end !== -1) regions.push(src.slice(from, end));
  }
  assert.ok(regions.length > 0, `effect list opener not found: ${opener}`);
  return regions.reduce((a, b) => (b.length > a.length ? b : a));
};

const EFFECTS_OPENER = 'this._ALL_EFFECTS = [';

export function effectClassesInExtension() {
  return [...sliceArray(SRC, EFFECTS_OPENER).matchAll(/new (\w+)\(\)/g)]
    .map(([, cls]) => cls).sort();
}

export function effectClassesInPrefs() {
  return [...sliceArray(PREFS_SRC, EFFECTS_OPENER).matchAll(/\b([A-Z]\w*)\b/g)]
    .map(([, cls]) => cls).filter((cls, i, all) => all.indexOf(cls) === i).sort();
}

export function effectModuleFiles() {
  return readdirSync(path.join(ROOT, 'src/effects')).filter(f => f.endsWith('.js')).sort();
}

/** Every JS file the shell or the prefs process can load, as source text. */
export function allJsSources() {
  const files = ['extension.js', 'prefs.js'];
  const walk = (relDir) => {
    for (const entry of readdirSync(path.join(ROOT, relDir))) {
      const full = path.join(relDir, entry);
      if (entry.endsWith('.js')) files.push(full);
    }
  };
  walk('src');
  walk('src/effects');
  return files.map(readRepo);
}

/** class-name -> nick, read off each module's `static getNick()`. */
export function effectNicks() {
  const dir = path.join(ROOT, 'src/effects');
  const map = new Map();
  for (const file of effectModuleFiles()) {
    const src = readFileSync(path.join(dir, file), 'utf8');
    const nick = src.match(/static getNick\(\)\s*\{\s*return\s*'([\w-]+)';/);
    assert.ok(nick, `${file} declares no static getNick() returning a string literal`);
    const minVersion = src.match(/static getMinShellVersion\(\)\s*\{\s*return\s*\[(\d+),\s*(\d+)\]/);
    map.set(nick[1], {
      file,
      className: file.replace(/\.js$/, ''),
      nick: nick[1],
      minShellVersion: minVersion ? [Number(minVersion[1]), Number(minVersion[2])] : null,
    });
  }
  return map;
}

export function shaderFiles() {
  return readdirSync(path.join(ROOT, 'resources/shaders'))
    .filter(f => f.endsWith('.frag')).sort();
}

/** Preference pages per effect. `prefs.ui` is the dialog shell, not an effect page. */
export function dialogUiFiles() {
  return readdirSync(path.join(ROOT, 'resources/ui/adw'))
    .filter(f => f.endsWith('.ui') && f !== 'prefs.ui').sort();
}

export const sha256Of = sha256;
