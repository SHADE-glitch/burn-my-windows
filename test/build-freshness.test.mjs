// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — build-freshness gate for burn-my-windows@local.
//
// This extension is used in place: it has no install step, and the compiled
// GResource bundle and gschemas.compiled are committed to the repository. That means
// a shader, a .ui page or a schema key edited without running `make` does not fail
// loudly -- it keeps running with the OLD artifact and reports green. Nothing else in
// the toolchain notices, because `make` is not wired into any test hook. This gate is
// that missing notice.
//
// Two rules for this file: never write into the repository, and never touch the live
// dconf database. See probeEnv() in lib/static-sources.mjs for the second one.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {ROOT} from './lib/extension-slices.mjs';
import {
  BUNDLE, MANIFEST, MAIN_SCHEMA, PROFILE_SCHEMA,
  bundlePaths, bundleExtract, sourceBytes, manifestPaths,
  compiledKeys, compiledDefaults, xmlKeys, xmlDefaults, effectNicks,
  allJsSources,
  sha256Of,
} from './lib/static-sources.mjs';

const have = (bin, args) => spawnSync(bin, args, {stdio: 'ignore'}).status === 0;
// gresource has no --version and --help exits non-zero, so probe it with a real
// subcommand on the artifact this gate is about to read anyway.
const skipReason =
  have('gresource', ['sections', `${ROOT}/${BUNDLE}`]) && have('gsettings', ['--version'])
    ? null : 'gresource / gsettings not usable on this machine';
// node:test renders a present-but-null `skip` option as a SKIP marker in the TAP
// output, so the option object is only built when there is a real reason. A gate that
// quietly skips its own assertions is the failure mode this file exists to prevent.
const opts = () => (skipReason ? {skip: skipReason} : {});

const MAIN_SCHEMA_FILE = 'org.gnome.shell.extensions.burn-my-windows.gschema.xml';
const PROFILE_SCHEMA_FILE = 'org.gnome.shell.extensions.burn-my-windows-profile.gschema.xml';

