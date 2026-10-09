// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — repository-level documentation guards for burn-my-windows@local.
//
// These tests assert nothing about runtime behaviour. They guard invariants of the
// repository itself — the ones where a silent violation costs more than a failing
// test: a Chinese page whose English twin was never updated, a section count that
// drifted apart, or a committed doc that reads as unfinished work.
//
//   npm test          (desktop-free: no gjs, no GNOME, no network)
//
// Every assertion message says what a failure MEANS, so a red run is
// self-explanatory. Runtime facts that cannot be observed from outside the shell
// live in the L1 headless layer instead (see MAINTENANCE.md §1).

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {ROOT} from './lib/extension-slices.mjs';

/**
 * Every file in the working tree, skipping VCS and install noise. A directory walk
 * rather than `git ls-files` on purpose: the guards must also see a brand-new doc one
 * second before it is committed, because that is the only moment drift can still be
 * stopped.
 */
function listFiles() {
  const out = [];
  // `reports/` is excluded because it is local-only phase evidence (see .gitignore):
  // its prose is not a committed doc, and guarding it would make the suite depend on
  // files a fresh clone does not have.
  const skip = new Set(['.git', 'node_modules', '__pycache__', 'reports']);
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), {withFileTypes: true})) {
      if (skip.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk('');
  return out.sort();
}

const FILES = listFiles();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const h2 = (rel) => (read(rel).match(/^## /gm) || []).length;

describe('documentation conventions hold', () => {
  // House convention across every fork in this workspace: user-facing docs are a
  // two-file bilingual pair with mirrored section order, English first. Heading LINE
  // numbers are not asserted — they cannot survive prose edits. Section COUNT and the
  // switcher opener can, and that is the enforceable version of the same rule.
  const pairs = FILES
    .filter((f) => path.dirname(f) === '.')
    .filter((f) => f.endsWith('.zh-CN.md'))
    .map((zh) => [zh.replace(/\.zh-CN\.md$/, '.md'), zh]);

  it('every Chinese doc has an English twin with the same section count', () => {
    assert.ok(pairs.length >= 1, 'no bilingual README pair found');
    for (const [en, zh] of pairs) {
      assert.ok(FILES.includes(en), `${zh} has no English twin (${en})`);
      assert.equal(h2(en), h2(zh),
        `${en} has ${h2(en)} sections but ${zh} has ${h2(zh)} — keep the pair in step`);
      for (const f of [en, zh])
        assert.match(read(f), /^<p align="right"><a href=/,
          `${f} must open with the language switcher so the pair stays navigable`);
    }
  });

  it('no committed markdown uses task checkboxes', () => {
    // All the sibling forks use bullets, tables or prose. A checkbox in a committed
    // doc reads as unfinished work and never gets cleaned up.
    for (const f of FILES.filter((x) => x.endsWith('.md')))
      assert.ok(!/^\s*- \[[ xX]\]/m.test(read(f)), `${f} contains a task checkbox`);
  });

  it('phase evidence under reports/ is never committed', () => {
    // reports/ holds PROFILE / AUDIT / PLAN / VERIFY / STATE, which quote raw journal
    // lines, window titles and resolved temp paths -- exactly what must not reach a
    // public remote. Both directions are asserted: the ignore rule has to exist, and
    // nothing may be tracked under the directory even if a file was force-added past
    // the rule.
    const rules = read('.gitignore').split('\n').map((line) => line.trim());
    assert.ok(rules.includes('reports/'),
      '.gitignore no longer ignores reports/ — phase evidence would become committable');
    const tracked = execFileSync('git', ['ls-files', '--', 'reports'],
      {cwd: ROOT, encoding: 'utf8'}).trim();
    assert.equal(tracked, '',
      `reports/ must stay local-only, but git tracks files under it:\n${tracked}`);
  });
});
