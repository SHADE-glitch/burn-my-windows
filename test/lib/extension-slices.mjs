// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — shared source slicing for burn-my-windows@local tests.
//
// extension.js and prefs.js are both GI-bound and cannot be imported outside GNOME Shell (or
// outside the preferences process), so every static gate reads them as text. The regions are
// located by the stable comments around them, never by line numbers: a line-number anchor
// breaks on every unrelated edit above it and silently stops testing what it claimed to test.

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const readRepo = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

export const SRC = readRepo('extension.js');
export const PREFS_SRC = readRepo('prefs.js');

// The 8 methods enable() replaces. `instance: true` marks the two that are assigned
// onto Main.wm as own properties instead of onto a prototype.
export const PATCHES = [
  {holder: 'wm', name: '_shouldAnimateActor', instance: true},
  {holder: 'wm', name: '_waitForOverviewToHide', instance: true},
  {holder: 'workspace', name: '_addWindowClone', instance: false},
  {holder: 'workspace', name: '_windowRemoved', instance: false},
  {holder: 'workspace', name: '_doRemoveWindow', instance: false},
  {holder: 'windowPreview', name: '_init', instance: false},
  {holder: 'windowPreview', name: '_deleteAll', instance: false},
  {holder: 'windowPreview', name: '_restack', instance: false},
];

export const INSTALL_START =
  'this._origShouldAnimateActor    = Main.wm._shouldAnimateActor;';
export const INSTALL_END =
  '  // This function could be called after the extension is uninstalled';
export const RESTORE_START =
  '    // Restore the original window-open and window-close animations.';
export const RESTORE_END =
  '    // Disconnect the active-profile handler.';

export function sliceBetween(source, startAnchor, endAnchor) {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor);
  assert.notEqual(start, -1, `slice start anchor not found: ${startAnchor}`);
  assert.notEqual(end, -1, `slice end anchor not found: ${endAnchor}`);
  assert.ok(start < end, `slice anchors are inverted: ${startAnchor}`);
  return source.slice(start, end);
}

// One whole class method, body included. Brace counting rather than a pair of comment
// anchors: these methods are scattered through the class, and six more anchor comments
// would be six more things to keep in sync. Strings and comments are skipped, because
// a stray brace in prose would otherwise end the slice early.
export function sliceMethod(source, name) {
  const start = source.indexOf(`\n  ${name}(`);
  assert.notEqual(start, -1,
    `${name}() is not a two-space-indented method of the source being sliced ` +
    '(extension.js and prefs.js are both sliced here)');
  const open = source.indexOf('{', source.indexOf(')', start));
  assert.notEqual(open, -1, `${name}() has no body`);

  let depth = 0;
  let i = open;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (c === '\n') lineComment = false;
    } else if (blockComment) {
      if (c === '*' && next === '/') { blockComment = false; i++; }
    } else if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '/' && next === '/') {
      lineComment = true; i++;
    } else if (c === '/' && next === '*') {
      blockComment = true; i++;
    } else if (c === '"' || c === '\'' || c === '`') {
      quote = c;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(start + 1, i + 1);
    }
    i++;
  }
  assert.fail(`${name}() has unbalanced braces -- the slice would run past it`);
}

// enable() declares `const extensionThis = this` before the first patch, and every
// replacement reaches its original through that alias, so a replay has to provide it.
export function installSource() {
  const region = sliceBetween(SRC, INSTALL_START, INSTALL_END);
  // The region still carries enable()'s own closing brace. Inside a class body every
  // method closes with exactly two spaces of indent, so that terminator is dropped
  // explicitly -- cutting here verbatim yields a SyntaxError deep inside
  // new Function() that says nothing about the cause.
  const tail = region.lastIndexOf('\n  }\n');
  assert.notEqual(tail, -1,
    'could not find the end of enable() while slicing the install region');
  return 'const extensionThis = this;\n' + region.slice(0, tail + 1);
}

export function restoreSource() {
  return sliceBetween(SRC, RESTORE_START, RESTORE_END);
}

// ---------------------------------------------------------------- sentinel tables

const SENTINEL_PREFIX = '[burn-my-windows@local] expected';

// Anchors for the three probe families. All of them sit in _doEnable() except the
// instance-field probe, which lives inside the patched WindowPreview.prototype._init
// because the fields it checks are plain assignments made by the original _init().
const FUNCTION_TABLE_END = INSTALL_START;
const FUNCTION_TABLE_START =
  '// Sentinel for GNOME upgrades: all patch targets below are private Shell';
const ACCESSOR_TABLE_START = 'const findDescriptor = (obj, name) => {';
const ACCESSOR_TABLE_END = INSTALL_START;
const PROBE_START = "// Sentinel for the private instance fields we rely on.";
const PROBE_END = '    // The _deleteAll is called when the user clicks';

// Function-table entries are exactly the 2-element tuples; accessor entries carry two
// extra flags, so the same regex cannot confuse the two families.
export function sentinelFunctions() {
  const region = sliceBetween(SRC, FUNCTION_TABLE_START, FUNCTION_TABLE_END);
  return [...region.matchAll(
    /\[\s*(Main\.wm|Workspace\.prototype|WindowPreview\.prototype),\s*'(_\w+)'\]/g)]
    .map(([, holder, name]) => ({holder, name}));
}

export function sentinelAccessors() {
  const region = sliceBetween(SRC, ACCESSOR_TABLE_START, ACCESSOR_TABLE_END);
  return [...region.matchAll(
    /\[\s*WindowPreview\.prototype,\s*'(\w+)',\s*(true|false),\s*(true|false)\]/g)]
    .map(([, name, get, set]) => ({name, needGet: get === 'true', needSet: set === 'true'}));
}

export function sentinelInstanceFields() {
  const region = sliceBetween(SRC, PROBE_START, PROBE_END);
  const tuples = [...region.matchAll(
    /\[\s*'(WindowPreview|Workspace)',\s*(this|params\[1\]),\s*'(_\w+)'\]/g)]
    .map(([, className, target, name]) => ({className, target, name}));
  return {tuples, region, arrayCheck: /Array\.isArray\(params\[1\]\._windows\)/.test(region)};
}

// `this._orig* = <holder>._*;` -- the captures enable() makes.
export function origCaptures() {
  return SRC.match(
    /^\s*this\.(_orig\w+)\s*=\s*(?:Main\.wm|Workspace\.prototype|WindowPreview\.prototype)\._\w+;/gm)
    ?? [];
}

// Every restore must be guarded, and so must every install.
export function guardedRestores() {
  return SRC.match(
    /if \(this\._orig\w+\)\n\s+(?:Main\.wm|Workspace\.prototype|WindowPreview\.prototype)\._\w+ = this\._orig\w+;/g)
    ?? [];
}

export function guardedInstalls() {
  return SRC.match(/\n\s*if \(this\.(_orig\w+)\) \{/g) ?? [];
}

export function warnSites() {
  return SRC.match(/console\.warn\(`\[burn-my-windows@local\]/g) ?? [];
}

export function sentinelWarnSites() {
  return SRC.match(new RegExp(SENTINEL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))
    ?? [];
}
