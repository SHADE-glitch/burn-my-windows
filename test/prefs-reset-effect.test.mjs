// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — "reset this effect" resets that effect's own keys, in this profile only.
//
// The fork already has 119 per-option reset buttons; what users kept lacking was a way to
// undo one effect after experimenting with it. The obvious implementation -- reset every
// schema key that starts with `<nick>-` -- is wrong here in a way that is easy to miss:
// `tv-` is the prefix of every `tv-glitch-` key too, so resetting TV would quietly reset TV
// Glitch as well. So the key set is collected while each effect is being wired up, and that
// collection is what these assertions hold.
//
// prefs.js is GI-bound, so the two methods are sliced and run against mock settings objects,
// the way prefs-window-chrome.test.mjs runs the widget-tree surgery.

import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {PREFS_SRC, ROOT, sliceMethod} from './lib/extension-slices.mjs';

const METHODS = new Function(
  `return {${sliceMethod(PREFS_SRC, '_bindResetButton')},\n` +
  `${sliceMethod(PREFS_SRC, '_resetEffect')}};`)();

// One profile's settings. `reset` records what it was asked to reset, which is the only
// observable that matters here: everything else about GSettings is upstream's business.
function makeSettings(name) {
  return {name, resets: [], reset(key) { this.resets.push(key); }};
}

// `withResetWidget` decides whether the per-option button exists for a key. It must not change
// what the per-effect reset covers: an option whose row has no button is still an option.
function makeEnv(active, {withResetWidget = true} = {}) {
  const self = Object.assign({}, METHODS, {
    _effectKeys: {},
    _bindingEffect: null,
    _builder: {
      get_object(id) {
        if (!id.startsWith('reset-')) return null;
        return withResetWidget ? {connect: () => {}, _isConnected: false} : null;
      },
    },
    getProfileSettings: () => active,
  });
  return {self, active};
}

// Replays what _loadActiveProfile does for one effect: mark the nick, bind its keys, unmark.
function bindEffect(self, nick, keys) {
  self._bindingEffect = nick;
  for (const key of keys) {
    self._bindResetButton(key);
  }
  self._bindingEffect = null;
}

test('an effect reset covers exactly the keys that effect wired up', () => {
  const active = makeSettings('profile-A');
  const {self} = makeEnv(active);

  bindEffect(self, 'incinerate',
    ['incinerate-enable-effect', 'incinerate-animation-time', 'incinerate-scale',
     'incinerate-turbulence', 'incinerate-use-pointer', 'incinerate-color']);
  bindEffect(self, 'wisps', ['wisps-enable-effect', 'wisps-animation-time']);

  self._resetEffect('incinerate');

  assert.deepEqual(active.resets,
    ['incinerate-enable-effect', 'incinerate-animation-time', 'incinerate-scale',
     'incinerate-turbulence', 'incinerate-use-pointer', 'incinerate-color'],
    'the reset set is not the set this effect declared');
  assert.ok(!active.resets.some(k => k.startsWith('wisps-')),
    'resetting one effect touched another effect that shares no prefix');
});

test('the tv / tv-glitch prefix trap does not bite', () => {
  // This is the assertion a `<nick>-` schema scan would fail: both effects' keys start with
  // `tv-`, so the only correct set for `tv` is the one `tv` itself bound.
  const active = makeSettings('profile-A');
  const {self} = makeEnv(active);

  bindEffect(self, 'tv', ['tv-enable-effect', 'tv-animation-time']);
  bindEffect(self, 'tv-glitch', ['tv-glitch-enable-effect', 'tv-glitch-animation-time',
                                 'tv-glitch-noise']);

  self._resetEffect('tv');

  assert.deepEqual(active.resets, ['tv-enable-effect', 'tv-animation-time'],
    `resetting tv leaked into tv-glitch: ${active.resets.join(', ')}`);
});

test('resetting writes to the profile being edited and to no other', () => {
  const a = makeSettings('profile-A');
  const b = makeSettings('profile-B');
  const env = makeEnv(a);
  const self = env.self;

  bindEffect(self, 'fire', ['fire-enable-effect', 'fire-animation-time']);

  // The user switches profiles between wiring the UI and pressing the button; the click has to
  // land on whichever profile is active now, which is what getProfileSettings() answers for.
  self.getProfileSettings = () => b;
  self._resetEffect('fire');

  assert.deepEqual(a.resets, [], 'a stale profile reference wrote into the previous profile');
  assert.deepEqual(b.resets, ['fire-enable-effect', 'fire-animation-time'],
    'the active profile did not receive the resets');
});

