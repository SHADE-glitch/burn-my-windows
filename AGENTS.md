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
- `npm test` runs `node --test test/*.test.mjs`. `npm run check` is a syntax-only gate
  (`node --check extension.js && node --check prefs.js`); it parses as ESM because
  `package.json` sets `"type": "module"`. There is deliberately **no `version` field** —
  `metadata.json` is the single source of truth for it.
- `extension.js`, `prefs.js` and `src/` are all GI-bound, so they cannot be imported
  outside GNOME Shell. `test/patch-symmetry.test.mjs` therefore slices the two patch
  regions out of the source and runs them against mock shell objects, the way
  `fast-translate@local/test/prefs-validator.js` does its static checks. The slices are
  located by the stable comments around them, never by line numbers.
- **`disable` + `enable` does not reimport modules**, so no script can make a source edit
  live. `scripts/reload.sh` runs `make`, cycles the extension, waits for `State: ACTIVE`,
  tails the log, and warns when `extension.js` or `src/*.js` has uncommitted changes that
  a re-login is still needed for. A real check requires **log out / log in**, then
  `journalctl -f -o cat /usr/bin/gnome-shell | grep -i burn-my-windows`.
- Do not claim a source change is verified without a re-login; a passing `npm test`
  proves the patch bookkeeping, not the animation behaviour.
- **`_shouldAnimateActor` cannot be fully tested under Node.** It recognises the
  window-open/close paths by looking for `_mapWindow@` / `_destroyWindow@` in
  `(new Error()).stack`, and that `@` frame syntax is SpiderMonkey's; V8 writes
  `at _mapWindow (...)`, so the take-over branch is inert here. The test pins the
  assumption instead. Covering that branch for real needs the headless-shell
  integration script, which this repo does not have yet.

## Docs & Commits
- `README.md` and `README.zh-CN.md` are a **two-file bilingual pair** — edit both.
- Commit code first, docs in a separate commit. Commit messages use **Chinese subjects
  with English conventional-commit prefixes** (`fix:` / `perf:` / `docs:` / `chore:`).