test('the committed bundle contains exactly the manifest entries', opts(), () => {
  const inBundle = bundlePaths().map(p => p.replace(/^\//, '')).sort();
  const inManifest = manifestPaths().sort();

  const missingFromBundle = inManifest.filter(p => !inBundle.includes(p));
  const staleMembers = inBundle.filter(p => !inManifest.includes(p));

  assert.deepEqual(staleMembers, [],
    `${BUNDLE} holds ${staleMembers.length} member(s) the manifest no longer lists: ` +
    `${staleMembers.join(', ')}. They are still shipped to users. ` +
    'Run: make && git add ' + BUNDLE);
  assert.deepEqual(missingFromBundle, [],
    `${MANIFEST} lists ${missingFromBundle.length} file(s) absent from the bundle: ` +
    `${missingFromBundle.join(', ')}. Each one is a missing resource at runtime. ` +
    'Run: make && git add ' + BUNDLE);
  assert.ok(inBundle.length > 0, 'the bundle is empty');
});

// Content, not mtime and not a byte-compare of the bundle file itself: gresource
// stores members verbatim, so each one can be extracted and hashed against its
// source. That catches the failure mode that matters -- an edited .frag or .ui whose
// rebuild was never committed -- which mtime cannot, since checkout resets mtimes.
test('every bundle member matches its source file byte for byte', opts(), () => {
  const offenders = [];
  for (const resourcePath of bundlePaths()) {
    const rel = resourcePath.replace(/^\//, '');
    const inBundle = sha256Of(bundleExtract(resourcePath));
    try {
      const onDisk = sha256Of(sourceBytes(rel));
      if (inBundle !== onDisk) offenders.push(`${rel} (content differs)`);
    } catch {
      offenders.push(`${rel} (source file missing)`);
    }
  }
  assert.deepEqual(offenders, [],
    `${offenders.length} bundle member(s) are stale: ${offenders.join(', ')}. ` +
    'Run: make && git add ' + BUNDLE);
});

// The bundle is addressed by string literals in JS. A literal that is not in the
// bundle throws only on the code path that reaches it -- often a single effect page.
test('every resource path used by the JS exists in the bundle', opts(), () => {
  const inBundle = new Set(bundlePaths());
  const literals = new Set();
  for (const src of allJsSources()) {
    for (const [, p] of src.matchAll(
      /['"`](\/(?:shaders|ui|img|interfaces|credits)\/[A-Za-z0-9._/-]+)['"`]/g)) {
      literals.add(p);
    }
  }
  const dangling = [...literals].filter(p => !inBundle.has(p)).sort();
  assert.deepEqual(dangling, [],
    `these resource paths are referenced by the JS but absent from the bundle: ` +
    `${dangling.join(', ')}`);
  assert.ok(literals.size >= 10,
    `only ${literals.size} resource literals found -- the regex or the sources changed`);
});

// The two tests above check the bundle against the manifest; neither checks the manifest
// against anything. An icon listed but named by nobody still compiles, still ships, and is
// invisible -- deleting it from the .ui would not help, because upstream added the *manifest*
// line for an action this fork never grew. So: every bundled icon must be named by source we
// actually ship.
test('every bundled icon is named by something we ship', opts(), () => {
  const icons = manifestPaths().filter((p) => p.startsWith('img/scalable/actions/'));
  assert.ok(icons.length > 0,
    `no img/scalable/actions/ entry is left in ${MANIFEST} -- this check would pass on an ` +
    'empty set and say nothing');

  // Icon names reach a widget two ways: an `icon-name` string in a .ui page, or a literal
  // passed to the JS. Both are shipped text, so both count as a use.
  const text = [...allJsSources(),
                ...manifestPaths().filter((p) => p.endsWith('.ui')).map(sourceBytes)]
    .map((chunk) => (typeof chunk === 'string' ? chunk : chunk.toString('utf8')))
    .join('\n');

  const unnamed = icons
    .map((p) => p.replace(/^img\/scalable\/actions\//, '').replace(/\.svg$/, ''))
    .filter((name) => !text.includes(name))
    .sort();
  assert.deepEqual(unnamed, [],
    `${unnamed.length} icon(s) are compiled into ${BUNDLE} but no shipped source names them: ` +
    `${unnamed.join(', ')}. Wire it up, or drop it from ${MANIFEST} and the .svg, then run make.`);
});

test('the compiled schemas match their XML', () => {
  for (const [schemaId, file] of [[MAIN_SCHEMA, MAIN_SCHEMA_FILE],
                                  [PROFILE_SCHEMA, PROFILE_SCHEMA_FILE]]) {
    const compiled = compiledKeys(schemaId);
    const fromXml = xmlKeys(file);
    assert.ok(compiled.length > 0, `${schemaId} compiled to zero keys`);
    assert.deepEqual(compiled, fromXml,
      `${file} and schemas/gschemas.compiled disagree for ${schemaId}: ` +
      `only in xml ${fromXml.filter(k => !compiled.includes(k)).join(', ')}, ` +
      `only in compiled ${compiled.filter(k => !fromXml.includes(k)).join(', ')}. ` +
      'Run: make && git add schemas/gschemas.compiled');
  }
});

// Defaults matter as much as key names: `fire-enable-effect` being the single `true`
// default is what decides which effect a fresh profile plays.
test('the main schema defaults survive compilation', () => {
  const fromXml = xmlDefaults(MAIN_SCHEMA_FILE);
  const compiled = Object.fromEntries(
    compiledDefaults(MAIN_SCHEMA).map(({key, value}) => [key, value]));
  assert.deepEqual(Object.keys(compiled).sort(), Object.keys(fromXml).sort(),
    'the compiled main schema has a different key set than the XML');

  for (const [key, rawDefault] of Object.entries(fromXml)) {
    // Scalars are compared by value. `list-recursively` prints strings single-quoted
    // and everything else bare, while the XML writes GVariant text -- so `""` in the
    // schema is `''` in the output. Anything that is not a scalar (arrays, flagged
    // enums, `<value>` children) is only checked for presence: re-implementing the
    // GVariant text format here would test this file, not the schema.
    const isScalar = !rawDefault.startsWith('[') && !rawDefault.startsWith('<');
    if (!isScalar) {
      assert.ok(key in compiled, `${key} has a non-scalar default but no compiled value`);
      continue;
    }
    const quoted = /^"(.*)"$/u.exec(rawDefault) ?? /^'(.*)'$/u.exec(rawDefault);
    const expected = quoted ? `'${quoted[1]}'` : rawDefault;
    assert.equal(compiled[key], expected,
      `default for ${key} differs between ${MAIN_SCHEMA_FILE} and the compiled schema ` +
      `(xml: ${rawDefault}, compiled: ${compiled[key]})`);
  }
});

test('every effect has its enable switch in the compiled profile schema', () => {
  const compiled = compiledKeys(PROFILE_SCHEMA);
  const nicks = [...effectNicks().keys()];
  const missing = nicks.filter(n => !compiled.includes(`${n}-enable-effect`));
  assert.deepEqual(missing, [],
    `no <nick>-enable-effect key for: ${missing.join(', ')}`);

  const switches = compiled.filter(k => k.endsWith('-enable-effect'));
  assert.equal(switches.length, nicks.length,
    `expected one enable switch per effect, found ${switches.length}`);

  // A fresh profile plays exactly one effect. If that ever changes, every "what does
  // the user see on first run" statement in the docs is stale -- so assert it here
  // rather than letting the docs drift.
  const onByDefault = compiledDefaults(PROFILE_SCHEMA)
    .filter(({key, value}) => key.endsWith('-enable-effect') && value === 'true')
    .map(({key}) => key).sort();
  assert.deepEqual(onByDefault, ['fire-enable-effect'],
    `expected exactly fire to be enabled by default, got: ${onByDefault.join(', ')}`);
});
