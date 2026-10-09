// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — the preferences window's widget-tree surgery must degrade, never crash.
//
// prefs.js reaches through AdwPreferencesWindow's internals to put the menu button on the
// header bar and to hang an Adw.Flap above the content Clamp. That tree is not API: one
// libadwaita release that inserts a container makes a lookup return null, and every
// statement in the block dereferences the result. A throw here does not break animations --
// it breaks the dialog the user needs in order to turn anything off, from a process the
// shell-side probes cannot even see.
//
// So the contract is: **a missing widget costs the decoration, not the window.** Each half
// of the surgery has to survive the other half's failure, and failing quietly is not allowed
// either -- an unattributable silence is how this stays broken for a whole release.
//
// prefs.js is GI-bound, so the methods are sliced and run against a mock widget tree the way
// proxy-retry.test.mjs runs the extension's proxy methods. The traversal under test is the
// real `_findWidgetByType`, not a stub, so the guards are proven against the lookup that
// actually ships.

import assert from 'node:assert/strict';
import test from 'node:test';

import {PREFS_SRC, sliceMethod} from './lib/extension-slices.mjs';

const PREFIX = '[burn-my-windows@local]';

// Every mock widget is iterable over its children, because that is how Gtk.WidgetContainer
// widgets behave under gjs -- which is exactly what `_findWidgetByType` relies on.
class Widget {
  constructor(name, children = []) {
    this.name = name;
    this.children = children;
    this._parent = null;
  }
  get_parent() { return this._parent; }
  [Symbol.iterator]() { return this.children[Symbol.iterator](); }
}

class HeaderBar extends Widget {
  constructor(name = 'header') {
    super(name);
    this.packed = [];
    this.titleWidget = null;
  }
  pack_start(widget) { this.packed.push(widget); }
  set_title_widget(widget) { this.titleWidget = widget; }
}

class Clamp extends Widget {}

class Viewport extends Widget {
  constructor(name = 'viewport') {
    super(name);
    this.child = null;
  }
  set_child(widget) { this.child = widget; }
}

class Scroller extends Widget {
  constructor(name = 'scroller') {
    super(name);
    this.policies = [];
    this.flags = {};
    this.child = null;
  }
  set_policy(h, v) { this.policies.push([h, v]); }
  set_propagate_natural_height(v) { this.flags.propagate = v; }
  set_vexpand(v) { this.flags.vexpand = v; }
  set_child(widget) { this.child = widget; }
}

class Flap extends Widget {
  constructor(name = 'flap') {
    super(name);
    this.content = null;
  }
  set_content(widget) { this.content = widget; }
}

const Adw = {HeaderBar, Clamp};
const Gtk = {
  PolicyType: {NEVER: 'never', AUTOMATIC: 'automatic'},
  ScrolledWindow: {new: () => new Scroller('created')},
};

// `console` is a parameter of the factory, so the sliced methods close over the fake one the
// env installs -- otherwise their warnings go to the real journal-shaped stdout and nothing in
// this file could assert on them.
const FACTORY = new Function('Adw', 'Gtk', 'console',
  `return {${sliceMethod(PREFS_SRC, '_findWidgetByType')},\n` +
  `${sliceMethod(PREFS_SRC, '_installWindowChrome')}};`);

// A healthy GNOME 50 content tree: content -> box -> header, content -> page -> scroller ->
// viewport -> clamp. `skip` short-circuits one of the two lookups, which is how a changed
// libadwaita tree shows up: the widgets still exist, the recursive search just stops finding
// them where it used to.
function makeTree() {
  const header = new HeaderBar();
  const clamp = new Clamp();
  const viewport = new Viewport();
  const scroller = new Scroller();

  clamp._parent = viewport;
  viewport._parent = scroller;
  scroller.children = [viewport];
  viewport.children = [clamp];

  const top = new Widget('content', [
    new Widget('box', [header]),
    new Widget('page', [scroller]),
  ]);

  return {header, clamp, viewport, scroller, top};
}

// Builds the env, runs the surgery against `tree`, and returns everything the assertions need.
// `skip` short-circuits one of the two lookups; the widgets themselves stay in the tree, which
// is how a libadwaita change actually presents: the search stops finding them where it used to.
function run(tree, {skip = null} = {}) {
  const warnings = [];
  const flap = new Flap();
  const menu = new Widget('menu-button');
  const profileButton = new Widget('profile-button');
  const fakeConsole = {warn: (...args) => warnings.push(args.join(' '))};

  const methods = FACTORY(Adw, Gtk, fakeConsole);

  const self = Object.assign({}, methods, {
    _builder: {
      get_object(id) {
        if (id === 'menu-button') return menu;
        if (id === 'profile-button') return profileButton;
        if (id === 'profile-editor-flap') return flap;
        assert.fail(`prefs.js asked the builder for an unexpected object: ${id}`);
      },
    },
    _findWidgetByType(parent, type) {
      if (skip === 'header' && type === Adw.HeaderBar) return null;
      if (skip === 'clamp' && type === Adw.Clamp) return null;
      return methods._findWidgetByType.call(this, parent, type);
    },
  });

  methods._installWindowChrome.call(self, {get_content: () => tree.top});

  return {self, flap, menu, profileButton, warnings};
}

