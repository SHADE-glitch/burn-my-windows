// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — the lazy power-Information proxies must retry, but never on the
// window-animation path, never without a bound, and never across disable().
//
// Why this is a gate and not a comment: the fork decides which profile matches by
// reading the battery state, and the first animation of a session can easily arrive
// while logind/UPower is still starting. Latching that failure used to last the whole
// login session, so a profile constrained to "on battery" silently never matched again.
// The obvious fix -- retry from the read site -- would put a synchronous D-Bus call on
// the compositor's hot path for every window of a session on a machine where the
// service stays masked. Both halves of that trade are asserted below.
//
// extension.js is GI-bound, so the five methods are sliced out and run against mock
// Gio / GLib / utils, the way patch-symmetry.test.mjs runs the patch regions.

import assert from 'node:assert/strict';
import test from 'node:test';

import {SRC, sliceMethod, sliceBetween} from './lib/extension-slices.mjs';

const UPOWER_NAME = 'org.freedesktop.UPower';
const PROFILES_NAME = 'net.hadess.PowerProfiles';

// Anchored on the comments disable() itself carries; the region is the whole
// proxy-retry teardown and nothing else.
const CANCEL_START = '    // Cancel any pending proxy-retry timeout';
const CANCEL_END = '    // Disconnect profile settings signal connections.';

const METHODS = [
  '_getUpowerProxy', '_tryUpowerProxy',
  '_getPowerProfilesProxy', '_tryPowerProfilesProxy',
  '_scheduleProxyRetry',
];

const CLASS = new Function('Gio', 'GLib', 'utils',
  `return {${METHODS.map((m) => sliceMethod(SRC, m)).join(',\n')}};`);

// owners maps a bus name to whatever get_name_owner() should answer. `appearLater`
// flips them on between calls, which is how a service that finishes starting up
// mid-session is simulated.
function makeEnv({owners = {}, throwOnBuild = false} = {}) {
  const state = {builds: [], timers: [], removed: [], seq: 0, live: {...owners}, throwOnBuild};
  const Gio = {
    DBus: {system: 'test-system-bus'},
    DBusProxy: {
      makeProxyWrapper(interfacePath) {
        return class MockProxy {
          constructor(bus, name, path) {
            state.builds.push(name);
            if (state.throwOnBuild) throw new Error('bus unavailable');
            this.name = name;
            this.interfacePath = interfacePath;
          }
          get_name_owner() { return state.live[this.name] ?? null; }
        };
      },
    },
  };
  const GLib = {
    PRIORITY_LOW: 100,
    SOURCE_REMOVE: 0,
    SOURCE_CONTINUE: 1,
    timeout_add_seconds(priority, seconds, callback) {
      state.timers.push({priority, seconds, callback});
      return ++state.seq;
    },
    Source: {remove(id) { state.removed.push(id); }},
  };
  const utils = {getStringResource: (p) => `interface-xml:${p}`};

  // One object plays both roles, exactly as production does: the methods and the state
  // they read and write live on the same instance.
  const ext = Object.assign(CLASS(Gio, GLib, utils), {
    _upowerProxy: null,
    _upowerProxyChecked: false,
    _powerProfilesProxy: null,
    _powerProfilesProxyChecked: false,
    _proxyRetryId: 0,
    _proxyRetryAttempts: 0,
    _settings: {get_string: () => ''},
  });
  const buildsOf = (name) => state.builds.filter((b) => b === name).length;
  // The most recently armed timeout, which is the only one that can still fire: the
  // callback clears _proxyRetryId before it re-arms.
  const fireRetry = () => {
    const timer = state.timers.at(-1);
    assert.ok(timer, 'no retry timeout was armed to fire');
    return timer.callback();
  };
  return {ext, state, buildsOf, fireRetry};
}

test('a reachable service is adopted on the first attempt and never re-probed', () => {
  const e = makeEnv({owners: {[UPOWER_NAME]: ':1.7', [PROFILES_NAME]: ':1.9'}});

  assert.ok(e.ext._getUpowerProxy(), 'the proxy was not returned');
  assert.equal(e.state.timers.length, 0,
    'a successful first attempt still scheduled a retry');
  assert.equal(e.buildsOf(UPOWER_NAME), 1);

  // Later animations must not re-read the bus name either -- they get the cached proxy.
  for (let i = 0; i < 5; i++) e.ext._getUpowerProxy();
  assert.equal(e.buildsOf(UPOWER_NAME), 1, 'the proxy was rebuilt from the animation path');
});

