// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — documentation routing guards for burn-my-windows@local.
//
// Splitting MAINTENANCE.md into docs/maintenance/ is only an asset while every pointer
// still lands. A prose doc has no compiler: a section that moved, a renamed file or a
// renumbered heading silently turns the runbook into a map of nowhere, and the next
// upgrade reads a router line as if it were the answer. These gates are what makes
// "the docs were split" mean "the docs are still reachable".
//
//   npm test          (desktop-free: no gjs, no GNOME, no network)
//
// Every assertion message says what a failure MEANS, so a red run is self-explanatory.
// Runtime facts that cannot be observed from outside the shell live in the L1 headless
// layer instead (see MAINTENANCE.md §1).
//
// Nothing here is satisfied by a hand-maintained count. Each expectation is derived from
// the files themselves — from MOVED_SECTIONS, from the headings a file actually has, or
// from the links a file actually contains — and every gate carries a control assertion so
// that a regex which stopped matching anything cannot turn the suite silently green.
//
// Conventions this gate encodes:
//   - Section numbers are the ORIGINAL MAINTENANCE.md ones and are never renumbered;
//     a moved section keeps its number as a heading in the file that now holds it.
//   - A `§N` reference names its target file when the target is not in the file the
//     reference sits in. A bare `§N` means: this file's own heading N if it has one,
//     otherwise MAINTENANCE.md's. A file name written next to a `§N` beats chain
//     inheritance, and a comma ends a clause rather than gluing a name to a number.
//   - `原 MAINTENANCE §N` is a provenance marker ("this used to be §N there"), not a
//     live pointer, so it is masked before checking.

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {ROOT} from './lib/extension-slices.mjs';

const ROUTER = 'MAINTENANCE.md';
const COMPAT = 'docs/maintenance/compat-matrix.md';
const API = 'docs/maintenance/shell-internal-api.md';
const MEASURE = 'docs/maintenance/measurement.md';
const NEW_DOCS = [COMPAT, API, MEASURE];

// THE single array: which section lives where after the split. Everything below — the
// moved-number list, the stale-home check, the pointer-row check, the reachability check —
// is derived from it, so adding a moved section means adding one row here and nothing else.
// `stub` is not stated here; it is read off the router's own heading line.
const MOVED_SECTIONS = [
  {file: COMPAT, section: 6},
  {file: API, section: 5},
  {file: API, section: 7},
  {file: API, section: 10},
  {file: MEASURE, section: 8},
  {file: MEASURE, section: 12},
];
const MOVED_NUMBERS = [...new Set(MOVED_SECTIONS.map((s) => s.section))].sort((a, b) => a - b);
const FILE_OF_MOVED_NUMBER = new Map(MOVED_SECTIONS.map((s) => [s.section, s.file]));

// The sections that never moved: they are what makes MAINTENANCE.md a runbook rather than
// a table of contents.
const KEPT_SECTIONS = [0, 1, 2, 3, 4, 9, 11, 13];

// One table row (or one unmistakable sentence) per moved block, lifted verbatim from the
// source section — body text, never a heading, because the router keeps the heading line.
// Hardcoded on purpose, the same way the `26` in the effect-registry gate is: deriving the
// expectation from the file under test would prove nothing.
const MOVED_MARKERS = [
  {file: COMPAT, section: 6, text: '`Clutter.Timeline.prototype.set_actor`'},
  {file: API, section: 5, text: '`Main.wm._shouldAnimateActor`'},
  {file: API, section: 7, text: '`Main.createLookingGlass()`'},
  {file: API, section: 10, text: '按顺序做，别跳'},
  {file: MEASURE, section: 8, text: '软件渲染（llvmpipe）与真实 GPU 不可比'},
  {file: MEASURE, section: 12, text: 'v48，基线提交 `16ab10a`'},
  // The probe 06 / 07 methodology block came out of §1 with §8 and §12.
  {file: MEASURE, section: '1 的 06 / 07 小节', text: '`begin_work` / `end_work` 的"会话相等"不是有效不变量'},
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile();

/**
 * Every markdown file in the working tree. A directory walk rather than `git ls-files`
 * on purpose (same reasoning as test/repo.test.mjs): the gate has to see a doc one
 * second before it is committed, because that is the only moment drift can still be
 * stopped. `reports/` is skipped because it is gitignored local-only phase evidence —
 * a fresh clone does not have it, so no committed rule may depend on its prose.
 */
function listMarkdown() {
  const out = [];
  const skip = new Set(['.git', 'node_modules', '__pycache__', 'reports']);
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), {withFileTypes: true})) {
      if (skip.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && r.endsWith('.md')) out.push(r);
    }
  };
  walk('');
  return out.sort();
}

