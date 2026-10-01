// Regression gate for the shell monkey-patches in extension.js.
//
// burn-my-windows replaces private GNOME Shell methods. If a future GNOME version
// drops or renames one of them, the extension has to degrade quietly: no invented
// stub, nothing left behind, and no TypeError thrown on the shell's hot path. None
// of this can be imported outside GNOME Shell -- extension.js and src/ are all
// GI-bound -- so this gate slices the two patch regions out of the source and runs
// them against mock shell objects, the same approach fast-translate@local's
// test/prefs-validator.js takes for its static checks.
//
// The slices are located by the stable comments around them, never by line numbers.

import assert from 'node:assert/strict';
import test from 'node:test';

import {SRC, PATCHES, installSource, restoreSource} from './lib/extension-slices.mjs';

const PATCH_COUNT = PATCHES.length;

// installSource() slices from the first `this._orig... = ...` capture to the comment
// that introduces disable(), and prepends the `const extensionThis = this` declaration
// enable() makes, so a replay reaches its original exactly the way production does.
const INSTALL_SRC = installSource();
const RESTORE_SRC = restoreSource();

// The 8 methods enable() replaces are declared once, in lib/extension-slices.mjs, so
// the sentinel drift gate and this gate cannot ever disagree about how many there are.
// `instance: true` marks the two that are assigned onto Main.wm as own properties
// instead of onto a prototype. That difference is what originally made them look like
// the only ones needing an install guard, but the failure mode below is identical for
// both kinds: a missing upstream method would be re-created as a stub, and the guarded
// restore would then have nothing to put back.

function installInto(ext, shell) {
  return new Function('Main', 'Workspace', 'WindowPreview', 'global', INSTALL_SRC)
    .call(ext, {wm: shell.wm}, shell.workspace, shell.windowPreview, shell.global);
}

function restoreInto(ext, shell) {
  return new Function('Main', 'Workspace', 'WindowPreview', 'global', RESTORE_SRC)
    .call(ext, {wm: shell.wm}, shell.workspace, shell.windowPreview, shell.global);
}

const holderOf = (shell, holder) =>
  holder === 'wm' ? shell.wm : shell[holder].prototype;

const patchByName = (name) => PATCHES.find(p => p.name === name);

function snapshot(shell) {
  return PATCHES.map(({holder, name}) => [holder, name, holderOf(shell, holder)[name]]);
}

// A mock shell carrying the 8 patch targets plus the connect() the install slice
// makes for kill-effects. `drop` lists the methods to leave absent, which is how the
// "a future GNOME removed it" case is simulated, and `originals` overrides the
// default original (which just returns its own name) where a replacement needs a
// realistic return value.
function makeShell({drop = [], originals = {}} = {}) {
  const missing = new Set(drop);
  const defined = (name) => {
    if (missing.has(name)) return undefined;
    return originals[name] ?? function upstream() { return name; };
  };
  return {
    wm: {
      _shouldAnimateActor: defined('_shouldAnimateActor'),
      _waitForOverviewToHide: defined('_waitForOverviewToHide'),
    },
    workspace: {prototype: {
      _addWindowClone: defined('_addWindowClone'),
      _windowRemoved: defined('_windowRemoved'),
      _doRemoveWindow: defined('_doRemoveWindow'),
    }},
    windowPreview: {prototype: {
      _init: defined('_init'),
      _deleteAll: defined('_deleteAll'),
      _restack: defined('_restack'),
    }},
    global: {window_manager: {connect: () => 1}},
  };
}

// enable() reads the originals off the shell into the extension object and the
// replacements delegate through that same object, so one object plays both roles.
// _shouldDestroy, _chooseEffect and _setupEffect are called by the replacements at
// invocation time; the defaults below keep the "no effect configured" path reachable.
function makeExt(overrides = {}) {
  return Object.assign({
    _shouldDestroy: () => false,
    _chooseEffect: () => undefined,
    _setupEffect: () => {},
    _previewFieldsWarned: true,
  }, overrides);
}

