// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — sentinel drift gate for burn-my-windows@local.
//
// The fork's only defence against a GNOME upgrade renaming a private API it patches
// is the sentinel in _doEnable(): three probe tables that warn instead of throwing.
// That defence is worth nothing if it silently stops covering what the code uses --
// so this gate holds the tables, the patch list and the guards to each other.
//
// Nothing here runs the code; it reads the source. The live check is Tier 1's
// `sentinel-symbols-present` case in test/integration.sh, which measures the same
// symbols against a real GNOME Shell process.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SRC, PATCHES,
  sentinelFunctions, sentinelAccessors, sentinelInstanceFields,
  origCaptures, guardedRestores, guardedInstalls, warnSites, sentinelWarnSites,
} from './lib/extension-slices.mjs';

const HOLDER_OF = {
  wm: 'Main.wm',
  workspace: 'Workspace.prototype',
  windowPreview: 'WindowPreview.prototype',
};

// The three symbols the sentinel checks but never patches: they are called from the
// animation completion path, so they exist in the table only because something
// dereferences them.
const CALL_ONLY_SYMBOLS = ['_mapWindowDone', '_destroyWindowDone', '_lookupIndex'];

test('the patch list matches the originals enable() captures', () => {
  const captures = origCaptures();
  assert.equal(captures.length, PATCHES.length,
    `enable() captures ${captures.length} originals but PATCHES lists ${PATCHES.length}. ` +
    'A 9th monkey-patch has to be added to test/lib/extension-slices.mjs or the ' +
    'install/restore symmetry gate stops covering it.');

  // Each patch must be captured from the holder it is later written back to. This is
  // the link between the PATCHES table and the source: the saved-original field names
  // are free-form, so they are matched by their right-hand side instead.
  for (const {holder, name} of PATCHES) {
    const rhs = `${HOLDER_OF[holder]}.${name}`;
    const hits = captures.filter(c => c.includes(`= ${rhs};`));
    assert.equal(hits.length, 1,
      `expected exactly one capture of ${rhs}, found ${hits.length}: ` +
      `${hits.map(h => h.trim()).join(' | ') || 'none'}`);
  }
});

test('every patched method is also watched by the sentinel', () => {
  const watched = new Set(sentinelFunctions().map(s => s.name));
  const unwatched = PATCHES.map(p => p.name).filter(n => !watched.has(n));
  assert.deepEqual(unwatched, [],
    `patched but not sentinel-checked: ${unwatched.join(', ')}. A rename by upstream ` +
    'would then be silent, which is the whole thing this fork is trying to avoid.');

  const functions = sentinelFunctions();
  assert.equal(functions.length, PATCHES.length + CALL_ONLY_SYMBOLS.length,
    `expected ${PATCHES.length} patched + ${CALL_ONLY_SYMBOLS.length} call-only ` +
    `sentinel entries, found ${functions.length}`);

  // A symbol earns its place in the table by being dereferenced somewhere.
  for (const name of CALL_ONLY_SYMBOLS) {
    assert.ok(
      new RegExp(`(Main\\.wm|workspace)\\.${name}\\(`).test(SRC) ||
      new RegExp(`${name}\\(`).test(SRC),
      `the sentinel checks ${name} but no code calls it any more -- drop the row`);
  }
});

test('sentinel holders agree with the patch targets', () => {
  const table = sentinelFunctions();
  for (const {holder, name} of PATCHES) {
    const row = table.find(s => s.name === name);
    assert.ok(row, `the sentinel has no row for ${name}`);
    assert.equal(row.holder, HOLDER_OF[holder],
      `the sentinel checks ${name} on ${row.holder} but the patch writes it on ` +
      `${HOLDER_OF[holder]}. Warning about a symbol that is not the one in use is ` +
      'the most misleading thing a sentinel can do.`');
  }
});

test('both sides of every patch are guarded', () => {
  const restores = guardedRestores();
  assert.equal(restores.length, PATCHES.length,
    `expected ${PATCHES.length} guarded restores in _doDisable(), found ${restores.length}`);
  const installs = guardedInstalls();
  assert.equal(installs.length, PATCHES.length,
    `expected ${PATCHES.length} guarded installs in _doEnable(), found ${installs.length}`);

  // A one-sided guard is the specific bug: an unguarded install re-creates a method
  // upstream no longer has, and the guarded restore then skips it, leaving the stub
  // for the rest of the login session.
  const installed = new Set(installs.map(s => s.match(/_orig\w+/)[0]));
  const restored = new Set(restores.map(s => s.match(/_orig\w+/)[0]));
  assert.deepEqual([...installed].sort(), [...restored].sort(),
    'the install and restore guards cover different methods');
});

test('the three probe families still hold what they hold today', () => {
  const accessors = sentinelAccessors();
  assert.deepEqual(accessors.map(a => a.name).sort(), ['overlayEnabled', 'window_container'],
    'the accessor table changed -- update MAINTENANCE.md section 2 in the same commit');
  assert.equal(accessors.find(a => a.name === 'overlayEnabled').needSet, true,
    'overlayEnabled must require a setter: writing it is what hides the window overlay');
  assert.equal(accessors.find(a => a.name === 'window_container').needSet, false,
    'window_container is read-only for this fork; requiring a setter would warn on a ' +
    'perfectly working shell');

  const fields = sentinelInstanceFields();
  assert.equal(fields.tuples.length, 4, 'the instance-field probe changed shape');
  assert.equal(fields.arrayCheck, true,
    'Workspace._windows must still be asserted as an array: WorkspaceLayout holds a Map ' +
    'of the same name and _shouldDestroy() indexes into this one');
  assert.deepEqual(fields.tuples.map(t => t.name).sort(),
    ['_closeRequested', '_icon', '_windowActor', '_windows']);
});

test('the log prefix the runbook greps for is still there', () => {
  assert.equal(warnSites().length, 5,
    'expected 5 console.warn sites carrying the literal [burn-my-windows@local] prefix');
  assert.equal(sentinelWarnSites().length, 4,
    'expected 4 sentinel warnings of the form "expected ... to be ..."');
  assert.equal((SRC.match(/\[burn-my-windows@local\] expected/g) ?? []).length, 4,
    'the sentinel message wording changed -- every log assertion in Tiers 1-3 and ' +
    'MAINTENANCE.md section 5 greps on it');
});

// The instance-field probe runs inside WindowPreview.prototype._init -- the most
// safety-critical patch in this file, on the path every overview thumbnail takes. It
// is only allowed to *look*, never to touch. A future "helpful" addition that reads
// this.window_container there would invoke a GObject getter on a half-built preview,
// and that must fail a test rather than a Friday.
test('the instance-field probe cannot touch the object it inspects', () => {
  const {region} = sentinelInstanceFields();
  assert.ok(!/[^A-Za-z]this\./.test(region),
    'the probe must not read a property off `this` -- only `in`, `typeof` and ' +
    'Array.isArray are allowed there');
  assert.ok(!region.includes('.connect('),
    'the probe must not connect signals');
  assert.ok(!/\.get_[a-z_]+\(/.test(region),
    'the probe must not call a getter method');
  assert.ok(!region.includes('getOwnPropertyDescriptor'),
    'the probe inspects instances, so a descriptor walk would find nothing and warn ' +
    'on a healthy shell');
  assert.equal((region.match(/console\.warn/g) ?? []).length, 2,
    'the probe has exactly two warning sites: the field loop and the array check');
});