const MD_FILES = listMarkdown();

/** `## 6. 兼容分支矩阵…` → {6: {stub, line}}. Only numbered headings count: those are
 *  what a `§N` reference can point at. A stub is a router line, recognisable by `→ [`. */
function numberedSections(rel) {
  const map = new Map();
  if (!exists(rel)) return map;
  for (const line of read(rel).split('\n')) {
    const m = /^#{1,3}[ \t]+(\d+)[.、][ \t]/.exec(line);
    if (m) map.set(Number(m[1]), {stub: /\s→\s*\[/.test(line), line});
  }
  return map;
}

/** Resolve a `.md` token the way a reader would: repo-root-relative first (how the docs
 *  are written), then relative to the referring file (how `../../MAINTENANCE.md` works).
 *  Returns the repo-relative path, or null when nothing matches. */
function resolveMd(token, fromRel) {
  const clean = token.replace(/^[`'"([<]+|[`'"’)\]>.]+$/g, '');
  const candidates = [clean, path.posix.join(path.posix.dirname(fromRel), clean)];
  for (const c of candidates) {
    const norm = path.posix.normalize(c);
    if (!norm.startsWith('..') && exists(norm)) return norm;
  }
  return null;
}

const PROVENANCE = /原\s*`?MAINTENANCE(?:\.md)?`?\s*§\s*\d+(?:\s*\/\s*§?\s*\d+)*/g;
const MD_TOKEN = /[\w./-]*\.md/;
const SEC_REF = /§\s*(\d+(?:\s*\/\s*§?\s*\d+)*)/g;
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const HEADING = /^#{1,6}[ \t]+(.*?)[ \t]*$/;

// A citation that still names the router as the home of a moved section, e.g.
// `MAINTENANCE.md §12`, "see MAINTENANCE §6", `` `MAINTENANCE.md` §5 ``.
const OLD_HOME = new RegExp(
  '`?MAINTENANCE(?:\\.md)?`?[\\s`\'"（）()\\[\\]【】:：,，、;；/~–—-]*§\\s*(' +
  MOVED_NUMBERS.join('|') + ')');

/**
 * GitHub-style slug, tuned for headings that are Chinese and full of `：`, `（）`, `§` and
 * `→`. GitHub drops punctuation/symbols without inserting a space and maps each whitespace
 * run to a single dash; CJK letters survive because they are letters. Because the exact
 * drop-set is a moving target for full-width punctuation, a heading also contributes the
 * raw-text candidate (spaces to dashes, nothing dropped), which is what a reader pasting
 * the heading itself would produce. An anchor that matches no candidate of any heading in
 * the target file is a failure, never a skip.
 */
function slugCandidates(headingText) {
  const text = headingText
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // image links -> alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links -> label text
    .replace(/[*_~]/g, '')                     // emphasis markers
    .trim();
  const lower = text.toLowerCase();
  const stripped = lower.replace(/[^\p{L}\p{N}\p{M}\p{Pc}\- ]+/gu, '');
  const dashed = (s) => s.normalize('NFC').replace(/[\s\u00A0\u2000-\u2006\u2008-\u200A\u205F\u3000]+/g, '-');
  return [dashed(stripped), dashed(lower), dashed(text)];
}

/** Every anchor string that resolves inside `rel`. */
function anchorsOf(rel) {
  const set = new Set();
  if (!exists(rel)) return set;
  for (const line of read(rel).split('\n')) {
    const m = HEADING.exec(line);
    if (!m) continue;
    for (const c of slugCandidates(m[1])) if (c) set.add(c);
  }
  return set;
}

const decodeAnchor = (a) => {
  try {
    return decodeURIComponent(a);
  } catch {
    return a;
  }
};

// How far a file name may sit from the `§N` it qualifies. Only punctuation and spacing count
// as "attached"; any word in between means the file name belonged to a different clause and
// the reference has to be read as bare. A comma is deliberately NOT attachment glue: in
// "…`a.md`，§6 → `b.md`" the leading name qualifies the previous reference, not this one.
const ATTACHED_BEFORE = /([\w./-]*\.md)(?:[\s`'"“”（）()\[\]【】:：;；/~–—-]*)$/;
const ATTACHED_AFTER = /^[\s`'"（）()\[\]【】:：,，、;；/~–—→-]*$/;
const ONLY_JOINERS = /^[\s、，,与和/（）()【】~-]*$/;

/**
 * Resolve one `§N` occurrence to the file it names. Precedence is pinned by a unit check
 * below, because getting it wrong silently mis-points a citation:
 *   1. a `.md` attached right before the number → that file;
 *   2. a `.md` attached right after it (`§6 → [docs/…]`, the router's own index form) → that file;
 *   3. a pure joiner back to a reference already read on this line (`§8 与 §12`) → its file;
 *   4. attached to nothing: the referring file's own §N if it has one, otherwise MAINTENANCE.md.
 * An explicit name outranks inheritance: `§5 / §7 → a.md，§6 → b.md` is one sentence per
 * destination, and read the other way round §6 keeps pointing at a.md while still looking cited.
 * `§5 / §7 / §10` is one match, so every number in the chain inherits the same target.
 * Returns `{file, raw}`; `file` is null exactly when a name was attached but is not a file,
 * and `raw` is that name so the caller can report which token broke.
 */
function targetOfReference(line, m, rel, own, prev) {
  const before = ATTACHED_BEFORE.exec(line.slice(0, m.index));
  if (before) {
    return {file: resolveMd(before[1], rel), raw: before[1]};
  }
  const after = line.slice(m.index + m[0].length);
  const afterM = MD_TOKEN.exec(after);
  if (afterM && ATTACHED_AFTER.test(after.slice(0, afterM.index))) {
    return {file: resolveMd(afterM[0], rel), raw: afterM[0]};
  }
  if (prev && prev.file && ONLY_JOINERS.test(line.slice(prev.end, m.index))) {
    return {file: prev.file, raw: null};
  }
  if (own.has(numbersIn(m)[0])) return {file: rel, raw: null};
  return {file: ROUTER, raw: null};
}

/** Every `§N` in `rel` with the file it points at. */
function sectionReferences(rel) {
  const found = [];
  const own = numberedSections(rel);
  const lines = read(rel).split('\n');
  lines.forEach((raw, i) => {
    const line = raw.replace(PROVENANCE, '');
    let prev = null; // {end, file} of the previous reference on this line, for `§8 与 §12`
    for (const m of line.matchAll(SEC_REF)) {
      const hit = targetOfReference(line, m, rel, own, prev);
      prev = {end: m.index + m[0].length, file: hit.file};
      for (const n of numbersIn(m)) {
        found.push(hit.file === null
          ? {n, file: null, raw: hit.raw, line: i + 1, text: raw}
          : {n, file: hit.file, line: i + 1, text: raw});
      }
    }
  });
  return found;
}

/** The numbers inside one `§5/§7/§10` match. */
function numbersIn(m) {
  return m[1].split('/')
    .map((piece) => Number((/\d+/.exec(piece) || [])[0]))
    .filter((n) => Number.isInteger(n));
}

/** The router's own index block: the bullets under the preamble that list section numbers. */
function routerIndexNumbers() {
  const out = [];
  for (const line of read(ROUTER).split('\n')) {
    if (!/^[*-]\s*§/.test(line)) continue;
    for (const m of line.replace(PROVENANCE, '').matchAll(SEC_REF)) out.push(...numbersIn(m));
  }
  return out;
}

/** The router heading lines that point at `file` for section `n`. */
function pointerLines(rel, n, file) {
  if (!exists(rel)) return [];
  return read(rel).split('\n').filter((line) => {
    const m = new RegExp(`^#{1,3}[ \\t]+${n}[.、][ \\t]`).exec(line);
    return !!m && /\s→\s*\[/.test(line) && line.includes(`${file})`);
  });
}

const ALL_REFS = MD_FILES.flatMap((rel) => sectionReferences(rel).map((r) => ({...r, from: rel})));

describe('the maintenance runbook is still reachable after the split', () => {
  it('the three long-term asset pages exist and hold content', () => {
    for (const rel of NEW_DOCS) {
      assert.ok(exists(rel),
        `${rel} is missing — ${ROUTER} routes sections into it, so those sections currently ` +
        'exist only as a link and the runbook is asking the reader to read nothing');
      const body = read(rel);
      assert.ok(body.trim().length > 0,
        `${rel} exists but is empty — a pointer to an empty file is a slower way of losing ` +
        'the section than deleting it');
      assert.match(body, /^#{1,3}[ \t]+(?:\d+[.、]|[^\d#])/m,
        `${rel} has no heading — the pages are meant to be read section by section, not as one blob`);
      assert.match(body, /MAINTENANCE\.md/,
        `${rel} no longer says it was split out of ${ROUTER}; a reader cannot tell which ` +
        'file is authoritative when the two disagree');
    }
  });

  it('every relative markdown link and every #anchor resolves to a real heading', () => {
    assert.ok(MD_FILES.length >= NEW_DOCS.length + 5,
      `only ${MD_FILES.length} markdown files were walked, so this gate is looking at almost ` +
      'nothing — the walk itself broke, not the docs');
    let links = 0;
    let anchors = 0;
    for (const rel of MD_FILES) {
      read(rel).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(LINK)) {
          const url = m[1];
          if (/^(https?:|mailto:|data:|\/\/)/.test(url)) continue;
          const [target, ...rest] = url.split('#');
          const anchor = rest.join('#');
          if (!target) {
            assert.ok(anchor, `${rel}:${i + 1} has an empty link target — nothing to resolve`);
          }
          links++;
          const resolved = target ? resolveMd(target, rel) : rel;
          assert.ok(resolved,
            `${rel}:${i + 1} links to "${url}", which is not a file in this repo — a reader ` +
            'following it lands on a 404, and after a move this is how a doc silently rots');
          if (!anchor) continue;
          anchors++;
          const candidates = anchorsOf(resolved);
          assert.ok(candidates.size > 0,
            `${rel}:${i + 1} anchors into ${resolved}, but that file exposes no heading at all`);
          const given = decodeAnchor(anchor);
          assert.ok(candidates.has(given),
            `${rel}:${i + 1} links to #${anchor} in ${resolved}, but no heading there slugs to ` +
            'it — the heading was renamed or deleted, and the deep link now points at nowhere');
        }
      });
    }
    // Control: an anchor check that never ran would be indistinguishable from a passing one.
    assert.ok(links >= 10,
      `only ${links} relative links were checked across ${MD_FILES.length} markdown files — ` +
      'the link pattern stopped matching, so this gate is decoration');
    assert.ok(anchors >= 1,
      'no #anchor link was checked — the router index is supposed to deep-link into each moved ' +
      'section, and without one the anchor branch of this gate has never actually run');
  });

  it('the slug resolver itself is a resolver, not a pass-through', () => {
    // Same-file unit check: the anchors this repo writes must be produced by the slug rules,
    // and a bogus anchor must not be accepted. Without this, an over-permissive matcher would
    // green-light every deep link above.
    const routerAnchors = anchorsOf(ROUTER);
    assert.ok(routerAnchors.size >= 14,
      `${ROUTER} produced only ${routerAnchors.size} anchor candidates — the heading scan ` +
      'stopped matching, so every anchor assertion in this file is vacuous');
    for (const bad of ['not-a-heading', '§12', '5', '哨兵清单-18-个符号']) {
      assert.ok(!routerAnchors.has(bad),
        `${ROUTER} should not expose #${bad} — the anchor matcher accepts strings no heading ` +
        'could slug to, which is how a renamed heading stays green');
    }
    // A Chinese heading with `：` and a digit prefix must slug without the punctuation and
    // with the space before 18 kept as a dash.
    const sec0 = slugCandidates('0. 三十秒速查');
    assert.ok(sec0.includes('0-三十秒速查'), `unexpected slug set: ${sec0.join(' | ')}`);
  });

  it('a §N resolves to the name written next to it, not to the previous clause', () => {
    // Unit check on the resolver that every file-level gate above consumes. A precedence flip
    // (chain inheritance read before the explicit file name), or a comma counted as attachment
    // glue, mis-points a citation while the whole suite stays green — so this pins the order
    // on synthetic lines instead of relying on the repo happening to contain the shape.
    const own = new Map(); // the referring file has no numbered sections of its own
    const FROM = 'CHANGELOG.md';
    const refs = (text) => [...text.matchAll(SEC_REF)];

    const chain = '§5 / §7 / §10 → `docs/maintenance/shell-internal-api.md`，' +
      '§6 → `docs/maintenance/compat-matrix.md`';
    const ms = refs(chain);
    assert.equal(ms.length, 2, 'this fixture no longer holds the shape the precedence rule is about');
    const first = targetOfReference(chain, ms[0], FROM, own, null);
    assert.equal(first.file, API, `unexpected target ${first.file} for the leading chain`);
    assert.deepEqual(numbersIn(ms[0]), [5, 7, 10], 'the leading chain stopped being a single match');
    const second = targetOfReference(chain, ms[1], FROM, own,
      {end: ms[0].index + ms[0][0].length, file: first.file});
    assert.equal(second.file, COMPAT,
      '§6 names its own file after a comma; inheriting the previous clause instead is exactly ' +
      'the mis-point that precedence exists for — it would read as a correct citation');

    // Controls: inheritance has to keep working where nothing is attached, a bare reference
    // still has to fall back to the router, and an attached path that is not a file has to
    // fail loudly rather than quietly resolve somewhere else.
    const joined = '对照 §8 与 §12 的基线';
    const jm = refs(joined);
    assert.equal(jm.length, 2, 'the joiner fixture stopped matching, so the control below tests nothing');
    const inherited = targetOfReference(joined, jm[1], FROM, own,
      {end: jm[0].index + jm[0][0].length, file: MEASURE});
    assert.equal(inherited.file, MEASURE,
      'a bare §N after a joiner must inherit the reference before it, or `§8 与 §12` splits into ' +
      'two different files');
    const bare = targetOfReference('见 §13 的已知不修', refs('见 §13 的已知不修')[0], FROM, own, null);
    assert.equal(bare.file, ROUTER,
      'a bare §N in a file that has no such heading must fall back to the router');
    const brokenText = '见 `docs/maintenance/nope.md` §9';
    const broken = targetOfReference(brokenText, refs(brokenText)[0], FROM, own, null);
    assert.equal(broken.file, null,
      'an attached path that is not a file must resolve to nothing — falling back would keep a ' +
      'broken citation green');
    assert.equal(broken.raw, 'docs/maintenance/nope.md', 'the failure has to name the token that broke');

    // The two discriminating cases. Each one fails under exactly one of the two rules this
    // test pins, so neither rule is decoration:
    //   - explicit name before inheritance: without it, `§12 → measurement.md` keeps §12 on
    //     whatever §8 fell back to and the written file name is simply ignored;
    //   - a comma is not attachment glue: with it, "`measurement.md`，§12" silently reads as a
    //     qualified citation even though the name belongs to the clause before it.
    const named = '对照 §8 与 §12 → `docs/maintenance/measurement.md` 的基线';
    const nm = refs(named);
    assert.equal(nm.length, 2, 'the named-after-a-joiner fixture stopped matching');
    const fallback = targetOfReference(named, nm[0], FROM, own, null);
    assert.equal(fallback.file, ROUTER, `unexpected target ${fallback.file} for the bare §8`);
    const namedHit = targetOfReference(named, nm[1], FROM, own,
      {end: nm[0].index + nm[0][0].length, file: fallback.file});
    assert.equal(namedHit.file, MEASURE,
      '§12 carries its own file name after a joiner; inheriting the previous reference instead ' +
      'discards what the author wrote next to the number');
    const comma = '见 `docs/maintenance/measurement.md`，§12 记着基线';
    const commaHit = targetOfReference(comma, refs(comma)[0], FROM, own, null);
    assert.notEqual(commaHit.file, MEASURE,
      'a comma ends the clause: the name belongs to what came before §12, and letting it qualify ' +
      'this number is how an ambiguous citation passes as a precise one');
    assert.equal(commaHit.file, ROUTER,
      `unexpected fallback ${commaHit.file} — a bare §N must still land on the router, where the ` +
      'file-level gate can reject it for pointing at a pointer line');
  });

  it('no markdown cites a moved section by its old MAINTENANCE.md home', () => {
    // The list of numbers is not restated here: it is MOVED_NUMBERS, i.e. MOVED_SECTIONS.
    assert.ok(MOVED_NUMBERS.length === MOVED_SECTIONS.length,
      'MOVED_SECTIONS holds a duplicate section number, so the moved-number list this gate ' +
      'derives is no longer one row per section');
    // Control: the pattern has to fire on the exact shape it forbids and stay silent on the
    // shape the docs use, or this gate is checking nothing.
    assert.match('见 `MAINTENANCE.md` §12 的基线', OLD_HOME,
      'the stale-home pattern no longer matches a `MAINTENANCE.md §12` citation — it was ' +
      'loosened or the moved-number list broke, and stale citations would pass silently');
    assert.doesNotMatch('见 `docs/maintenance/measurement.md` §12 的基线', OLD_HOME,
      'the stale-home pattern also matches correct citations, so it cannot tell a fix from a bug');
    for (const rel of MD_FILES) {
      read(rel).split('\n').forEach((line, i) => {
        const hit = OLD_HOME.exec(line.replace(PROVENANCE, ''));
        assert.ok(!hit,
          `${rel}:${i + 1} cites §${hit && hit[1]} while naming ${ROUTER}, but §${hit && hit[1]} ` +
          `now lives in ${FILE_OF_MOVED_NUMBER.get(hit ? Number(hit[1]) : 0) || 'a moved section'} — ` +
          'the router only keeps a pointer line for it, so this citation sends the reader to a stub');
      });
    }
  });

  it('no `§N` reference points at a section that is not there any more', () => {
    // Control group. A grep that stopped matching anything would make every assertion below
    // vacuously green, so the gate has to prove it is still looking at real references —
    // including at least one pointing into each file the sections moved to.
    assert.ok(ALL_REFS.length >= 20,
      `only ${ALL_REFS.length} §N references were found across ${MD_FILES.length} markdown files — ` +
      'a rewrite that turns numbered citations into prose silently disarms this whole gate');
    for (const rel of NEW_DOCS) {
      assert.ok(ALL_REFS.some((r) => r.file === rel),
        `no §N reference resolves to ${rel}, so nothing here proves that the split-out sections ` +
        'are reachable by number — citations must name the file they moved to');
    }
    for (const ref of ALL_REFS) {
      if (ref.file === null) {
        assert.fail(
          `${ref.from}:${ref.line} cites §${ref.n} after \`${ref.raw}\`, but that path is not a file — ` +
          'the reference now resolves to nothing, so whoever follows it will act on the wrong page');
      }
      const sections = numberedSections(ref.file);
      assert.ok(sections.has(ref.n),
        `${ref.from}:${ref.line} cites §${ref.n} in ${ref.file}, which has no such heading — the ` +
        'section was renumbered or deleted, and the citation now proves nothing');
      assert.ok(!sections.get(ref.n).stub,
        `${ref.from}:${ref.line} cites §${ref.n} in ${ref.file}, but that heading is only a router ` +
        `pointer (${sections.get(ref.n).line.trim()}) — point at the file the router names, ` +
        'otherwise the split leaves a two-hop citation that reads like the content stayed put');
    }
  });

  it('MAINTENANCE.md keeps exactly one pointer row per moved section', () => {
    for (const {file, section} of MOVED_SECTIONS) {
      const pointers = pointerLines(ROUTER, section, file);
      assert.equal(pointers.length, 1,
        `${ROUTER} has ${pointers.length} pointer lines for §${section} pointing at ${file}; it ` +
        'must have exactly one — zero means the section looks deleted, two means two files now ' +
        'claim to be the entry point');
      const target = numberedSections(file);
      assert.ok(target.has(section) && !target.get(section).stub,
        `${file} must carry §${section} as a real heading (it keeps the original number so that ` +
        `every §${section} citation elsewhere still means the same thing), but it does not`);
    }
    // The router's own index block must name each moved number once and only once, and it is
    // compared against MOVED_SECTIONS rather than a count somebody maintains by hand.
    const indexed = routerIndexNumbers().sort((a, b) => a - b);
    assert.deepEqual(indexed, MOVED_NUMBERS,
      `${ROUTER}'s index block lists §${indexed.join('/§')} but the split moved §${MOVED_NUMBERS.join('/§')} — ` +
      'the index and the pointer rows have to name the same sections, or a reader who starts at ' +
      'the index never learns that something moved');
  });

  it('the moved content is in its new file and out of MAINTENANCE.md', () => {
    const router = read(ROUTER);
    for (const {file, section, text} of MOVED_MARKERS) {
      const body = read(file);
      assert.ok(body.includes(text),
        `${file} no longer contains "…" from §${section} — the section was rewritten in place ` +
        'instead of being moved, which is how a split quietly loses the caveats that were paid for');
      assert.ok(!router.includes(text),
        `${ROUTER} still contains "…" from §${section} — the content was copied rather than moved, ` +
        'so the same claim now lives in two files and only one of them will ever get updated');
    }

    // The kept sections have to stay kept, with their numbers.
    const sections = numberedSections(ROUTER);
    for (const n of KEPT_SECTIONS) {
      assert.ok(sections.has(n) && !sections.get(n).stub,
        `${ROUTER} §${n} lost its body or was turned into a pointer — the 三十秒速查 / 三层验证 / ` +
        '沙箱边界 / 日志 / 回滚 / 能证明什么 / 已知不修 sections are what this file is for');
    }
    const numbers = [...sections.keys()].sort((a, b) => a - b);
    assert.deepEqual(numbers, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      `${ROUTER} no longer exposes the heading numbers 0..13 — the § numbers are referenced from ` +
      'AGENTS.md, CHANGELOG.md and the probes, so renumbering them is the exact bug this gate exists for');
  });

  it('every §N mentioned in any markdown file still has a heading in MAINTENANCE.md', () => {
    // Reachability, not routing: a number cited anywhere in the docs must still exist as a
    // heading in the router — real content or pointer line — otherwise the citation is a
    // dangling number no file can answer.
    const router = numberedSections(ROUTER);
    const mentioned = [...new Set(ALL_REFS.map((r) => r.n))].sort((a, b) => a - b);
    assert.ok(mentioned.length >= 8,
      `only ${mentioned.length} distinct §N numbers are mentioned across the docs — the ` +
      'reference scan stopped working, so "no dangling numbers" would be vacuously true');
    for (const n of mentioned) {
      assert.ok(router.has(n),
        `§${n} is cited in the docs but ${ROUTER} has no heading ${n} at all — a number with no ` +
        'home in the router cannot be resolved even via a pointer line');
    }
  });
});