test('a failed attempt costs the animation path exactly one build, then a timer', () => {
  const e = makeEnv({owners: {}});

  assert.equal(e.ext._getUpowerProxy(), null, 'a service-less attempt returned a proxy');
  assert.equal(e.buildsOf(UPOWER_NAME), 1);

  // Twenty more window animations. This is the regression the retry must not introduce:
  // a synchronous D-Bus call per window on a machine where UPower stays masked.
  for (let i = 0; i < 20; i++) {
    assert.equal(e.ext._getUpowerProxy(), null);
  }
  assert.equal(e.buildsOf(UPOWER_NAME), 1,
    `the animation path rebuilt the proxy ${e.buildsOf(UPOWER_NAME)} times`);
  assert.equal(e.state.timers.length, 1, 'the failure did not arm exactly one retry');
  assert.equal(e.state.timers[0].priority, 100,
    'the retry does not run at low priority, so it can preempt an animation');
  assert.ok(e.state.timers[0].seconds >= 10,
    `the retry fires after ${e.state.timers[0].seconds}s -- too tight to let a service start`);
});

test('the retry adopts a service which finishes starting up', () => {
  const e = makeEnv({owners: {}});
  e.ext._getUpowerProxy();
  e.ext._getPowerProfilesProxy();
  assert.equal(e.state.timers.length, 1, 'two missing services must share one retry');

  e.state.live[UPOWER_NAME] = ':1.7';
  e.state.live[PROFILES_NAME] = ':1.9';
  e.fireRetry();

  assert.ok(e.ext._upowerProxy, 'the retry never adopted UPower');
  assert.ok(e.ext._powerProfilesProxy, 'the retry never adopted PowerProfiles');
  assert.equal(e.state.timers.length, 1, 'a satisfied retry kept retrying');
});

test('a permanently absent service is retried a bounded number of times', () => {
  const e = makeEnv({owners: {}});
  e.ext._getUpowerProxy();

  let fired = 0;
  while (e.state.timers.length > fired) {
    e.fireRetry();
    fired++;
    assert.ok(fired <= 10, 'the retry loop never terminated');
  }
  assert.equal(fired, 3, `retried ${fired} times; the bound is what keeps this off the bus forever`);
  assert.equal(e.buildsOf(UPOWER_NAME), 4, 'one initial attempt plus three retries');
});

test('disable() cancels the pending retry and lets a re-enable try again', () => {
  const e = makeEnv({owners: {}});
  e.ext._getUpowerProxy();
  assert.equal(e.state.timers.length, 1);

  // The real disable() region, not a paraphrase of it.
  new Function('GLib', sliceBetween(SRC, CANCEL_START, CANCEL_END)).call(e.ext, {
    Source: {remove: (id) => e.state.removed.push(id)},
  });

  assert.deepEqual(e.state.removed, [1], 'disable() did not remove the armed timeout');
  assert.equal(e.ext._proxyRetryId, 0, 'a stale source id survived disable()');
  assert.equal(e.ext._proxyRetryAttempts, 0, 'the attempt counter survived disable()');
  assert.equal(e.ext._upowerProxyChecked, false,
    'the failure latch survived disable(), so a re-enable cannot make a fresh attempt');

  e.ext._getUpowerProxy();
  assert.equal(e.buildsOf(UPOWER_NAME), 2, 'the re-enabled extension refused to probe again');
});

test('the retry never builds into a disabled extension', () => {
  const e = makeEnv({owners: {}});
  e.ext._getUpowerProxy();
  // disable() unregisters the GResource bundle, so the interface XML is gone by now.
  e.ext._settings = null;
  e.fireRetry();

  assert.equal(e.buildsOf(UPOWER_NAME), 1, 'a retry built a proxy after disable()');
  assert.equal(e.ext._proxyRetryId, 0, 'a cancelled retry re-armed itself');
});
