<p align="right"><a href="MAINTENANCE.md"><b>English</b></a> | <a href="MAINTENANCE.zh-CN.md">简体中文</a></p>

# burn-my-windows@local maintenance checklist

This repository is a local maintenance branch of upstream [Burn-My-Windows](https://github.com/Schneegans/Burn-My-Windows) frozen at v48, with no install step, run directly from `~/.local/share/gnome-shell/extensions/burn-my-windows@local`. There is exactly one target platform: Ubuntu 26.04 + GNOME Shell 50.1 + gjs 1.88 + Wayland.

This file answers only three questions: **what to run before changing, how to read the log, and what not to touch.**
For "what changed and why", see the relative-to-upstream change list in [README.md](README.md);
for the hard rules for agents, see [AGENTS.md](AGENTS.md). The three do not overlap, to avoid drift.

The three blocks that need long-term keeping have been split into `docs/maintenance/`; this file only indexes them, and the section numbers keep their original numbering, never reordered:

- §5 / §7 / §10 → [docs/maintenance/shell-internal-api.md](docs/maintenance/shell-internal-api.md#5-sentinel-list-18-symbols)
- §6 → [docs/maintenance/compat-matrix.md](docs/maintenance/compat-matrix.md#6-compatibility-branch-matrix-8-sites-and-which-gnome-50-takes)
- §8 / §12 → [docs/maintenance/measurement.md](docs/maintenance/measurement.md#8-which-observations-can-serve-as-evidence-and-which-cannot)
- the 06 / 07 methodology, split out of this file's §1, is in [docs/maintenance/measurement.md](docs/maintenance/measurement.md)

---

## 0. Thirty-second quick reference

| What I want to do | Run first |
| --- | --- |
| Changed any `.js` | `npm run check && npm test` (seconds, no shell needed) |
| Changed `resources/` or `schemas/` | `make` **and** commit the regenerated `resources/burn-my-windows.gresource` and `schemas/gschemas.compiled` together, then `npm test` |
| Changed one of the 8 monkey-patches | `npm test` (`patch-symmetry` + `sentinel-drift` both guard it) |
| Added / removed an effect | `npm test` (registration-point completeness goes red), then `./test/headless/run.sh 02` |
| Want to know what a GNOME upgrade broke | `./test/headless/run.sh 01`, then [`docs/maintenance/shell-internal-api.md`](docs/maintenance/shell-internal-api.md) §5 |
| Want to confirm the animation really still plays | `./test/headless/run.sh 05` (real window) → then confirm by eye with §1's L2 |
| Suspect a leftover process is interfering | `./test/headless/down.sh` |
| The desktop broke and you need to back out | §9, the first level needs no re-login |

**Always run L0 first.** It needs no desktop, does not fight for CPU, and it is the only gate that can catch "a missing registration" without a display.

---

## 1. Three verification layers

### L0 static (no shell needed, `npm test`)

```sh
npm run check   # node --check extension.js prefs.js + all 32 files under src/
npm test        # test/*.test.mjs
```

Expected: `check` silent; `test` all green. The gate count and case count are **printed by the command itself**; do not copy them into any doc;
treat a `# SKIP` as a failure — a skipped gate does not exist.

Each gate catches one kind of "error that does not raise an error":

| File | Catches |
| --- | --- |
| `test/build-freshness.test.mjs` | stale compiled artifacts: bundle member set vs manifest, per-member sha256 content vs source file, compiled schema key set vs XML, primary-key defaults |
| `test/effect-registry.test.mjs` | the 26 effects complete across **8 registration points**, including the 130 `dialog.bind*` binding keys that exist in both the schema and its `.ui` |
| `test/sentinel-drift.test.mjs` | the three sentinel tables ↔ `PATCHES` ↔ install/restore guards ↔ warn prefix interlocking; plus the probe-purity gate |
| `test/patch-symmetry.test.mjs` | the 8 patches install/uninstall in pairs, never inventing a stub for a method upstream dropped; the `Error`-shaped stack frames drive the take-over branch, including the ease override not reading back and the overview wait returned when all effects are off |
| `test/proxy-retry.test.mjs` | power proxies: no rebuild on the animation hot path after a failure, retries bounded, `disable()` cancels the timer and lets re-enable try again |
| `test/shader-warmup.test.mjs` | shader pre-warm: only success is registered, one failure does not end the queue, failures leave a log, dedup across profiles, the source retires after disable |
| `test/repo.test.mjs` | the repository's own conventions: README bilingual pair in step, no checkboxes, `reports/` both ignored and untracked |
| `test/docs-links.test.mjs` | doc routing: the three pages under `docs/maintenance/` exist, the files markdown links point at exist, `§N` references do not dangle, content split out is really not in this file |
| `test/doc-anchors.test.mjs` | line-number anchors in the docs: the file an anchor names exists in this repo, the line it names is in range and not blank, and a bare line number with no file is not allowed (a line number with no file name cannot be checked by anything, so when it rots nobody knows). Anchors in `CHANGELOG.md` and `.js` comments are **not** in its scope, reason in the test header |

**Why the build-freshness gate is needed**: this repo commits compiled artifacts into git and has no install step, so changing a
`.frag` / `.ui` / schema and forgetting `make` makes the runtime **keep using the old artifact and report green**. No tool tells you.

The expected value `26` is **hardcoded**. Deriving 26 from the object under test and comparing it with itself is `a === a`.

A gate's effectiveness is verified by mutation (done in a `cp -a` copy, never in the working tree):

```sh
D=$(mktemp -d /tmp/bmw-mutate.XXXXXX); cp -a ./. "$D/" && cd "$D"
printf '\n// x\n' >> resources/shaders/glide.frag   # build-freshness must go red
node --test test/build-freshness.test.mjs | grep -c '^not ok'
```

### L1 headless probes (real shell process, sandbox, minutes)

```sh
./test/headless/run.sh all      # probe list in run.sh's ALL_PROBES, each takes a shell start to itself
./test/headless/run.sh 01       # run only the one to look at first after an upgrade
```

Probe list:

| # | Name | checks | What only a real process can prove |
| --- | --- | --- | --- |
| 01 | `load-and-sentinel` | 13 | the 18 private API symbols really exist on **this** GNOME; which of the 8 compatibility branches is actually taken; the sentinel neither rang nor skipped |
| 02 | `effects-and-shaders` | 10 | the expected effect count comes from the gresource, not the fork's own list; shader-pool in/out; GType unique and stable per nick; 6 uniform locations resolve |
| 03 | `animation-dispatch` | 21 | `_chooseEffect`'s preview branch and its clear contract; calling functions actually named `_mapWindow` / `_destroyWindow` produces real SpiderMonkey `@` frames, driving the take-over branch; real `_setupEffect` attach/wrap-up and the dispose race |
| 04 | `lifecycle-residue` | 17 | after `disable()` the 8 patches have their identity restored, handlers are zero, the bundle unregistered; a re-enable is a **new closure**; handler count scales with profiles (a leak shows as 3×) |
| 05 | `window-animation` | 5 | mutter really maps windows, really plays the given effect per `preview-effect`, `update-animation` ticks every frame (= the compositor really drew this shader) |
| 06 | `main-thread-budget` | 20 | how long `enable()` blocks the main thread with one profile and with 20; whether the lazy proxy degrades back to construction at startup; whether an unconstrained profile really never touches the bus |
| 07 | `global-state-balance` | 3 | whether `begin_work` / `end_work` and unredirect still balance on paths where **the animation did not finish** (normal close / `kill -9` mid-animation / disable mid-animation / minimize mid-animation / close in the overview) |

A clean run on 2026-10-01: **all 7 probes PASS, 89 checks in total**;
in probe 05, 26/26 windows mapped and played successfully, 70–73 frames per round, `_progress` constant at 0.5, all wrap-ups returned to the pool,
and 0 CRITICALs pointing at the extension's own path.

### 06 / 07: why these two gates exist on their own → [docs/maintenance/measurement.md](docs/maintenance/measurement.md)

**But probe 05's pixel-comparison layer is SKIP, not PASS**: `org.gnome.Shell.Screenshot.Screenshot`
returns `Gio.IOErrorEnum: Timeout was reached` in the sandbox (all three sample points `fire` / `matrix` / `snap`
behave the same). It is counted separately, prints its reason, and **is never folded into the pass/fail verdict**; the verdict is still
decided by the five paths setup / attach / paint / pin / cleanup. So "the 26 effects' images have been verified" does
not hold — what was verified is that each was selected, attached, drew about 72 frames and was reclaimed correctly; the image itself is still L2's human judgement.

Results land in `/tmp/bmw-harness/out/<probe>.json`, **not in the repo**, so no gitignore is needed, and the evidence survives a crash.
`checks` and `metrics` are kept apart: a changed number should not turn the suite red, a real regression must — these are two things in the same file
(`verdict.js`).

### L2 real session (read-only, human judgement)

Only this layer can judge "does it look right". After logging out and back in:

```sh
journalctl -f -o cat --identifier=/usr/bin/gnome-shell | grep -F '[burn-my-windows@local]'
```

Then in order: open/close windows ×20, close a window in the overview, minimize and switch workspaces, close another window during fullscreen video,
plug/unplug power and switch power-saver, open preferences and check the log for new warnings, disable/enable ×10 each.

**Any "the effect looks wrong" conclusion can only come from this layer.** L1 only judges structure and log shape.

---

## 2. Code-loading rules (the easiest one to self-deceive with)

- `disable` + `enable` does **not** re-import modules. GNOME Shell caches ES modules by URI, so
  `scripts/reload.sh` runs the **old code**. To see a `.js` change on the desktop you must **log out and back in**.
- But `./test/headless/up.sh` starts a **new process**, which loads the **current working tree** — a `.js` change takes effect immediately.
  These two are not contradictory: one is about an already-running process, the other about a newly started one. To verify new code without touching the desktop, use the latter.
- Therefore **it is not allowed** to claim a change is verified from "`npm test` passed" or "no error after reload". The former only proves the bookkeeping,
  the latter runs the old code.

---

## 3. Boundaries of the isolated headless shell

Every item in `up.sh` is load-bearing; removing any one pollutes the real session or makes the measurement meaningless:

| Setting | Why |
| --- | --- |
| private `dbus-daemon` (`$WORK/bus`) | isolated from the real session bus; also the identity marker at teardown |
| `GSETTINGS_BACKEND=memory` | the probes' settings writes **never reach** `~/.config/dconf/user`. It is **per-process**, so settings must be written inside the shell |
| `XDG_CONFIG_HOME=$WORK/xdg-config` | ProfileManager's keyfile lands in the sandbox. Without it, `getProfiles()` will **quietly create a profile** in your **real** `~/.config/burn-my-windows/profiles/` |
| `XDG_DATA_HOME=$WORK/xdg-data` (containing only a symlink to this repo) | only the burn-my-windows extension is discovered. `fast-translate@local`, `macos-dock@local` cannot start on their own, and their errors would be misread as this fork's regressions |
| private `XDG_RUNTIME_DIR` | the shell creates `gnome-shell-disable-extensions` in the runtime dir at startup and deletes it after ~60 s. This suite kills the shell often; dying inside that window would **leave the marker in the real runtime dir**, and its presence would make the session disable all extensions after the next crash — one test run becomes a user-visible failure |
| `WAYLAND_DISPLAY=wayland-bmw-harness` + `--wayland-display=` of the same name | without it the shell fights for `/run/user/1000/wayland-0.lock`, and the failure cascades into `StartServiceByName` failure, `Execution of main.js threw exception`, and finally `free(): invalid pointer` — looking like the shell itself has a bug |
| `--headless --unsafe-mode --virtual-monitor 1280x800` | `--unsafe-mode` is what provides `org.gnome.Shell.Eval` (GNOME 50 removed the `unsafe-mode` gsettings key); `--devkit` is not needed; **`--nested` was removed in GNOME 50** |
| `GIO_USE_VFS=local` | otherwise GVFS writes and holds a metadata store under the redirected XDG_DATA_HOME |

### What can and cannot be used in Eval: a measured list

These were all hit while writing probes, and each one masquerades as "the extension is broken":

| Form | Measured result |
| --- | --- |
| `log('...')` (GJS global) | ✅ goes to the shell log; probe markers use it |
| `console.warn('...')` | ✅ goes to the log, but at WARNING level |
| `imports.gi.GLib.log(...)` | ❌ **the function does not exist**, calling it throws |
| `Main.global.compositor` | ❌ `Main.global` is undefined; use the bare `global` |
| `imports.gi.Shell.Workspace` / `.WindowPreview` | ❌ undefined on GNOME 50, see the end of [`docs/maintenance/shell-internal-api.md`](docs/maintenance/shell-internal-api.md) §5 |
| `new Meta.Rectangle(0,0,800,600)` | ❌ cannot be constructed from Eval. The fork only reads `get_frame_rect().width`, so a plain object suffices |
| `mw.delete()` | ❌ needs a timestamp: `mw.delete(global.get_current_time())`, otherwise GI reports "At least 1 argument required", the window is **not closed**, and it is then counted as a leaked window |
| `GLib.file_remove(p)` | ❌ does not exist; use `Gio.File.new_for_path(p).delete(null)` |
| `imports.gi.Gtk` version string | must be `'4.0'`; writing `'4'` gives "Typelib file for namespace 'Gtk', version '4' not found" |
| `Process.kill(pid)` | ❌ there is no `Process` in the shell process; use `GLib.kill(pid, 15)` |
| `EM._callExtensionDisable(uuid)` | ❌ **is not equivalent to** disable: the 8 patches, 8 handlers, the bundle and the D-Bus export all remain, and the following enable dies immediately with "An object is already exported". Use `stateObj.disable()` / `stateObj.enable()` |
| `GLib.spawn_async` to start a client | ✅ but you must **pass envp explicitly** (`WAYLAND_DISPLAY`, the private `XDG_RUNTIME_DIR`, `GDK_BACKEND=wayland`, `GSK_RENDERER=cairo`), and `BMW_HARNESS` must be exported by up.sh, or the probe cannot find `window-client.js` |


**Kill processes only by pidfile, and first verify that pid's cmdline is still yours.**
Do not `pkill -f <pattern>`: the pattern string also appears in the caller's own command line, and the script kills the
shell that started it (showing as a silent exit 143); `pgrep -x gnome-shell` also hits the user's real session shell,
and this workspace often has **another fork session running in parallel** with its own headless shell.

To have the driver connect to that private bus, use `. /tmp/bmw-harness/env.sh`, and do not write the socket path in your own command line.

Readiness check: cold start takes about 20 s, and `gnome-extensions info` may report `State: UNKNOWN` while `stateObj` is still
undefined. There are only two reliable signals — Eval returns `(true, ...)` (a shell without unsafe-mode returns `(false, ...)` with exit 0),
and `extensionManager.lookup(uuid).stateObj._settings` really has a value.

---

## 4. How to read the log

Two channels, **the prefs process is not in the first**:

```sh
# shell process: everything in extension.js and src/
journalctl -f -o cat --identifier=/usr/bin/gnome-shell | grep -F '[burn-my-windows@local]'

# preferences process (separate gjs, journald identifies it as org.gnome.Shell.Extensions)
journalctl -f -o cat --identifier=org.gnome.Shell.Extensions | grep -iE 'burn-my|GJS|TypeError'
```

Use the bracketed prefix rather than `-i burn-my-windows`: `utils.debug()` also prints routine operational information containing
`burn-my-windows@local`, and a loose match mistakes chatter for a regression.

The literal shape of a sentinel warning (`test/sentinel-drift.test.mjs` guards it; changing the wording means changing §0's grep too):

```
[burn-my-windows@local] expected <name> to be a function, got <type>. Effects may not work on this GNOME version.
```

Counting one is enough:

```sh
journalctl -o cat --since "-10 min" | grep -cE '\[burn-my-windows@local\] expected .* to be'   # must be 0
```

---

## 5. Sentinel list: 18 symbols → [docs/maintenance/shell-internal-api.md](docs/maintenance/shell-internal-api.md)

---

## 6. Compatibility branch matrix: 8 sites, and which GNOME 50 takes → [docs/maintenance/compat-matrix.md](docs/maintenance/compat-matrix.md)

---

## 7. Private APIs the sentinel does not cover (hand-check after an upgrade) → [docs/maintenance/shell-internal-api.md](docs/maintenance/shell-internal-api.md)

---

## 8. Which observations can serve as evidence, and which cannot → [docs/maintenance/measurement.md](docs/maintenance/measurement.md)

---

## 9. Rollback recipes (in increasing order of force)

1. **Immediately, no re-login needed**: `gnome-extensions disable burn-my-windows@local`
   — animations return to native, everything else is unaffected.
2. **Back out the code**: `git stash` or `git checkout <good-sha>`; if you ever touched `resources/` / `schemas/`,
   you must `make` **and** commit the regenerated artifacts; then **log out and back in** (the module cache is per shell process).
3. **Clear settings only** (never use `dconf rm /`, never use an empty dump with `dconf load /` — that would clear the whole user database;
   profiles are keyfiles, **never delete them**):
   ```sh
   cp -a ~/.config/burn-my-windows ~/.config/burn-my-windows.bak.$(date +%s)
   dconf dump /org/gnome/shell/extensions/burn-my-windows/ > /tmp/bmw.dconf
   dconf rm   /org/gnome/shell/extensions/burn-my-windows/    # only affects active-profile / last-*-version
   ```
   Restore: `dconf load /org/gnome/shell/extensions/burn-my-windows/ < /tmp/bmw.dconf`,
   and copy the profile directory back with `cp -a`.
4. **Nuclear option**: `mv` the extension directory out of `~/.local/share/gnome-shell/extensions` (do it while you can still log in),
   then log out. **Never run `gnome-extensions install` or `pack` inside the repo directory** — it follows symlinks and
   wipes the source contents.
5. **Evidence to attach to a bug report**: the two grep outputs from §4, `gnome-shell --version`, `git log --oneline -1`,
   and which specific ones of the 18 symbols warned.

---

## 10. GNOME major-version upgrade checklist → [docs/maintenance/shell-internal-api.md](docs/maintenance/shell-internal-api.md)

---

## 11. What headless can and cannot prove

**Can prove**: whether the private APIs exist, which branch is taken, whether the 26 effects can be selected and attached to real windows, whether the shader pool and
GType are stable, whether there is residue after disable, whether the dispose race throws, whether the log shape is clean.

**Cannot prove**: the link cost of the first draw on a real GPU; the cost of re-parsing
`get_pipeline().set_blend('RGBA = ADD (...)')` every frame; the correctness of `uSize` and padding under
multi-monitor/HiDPI; the real behaviour of any effect needing a pointer (the sandbox has no pointer);
`WindowPicker`'s LookingGlass interaction (cannot be clicked in the sandbox); the X11/XWayland window path;
and "does it look good".

---

## 12. Current baseline → [docs/maintenance/measurement.md](docs/maintenance/measurement.md)

---

## 13. Known not to fix / to confirm

- **A profile with a power-tier constraint pays 4.4 ms of synchronous D-Bus on its first matching animation after login** (measured
  `4437 / 88 / 52` µs, i.e. one-off). 4.4 ms is about 26% of a 60 Hz frame (16.7 ms), in theory
  one hitch on the first window open/close after login, unlock or a power switch. **Decision: do not fix.**
  Moving proxy construction out of `enable()` is exactly what fixed that startup incident back then, and reworking
  this verified startup design to erase a one-off 4.4 ms is not worth it under "stability > performance".
  If it is ever really changed, the correct landing spot is the existing `_warmShaders()` idle pump (low priority, one thing per tick),
  calling `_getUpowerProxy()` / `_getPowerProfilesProxy()` once each there,
  **not** back in `enable()`.
  Note: it is only reached when a profile sets `profile-power-mode` or `profile-power-profile`;
  an unconstrained profile's animation path does not touch the bus once (`_chooseEffect()`'s
  `if (matches && c.powerProfile != 0)`), which is the current user's config.
- **`_doDisable()` does not proactively end a playing animation**. 07 measured that global state still balances in this case
  (the shader is carried to completion and reclaimed by the timeline itself), so this is not a to-fix item; but it is the source of the
  actor-clock risk above, and 07 must be re-run before changing the disable path.
- **`enable()` is not idempotent** (upstream behaviour, not introduced by the fork, **not fixed**): a second
  `enable()` without a `disable()` throws when exporting the D-Bus object
  `An object is already exported for the interface org.gnome.shell.extensions.BurnMyWindows`,
  and the fork's own catch records it as `[burn-my-windows@local] enable failed`, leaving a
  `g_dbus_interface_skeleton_unexport: assertion 'interface_->priv->connections != NULL' failed`.
  A normal desktop flow never reaches it (one enable per login), **but the probes do**: that is why 04 must use
  `stateObj.disable()` / `stateObj.enable()` rather than `EM._callExtensionDisable()` (the latter frees
  nothing at all). If a future change makes the extension restart while running, this becomes a real problem.
- **`WindowPicker`'s LookingGlass path is only half covered** (`docs/maintenance/shell-internal-api.md` §7,
  first row). Probe 04 now asserts that two
  `PickWindow()` calls share one inspector and that `disable()` hands it back; but "really click a window" still needs a
  manual click — the sandbox has no pointer input and the `target` signal is not emitted by mutter. After an upgrade you still have to click "Select app" by hand.
- `_chooseEffect()`'s first guard is `if (!actor.meta_window) return null`. A probe object that forgets
  this field never reaches the take-over branch and falls back to the shell's real `_shouldAnimateActor` — which needs
  `actor.get_texture()` and therefore throws inside the **probe**, looking like the fork crashed.
- **unredirect is not reference-counted**: `Shader.beginAnimation` / `endAnimation` toggle **global** state,
  so when two animations overlap, the one that ends first turns unredirect on while the other is still running. It only affects fullscreen
  (e.g. closing another window during fullscreen playback). Upstream behaviour, not introduced by the fork. **Decision: do not fix** (this section previously carried "your call",
  now closed per the recommendation). The reason is asymmetric cost: fixing it means adding a reference count in `src/Shader.js`, i.e. rewriting the open/close timing
  shared by 26 effects — **overturning the upstream mechanism** — while the benefit is only a look-level difference of "one extra compositing on that frame during fullscreen".
  Under stability > performance > look, the trade is not worth it. **When to reverse**: if someone really reports on a real machine that fullscreen animations are interrupted by redundant
  compositing, act on the **symptom**, not on this analysis.
- The comments at `src/Shader.js:28` and `src/effects/Glide.js:37` say `.glsl`, while `src/Shader.js:209` actually loads `.frag`.
- `src/migrate.js`'s known fragilities are all text parsing (runs once, gated by `last-extension-version`):
  `r.includes(...)` can match inside another key's string value in the dconf dump; `replace('[/]\n','')` and
  `replace('flame-','fire-')` are literal replacements handling only the first occurrence; `^.*-preview-.*` deletes any line containing
  `-preview-`; the retry dedup compares exactly-trimmed text and fails as soon as the format changes.
  **One old conclusion withdrawn**: this section previously said "`src/migrate.js:89` strips `test-mode=` from a migrated keyfile, so a migrated
  profile can never enter test mode" — that does not hold. `test-mode` belongs to the **main** schema
  (`schemas/org.gnome.shell.extensions.burn-my-windows.gschema.xml`) and is read only from `this._settings`
  (`extension.js:1164`), while the migration does not write the main schema at all: the generated keyfile could never contain this key.
  Test mode works for migrated profiles as usual.
- `_ALL_EFFECTS` is in a different order in `extension.js` and `prefs.js` (Mushroom is last in one and 14th in the other).
  This is legal, so all comparisons are done by **set**.
- `test-mode` does not seed 4 effects (see `docs/maintenance/measurement.md` §8), so their frames do not take part in the reproducibility assertions.
- `src/Shader.js:215`'s `match.index` has no null check: a `.frag` without `void main(){…}` throws a TypeError at construction.
  All current 26 `.frag` files are proven compilable by probe 02, so this is a **potential** problem whose
  impact is "a hard-to-read error location when a new, wrong `.frag` is added", not part of this round's fixes.
- The preferences dialog's About and the donation popup that "prompts once every 10 opens" **still belong to upstream** (`set_developer_name`,
  `set_copyright`, license, the four `donate-*`, `show-sponsors`, `translate` and `metadata.json:donations`
  are all untouched), while the **destination slots** (the menu's `homepage` / `bugs`, About's `set_website` / `set_issue_url`,
  and the address the `changelog` action opens) — **all five** — point back at this repo, consistent with `metadata.json:url`. The last one was
  added later: the toast shown after the extension version changes guides the user to read exactly it, and this fork's changes are recorded only in this repo's `CHANGELOG.md`,
  while upstream's cannot say "why did your effect change". The gate works both ways: `test/prefs-attribution.test.mjs`
  takes the expected addresses from the README's `git clone` line and `**Upstream:**` line, so rewriting the **shape** of those two README lines
  makes it red on "cannot get the address" rather than on attribution; the **count** of five slots is pinned by the same gate too — one more means the sweep overreached
  into docs still belonging to upstream, one fewer means a missed change. See CHANGELOG's D-051 / D-052 / D-056.
- **That `changelog` URL only guards half of it — "the path lands on a file we ship"**:
  `test/prefs-attribution.test.mjs`'s
  case 5 now splits `/blob/<ref>/<path>` and requires `<path>` to be **really readable in this repo**, non-empty, and to carry the
  `# CHANGELOG` heading (three injections each hit once: changing the path to `docs/changelog.md` / changing the whole URL to the repo root /
  renaming `CHANGELOG.md` — all red on the same assertion, the message directly writing "that page would 404").
  **The other half is still unguarded**: the branch name in `<ref>`. Renaming the default branch → the menu item and the update toast 404 together while L0 is all green.
  The reason for not making it a gate is unchanged: a gate needs a trustworthy source for "what this repo's default branch is called", and a CI checkout has none
  (`refs/remotes/origin/HEAD` is not a guaranteed product of a GitHub Actions checkout), so adding a field committed into the repo for this one
  would decide half the decision. The manual check is one command: `git ls-remote --symref origin HEAD` — it only gives a result when the remote is
  SSH (on this machine the https form connecting to `github.com:443` **hangs silently**, no error),
  and on 2026-10-10 it read `ref: refs/heads/master`.
- The sandbox's `gjs` GTK4 client only proves "it can open a window, close a window, and the animation is taken over", not the rest of a GTK app's behaviour on your machine.
- **The doc-router gate does not distinguish body text from quotations**: it scans the section-number references on every markdown line, so **citing a bad example is also counted as
  a real reference** and turns the gate red. The workaround is either not to write section numbers inside quotations, or to have the section number in the quotation sit right next to its own file name;
  the provenance form `原 MAINTENANCE §N` has been masked out and is not treated as a live pointer.