test('reloading a profile does not double-reset a key', () => {
  // _loadActiveProfile runs again on every profile switch, so the same keys are bound twice --
  // the collection has to be a set, or one click would reset each key as many times as the
  // dialog has been redrawn.
  const active = makeSettings('profile-A');
  const {self} = makeEnv(active);

  bindEffect(self, 'matrix', ['matrix-enable-effect', 'matrix-animation-time']);
  bindEffect(self, 'matrix', ['matrix-enable-effect', 'matrix-animation-time']);

  self._resetEffect('matrix');
  assert.deepEqual(active.resets, ['matrix-enable-effect', 'matrix-animation-time'],
    `expected one reset per declared key, got ${active.resets.length}`);
});

test('a key whose row has no per-option button is still covered', () => {
  const active = makeSettings('profile-A');
  const {self} = makeEnv(active, {withResetWidget: false});

  bindEffect(self, 'glide', ['glide-enable-effect', 'glide-animation-time']);
  self._resetEffect('glide');

  assert.deepEqual(active.resets, ['glide-enable-effect', 'glide-animation-time'],
    'coverage was gated on the existence of the per-option reset button, so an option would ' +
    'survive a "reset this effect"');
});

test('every binding path feeds the collection', () => {
  // The bind helpers all converge -- either directly on _finishBinding or on _bind, which
  // then reaches it. That is why recording in the funnel covers keys this file never mentions
  // by name. A new bind path that skips the convergence would silently drop its key from every
  // per-effect reset -- invisible until a user notices one option that will not go back.
  const funnels = ['bindComboRow', 'bindComboBox', 'bindEntry', 'bindAdjustment', 'bindSwitch',
                   'bindColorButton'];
  for (const name of funnels) {
    const body = sliceMethod(PREFS_SRC, name);
    assert.ok(/this\._bind\(|this\._finishBinding\(/.test(body),
      `${name}() no longer reaches _bind / _finishBinding, so its keys escape the per-effect ` +
      'reset set -- record them explicitly or route it through the funnel');
  }
  // The implied step of the sentence above: five of the six only reach the funnel through
  // _bind, so without this the assertion would still pass if _bind stopped forwarding.
  assert.match(sliceMethod(PREFS_SRC, '_bind'), /this\._finishBinding\(/,
    '_bind() no longer forwards to the funnel, so the five helpers above reach a dead end');
});

test('an effect binds its options where the marker is up', () => {
  // Recording happens while prefs.js's effect loop holds `_bindingEffect` set, and that loop
  // is the only caller of `bindPreferences()`. An effect that bound one of its own keys from
  // anywhere else -- when its page is realized, say -- would land outside every effect's key
  // set, and the two assertions above would stay green: they only speak about the helpers.
  // So the *call sites* have to be scanned, not just the helpers.
  const dir = path.join(ROOT, 'src/effects');
  const offenders = [];
  let files = 0, sites = 0;

  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith('.js')) continue;
    files++;
    let method = null;
    for (const line of readFileSync(path.join(dir, entry), 'utf8').split('\n')) {
      // Class methods of an effect are indented by exactly two spaces; anything less or more
      // is not a method, so the marker never silently sticks to a nested function.
      const m = /^  (?:static )?([A-Za-z_]+)\(/.exec(line);
      if (m) method = m[1];
      if (/\bdialog\.bind[A-Za-z]*\(/.test(line)) {
        sites++;
        if (method !== 'bindPreferences') offenders.push(`${entry}: ${method}()`);
      }
    }
  }

  assert.ok(files > 0 && sites > 0,
    `scanned ${files} effect file(s) and found ${sites} bind call(s) -- a scan over nothing `
    + 'is how this gate would start passing without protecting anything');
  assert.deepEqual(offenders, [],
    `these bind calls are outside bindPreferences(), so their keys reach no "reset this `
    + `effect": ${offenders.join(', ')}`);
});
