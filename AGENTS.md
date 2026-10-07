# AGENTS.md

Guidance for agents working inside `burn-my-windows@local` — a local maintenance
fork of Burn-My-Windows, used in place with no install step.

## Critical Rules
- **Do not load ESModules via legacy `imports`** (e.g. `imports.ui.main` throws
  `SyntaxError` in GNOME 45+). Use static `import` or dynamic `await import()`.
- **Do not reassign ESModule exports directly** (e.g. `Main.notify = ...`).
  Patch mutable prototypes and save the original for restore.
- **Every monkey-patch needs a guard on BOTH sides.** `extension.js` patches 8 shell
  methods (`Workspace.prototype._addWindowClone`, `_windowRemoved`, `_doRemoveWindow`,
  `WindowPreview.prototype._init`/`_deleteAll`/`_restack`, `Main.wm._shouldAnimateActor`,
  `Main.wm._waitForOverviewToHide`). **All 8 installs and all 8 restores are guarded**
  by `if (this._origXxx)` — the two sides must be guarded together.
  - A one-sided guard is still broken. If upstream drops a method, an unguarded install
    re-creates it as a stub, and the guarded restore then skips because
    `this._origXxx` is `undefined` — the stub then survives the whole login session.
  - All 8 replacements delegate through `extensionThis._origXxx.apply(...)`, so an
    unguarded install is not only a leak: it throws a `TypeError` on the shell's hot
    path (every window open/close for `_shouldAnimateActor`).
  - Keep the `extensionThis` aliasing in mind: `enable()` sets `const extensionThis =
    this`, so a replacement that delegates must reach its original through that alias.
  - `test/patch-symmetry.test.mjs` enforces this. Run `npm test` after touching any
    patch. As of 2026-09-29 all 8 guards are in place and the suite is green; replacing
    any single one of them with `if (true)` is caught, so none of the 8 is decoration.
- **GJS constraint**: no `fetch`/`URLSearchParams` inside the shell process. Use
  `Soup.Session` + `GLib.Bytes`.
- **`disable` + `enable` does NOT reimport modules.** A cached ESModule keeps its old
  code, so an edit to a `src/*.js` file only takes effect after a **log out / log in**.
  Never claim a reload activated an edit.

## Build
- **Run `make` after editing anything under `resources/` or `schemas/`.** The compiled
  GResource bundle and `gschemas.compiled` are committed because the extension is used
  in place and has no install step. `--sourcedir=resources` in the Makefile is load-bearing.
- **NEVER run `gnome-extensions install` or `gnome-extensions pack` from within this
  repo directory.** The install tool follows symlinks and will wipe the source contents.

## Version Gating
- `src/utils.js` owns the only version gate: `shellVersionIs()` /
  `shellVersionIsAtLeast()`, fed by `Config.PACKAGE_VERSION`. The comparator returns
  true for any newer major, so GNOME 50 needs no change.
- Two call sites depend on it: `getImageResource()` (48 beta → `St.ImageContent.set_data`
  takes a Cogl context) and `parseColor()` (47 alpha → `Cogl.Color` over `Clutter.Color`).
- Per-effect gates are `static getMinShellVersion()` in each `src/effects/*.js`; the
  highest declared minimum is `[40, 0]`. Bump these only if an effect starts touching
  newer shell internals.

## Tests
- **Three layers, always in order.** See `MAINTENANCE.md` §1 for what each one can prove.
  - **L0** `npm run check && npm test` — seconds, no display. `check` is `node --check`
    over `extension.js`, `prefs.js` and all of `src/` (32 files); `test` runs
    `test/*.test.mjs`. Four gates: build freshness, effect registration, sentinel drift,
    patch symmetry. Run this before claiming anything about **any** change.
  - **L1** `./test/headless/run.sh all` — real GNOME Shell process, fully sandboxed,
    minutes. The only layer that can prove private-API existence, shader/uniform
    resolution, the `_mapWindow@` take-over branch on a genuine SpiderMonkey stack, and
    dispose-race behaviour.
  - **L2** the real session, by eye. Smoothness, first-paint GLSL link cost, and whether
    an effect *looks* right are not determinable by any script.
- `extension.js`, `prefs.js` and `src/` are all GI-bound, so they cannot be imported
  outside GNOME Shell. `test/patch-symmetry.test.mjs` therefore slices the two patch
  regions out of the source and runs them against mock shell objects. The slices are
  located by the stable comments around them (they live in `test/lib/extension-slices.mjs`),
  never by line numbers.
