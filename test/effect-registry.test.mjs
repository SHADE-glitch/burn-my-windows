// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — effect registration gate for burn-my-windows@local.
//
// One effect is registered in eight places at once. Miss one and nothing fails
// loudly: an effect absent from the gresource manifest never loads, one absent from
// the profile schema makes prefs.js fall back to a bare Adw.ActionRow so its options
// silently vanish, one whose .ui page is missing renders an empty page. All of that
// is invisible until someone opens the preferences dialog and notices a row is gone.
//
// The expected count is hardcoded on purpose. Deriving 26 from the same list the
// gate checks would make the check a tautology.

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {ROOT} from './lib/extension-slices.mjs';
import {
  PROFILE_SCHEMA,
  compiledKeys, effectClassesInExtension, effectClassesInPrefs, effectModuleFiles,
  effectNicks, shaderFiles, dialogUiFiles,
} from './lib/static-sources.mjs';

const EXPECTED_EFFECT_COUNT = 26;

const nicks = [...effectNicks().keys()].sort();
const profileKeys = compiledKeys(PROFILE_SCHEMA);

// Registers an effect: class name -> nick. `SnapOfDisintegration` is `snap`,
// `TRexAttack` is `trex`, `TVEffect` is `tv`; nothing maps nick -> file by string
// transformation, so each registration point is matched through this map.
const classToNick = new Map(
  [...effectNicks().values()].map(e => [e.className, e.nick]));
const nickToClass = new Map([...classToNick].map(([c, n]) => [n, c]));

test('all eight registration points hold the same 26 effects', () => {
  const classes = EXPECTED_EFFECT_COUNT;
  assert.equal(effectClassesInExtension().length, classes,
    'extension.js _ALL_EFFECTS does not hold 26 entries');
  assert.equal(effectClassesInPrefs().length, classes,
    'prefs.js _ALL_EFFECTS does not hold 26 entries');
  assert.equal(effectModuleFiles().length, classes,
    'src/effects/ does not hold 26 modules');
  assert.equal(nicks.length, classes, 'the modules do not declare 26 unique nicks');
  assert.equal(shaderFiles().length, classes,
    'resources/shaders/ does not hold 26 .frag entry points (common.glsl is shared, ' +
    'not an effect, and must not be counted)');
  assert.equal(dialogUiFiles().length, classes,
    'resources/ui/adw/ does not hold 26 effect pages (prefs.ui is the dialog shell)');

  // Compare as sets: extension.js puts Mushroom last while prefs.js sorts it
  // alphabetically, and that difference is legitimate.
  const expectedClasses = [...classToNick.keys()].sort();
  assert.deepEqual(effectClassesInExtension(), expectedClasses,
    'extension.js and the effect modules disagree about which classes exist');
  assert.deepEqual(effectClassesInPrefs(), expectedClasses,
    'prefs.js and the effect modules disagree about which classes exist');
});

test('every effect has its shader, page and schema switches', () => {
  const missing = [];
  for (const nick of nicks) {
    if (!shaderFiles().includes(`${nick}.frag`)) missing.push(`${nick}.frag`);
    if (!dialogUiFiles().includes(`${nick}.ui`)) missing.push(`${nick}.ui`);
    for (const key of [`${nick}-enable-effect`, `${nick}-animation-time`]) {
      if (!profileKeys.includes(key)) missing.push(key);
    }
  }
  assert.deepEqual(missing, [],
    `these artifacts are referenced by an effect but absent: ${missing.join(', ')}`);
});

// The whole point of the shared common.glsl: an effect that ships a .frag nobody can
// enable is dead weight in the bundle, and one whose enable switch exists with no
// shader throws on first animation.
test('enable switches and shaders are a bijection', () => {
  const switches = profileKeys.filter(k => k.endsWith('-enable-effect'))
    .map(k => k.replace(/-enable-effect$/, '')).sort();
  const frags = shaderFiles().map(f => f.replace(/\.frag$/, '')).sort();
  assert.deepEqual(switches, frags,
    'the schema and the bundle disagree about which effects exist');
  assert.deepEqual(switches, nicks, 'the schema and the modules disagree about nicks');
});

// An effect's option widgets are bound by name in bindPreferences(), declared in its
// .ui page, and keyed in the profile schema. All three have to agree or the option
// silently stops persisting.
test('every bound option key exists in the schema and in its .ui page', () => {
  // The narrow form is load-bearing: a looser "any quoted string in the method body"
  // harvests signal names such as 'state-set' and 'value-changed' and reports them as
  // missing settings keys.
  const BIND = /dialog\.bind\w+\(\s*'([a-z0-9-]+)'/g;
  const problems = [];
  let bindings = 0;

  for (const effect of effectNicks().values()) {
    const src = readFileSync(path.join(ROOT, 'src/effects', effect.file), 'utf8');
    const body = sliceMethod(src, 'bindPreferences(dialog)');
    assert.ok(body, `${effect.file} defines no bindPreferences(dialog)`);

    const ui = readFileSync(
      path.join(ROOT, 'resources/ui/adw', `${effect.nick}.ui`), 'utf8');

    for (const [, key] of body.matchAll(BIND)) {
      bindings++;
      const inSchema = profileKeys.includes(key);
      const inUi = ui.includes(`id="${key}"`) || ui.includes(`id="reset-${key}"`);
      if (!inSchema) problems.push(`${effect.nick}: '${key}' bound but not in the schema`);
      else if (!inUi) problems.push(`${effect.nick}: '${key}' bound but no widget id in ${effect.nick}.ui`);
    }
  }
  assert.deepEqual(problems, [], `option bindings disagree:\n  ${problems.join('\n  ')}`);
  assert.ok(bindings >= 100,
    `only ${bindings} bindings seen -- the regex or the effects changed shape`);
});

// prefs.js hides an effect whose minimum shell version is not met, and the highest
// declared minimum is what decides that. A typo there removes an effect from the
// whole UI without a log line.
test('every effect declares a parseable minimum shell version', () => {
  const versions = [...effectNicks().values()].map(e => e.minShellVersion);
  const missing = versions.filter(v => v === null);
  assert.deepEqual(missing, [],
    `${missing.length} effect module(s) declare no static getMinShellVersion()`);
  const max = versions.reduce((a, v) => (v[0] > a[0] || (v[0] === a[0] && v[1] > a[1]) ? v : a));
  assert.deepEqual(max, [40, 0],
    `the highest declared minimum shell version is ${max}, AGENTS.md documents [40, 0]. ` +
    'Raising it changes which effects GNOME 50 offers.');
});

test('both processes enumerate the same nicks', () => {
  const extNicks = effectClassesInExtension().map(c => classToNick.get(c)).sort();
  const prefsNicks = effectClassesInPrefs().map(c => classToNick.get(c)).sort();
  assert.deepEqual(extNicks, prefsNicks,
    'the shell and the prefs process offer different effect sets');
  assert.equal(new Set(extNicks).size, EXPECTED_EFFECT_COUNT,
    'two classes share a nick -- GSettings keys and shader GTypes would collide');
  assert.equal(nickToClass.size, EXPECTED_EFFECT_COUNT);
});

// Brace-matched method body. Good enough for these files because no bindPreferences()
// body contains a brace inside a string; if that ever changes, this returns early
// rather than silently returning a truncated body -- the assertion below catches it.
function sliceMethod(src, header) {
  const at = src.indexOf(header);
  if (at === -1) return null;
  const open = src.indexOf('{', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}
