// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — where the preferences window sends the user, and who it credits.
//
// A fork has two different answers to "where do I go from here", and a search-and-replace of
// the upstream repository name gives the same answer to both. Reporting a broken animation has
// to reach the code that is actually maintained here; writing the effect and paying for the
// artwork still belongs to upstream. Both halves are one edit away from being wrong, and the
// wrong half is not visible from the dialog -- it is visible weeks later, in an issue tracker
// nobody reads or in a credit line that quietly disappeared.
//
// The expected fork URL is read from README.md rather than repeated here: two copies of a URL
// are one drift waiting to happen, and the README is the copy the user reads.

import assert from 'node:assert/strict';
import test from 'node:test';

import {PREFS_SRC, readRepo} from './lib/extension-slices.mjs';

// The clone line is the fork's own address, stated once per README language.
function forkUrl() {
  const m = /git clone https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\.git/.exec(readRepo('README.md'));
  assert.ok(m,
    'README.md has no `git clone https://github.com/<owner>/<repo>.git` line, so there is no '
    + 'fork address for this gate to compare against');
  return `https://github.com/${m[1]}/${m[2]}`;
}

// The upstream block of the same README carries the author whose name must stay in the About
// dialog. Taken from the repository owner so the check does not hardcode a person.
function upstreamOwner() {
  const m = /Upstream:\*\* \[([^\]]+)\]\(https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\)/
    .exec(readRepo('README.md'));
  assert.ok(m,
    'README.md has no `**Upstream:** [..](https://github.com/<owner>/<repo>)` line, so the '
    + 'author this gate is supposed to keep credited is unknown');
  return m[2];
}

function menuUrl(actionName) {
  const m = new RegExp(`addURIAction\\('${actionName}',\\s*'([^']+)'\\)`).exec(PREFS_SRC);
  assert.ok(m,
    `prefs.js no longer has addURIAction('${actionName}', …) -- the menu entry this gate is `
    + 'about is gone, so there is nothing left to point anywhere');
  return m[1];
}

function aboutField(setter) {
  const m = new RegExp(`dialog\\.${setter}\\('([^']+)'\\)`).exec(PREFS_SRC);
  assert.ok(m, `prefs.js no longer calls dialog.${setter}('<text>') -- the About dialog lost `
    + 'that field, and a gate over a field that does not exist proves nothing');
  return m[1];
}

// The changelog action does not go through addURIAction: it is the one menu entry that is also
// triggered by the "what changed" toast, so its URL sits inside a Gtk.show_uri() call.
function changelogUrl() {
  const m = /Gtk\.show_uri\(\s*null,\s*'([^']+)'/.exec(PREFS_SRC);
  assert.ok(m,
    'prefs.js no longer has a Gtk.show_uri(null, …) call for the changelog action -- either the '
    + 'action is gone or it stopped opening a URL, and this gate would be checking nothing');
  return m[1];
}

test('the two addresses are different repositories', () => {
  // Without this, a fork URL that accidentally *is* upstream would make every assertion below
  // pass while checking nothing at all.
  assert.notEqual(forkUrl(), `https://github.com/${upstreamOwner()}/Burn-My-Windows`,
    'the README documents the fork and the upstream as the same repository -- the checks that '
    + 'follow would pass by construction');
});

test('reporting a problem reaches the code that is actually maintained', () => {
  const where = {
    "menu 'bugs'": menuUrl('bugs'),
    "menu 'homepage'": menuUrl('homepage'),
    'About set_issue_url': aboutField('set_issue_url'),
    'About set_website': aboutField('set_website'),
    // The changelog is the slot the update toast points at, so a reader following it is told
    // what changed in *this* code -- upstream's changelog cannot say that.
    'changelog action': changelogUrl(),
  };
  for (const [label, url] of Object.entries(where)) {
    assert.ok(url.startsWith(forkUrl()),
      `${label} sends the user to ${url}, which is not ${forkUrl()} -- an issue filed there `
      + 'lands in a tracker that does not have this code');
  }
});

test('the credit lines still name the upstream author', () => {
  const author = upstreamOwner();
  for (const [label, text] of [
    ['About set_developer_name', aboutField('set_developer_name')],
    ['About set_copyright', aboutField('set_copyright')],
  ]) {
    assert.match(text, new RegExp(author, 'i'),
      `${label} reads "${text}" -- repointing the URLs is not a licence to remove the author `
      + `(${author}) from the dialog`);
  }
});

test('the money and the translation queue stay with upstream', () => {
  // Donations and Weblate are the upstream author's, and Q5 keeps the donation dialog exactly
  // as it is. If these ever move to the fork, the fork's owner is being asked to fund work
  // they did not write -- so this is a decision, not a detail.
  const keepers = ['donate-kofi', 'donate-github', 'donate-paypal', 'donate-crypto',
                   'show-sponsors', 'translate'];
  const urls = keepers.map((name) => [name, menuUrl(name)]);
  assert.ok(urls.length >= 6, 'the list of links that must stay upstream is empty');

  for (const [name, url] of urls) {
    assert.ok(!url.startsWith(forkUrl()),
      `addURIAction('${name}', …) now points at the fork (${url}) -- the fork does not run `
      + 'that donation page or that translation instance');
  }
});

test('the attribution edits stayed inside the five slots they belong to', () => {
  // One whole-menu sweep of `Schneegans` -> fork owner would also rewrite `new-effect`,
  // `wallpapers` and the donation pages, which document upstream's own work. Counting the
  // URLs that carry the fork address catches that sweep without naming each upstream link.
  const forkAddressed = (PREFS_SRC.match(new RegExp(forkUrl().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []);
  assert.equal(forkAddressed.length, 5,
    `prefs.js carries the fork address ${forkAddressed.length} times, expected exactly 5 `
    + '(menu homepage, menu bugs, About website, About issues, changelog action). More than five '
    + 'means a sweep reached something that is still upstream documentation; fewer means one slot '
    + 'was missed.');
});