- **Expected counts are hardcoded and cross-checked on purpose.** `26` effects appear in
  `test/effect-registry.test.mjs`, `test/build-freshness.test.mjs` and probes 02/05; the
  probe derives its expectation from the GResource bundle, not from `_ALL_EFFECTS`,
  because comparing a list with itself proves nothing.
- **Gates must be able to fail.** Prove it with mutations in a `cp -a` copy (never the
  working tree): tamper a `.frag`, drop an effect from `_ALL_EFFECTS`, add a 9th
  `this._orig…` capture without updating `PATCHES`, or un-guard one install.
- **`disable` + `enable` does not reimport modules**, so no script can make a source edit
  live *in the running desktop*. `scripts/reload.sh` runs `make`, cycles the extension,
  waits for `State: ACTIVE`, tails the log, and warns when `extension.js` or `src/*.js`
  has uncommitted changes that a re-login is still needed for. A real check requires
  **log out / log in**, then
  `journalctl -f -o cat --identifier=/usr/bin/gnome-shell | grep -F '[burn-my-windows@local]'`.
- Do not claim a source change is verified without a re-login; a passing `npm test`
  proves the patch bookkeeping, not the animation behaviour.
- **`_shouldAnimateActor` *is* now covered, two ways.** Under Node the branch is driven
  by temporarily replacing `globalThis.Error` with a stack of the Gecko shape (the
  sliced code resolves `Error` from the global scope at call time). In a real shell,
  probe 03 defines functions actually named `_mapWindow` / `_destroyWindow`, which
  produces genuine SpiderMonkey frames. The old "inert under Node, needs an integration
  script this repo does not have" note was obsolete on both counts.
- **A probe object has to satisfy the path it is testing.** A stub actor with no
  `meta_window` makes `_chooseEffect()` bail at its first guard and the fork correctly
  delegates to the shell's real `_shouldAnimateActor` — which dereferences
  `actor.get_texture()` and throws. Record the saved original instead of calling through.
- **Never `pkill -f <pattern>` in harness scripts.** The pattern is also in the invoking
  shell's own argv, so the teardown kills its caller (silent exit 143). Kill by pidfile,
  after verifying the pid's cmdline is still yours.
- **Never make L1 write settings via `gsettings` from the driver.**
  `GSETTINGS_BACKEND=memory` is per-process; probes set settings through
  `stateObj._settings` inside the sandboxed shell.

## Docs & Commits
- `README.md` and `README.zh-CN.md` are a **two-file bilingual pair** — edit both.
- Commit code first, docs in a separate commit. Commit messages use **Chinese subjects
  with English conventional-commit prefixes** (`fix:` / `perf:` / `docs:` / `chore:`).

## Recording conventions
- Behaviour changes land in `CHANGELOG.md` as `D-###` entries; ids are monotonic and **never
  reused**, so a gap means an entry was deleted — `check:log` fails on that rather than calling it
  cleanup. A window with zero entries is also a failure: a check over an empty set proves nothing.
- `kind` ∈ `fix` | `perf` | `taste` | `guard` | `revert` | `chore`, cut by **who may demand a
  revert**: bug → `fix`; measurable degradation, not correctness → `perf`; only my taste → `taste`
  (zero obligation, discardable wholesale on an upgrade); no behaviour change, detects drift →
  `guard`; withdraws earlier work → `revert`; cleanup with no obligation either way → `chore`.
  A commit that is two things becomes two entries citing one hash — done so for `f4cba97`
  (D-010 guard / D-011 perf / D-012 perf) and `038c903` (D-019 fix / D-020 guard).
- `guard` is not a synonym for `fix` here: the sentinel list (§5) and the compatibility matrix (§6)
  are judged by *"can it be provoked once"*, not by *"does the suite pass"*.
- An entry is an assertion **as of its commit**, not current state. Never re-verify an old entry;
  never hand-copy an aggregate count — `npm run check:log`, `make` and the §12 baseline commands
  print them. Measured µs/ms figures inside entries are *that day's* measurements.
- Known-but-not-fixed issues stay in `MAINTENANCE.md` §13; they have no commit, so no entry.
- `Symptom` names the mechanism, never the session: no window titles, no application names from a
  real desktop, no screen-recording content.
- Run `npm run check:log` before committing docs; bare `node scripts/check-log.mjs` also works.
