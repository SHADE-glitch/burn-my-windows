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
import test from 'node:test';

import {PREFS_SRC, sliceMethod} from './lib/extension-slices.mjs';

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
  // _bindResetButton is the single funnel: each public bind* helper reaches it, which is why
  // recording there covers keys this file never mentions by name. A new bind path that skips
  // the funnel would silently drop its key from every per-effect reset -- invisible until a
  // user notices one option that will not go back.
  const funnels = ['bindComboRow', 'bindComboBox', 'bindEntry', 'bindAdjustment', 'bindSwitch',
                   'bindColorButton'];
  for (const name of funnels) {
    const body = sliceMethod(PREFS_SRC, name);
    assert.ok(/_bind\(|_bindResetButton\(/.test(body),
      `${name}() no longer reaches _bind / _bindResetButton, so its keys escape the per-effect ` +
      'reset set -- record them explicitly or route it through the funnel');
  }
  const reached = funnels.filter((name) => /_bindResetButton\(/.test(sliceMethod(PREFS_SRC, name)));
  assert.ok(reached.length >= 1,
    'not one bind helper calls _bindResetButton itself -- the funnel above is matching prose, ' +
    'not code');
});