test('the healthy tree still gets both halves of the surgery', () => {
  const tree = makeTree();
  const env = run(tree);

  assert.deepEqual(env.warnings, [],
    `a working widget tree must not warn, got: ${env.warnings.join(' | ')}`);
  assert.equal(tree.header.packed.length, 1, 'the menu button was not packed into the header bar');
  assert.equal(tree.header.packed[0], env.menu);
  assert.equal(tree.header.titleWidget, env.profileButton,
    'the profile button did not become the header bar title widget');

  assert.equal(tree.viewport.child, env.flap, 'the flap was not installed in place of the clamp');
  assert.equal(env.flap.content.name, 'created', 'the flap did not receive a new scrolled window');
  assert.equal(env.flap.content.child, tree.clamp,
    'the clamp was not reparented into the flap content, so the editor would reveal nothing');
  assert.deepEqual(env.flap.content.policies, [['never', 'automatic']],
    'the flap content scrolls the wrong way');
  assert.deepEqual(env.flap.content.flags, {propagate: true, vexpand: true});
  assert.deepEqual(tree.scroller.policies, [['never', 'never']],
    'the outer scroller kept its policy, so the page would scroll twice');
});

test('a missing header bar costs the decoration, not the dialog', () => {
  const tree = makeTree();
  const env = run(tree, {skip: 'header'});

  // The unguarded statement is `header.pack_start(menu)`: with no HeaderBar in the tree it
  // throws, the whole preferences window fails to build, and the user cannot reach the switch
  // that would disable this extension.
  assert.equal(env.warnings.length, 1,
    `a missing header bar must warn exactly once, got ${env.warnings.length}: ${env.warnings.join(' | ')}`);
  assert.ok(env.warnings[0].includes(PREFIX),
    `the warning is not attributable to this fork: ${env.warnings[0]}`);
  assert.equal(tree.viewport.child, env.flap,
    'the profile editor was skipped too -- losing the header must not lose the editor');
});

test('a missing clamp costs the editor, not the header', () => {
  const tree = makeTree();
  const env = run(tree, {skip: 'clamp'});

  assert.equal(env.warnings.length, 1,
    `a missing clamp must warn exactly once, got ${env.warnings.length}`);
  assert.ok(env.warnings[0].includes(PREFIX),
    `the warning is not attributable to this fork: ${env.warnings[0]}`);
  assert.equal(tree.header.packed.length, 1,
    'the menu button was skipped too -- the two halves do not depend on each other');
  assert.equal(tree.header.titleWidget, env.profileButton);
});

test('a chain with no outer scroller is reported, not thrown', () => {
  // `viewport.get_parent().set_policy(...)` dereferences a parent that a libadwaita change
  // could remove. Nothing above it should die with it.
  const tree = makeTree();
  tree.viewport._parent = null;
  const env = run(tree);

  assert.equal(env.warnings.length, 1,
    `an orphaned viewport must warn exactly once, got ${env.warnings.length}`);
  assert.ok(env.warnings[0].includes(PREFIX),
    `the warning is not attributable to this fork: ${env.warnings[0]}`);
  assert.equal(tree.header.packed.length, 1, 'the header half must still be installed');
});

test('every prefs.js warning carries the prefix the log channel is read by', () => {
  // prefs.js logs to a different journald identifier than the shell (org.gnome.Shell.Extensions),
  // so an unattributable line there cannot be told apart from another extension's. The floor is
  // a control: this invariant means nothing once the file stops warning at all.
  const all = PREFS_SRC.match(/console\.warn\(/g) ?? [];
  assert.ok(all.length >= 2,
    `only ${all.length} console.warn sites in prefs.js -- the guards this gate exists for were ` +
    'removed, so the prefix check below is decoration');
  const prefixed = PREFS_SRC.match(/console\.warn\(`\[burn-my-windows@local\]/g) ?? [];
  assert.equal(prefixed.length, all.length,
    `a console.warn in prefs.js is missing the literal ${PREFIX} prefix ` +
    `(${prefixed.length} of ${all.length} carry it)`);
});
