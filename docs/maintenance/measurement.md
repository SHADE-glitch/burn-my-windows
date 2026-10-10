# Observation criteria and current baseline

This page is one of burn-my-windows@local's three long-term asset pages. It was split out of
`MAINTENANCE.md`, holding the original §8 (which observations can serve as evidence, and which
cannot) and §12 (current baseline), plus the methodology subsection "why probes 06 / 07 exist on
their own" that originally belonged to `MAINTENANCE.md` §1. `MAINTENANCE.md` keeps only a router
line, and the body is maintained only here. The three blocks govern the same thing: **which numbers
may be used as evidence, which merely masquerade as evidence, and what "the current line" looks
like**. **Before touching anything, read [MAINTENANCE.md](../../MAINTENANCE.md) §3 (the boundaries
of the isolated headless shell) and [AGENTS.md](../../AGENTS.md) (the hard rules for agents)**: every
number on this page comes from a probe in the sandbox, and absolute values can only be compared
longitudinally on the same machine — cross-environment comparison is meaningless.

---

### 06 / 07: why these two gates exist on their own

They address problems that **throw no exception, raise no warning and change no behaviour**, only the
running feel of the whole machine:

- Synchronous IO / D-Bus on the main thread at startup. This fork's history really had one: a proxy
  constructed synchronously in `_doEnable()`, blowing through the GDM fallback greeter's ~12 s
  timeout and wrecking the whole login. So 06 asserts outright "neither proxy is constructed during
  enable()", pinning this class of regression.
- Global-state balance going off. `beginAnimation()` calls `global.begin_work()` and
  `compositor.disable_unredirect()`, and the matching `end_work()` / `enable_unredirect()` happen
  **only** in `endAnimation()`, which is driven by the timeline's `stopped` signal; the timeline is
  in turn bound to the **actor clock** by `set_actor(actor)` — it does not advance once the actor
  stops being drawn. Any "animation did not finish" path can leave the work count permanently in the
  wrong state, showing up as never-idle, battery drain and fullscreen frame drops, and nobody would
  connect that to a window-effect extension.

Measured conclusion: **no leak**. All five paths return their shaders (a hard, attributable gate;
probe 07 has run six rounds, each returning 5/5 scenarios); `_doDisable()` indeed does not
proactively end an in-flight animation, but it leaves no dangling work count.

> **`begin_work` / `end_work` "session equality" is not a valid invariant; do not use it as a
> criterion.** The first time I used it to report "34 starts / 34 ends, perfectly balanced", the
> second run of the same code gave 34 / 35, with no change in extension behaviour.
> Two reasons: if the instrumentation is installed after `enable()`, one startup `begin_work` falls
> outside the window while its `end_work` falls inside (the direction is the evidence: a real leak
> should be begins falling behind ends); more fundamentally, `global.begin_work/end_work` is
> **shared by the whole shell process** and gnome-shell calls it too, so this counter cannot be
> attributed to this extension — it can only bound the damage.
> What 07 now asserts is: instrumentation before `boot()`, **this probe must not widen the
> unbalanced gap relative to the start** (`outstandingAtEnd <= outstandingAtStart`; on 2026-10-09
> three consecutive runs gave start/end pairs of 0→0, -1→-1, 0→-1, **not once "both zero"**, so do
> not assume 0), plus the in-flight count must not grow without bound (≤ 2 per scenario), plus the
> per-scenario shader return above. The total is only a metric for longitudinal comparison on the
> same machine.

> One removed false positive is worth remembering: per-scenario sliced counting once reported
> `overview-close 12 starts / 13 ends`, while the session total was 34/34 — an animation may legally
> run over into the next scenario before ending. Keeping an assertion that misreports only trains
> people to ignore red. So 07 asserts quantities independent of the boundary: per-scenario it
> requires "the shader must be returned", globally it requires "the session is balanced", plus "the
> in-flight count must not grow without bound".

---

## 8. Which observations can serve as evidence, and which cannot

**Can serve as evidence**: `checks` all green, sentinel warning count 0, `already disposed` count 0,
the 8 patches identical after disable, `_profileSignalIds` proportional to the profile count,
zero-write three hashes unchanged, probe 05's `update-animation` frame count > 0 for every effect,
probe 07's "this probe did not widen the `begin_work` gap", and probe 06's `enable()` duration
against its budget lines (60 ms / 250 ms).

**Cannot serve as evidence**:

- The **absolute value** of any timing number in the sandbox. Software rendering (llvmpipe) and a real GPU are not comparable — a like measurement in this workspace once measured a fill at ~757 ms
  on the desktop versus 5355 ms in the sandbox. So 06's `enable()` numbers can only be used as a
  **same-machine longitudinal** trend (5 ms this time, 40 ms next time is what to watch), never as a
  cross-environment conclusion.
- Probe 07's **begin/end session equality** (including the per-scenario difference). Cross-scenario
  wrap-up can legally make ends > begins inside one window, and gnome-shell itself calls these two
  functions. What is usable is "the gap did not widen" and "per-scenario shader return".
- A single effect's "is the frame count right". The `update-animation` count only proves the
  compositor drew, not that it drew correctly.
- The total GLib CRITICALs at teardown: shutting down the sandbox spews a pile of shell-internal
  `dateMenu.js already disposed` unrelated to the fork. `run.sh` therefore counts as failure only the
  part **pointing at the extension's own path**, and records but does not judge the rest.
- Pixel reproducibility under `test-mode`: `fire`, `aura-glow`, `mushroom` and `team-rocket` use
  `Math.random()` for `_uSeed` **not protected by `testMode`**, so those 4 are not guaranteed
  frame-identical.
- **CRITICALs the probe itself produces**. The most common source of `already disposed` is a probe
  reading an actor after mutter has taken the window away — GJS's CRITICAL here **cannot be caught by
  try/catch**, so 26 effects spew 26 of them and it looks like the fork's wrap-up has a bug, when in
  fact the probe violated the same discipline the sentinel is held to in
  `docs/maintenance/shell-internal-api.md` §5.
  For whether wrap-up happened, look at the surviving evidence — **the pool back to +1** and
  `preview-effect` cleared — not at dead objects.

---

## 12. Current baseline

