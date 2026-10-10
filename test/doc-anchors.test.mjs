// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — line-number anchor guards for burn-my-windows@local documentation.
//
// A `file:line` anchor is the least trustworthy citation this repo writes. A moved heading
// still has a name that a reader (and test/docs-links.test.mjs) can match; a bare number
// has no name, so when the code above it grows or shrinks the anchor keeps reading as
// evidence while pointing at unrelated syntax. Line counts shift in bulk — one added block
// in extension.js re-points every anchor below it.
//
// This gate exists because a one-off mechanical walk found the failure already in the
// tree: the extension.js function table in docs/maintenance/shell-internal-api.md cited
// `:1088`, `:1090` and `:1107` for three call sites that actually live at 1240, 1242 and
// 1259 — and two of the three cited lines were a lone brace and a blank line. Nobody
// noticed, because nothing looked. So the rule encoded here is: an anchor must name its
// file (only then can anything check it), and the line it names must exist and say something.
//
//   npm test          (desktop-free: no gjs, no GNOME, no network)
//
// Scope, with the reason for each exclusion. All three are decisions, and each carries a
// control assertion below so that "not scanned" can never silently mean "not seen":
//   - CHANGELOG.md is NOT scanned. Ledger entries assert what was true AS OF their commit;
//     re-checking them against today's tree would turn correct history into a false red.
//   - reports/ is gitignored local-only phase evidence: a fresh clone does not have it, so
//     no committed gate may depend on its prose (same reasoning as test/repo.test.mjs).
//   - Anchors inside .js comments are NOT scanned either, because extension.js cites
//     upstream GNOME Shell files (workspace.js:1090, windowPreview.js:48) that are not in
//     this tree at all. A repo-wide rule would need a hand-maintained allowlist of "whose
//     file is this", which is the kind of expectation this suite avoids. Those comments
//     were walked by hand in the round this gate was written and were live; source comments
//     should name the symbol instead, as the probe comments mostly already do.
//
// Every expectation is derived from the files themselves, and every assertion message says
// what a failure MEANS, so a red run is self-explanatory.

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {ROOT} from './lib/extension-slices.mjs';

const LEDGER = 'CHANGELOG.md';

// The extensions an anchor may name. `metadata.json:donations` cannot match, because the
// part after the colon there is not a number.
const EXT = 'js|mjs|ui|frag|glsl|json|css|xml|sh|py|md';
const NAMED_ANCHOR = new RegExp(
  `([A-Za-z0-9._/+-]+\\.(?:${EXT})):(\\d+(?:[ \\t]*,[ \\t]*\\d+)*)`, 'g');
// A colon+digits that names no file. A digit before the colon marks a time or a duration
// (08:47:19, 3:22) and a letter marks a host:port (github.com:443) — neither is an anchor,
// so both are excluded by the lookbehind instead of by a list of exceptions.
const BARE_ANCHOR = /(?<![0-9A-Za-z._/:-]):(\d{2,5})(?![0-9])/g;

