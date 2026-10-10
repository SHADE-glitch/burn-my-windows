# Shell private API: sentinel list, uncovered items and upgrade manual

This page is one of burn-my-windows@local's three long-term asset pages. It was split out of
`MAINTENANCE.md`, holding its three original sections (§5 the sentinel list (18 symbols), §7 the
private APIs the sentinel does not cover, §10 the major-version upgrade checklist). `MAINTENANCE.md`
keeps only a router line, and the body is maintained only here.
This page records "which private interfaces the fork actually rests on, which one fails without a
log, and in what order to check on a GNOME major upgrade".
**Before touching anything, read [MAINTENANCE.md](../../MAINTENANCE.md) §3 (the boundaries of the
isolated headless shell) and [AGENTS.md](../../AGENTS.md) (the hard rules for agents)**; "which
observation can serve as evidence" belongs to [measurement.md](measurement.md) §8 / §12.

---

## 5. Sentinel list: 18 symbols

The fork's entire survival rests on GNOME Shell's private interfaces. The three probe tables in
`_doEnable()` **only warn, never throw**, covering the following 18 items. After an upgrade, read
the log first before anything else.

**11 functions** (`extension.js` function table)

| Symbol | Who calls it |
| --- | --- |
| `Main.wm._shouldAnimateActor` | the patch itself: every window open/close |
| `Main.wm._waitForOverviewToHide` | the patch itself |
| `Main.wm._mapWindowDone` | animation wrap-up `extension.js:1240` (called only, not patched) |
| `Main.wm._destroyWindowDone` | animation wrap-up `extension.js:1242` (called only, not patched) |
| `Workspace.prototype._addWindowClone` | overview clone zoom |
| `Workspace.prototype._windowRemoved` | close path |
| `Workspace.prototype._doRemoveWindow` | close path |
| `Workspace.prototype._lookupIndex` | `_shouldDestroy()` (`extension.js:1259`, called only, not patched) |
| `WindowPreview.prototype._init` | attach the unmanaged handling |
| `WindowPreview.prototype._deleteAll` | overview X double-click re-entry guard |
| `WindowPreview.prototype._restack` | stacking order |

**2 accessors**: `WindowPreview.prototype.overlayEnabled` (both get **and** set must exist — the
setter is what actually hides the icon/title/close button), and `window_container` (get only).
`window_container` is a GObject property whose descriptor sits on `Shell.WindowPreview.prototype`
rather than on the prototype we hold, so **it must be reached through the prototype chain**;
reading it with `typeof` calls the getter and yields `undefined`.

**4 instance fields + 1 type check** (inside the patched `_init`, one-shot):
`WindowPreview._windowActor`, `._icon`, `._closeRequested`, `Workspace._windows`,
plus `Array.isArray(Workspace._windows)`.
Three traps already hit: `in` is the **only** usable predicate (`_closeRequested` is `false` from
birth, so both `typeof` and a truthiness test falsely report it missing); `WorkspaceLayout` has a
**same-named** `Map`, so the array type must be verified; this probe may use only `in` / `typeof` /
`Array.isArray`, must not read a property off `this.`, and must not call `.connect(` — it runs on the
most dangerous patch of all, and `sentinel-drift` has a dedicated assertion for this.

> Important fact: `Workspace` / `WindowPreview` are **not in the `Shell` GI namespace**
> (`imports.gi.Shell.Workspace` is `undefined` on GNOME 50). They are ESM exports of
> `resource:///org/gnome/shell/ui/workspace.js` and `ui/windowPreview.js`.
> Any code that wants to inspect their prototypes in a real process must dynamic-import these two
> modules.

Rule: **adding one private-API dependency means adding one §5 row and one probe table at the same
time**, or `sentinel-drift` goes red.

---

## 7. Private APIs the sentinel does not cover (hand-check after an upgrade)

The probe table covers only 18 items; the following are **not in the table** (this round did not
touch `extension.js` as authorized, so the table was not extended either). When they break there is
no log, only misbehaviour:

| Location | Symbol | Who notices first |
| --- | --- | --- |
| `src/WindowPicker.js:56,65` | `Main.createLookingGlass()`, `new LookingGlass.Inspector` | **half**: probe 04 only proves "two clicks share one inspector, and disable() hands it back"; "really click a window" (the `target` signal) cannot be emitted in the sandbox and still needs a manual "Select app" click |
| `src/Shader.js:157` | `Meta.MaximizeFlags.BOTH` | L2 (fullscreen/maximized detection goes wrong) |
| `TRexAttack.js:77`, `SnapOfDisintegration.js:77,82`, `PaintBrush.js:68`, `BrokenGlass.js:103,108` | `Cogl.PipelineFilter.LINEAR`, `Cogl.PipelineWrapMode.REPEAT` | probe 05 (these 4 effects carry textures) |
| `src/utils.js:137,138,199` | `Cogl.PixelFormat.{RGB_888,RGBA_8888,RGBA_8888_PRE}` | probes 02/05 |
| `src/Shader.js:75` | base class `Shell.GLSLEffect` | probe 02 (fails at construction), found indirectly |
| `src/Shader.js:142,198` | `global.begin_work()` / `end_work()` | **nobody**: an imbalance only makes the battery/clock accounting quietly wrong |
| `Doom.js:55,113`, `src/utils.js:142` | `global.stage.height` | probe 05's `doom` |
| `PixelWipe.js:51`, `Incinerate.js:61`, `BrokenGlass.js:76` | `global.get_pointer()` | probe 05 can only prove "does not throw"; the sandbox has no pointer |
| `extension.js:1264` | `Workspace._windowActor` (runtime field) | probe 01's instance-field arm |
| `src/effects/*.js` 5 sites | `this._<x>Texture.get_texture()` | probe 05; it also means a **fake actor cannot pass** the real shell's `_shouldAnimateActor` (which needs `actor.get_texture()`) |

---

## 10. GNOME major-version upgrade checklist

Do them in order, and do not skip:

1. After the desktop starts, read the log first: `journalctl -o cat -n 400 --identifier=/usr/bin/gnome-shell | grep -F 'expected '`.
   **The symbol named in the warning is the difference itself**, no guessing needed.
2. Verify the 11 function names + the two frame names `_mapWindow` / `_destroyWindow` in the new
   shell source (a changed frame name is **silent**: only probe 03 rings). This machine has no
   `/usr/share/gnome-shell/js`, so read from the gnome-shell source of the matching version.
3. `npm run check && npm test` → fix L0 first. When adding an effect or a 9th patch, the number `26`
   must change together in `test/effect-registry.test.mjs`, `test/build-freshness.test.mjs`, probes
   02/05, `MAINTENANCE.md` §1 and `docs/maintenance/measurement.md` §12.
4. `./test/headless/run.sh 01` → sentinels and the matrix.
5. `./test/headless/run.sh 02 03 04` → shaders, dispatch, residue.
6. Check against `docs/maintenance/compat-matrix.md` §6: if a row flipped, **read both branches
   first** before touching code.
7. `./test/headless/run.sh 05` → real windows, effect by effect.
8. The L2 real-session manual items (`MAINTENANCE.md` §1) — only this layer can confirm the look.
9. In the same session, update this page's §5/§7 and `docs/maintenance/compat-matrix.md` §6, plus the
   README change list (commit code and docs separately).

The priority is always **stability > performance > look**; never change an effect's appearance to
make a test pass.