test(`enable() captures and disable() restores exactly ${PATCH_COUNT} methods`, () => {
  const captured = SRC.match(
    /^\s*this\._orig\w+\s*=\s*(?:Main\.wm|Workspace\.prototype|WindowPreview\.prototype)\._\w+;/gm) ?? [];
  assert.equal(captured.length, PATCH_COUNT,
    `expected ${PATCH_COUNT} _orig captures in enable(), found ${captured.length}`);

  const restored = SRC.match(
    /if \(this\._orig\w+\)\n\s+(?:Main\.wm|Workspace\.prototype|WindowPreview\.prototype)\._\w+ = this\._orig\w+;/g) ?? [];
  assert.equal(restored.length, PATCH_COUNT,
    `expected ${PATCH_COUNT} guarded restores in disable(), found ${restored.length}`);
});

test('enable() then disable() leaves the shell exactly as it found it', () => {
  const shell = makeShell();
  const before = snapshot(shell);
  const ext = makeExt();

  installInto(ext, shell);

  for (const [holder, name, fn] of snapshot(shell)) {
    assert.notEqual(fn, before.find(([h, n]) => h === holder && n === name)[2],
      `enable() did not patch ${name}`);
  }

  restoreInto(ext, shell);

  for (const [holder, name, fn] of snapshot(shell)) {
    assert.equal(fn, before.find(([h, n]) => h === holder && n === name)[2],
      `disable() did not put ${name} back`);
  }
});

test('enable() never invents a method that upstream no longer has', () => {
  for (const {name} of PATCHES) {
    const shell = makeShell({drop: [name]});
    installInto(makeExt(), shell);
    assert.equal(holderOf(shell, patchByName(name).holder)[name], undefined,
      `enable() installed a stub for ${name}, which upstream no longer has. ` +
      'The install side needs the same guard the restore already has.');
  }
});

test('disable() never leaves a stub behind for a dropped method', () => {
  const shell = makeShell({drop: PATCHES.map(p => p.name)});
  const ext = makeExt();

  installInto(ext, shell);
  restoreInto(ext, shell);

  for (const {holder, name} of PATCHES) {
    assert.equal(holderOf(shell, holder)[name], undefined,
      `${name} exists after enable()+disable() but upstream never had it`);
  }
});

test('every replacement runs and reaches its original without throwing', async () => {
  const container = {connect: () => {}};
  const clone = {window_container: container};
  const shell = makeShell({originals: {
    _addWindowClone: () => clone,
  }});
  const ext = makeExt();
  installInto(ext, shell);

  const workspace = {_windows: []};
  const metaWindow = {
    connect: () => 42,
    disconnect: () => {},
    get_compositor_private: () => workspace,
  };
  const preview = {
    metaWindow,
    connect: () => {},
    window_container: {},
    overlayEnabled: true,
    _icon: {visible: true},
    _closeRequested: false,
    _windowActor: null,
  };
  const actor = {ease() { return 'eased'; }};

  // _shouldAnimateActor decides from the call stack whether it is on the window-open
  // or window-close path, so the caller has to be named _mapWindow to get past that
  // check. With no effect configured it must then fall through to the original.
  const delegated = (function _mapWindow() {
    return shell.wm._shouldAnimateActor.call(shell.wm, actor, 1);
  })();
  assert.equal(delegated, '_shouldAnimateActor',
    '_shouldAnimateActor did not delegate to the original');

  // This one intentionally does not delegate: the whole point of the patch is to stop
  // waiting for the overview, so it has to resolve right away.
  assert.equal(await shell.wm._waitForOverviewToHide.call(shell.wm), undefined,
    '_waitForOverviewToHide should resolve immediately');

  assert.equal(shell.workspace.prototype._addWindowClone.call(shell.workspace, metaWindow), clone,
    '_addWindowClone should return the clone the original returned');
  assert.equal(workspace._bmwOverviewClone, clone,
    '_addWindowClone should record the clone for the close animation');

  // _windowRemoved and _doRemoveWindow are gated on _shouldDestroy(). With it false
  // the upstream call is skipped on purpose, so both branches are exercised.
  assert.doesNotThrow(
    () => shell.workspace.prototype._windowRemoved.call(shell.workspace, workspace, metaWindow),
    '_windowRemoved should skip the original when _shouldDestroy() is false');
  ext._shouldDestroy = () => true;
  assert.doesNotThrow(
    () => shell.workspace.prototype._windowRemoved.call(shell.workspace, workspace, metaWindow),
    '_windowRemoved should delegate when _shouldDestroy() is true');
  assert.doesNotThrow(
    () => shell.workspace.prototype._doRemoveWindow.call(shell.workspace, metaWindow),
    '_doRemoveWindow should delegate when _shouldDestroy() is true');

  assert.doesNotThrow(
    () => shell.windowPreview.prototype._init.call(preview, metaWindow, shell.workspace),
    '_init should forward to the original and wire up the unmanaged handler');
  assert.doesNotThrow(
    () => shell.windowPreview.prototype._deleteAll.call(preview),
    '_deleteAll should forward to the original on the first click');
  assert.doesNotThrow(
    () => shell.windowPreview.prototype._restack.call(preview),
    '_restack should forward to the original');

  // With an effect configured, _shouldAnimateActor takes the animation over instead
  // of delegating. That path is unreachable here: it recognises the window-open and
  // window-close paths by looking for '_mapWindow@' / '_destroyWindow@' in
  // (new Error()).stack, and that '@' frame syntax is SpiderMonkey's. V8 writes
  // 'at _mapWindow (...)' instead, so the branch is inert under Node. The next test
  // pins the assumption, and covering the branch for real needs the headless-shell
  // integration script.

  // A _shouldAnimateActor that is not on either path must still reach the original,
  // which is the case for every unrelated caller such as minimise.
  assert.equal(shell.wm._shouldAnimateActor.call(shell.wm, actor, 1), '_shouldAnimateActor',
    '_shouldAnimateActor must delegate on paths it does not handle');
});