| Item | Value |
| --- | --- |
| Upstream version | v48, baseline commit `16ab10a` |
| Fork commit count | see `git rev-list --count 16ab10a..HEAD` (do not hand-copy a number, use the command) |
| Effect count | 26 |
| Bundle members | 70 = manifest `<file>` 70 (went from 74 to 70 on 2026-10-09 after deleting 4 icons nothing named; `img/scalable/actions/` has 5 left, each named by shipped text, guarded by `test/build-freshness.test.mjs`) |
| Schema keys | main 7 / profile 163 |
| Effects enabled by default | only `fire` (the only `true` among the 26 `<nick>-enable-effect`) |
| Pre-warmed | on a clean config `warmedNicks = 1` (= fire). To test all 26 warmed you must edit the sandbox keyfile |
| Patch sites | 8 installs / 8 restores, both sides guarded |
| Compatibility branch sites | 8 |
| Sentinel symbols | 18 (11 functions + 2 accessors + 4 fields + 1 array check) |
| L0 | `npm test` all green (gate and case counts come from the command output, do not copy); `npm run check` covers extension.js / prefs.js / all of src's js |
| L1 | probe and checks counts are printed by `run.sh`; one probe takes a shell start to itself, cold start ~20 s, `run.sh all` measured **3 min 22 s – 3 min 30 s** (four timed rounds on 2026-10-09/10: 3:22 / 3:24 / 3:30 / 3:30, the last being this round's 08:47:19–08:50:49; take the `date` difference before and after the command; earlier there were also untimed consecutive runs, not counted in the range; 7 cold starts + 26 real windows, re-measure this duration after adding or removing a probe) |
| Cross-run stability | probe 07 has run **eight rounds** (two on 2026-10-07, six on 2026-10-09/10), 3/3 criteria passed every round. Absolute counts were 36 / 36 in six rounds and 35 / 36 in two; `outstanding` start/end appeared as 0→0, -1→-1 and 0→-1: **what is consistent is the verdict, not the numbers**. The first version exposed an invalid assertion by wobbling between 34/34 and 34/35 |
| Most recent full certification | 2026-10-10 08:47:19–08:50:49 (**3 min 30 s**), 7 probes 103 checks all PASS (01/02/03/04/05/06/07 = 13/10/27/25/5/20/3), CRITICAL/JS ERROR 0, zero-write three hashes unchanged. **The certified tree is `9b5e3d4`**; there is only one criterion: **touch the load path and you must re-run**, read back with `git diff --stat 9b5e3d4..HEAD` — if any of the three items below appears, re-run; the rest (docs, `test/`'s L0 gates, `prefs.js`, icons, `.ui`) are no reason to re-run, and most of what lands after certification is exactly that kind. **The re-run trigger list is the probes' load path**: `extension.js`, `src/`, `resources/shaders/` (`.frag` loads via GResource, probe 02 compiles each) — any of these three means re-run. Changes to `prefs.js` / icons / `.ui` are **not** on this list: the next row says they are outside L1's load path, and their threshold is `npm test`'s four preferences-window gates + this page's L2 row. This item changed this round: the previous version also wrote `prefs.js` into the trigger list, so I re-ran a full round for a `prefs.js` change on the old list, and the verdict matched the previous one (per-probe counts 13/10/27/25/5/20/3 identical item by item, all PASS, only the sampled values in the rows below rewritten per this round) — **a wasted run for "proving prefs.js broke nothing"**, so the list was rewritten by load path rather than left to make people wait 3.5 minutes |
| What certification covers | all seven probes run inside the **shell process**, loading `extension.js` and `src/`; `prefs.js` and the icons and `.ui` pages under `resources/` are **not on its load path**. So a `prefs.js` change will not turn L1 red, and L1 green does not prove the settings page — that layer is spoken for only by L0's static gates + the real-machine verification in this page's L2 row |
| enable() main-thread block | 1 profile: 4–6 ms (5 ms this round); 20 profiles: **29–46 ms**. Eight independent samples on 2026-10-09/10: 46 / 30 / 29 / 35 / 31 / 33 / 33 / 35 ms. Of these, 46, 31, 33, 33 and 35 came from `run.sh all` consecutive runs, and 30 / 29 / 35 from a single `run.sh 06` — **consecutive and single runs have no stable high/low relation, do not attribute 46 to the run style**. `extension.js` and `src/` have been **byte-identical** since before the settings-page round started (`681c150`) (`git diff --stat 681c150..HEAD -- extension.js src/` is empty), so this spread is machine state, not code. **This item previously recorded single samples (6 ms / 35 ms), which is exactly how it could deceive** |
| begin_work / end_work | all five abnormal wrap-up paths return their shaders. **The absolute count drifts**: five `run.sh all` runs on 2026-10-09/10 gave 36/36 (0 → 0), 35/36 (-1 → -1), 35/36 (0 → -1), 36/36 (0 → 0), 36/36 (0 → 0), all PASS — the counter is process-level and gnome-shell calls it too, so the gap can be negative (the shell's own `end_work` fell inside the window one extra time). **The criterion was never equality, but `probeDidNotWidenTheWorkGap`: it must not be wider at the end than at the start**, plus "in-flight count ≤ 2 per scenario" (`noUnboundedWorkAccumulation`); copying "36 / 36" into a doc as a baseline is treating it as a criterion. This round's negative gap came from the `overview-close` scenario's `beginsDelta 12 / endsDelta 13`, i.e. `outstandingWorkByScenario`'s last value -1 — the criterion looks at "not wider than at the start", and -1 is narrower than 0, so it PASSes as usual |
| Animation-path bus | the first **non-preview** animation constructs the UPower proxy (135 µs in the sandbox); after that `OnBattery` reads a local cache: on gjs 1.88, 50 reads totalled 634 µs (≈13 µs each; proxy `flags==0` ⇒ GIO holds its own PropertiesChanged subscription). With a power constraint the first one is **2.8–7.6 ms** (eight independent samples on 2026-10-09/10: 2791 / 3156 / 3260 / 3304 / 3466 / 4186 / 4197 / **7639** µs — median ~3.4 ms; the highest has no code change that could explain it, only the machine's state at the time; one 60 Hz frame is 16.7 ms, so the tail is already near three-tenths of a frame budget), after which 28–149 µs (the lower bound 28 µs is from an earlier round; this round and the 2026-10-09/10 eight's non-first-frame reads were 42–149 µs, this round 72 / 126) |
| ease override fallthrough | probe 05's `easeFallthroughsNatural`: 26 real windows each opened and closed once, measured **0** — D-034's branch is not reached under ordinary window traffic on GNOME 50 / Wayland, so it is potential correctness rather than a current bug |
| L1 observations | 26 shader GTypes, a round trip of about 140 ms; probe 05's 70–73 frames per effect |
| Settings handlers per profile | 8 (the length of `_profileSignalIds` is the leak count) |
| Verified platform | Ubuntu 26.04.1 / GNOME Shell 50.1 / gjs 1.88 / Wayland, 2026-10-01 |
| Most recent L2 real-machine verification | the real session after 2026-10-10 08:03 (log out / log in). **The prefs-side coverage was matched to the same number by three independent methods**: reflecting the schema gives 152 usable descriptions, minus 26 switches and 11 rows with `description == summary` → predicted 126 rows; after `Gtk.Builder` loads the 28 shipped `.ui` files (with `menus.ui` loaded before `prefs.ui` into the same builder, or `main-menu` cannot be referenced — an instrument problem, not a product defect), the real `_findRowFor` resolves 137 binding keys with **0 rows whose `Adw.ActionRow` cannot be found**, 137 − 11 = 126. The real widgets running the real methods: 8/8 (including `get_ancestor` being genuinely recursive). Across the whole boot, our-prefix warnings **0** and JS ERROR/TypeError/CRITICAL **0**. **This row covers the `prefs.js` as of 08:03**: the later `f976433` changed only the URL string of the "View Changelog" item. `ps` now shows the resident process hosting prefs, `/usr/bin/gjs -m /usr/share/gnome-shell/org.gnome.Shell.Extensions` (started 08:15:15, still alive), while `prefs.js`'s new content landed on disk only at 08:37:25 (`stat` mtime, commit 08:41:36) — **the process is older than the file**, so the new address on disk has never been loaded by any real session — the one hit of opening the menu to see where the browser lands must wait for the next login (or for that process to exit and restart on its own) and be checked by hand; this round claims no conclusion for it. **After the 11:19 re-login this item is settled**: the prefs host process started at 11:34:30, later than `prefs.js`'s 08:37:25 ⇒ the new code was indeed loaded, leaving only "click it and see where the browser lands" |
| L2 re-test (after the 2026-10-10 11:19 re-login, automated part) | gnome-shell started 11:19:34, and `ps` showed **no** prefs host process **at that time**; it started only when I first opened the settings window at 11:34:30 ⇒ what it loaded must be the `prefs.js` on disk from 08:37:25 (this is also one real measurement of "logging out takes that host away", but **conversely "killing just it is enough" is still unmeasured**, do not extrapolate). Among the real window's 469 nodes, `Reset to Default Value` and `Preview this effect` are still **26 each**, switches 26; in both log channels (`/usr/bin/gnome-shell` and `org.gnome.Shell.Extensions`) our-prefix warnings **0** and JS ERROR **0** — in the same time window there was indeed 1 `TypeError: can't access property "ensure_style", firstIcon.icon is null`, belonging to `ubuntu-dock@ubuntu.com/dash.js` (the whole repo has **zero hits** for `ensure_style` / `firstIcon`), not this extension's. **A newly hit instrument trap**: when an `Adw.ExpanderRow` is collapsed its **whole subtree is not in the a11y tree** (the option-row titles "Animation time" / "Tilt" / "Speed" all have 0 hits), so "searching for the description text via AT-SPI" is necessarily a false negative and **cannot** be used to judge whether the descriptions rendered — that can only be done by eye after expanding, or by building the real rows with `Gtk.Builder`. A collapsed row's label nodes carry only clipboard-class actions, and `do_action(0)` neither expands it nor changes the clipboard (measured: `wl-paste` content unmodified). The window was closed with its own `Close` action, `prefs-open-count` 13 → 14 (an upstream counter, +1 per open) |
| Known prefs-process noise | every open of the preferences window logs two `Type GITypeInfo of property Adw.PreferencesWindow::visible-page does not match …`. **Not this fork's**: the whole repo's `grep -rn visible-page prefs.js src/ extension.js` is empty, and the prefs process I did not start (the 08:15:16 one) logs the same two. The sender is GNOME's own `org.gnome.Shell.Extensions` launcher. The log channel is `--identifier=org.gnome.Shell.Extensions` (**not** `gjs`) |

> **Do not edit the working tree while a run is in progress**: the zero-write proof compares
> `git status --porcelain` before and after the run, so changing a file while it runs (even one
> unrelated to the test) makes it truthfully report "working tree modified" and voids that run.
> Likewise, `git commit` counts as a change — commit first, then certify.

> **This table takes no single samples.** In the "Value" column, any duration is either written as a
> range with the sample count and source noted (`run.sh all` consecutive run or a single probe run),
> or marked as a single sample. The previous version's `enable()` recorded 6 ms / 35 ms and thereby
> stored machine state as a "baseline": re-measuring the same code, the 20-profile tier measured
> 29–46 ms.