/** Every file in the working tree, minus VCS/install noise and the gitignored reports. */
function listFiles() {
  const out = [];
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
const DOCS = FILES.filter((f) => f.endsWith('.md') && f !== LEDGER);

const BY_BASENAME = new Map();
for (const f of FILES) {
  const base = path.posix.basename(f);
  if (!BY_BASENAME.has(base)) BY_BASENAME.set(base, []);
  BY_BASENAME.get(base).push(f);
}

const LINES = new Map();
function linesOf(rel) {
  if (!LINES.has(rel)) LINES.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n'));
  return LINES.get(rel);
}

/**
 * Resolve the file half of an anchor the way a reader would: the written path if the repo
 * has that path, otherwise the basename — but only when exactly one file carries it, since
 * the docs cite effect classes by name alone (Doom.js:55). Two candidates is refused, not
 * guessed: guessing is how a gate starts validating a file the prose does not mean.
 */
function resolveAnchorFile(token) {
  if (FILES.includes(token)) return {file: token, candidates: [token]};
  const candidates = BY_BASENAME.get(path.posix.basename(token)) ?? [];
  return {file: candidates.length === 1 ? candidates[0] : null, candidates};
}

/** The line numbers one anchor claims, so utils.js:137,138,199 becomes three checks. */
function namedStrings(text) {
  const out = [];
  for (const m of text.matchAll(NAMED_ANCHOR)) {
    for (const num of m[2].split(',')) out.push(Number(num.trim()));
  }
  return out;
}

function bareStrings(text) {
  return [...text.replace(NAMED_ANCHOR, ' ').matchAll(BARE_ANCHOR)].length;
}

function namedAnchors(rel) {
  const found = [];
  linesOf(rel).forEach((line, i) => {
    for (const m of line.matchAll(NAMED_ANCHOR)) {
      for (const num of m[2].split(',')) {
        found.push({file: m[1], line: Number(num.trim()), at: i + 1});
      }
    }
  });
  return found;
}

function bareAnchors(rel) {
  const found = [];
  linesOf(rel).forEach((line, i) => {
    const masked = line.replace(NAMED_ANCHOR, ' ');
    for (const m of masked.matchAll(BARE_ANCHOR)) {
      found.push({line: Number(m[1]), at: i + 1, text: line.trim()});
    }
  });
  return found;
}

const ALL_NAMED = DOCS.flatMap((rel) => namedAnchors(rel).map((a) => ({...a, from: rel})));
const ALL_BARE = DOCS.flatMap((rel) => bareAnchors(rel).map((a) => ({...a, from: rel})));

const bareWhere = (a) => `      ${a.from}:${a.at}  :${a.line}  | ${a.text.slice(0, 90)}`;

describe('every line-number anchor in the docs names a file and a real line in it', () => {
  it('the file half resolves inside this repository', () => {
    for (const a of ALL_NAMED) {
      const {file, candidates} = resolveAnchorFile(a.file);
      if (candidates.length > 1) {
        assert.fail(
          `${a.from}:${a.at} cites ${a.file}:${a.line} by basename, but that name is ambiguous ` +
          `here -- ${candidates.length} files share it (${candidates.join(', ')}). Picking one ` +
          'would make this gate validate a file the prose does not mean.');
      }
      assert.ok(file,
        `${a.from}:${a.at} cites ${a.file}:${a.line}, which is not a file in this repo. The ` +
        'sentence around it is written as a measured fact, so a reader has no way to notice that ' +
        'the file was renamed, moved or deleted after the number was taken.');
    }
  });

  it('the line half exists and is not blank', () => {
    for (const a of ALL_NAMED) {
      const file = resolveAnchorFile(a.file).file;
      if (!file) continue; // already failed above; a line check on a missing file is noise
      const body = linesOf(file);
      const content = body[a.line - 1];
      assert.ok(a.line >= 1,
        `${a.from}:${a.at} cites ${a.file} line ${a.line}. Line numbering starts at 1, so this ` +
        'is not a place in the file at all -- an off-by-one was typed into the doc.');
      assert.ok(content !== undefined,
        `${a.from}:${a.at} cites ${a.file}:${a.line}, but ${file} only has ${body.length} lines. ` +
        'The code it pointed at moved below EOF or was deleted, and the doc still cites it as ' +
        'evidence for a claim about current behaviour.');
      assert.ok(content.trim() !== '',
        `${a.from}:${a.at} cites ${a.file}:${a.line}, which is a blank line in that file. That is ` +
        'the signature of a drifted anchor: the claim was true at some line, the code shifted, ' +
        'and the number now lands on whitespace. Re-take it against the current file, or cite ' +
        'the symbol instead.');
    }
  });

  it('no anchor is written without the file it belongs to', () => {
    assert.equal(ALL_BARE.length, 0,
      `these citations give a line number but name no file:\n` +
      `${ALL_BARE.map(bareWhere).join('\n')}\n` +
      '    A bare :123 cannot be checked by anything, because nothing says which file the 123 ' +
      'belongs to -- and it is exactly the shape that rotted unnoticed in the extension.js ' +
      'function table. Write the file name inside the same code span.');

    // Controls in both directions: the scanner must fire on a synthetic bare reference, and
    // must NOT fire on the things that merely look like one. Without these, a lookbehind that
    // stopped matching anything would be indistinguishable from a clean docs tree.
    assert.equal(bareStrings('see `:209` for the loader'), 1,
      'the bare-anchor scanner no longer recognises the shape it exists for, so the assertion ' +
      'above is passing by blindness rather than by the docs being clean');
    for (const notAnAnchor of ['本轮 08:47:19–08:50:49', '四轮分别计时：3:22 / 3:24',
      'https 形态连 github.com:443 会静默挂死', '`metadata.json:donations` 一概不动']) {
      assert.equal(bareStrings(notAnAnchor), 0,
        `the bare-anchor scanner matched inside "${notAnAnchor}", which is a time, a duration, ` +
        'a host:port or a gsettings key path -- not an anchor. A scanner that flags ordinary ' +
        'prose gets ignored instead of obeyed.');
    }
  });
});

describe('the anchor scanner is a scanner, not a decoration', () => {
  it('it sees the anchor shapes this repo actually writes', () => {
    assert.ok(DOCS.length >= 7,
      `only ${DOCS.length} markdown files were walked, so this gate is looking at almost ` +
      'nothing -- the walk broke, not the docs');
    assert.ok(ALL_NAMED.length >= 15,
      `only ${ALL_NAMED.length} named anchors were found across ${DOCS.length} docs. These docs ` +
      'cite dozens; a count this low means the anchor pattern stopped matching, which would make ' +
      'every assertion above vacuous.');
    assert.ok(ALL_NAMED.length <= 200,
      `${ALL_NAMED.length} anchors were found, more than these docs contain. Something in the ` +
      'pattern is matching ordinary prose, and the failures it reports will not be believed.');

    // Positive controls on the exact shapes the docs use, so a broken pattern is caught here
    // even if every live anchor were deleted.
    assert.deepEqual(namedStrings('对照 `src/utils.js:137,138,199` 与 `Doom.js:55,113`'),
      [137, 138, 199, 55, 113],
      'a comma list of line numbers stopped being expanded into one check per number, so the ' +
      'later numbers in every list would go unchecked');
    assert.deepEqual(namedStrings('see `resources/shaders/glide.frag:12`'), [12],
      'anchors into assets (.frag / .ui / .xml paths) stopped being recognised');
    assert.equal(namedStrings('`metadata.json:donations` 一概不动').length, 0,
      'a gsettings-style key:subkey is being read as an anchor');
  });

  it('it would have flagged the ledger, and excludes it on purpose', () => {
    // Without this, "CHANGELOG.md is not scanned" is indistinguishable from "the scanner is
    // blind to CHANGELOG.md", and the exclusion could rot into a hole nobody chose.
    const hits = namedStrings(fs.readFileSync(path.join(ROOT, LEDGER), 'utf8'));
    assert.ok(hits.length >= 1,
      `${LEDGER} contains no file:line anchor at all now, so the exclusion above is no longer a ` +
      'decision about a real risk. Either the ledger lost its citations or the pattern broke -- ' +
      'in both cases this gate no longer scans the scope it describes.');
  });

  it('resolution refuses to guess', () => {
    // Unit checks on the resolver every assertion above consumes, pinned on synthetic tokens
    // because the repo cannot be relied on to contain each shape.
    assert.equal(resolveAnchorFile('nope.js').file, null,
      'a file name that does not exist resolved to something. Falling back would keep a broken ' +
      'citation green, which is the one outcome worse than a red.');
    assert.equal(resolveAnchorFile('Doom.js').file, 'src/effects/Doom.js',
      'a unique basename must resolve -- the docs cite effect classes by name alone, and ' +
      'requiring full paths instead would push every anchor into one more hand-maintained list');
    // The discriminating pair for the fallback rule: an exactly-written path wins even when
    // its basename is shared, and a basename that is genuinely ambiguous is refused. Without
    // the first, README.md:12 would be reported as ambiguous; without the second it would
    // silently validate whichever of the two READMEs the walk reached first.
    assert.equal(resolveAnchorFile('README.md').file, 'README.md',
      'README.md is a path this repo has, so it must resolve to itself -- falling into the ' +
      'basename branch here would flag every correctly written root-level citation');
    assert.equal(resolveAnchorFile('docs/README.md').file, null,
      'a path that does not exist but whose basename is shared by two files must not resolve: ' +
      'this repo has README.md and resources/credits/README.md, so picking one is a guess');
    assert.equal(resolveAnchorFile('docs/README.md').candidates.length, 2,
      'the ambiguity report must say how many files share the name, or the failure message ' +
      'reads like a missing file and sends the reader to the wrong fix');
  });
});