test('_shouldAnimateActor recognises the shell call paths by Gecko stack frames', () => {
  // The whole dispatch hinges on the frame syntax of the JS engine this runs on.
  // Asserting the probes are still in the source means a rename of either substring
  // shows up as a test failure rather than as effects that quietly stop working.
  assert.match(SRC, /stack\.includes\('_destroyWindow@'\)/,
    "expected the _destroyWindow@ stack probe");
  assert.match(SRC, /stack\.includes\('_mapWindow@'\)/,
    "expected the _mapWindow@ stack probe");

  // What used to be asserted here -- that a hand-written frame string contains its own
  // probe substring -- could not fail, so it is gone. The two cases below drive the
  // branch instead: the sliced code resolves `Error` from the global scope at call
  // time, so a stack of either shape can be supplied and the fork's own dispatch runs.
});

// The dispatch reads `(new Error()).stack` twice: once in _shouldAnimateActor and once
// inside the ease() override. Installing a fake Error for the duration of a call is
// therefore enough to drive both, which is what retires the "inert under Node" note.
// This is mock-level evidence -- it proves the fork's branch logic, not that GNOME
// Shell 50 emits Gecko-style frames. Tier 1's shouldAnimateActor-takeover-real-stack
// case supplies the engine-level truth by defining a function actually named
// _mapWindow inside a real shell process.
function withStack(frameText, run) {
  const Real = globalThis.Error;
  class ShapedError {
    constructor() {
      this.stack = frameText;
      this.message = '';
    }
  }
  globalThis.Error = ShapedError;
  try {
    return run();
  } finally {
    globalThis.Error = Real;
  }
}

const GECKO_OPEN = `  someFrame@file:///a.js:1:1\n  _mapWindow@resource:///org/gnome/shell/ui/windowManager.js:1465:22`;
const GECKO_CLOSE = `  someFrame@file:///a.js:1:1\n  _destroyWindow@resource:///org/gnome/shell/ui/windowManager.js:1504:9`;
const V8_OPEN = '  at _mapWindow (resource:///org/gnome/shell/ui/windowManager.js:1465:22)';

