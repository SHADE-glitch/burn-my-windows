// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — the shader pre-warm must only mark an effect as done when it
// actually got one, and must say so out loud when it did not.
//
// Why this is a gate: _warmShaders() is the difference between the first window of a
// session paying ~1.1 ms per effect and not paying it. Its failure path used to
// (a) mark the nick as warmed *before* trying, and (b) swallow the error. One shader
// rejected by the driver therefore meant an effect which never plays again until
// re-login, with nothing in the journal to explain it -- and the pool then builds that
// shader on the animation path, which is the hitch the whole method exists to avoid.
//
// extension.js is GI-bound, so the method is sliced out and run against a mock GLib,
// the way patch-symmetry.test.mjs runs the patch regions.

import assert from 'node:assert/strict';
import test from 'node:test';

import {SRC, sliceMethod} from './lib/extension-slices.mjs';

const WARM = new Function('GLib', `return {${sliceMethod(SRC, '_warmShaders')}};`);

// An effect is only ever touched through its static nick and its shader factory, so a
// plain object plays the role. `fail` marks the effects whose shader build throws; each
// effect records its own build attempts so the order can be asserted.
function makeEffect(nick, {fail = false} = {}) {
  const builds = [];
  return {
    constructor: {getNick: () => nick},
    builds,
    shaderFactory: {
      getShader() {
        if (fail) throw new Error(`${nick} GLSL rejected`);
        builds.push(nick);
        return {returnToFactory() {}};
      },
    },
  };
}

function makeEnv(profiles) {
  // An effect can be enabled in several profiles, so the same object appears more than
  // once: deduplicate or its build log would be counted twice.
  const effects = [...new Set(profiles.flat())];
  const state = {
    timers: [], removed: [], warnings: [],
    // Every build attempt in the order they happened.
    built: () => effects.flatMap(e => e.builds),
  };

  const GLib = {
    PRIORITY_LOW: 100,
    SOURCE_REMOVE: 0,
    SOURCE_CONTINUE: 1,
    idle_add(priority, callback) { state.timers.push({priority, callback}); return state.timers.length; },
    Source: {remove(id) { state.removed.push(id); }},
  };

  const ext = Object.assign(WARM(GLib), {
    _settings: {get_string: () => ''},
    _warmedNicks: new Set(),
    _warmId: 0,
    _ensureEffects: () => {},
    _profiles: profiles.map(enabledEffects => ({enabledEffects})),
  });

  // The fork calls console.warn directly, so capturing it means swapping the global for
  // the duration of the calls under test -- and putting it back afterwards.
  const realWarn = console.warn;
  const runCapturing = (body) => {
    console.warn = (msg) => { state.warnings.push(msg); };
    try {
      return body();
    } finally {
      console.warn = realWarn;
    }
  };

  // Drain the idle sources the way the main loop would: the same source is called
  // again and again, one effect per call, until it removes itself. Running each armed
  // source only once would stop after the first effect and read as "the queue ended".
  const drain = () => runCapturing(() => {
    let seen = 0;
    while (state.timers.length > seen) {
      const timer = state.timers[seen];
      let removed = false;
      for (let ticks = 0; ticks < 100 && !removed; ticks++) {
        removed = timer.callback() === GLib.SOURCE_REMOVE;
      }
      // A source which never removes itself would spin the real main loop forever.
      assert.ok(removed, 'an idle warm-up source never returned SOURCE_REMOVE');
      seen++;
    }
  });

  // Every case starts where production starts: _loadProfiles() has just called this,
  // so one idle source is already armed.
  ext._warmShaders();

  return {ext, state, GLib, drain, runCapturing};
}

test('a warm-up which succeeded is never repeated', () => {
  const e = makeEnv([[makeEffect('fire')]]);
  e.drain();
  assert.deepEqual(e.state.built(), ['fire']);

  e.ext._warmShaders();
  e.drain();
  assert.deepEqual(e.state.built(), ['fire'], 'an already-warmed effect was rebuilt');
  assert.equal(e.state.warnings.length, 0, 'a successful warm-up warned about something');
});

test('one rejected shader does not stop the other effects from warming', () => {
  const e = makeEnv([[
    makeEffect('a-ok'), makeEffect('b-bad', {fail: true}), makeEffect('c-ok'),
  ]]);
  e.drain();

  assert.deepEqual(e.state.built(), ['a-ok', 'c-ok'],
    `warmed ${JSON.stringify(e.state.built())} -- one failure must not end the queue`);
});

test('a failed effect is not marked warm, so the next reload retries it', () => {
  const e = makeEnv([[makeEffect('matrix', {fail: true})]]);
  e.drain();

  assert.ok(!e.ext._warmedNicks.has('matrix'),
    'a rejected effect was recorded as warmed -- it would then never be retried, and the ' +
    'animation path would pay the build cost the pre-warm exists to avoid');
  assert.equal(e.state.warnings.length, 1, 'the failure produced no journal line at all');
  assert.match(e.state.warnings[0], /\[burn-my-windows@local\] shader warm-up failed for matrix/,
    `the warning is unattributable or names no nick: ${e.state.warnings[0]}`);

  // A profile change runs _warmShaders() again; the un-warmed nick has to come back.
  e.ext._warmShaders();
  e.drain();
  assert.equal(e.state.warnings.length, 2, 'the retry gave up without trying again');
});

test('the same effect enabled in two profiles is warmed once per run', () => {
  const shared = makeEffect('fire');
  const e = makeEnv([[shared], [shared]]);
  e.drain();

  assert.deepEqual(e.state.built(), ['fire'],
    `built ${e.state.built().length} times -- one run must deduplicate by nick`);
});

test('warming aborts without residue when the extension is disabled mid-run', () => {
  const e = makeEnv([[makeEffect('a-ok'), makeEffect('b-ok')]]);
  const timer = e.state.timers[0];

  // One effect gets built, then disable() lands.
  assert.equal(timer.callback(), e.GLib.SOURCE_CONTINUE);
  assert.deepEqual(e.state.built(), ['a-ok']);

  e.ext._settings = null;
  assert.equal(timer.callback(), e.GLib.SOURCE_REMOVE,
    'the source kept running against a disabled extension');
  assert.equal(e.ext._warmId, 0, 'a stale source id was left behind');

  // _warmShaders() does not check the settings itself, so arming after a disable is
  // legal -- what must hold is that the source dies on its first tick and builds
  // nothing.
  e.ext._warmShaders();
  const late = e.state.timers.at(-1);
  assert.equal(late.callback(), e.GLib.SOURCE_REMOVE,
    'a warm-up armed against a disabled extension did not remove itself');
  assert.deepEqual(e.state.built(), ['a-ok'], 'a disabled extension built a shader');
});
