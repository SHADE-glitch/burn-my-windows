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
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'extension.js'), 'utf8');

// The 8 methods enable() replaces. `instance: true` marks the two that are assigned
// onto Main.wm as own properties instead of onto a prototype. That difference is
// what originally made them look like the only ones needing an install guard, but
// the failure mode below is identical for both kinds: a missing upstream method
// would be re-created as a stub, and the guarded restore would then have nothing to
// put back. So all 8 need the guard, and these tests hold them to it.
const PATCHES = [
  {holder: 'wm', name: '_shouldAnimateActor', instance: true},
  {holder: 'wm', name: '_waitForOverviewToHide', instance: true},
  {holder: 'workspace', name: '_addWindowClone', instance: false},
  {holder: 'workspace', name: '_windowRemoved', instance: false},
  {holder: 'workspace', name: '_doRemoveWindow', instance: false},
  {holder: 'windowPreview', name: '_init', instance: false},
  {holder: 'windowPreview', name: '_deleteAll', instance: false},
  {holder: 'windowPreview', name: '_restack', instance: false},
];

const PATCH_COUNT = PATCHES.length;

const INSTALL_START =
  'this._origShouldAnimateActor    = Main.wm._shouldAnimateActor;';
const INSTALL_END =
  '  // This function could be called after the extension is uninstalled';
const RESTORE_START =
  '    // Restore the original window-open and window-close animations.';
const RESTORE_END =
  '    // Disconnect the active-profile handler.';

function sliceBetween(startAnchor, endAnchor) {
  const start = SRC.indexOf(startAnchor);
  const end = SRC.indexOf(endAnchor);
  assert.notEqual(start, -1, `slice start anchor not found: ${startAnchor}`);
  assert.notEqual(end, -1, `slice end anchor not found: ${endAnchor}`);
  assert.ok(start < end, `slice anchors are inverted: ${startAnchor}`);
  return SRC.slice(start, end);
}

// The install region runs up to the comment that introduces disable(), so it still
// carries enable()'s own closing brace at the end. Cutting the slice there verbatim
// yields a SyntaxError deep inside new Function(), which says nothing about the
// cause, so the method terminator is dropped explicitly: inside a class body every
// method closes with exactly two spaces of indent.
const INSTALL_REGION = sliceBetween(INSTALL_START, INSTALL_END);
const INSTALL_TAIL = INSTALL_REGION.lastIndexOf('\n  }\n');
assert.notEqual(INSTALL_TAIL, -1,
  'could not find the end of enable() while slicing the install region');
const INSTALL_BODY = INSTALL_REGION.slice(0, INSTALL_TAIL + 1);

// enable() declares `const extensionThis = this` before the first patch, and every
// replacement reaches its original through that alias, so a replay has to provide it
// or the delegation under test would not be the production one.
const INSTALL_SRC = 'const extensionThis = this;\n' + INSTALL_BODY;
const RESTORE_SRC = sliceBetween(RESTORE_START, RESTORE_END);

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
  // Under V8 the substring never matches, so the replacements would silently stop
  // taking the animation over. Asserting it here means a future engine change shows
  // up as a test failure rather than as effects that quietly stop working.
  assert.match(SRC, /stack\.includes\('_destroyWindow@'\)/,
    "expected the _destroyWindow@ stack probe");
  assert.match(SRC, /stack\.includes\('_mapWindow@'\)/,
    "expected the _mapWindow@ stack probe");

  const frame = '_mapWindow@resource:///org/gnome/shell/ui/windowManager.js:1465:22';
  assert.ok(frame.includes('_mapWindow@'),
    'sanity check: the Gecko frame syntax used by the code must match its probe');
  const v8Frame = 'at _mapWindow (resource:///org/gnome/shell/ui/windowManager.js:1465:22)';
  assert.ok(!v8Frame.includes('_mapWindow@'),
    'sanity check: the V8 frame syntax must NOT match, which is why this path is untested here');
});