test('the window-open path is taken over when the stack looks like SpiderMonkey', () => {
  const shell = makeShell();
  const chosen = [];
  const setUps = [];
  const ext = makeExt({
    _chooseEffect: (actor, forOpening) => {
      chosen.push({actor, forOpening});
      return {effect: 'the-effect', profile: 'the-profile'};
    },
    _setupEffect: (actor, forOpening, effect, profile) => {
      setUps.push({actor, forOpening, effect, profile});
    },
  });
  installInto(ext, shell);

  const originalEase = function ease() { return 'stock ease'; };
  const actor = {ease: originalEase};

  const taken = withStack(GECKO_OPEN, () =>
    shell.wm._shouldAnimateActor.call(shell.wm, actor, 1));

  assert.equal(chosen.length, 1, '_chooseEffect was not consulted on the open path');
  assert.equal(chosen[0].forOpening, true, 'the open path must report forOpening = true');
  assert.equal(taken, true,
    'the patch must claim the animation, otherwise the shell eases the window away');
  assert.notEqual(actor.ease, originalEase, 'actor.ease was not intercepted');

  // The override is what actually creates the effect, and it re-reads the stack to
  // reject the X11 resize-that-lands-right-after-map case (issue 335). Driving it with
  // the same open-path frame has to restore the original ease and call _setupEffect.
  withStack(GECKO_OPEN, () => actor.ease({duration: 500, opacity: 0}));

  assert.equal(setUps.length, 1, 'the ease override never created the effect');
  assert.equal(setUps[0].forOpening, true);
  assert.equal(setUps[0].effect, 'the-effect', 'the chosen effect was not forwarded');
  assert.equal(setUps[0].profile, 'the-profile', 'the chosen profile was not forwarded');
  assert.equal(actor.ease, originalEase,
    'the override must hand ease() back when it is done');
});

test('the window-close path is taken over too, and an unrelated caller is not', () => {
  const shell = makeShell();
  const chosen = [];
  const setUps = [];
  const ext = makeExt({
    _chooseEffect: (actor, forOpening) => {
      chosen.push(forOpening);
      return {effect: 'e', profile: 'p'};
    },
    _setupEffect: (...args) => setUps.push(args[1]),
  });
  installInto(ext, shell);

  const actor = {ease: function ease() {}};
  assert.equal(withStack(GECKO_CLOSE, () =>
    shell.wm._shouldAnimateActor.call(shell.wm, actor, 1)), true,
    'the close path must be taken over as well');
  assert.deepEqual(chosen, [false], 'the close path must report forOpening = false');

  withStack(GECKO_CLOSE, () => actor.ease({duration: 500}));
  assert.deepEqual(setUps, [false], 'the ease override lost the forOpening flag');

  // A caller that is on neither path -- minimise, for instance -- has to reach the
  // original untouched, and must not be intercepted at all.
  chosen.length = 0;
  setUps.length = 0;
  const plain = {ease: function ease() { return 'stock'; }};
  assert.equal(withStack('  unrelatedFrame@file:///a.js:9:9', () =>
    shell.wm._shouldAnimateActor.call(shell.wm, plain, 1)), '_shouldAnimateActor',
    'an unrelated caller must delegate to the original');
  assert.equal(chosen.length, 0, '_chooseEffect ran on a path it should ignore');
  assert.equal(plain.ease(), 'stock', 'ease() was intercepted on an unrelated path');
});

test('the V8 frame shape does not take the animation over', () => {
  // This is the negative control that makes the two cases above mean something: with
  // only the Gecko case, a patch that returned true unconditionally would also pass.
  // If an engine ever stops emitting '@' frames, the fork stops intercepting -- which
  // is a visible regression here instead of a silently static window animation.
  const shell = makeShell();
  let consulted = 0;
  const ext = makeExt({
    _chooseEffect: () => { consulted++; return {effect: 'e', profile: 'p'}; },
  });
  installInto(ext, shell);

  const actor = {ease: function ease() { return 'stock'; }};
  const result = withStack(V8_OPEN, () =>
    shell.wm._shouldAnimateActor.call(shell.wm, actor, 1));

  assert.equal(result, '_shouldAnimateActor',
    'the V8 frame shape must not be recognised as a window-open path');
  assert.equal(consulted, 0, '_chooseEffect was consulted on an unrecognised frame shape');
  assert.equal(actor.ease(), 'stock', 'ease() was replaced on an unrecognised frame shape');
});

test('an unchosen effect still delegates to the original', () => {
  // The stack matched, but no profile applies to this window. The patch has to fall
  // through to the shell's own animation instead of swallowing it.
  const shell = makeShell();
  const ext = makeExt({_chooseEffect: () => undefined});
  installInto(ext, shell);

  const actor = {ease: function ease() { return 'stock'; }};
  const result = withStack(GECKO_OPEN, () =>
    shell.wm._shouldAnimateActor.call(shell.wm, actor, 1));

  assert.equal(result, '_shouldAnimateActor',
    'with no effect configured the shell animation must still run');
  assert.equal(actor.ease(), 'stock', 'ease() must be left alone when nothing was chosen');
});
