# CHANGELOG — burn-my-windows@local

Personal maintenance fork of [Burn My Windows](https://github.com/Schneegans/Burn-My-Windows) by
Simon Schneegans, frozen at upstream **v48** and imported at `16ab10a`. This file records only
deviations I introduced after that import.

Coverage: 16ab10a..HEAD
Check with `npm run check:log`. Entries are `D-###`, monotonic, never reused.
An entry states what was true **as of its commit**, not current state: old entries are not
re-verified, and aggregate counts live in the checker's output, never in this file.

> **How these were written.** `Symptom` / `Change` are compressed from the commit subject plus the
> state of the touched file at HEAD; diffs were not re-read one by one. `Evidence` names a test only
> where that suite was re-run in the session that wrote the entry (`npm test`, 29 pass at adoption);
> everything else is `L?`. Commit subjects carry audit numbers (P1-1, A3 …) — those are the
> maintenance ledger's ids, kept here verbatim so the two can be cross-read.

`kind` uses six values: `fix` / `perf` / `taste` / `guard` / `revert` / `chore`. `perf` is kept
apart from `fix` because throughput work is not correctness work; `chore` exists for cleanups that
carry **neither** obligation — see `MAINTENANCE.md` §13 for issues that are known and deliberately
not fixed, which are not recorded here at all.

---

### D-001 · 2026-09-22 · fix · v48
Symptom  the `changed::active-profile` handler stayed connected to settings after disable, so a repeated enable accumulated them
Change   disconnect that handler on disable
Evidence L0 reran `npm test` this round (patch-symmetry: `enable() then disable() leaves the shell exactly as it found it`)
Cost     the same "handler accumulation" class as D-008; both must hold
Commit   37eb5f8

### D-002 · 2026-09-22 · fix · v48
Symptom  an error thrown midway through `_doEnable()` left a half-enabled state that could neither work nor exit cleanly
Change   reclaim the partial state already built on the error path
Evidence L?
Cost     the same enable/disable contract as D-001 and D-003
Commit   3d2a107

### D-003 · 2026-09-22 · fix · v48
Symptom  the migration callback is async, so it still landed after `disable()` and wrote back to objects already released
Change   guard "already disabled?" before the callback runs
Evidence L?
Cost     read together with D-007's profile-migration dedup; an unguarded async continuation is a recurring defect class here
Commit   3223773

### D-004 · 2026-09-22 · perf · v48
Symptom  deferred enable waited 4000 ms, leaving a long post-login window with no animation
Change   shorten it to 1000 ms
Evidence L?
Cost     a trade between "don't slow startup" and "usable sooner"; restoring the large value brings the P0-class startup problem back
Commit   2830ac4

### D-005 · 2026-09-22 · fix · v48
Symptom  when UPower was unavailable it threw outright, putting the whole extension into a failed state
Change   tolerate the absence (no daemon → unconstrained profile)
Evidence L?
Cost     the same power-tier decision chain as D-013 / D-022; all three must agree
Commit   7323459

### D-006 · 2026-09-22 · chore · v48
Symptom  `getUIDir`, `Shader._time` and `mushroom-8bit` had no references left but stayed in the tree
Change   remove the dead code and the retired effect
Evidence L0 reran `npm test` this round (effect-registry: `all eight registration points hold the same 26 effects`, `enable switches and shaders are a bijection`)
Cost     no behaviour change; but the registration-point count is effect-registry's criterion, so removing an effect must change all eight at once
Commit   26dfe07

### D-007 · 2026-09-22 · fix · v48
Symptom  two potential crashes in the effects (not reproduced then, but readable from the code)
Change   harden both
Evidence L?
Cost     a potential crash cannot be proven by any test, only read; do not treat it as "covered by a case"
Commit   3169475

### D-008 · 2026-09-22 · fix · v48
Symptom  reloading profiles kept accumulating signal handlers, so one animation fired several callbacks
Change   stop the accumulation
Evidence L0 reran `npm test` this round (the balance assertions of patch-symmetry / sentinel-drift)
Cost     the same class as D-001; accumulation looks fine the first time, so it takes a repeated path to catch
Commit   0691b34

### D-009 · 2026-09-23 · fix · v48
Symptom  in a texture-binding callback `pipeline` can be null, and accessing it throws
Change   add a null guard
Evidence L?
Cost     only triggers on a specific frame / specific effect; not verified at L2
Commit   5b1fd8d

### D-010 · 2026-09-23 · guard · v48
Symptom  the extension's whole survival rests on private shell interfaces; if upstream renames one, the failure is silent
Change   introduce the private-API sentinel (probing: warn only, never block)
Evidence L0 reran `npm test` this round (sentinel-drift: `every patched method is also watched by the sentinel`, `the three probe families still hold what they hold today`)
Cost     the sentinel's criterion is "can be provoked once", not "runs green"; deleting it invites the upgrade-time blind spot back
Commit   f4cba97

### D-011 · 2026-09-23 · perf · v48
Symptom  every power-tier decision re-queried UPower
Change   cache the UPower result
Evidence L?
Cost     a cache needs an invalidation boundary, or tier changes go unanswered (linked to the missing-guard semantics of D-005 / D-022)
Commit   f4cba97

### D-012 · 2026-09-23 · perf · v48
Symptom  shaders compiled on first use, so the first animation stuttered noticeably
Change   pre-warm shaders during idle
Evidence L?
Cost     the pre-warm's cost and benefit are measured in this repo (`docs/maintenance/measurement.md` §12, with D-031); whether it compiles GLSL at startup was once unconfirmed
Commit   f4cba97

### D-013 · 2026-09-23 · fix · v48
Symptom  with the UPower daemon absent a constrained power tier still matched, making the constraint meaningless
Change   no longer match a constrained tier when the daemon is absent
Evidence L?
Cost     the same chain as D-005 and D-022; D-022 is its P1-1 re-review
Commit   2b33e53

### D-014 · 2026-09-23 · perf · v48
Symptom  the enabled-effect enumeration was recomputed on every animation
Change   cache it per profile instead of per animation
Evidence L0 reran `npm test` this round (effect-registry's bijection and eight-registration-point assertions prove the cache did not shrink the set)
Cost     the cache invalidation point must stay in step with profile changes
Commit   21de887

### D-015 · 2026-09-23 · perf · v48
Symptom  effect presets were rebuilt on every widget realize
Change   build them once per realize
Evidence L?
Cost     if runtime preset edits are ever allowed, this cache needs an invalidation path
Commit   a8d952f

### D-016 · 2026-09-23 · fix · v48
Symptom  overview cleanup cleared clone fields without checking ownership, wiping fields another clone was using
Change   clear only fields belonging to one's own clone
Evidence L?
Cost     cross-clone state trampling is the classic "green and still invisible"; the regression only shows with parallel windows
Commit   ba17312

### D-017 · 2026-09-23 · fix · v48
Symptom  a retried migration appended the profile again
Change   a retry no longer produces a duplicate profile
Evidence L?
Cost     the same async migration path as D-003
Commit   bd1d45d

### D-018 · 2026-09-23 · perf · v48
Symptom  enable went through the deferred path, leaving a no-animation window between login and usable
Change   switch to synchronous enable, falling back to a deferred retry on failure
Evidence L?
Cost     **the risk direction of a P0-class change**: once main-thread synchronous work grows it wrecks startup. This must be re-checked against MAINTENANCE §0's quick-reference criterion, not just "does it look right"
Commit   c9bf43b

### D-019 · 2026-09-23 · fix · v48
Symptom  `meta_window` can be null, and accessing it throws
Change   add a null guard
Evidence L?
Cost     the same "check for null before taking the window object" class as D-009
Commit   038c903

### D-020 · 2026-09-23 · guard · v48
Symptom  the timing and source of the power-tier sampling were unrecorded, so the reading could not explain itself
Change   write the power-state sampling method into the code (the behavioural half of the same commit is D-019)
Evidence L?
Cost     purely documentation; deleting it breaks nothing, it only makes the next misreading possible
Commit   038c903

### D-021 · 2026-09-23 · chore · v48
Symptom  comments and alias spelling were inconsistent
Change   unify comments and aliases
Evidence N/A (no behaviour change)
Cost     no obligation and no loss; it is no basis for any upgrade decision
Commit   ec656c7

### D-022 · 2026-09-24 · fix · v48
Symptom  P1-1: with the power-tier guard missing a constrained tier still mismatched (D-013's re-review closure)
Change   fix the match condition so a missing guard takes only the unconstrained tier
Evidence L?
Cost     the criterion comes from audit id P1-1; changing it means re-running the tier matrix (`docs/maintenance/compat-matrix.md` §6's 8 compatibility branches)
Commit   c15a7a1

### D-023 · 2026-09-24 · chore · v48
Symptom  P3-1: three comments described behaviour that did not match GNOME 50
Change   correct the comments per measurement
Evidence L?
Cost     a wrong comment costs more than no comment — it is the source of the next misjudgement
Commit   52dbe48

### D-024 · 2026-09-24 · perf · v48
Symptom  `common.glsl` was decoded once per effect instance; one warm-up round cost 1977µs
Change   decode once per process, dropping to 448µs (77% saved)
Evidence L?
Cost     the measured figures are from that measurement; re-measure after a GNOME version change instead of reusing these values
Commit   3ae5a8e

### D-025 · 2026-09-24 · perf · v48
Symptom  `_warmShaders` repeated 26 synchronous reads
Change   reuse `enabledEffects`, saving 1.36ms at N=20
Evidence L0 reran `npm test` this round (effect-registry guarantees the reused set is still complete)
Cost     as above: the numbers were measured then
Commit   47170d0

### D-026 · 2026-09-24 · guard · v48
Symptom  P1-2A: the sentinel missed the part of the runtime private API that is "statically checkable"
Change   fill in the statically checkable part
Evidence L0 reran `npm test` this round (sentinel-drift: `the patch list matches the originals enable() captures`, `sentinel holders agree with the patch targets`)
Cost     the sentinel list and the patch list must be added to and removed from together; a one-sided change is caught immediately by sentinel-drift
Commit   d396d31

### D-027 · 2026-09-24 · guard · v48
Symptom  P1-2B: the `WindowPreview` / `Workspace` instance fields were not watched by the sentinel
Change   add the instance-field sentinels
Evidence L0 reran `npm test` this round (sentinel-drift: `the instance-field probe cannot touch the object it inspects`)
Cost     as D-026; instance fields only exist at runtime, so a static test can only prove "the probe is written correctly", not "upstream did not change"
Commit   a58f3d6

### D-028 · 2026-09-24 · fix · v48
Symptom  P3-2: `_doDisable()` did not release `_shellSettings`, leaking one object per enable/disable cycle
Change   release it too
Evidence L0 reran `npm test` this round (patch-symmetry's enable/disable balance)
Cost     a leak is a correctness problem, not recorded as perf
Commit   a83df30

### D-029 · 2026-09-24 · perf · v48
Symptom  the profile-match constraints were re-evaluated on every animation; 454µs per animation at N=20 (2.72% of a frame)
Change   precompile the constraints, dropping to 1µs
Evidence L?
Cost     this is a hot path; the numbers were measured then, re-measure after an upgrade
Commit   b8369df

### D-030 · 2026-09-24 · fix · v48
Symptom  P1-3 (newly found outside the audit): end-animation touched an already-disposed window actor
Change   the end-of-animation path no longer accesses a destroyed actor
Evidence L?
Cost     accessing a disposed object in GJS is a runtime error, not a silent no-op; this only triggers when an animation is interrupted
Commit   fdb2fcb

### D-031 · 2026-09-25 · chore · v48
Symptom  A3: "does the pre-warm compile GLSL?" sat in the to-confirm pile for a long time, its conclusion living only in conversation
Change   settle it with measured data and write it into the docs (touched a comment in src/)
Evidence L?
Cost     this is worth "not having to re-measure next time"; once the data is stale, re-measure instead of quoting it
Commit   d581b3d

### D-032 · 2026-09-29 · guard · v48
Symptom  across the 8 shell patches the install-side and restore-side guards were asymmetric: one side had one, the other did not
Change   add guards to both install and restore
Evidence L0 reran `npm test` this round (sentinel-drift: `both sides of every patch are guarded`; patch-symmetry: `enable() never invents a method that upstream no longer has`, `disable() never leaves a stub behind for a dropped method`)
Cost     **a one-sided guard equals no guard**: when asymmetric, the restore path leaves the patch installed forever
Commit   1cc6722

### D-033 · 2026-09-29 · guard · v48
Symptom  the `Gtk` / `Gdk` imports in `prefs.js` and AuraGlow were not version-pinned
Change   pin `?version=4.0`
Evidence L0 reran `npm test` this round (effect-registry: `both processes enumerate the same nicks`)
Cost     pinning makes a GNOME major change blow up at load time instead of silently taking the wrong branch
Commit   d9f22a7

### D-034 · 2026-10-09 · fix · v48
Symptom  issue 335's resize branch only called the original `ease()` without removing the override (upstream deliberately left it armed), so the next takeover read the "original method" from `actor.ease` that was really the previous closure: each takeover chained one more closure, each retaining an effect object and its profile's `Gio.Settings`; the residual closure also created an effect out of thin air on the animation the patch deliberately delegated; after `disable()`, if it fired again, it threw a TypeError while `this._settings` was already null, so `_destroyWindowDone` stopped running
Change   store the original `ease()` on `actor._bmwEaseOriginal` and reuse it instead of reading back off the actor; `_doDisable()` walks the window actors and reclaims any still-pending override (reading only its own expando, never a disposed GObject); the resize branch passes through `ease()`'s return value and counts it
Evidence L0 reran `npm test` this round (patch-symmetry added `a resize fallthrough keeps the override pending but does not grow a chain`, `a delegated animation is not retroactively burned by an old closure`, `disable() takes back an ease() override that is still pending`; each of the three was red-verified by injecting a defect — "read `actor.ease` again", "drop the `return`", "do not walk the actors")
Cost     none of these three paths had ever been covered by a gate (both the `else` branch and the post-disable closure). The `_easeFallthroughs` counter exists to answer "does this path ever fire on GNOME 50 / Wayland"; it can be removed once measured
Commit   b174f69

### D-035 · 2026-10-09 · fix · v48
Symptom  if the first animation hit a logind / UPower startup race, `_upowerProxyChecked = true` was set before the attempt and the failure was never retried: `_upowerProxy` stayed null for the whole session, `powerMode` stayed 2, a profile constrained to "battery only" silently never matched, and only a re-login could recover
Change   split construction into `_tryUpowerProxy()` / `_tryPowerProfilesProxy()`; on failure schedule a low-priority retry at 30 s, at most three times, constructing only while the extension is still enabled; after a failure the animation hot path makes no synchronous bus call (the retry call is idempotent); `_doDisable()` cancels the timer and clears the attempt lock so re-enable can try again from scratch
Evidence L0 reran `npm test` this round (`test/proxy-retry.test.mjs`, 6 cases: five methods sliced out and run on mock Gio / GLib; six injections each red-verified — unfixed code / no retry scheduled / no upper bound / cancellation removed / hot-path rebuild / `_settings` guard removed); L1 probes 04 and 06 reran 17 + 20 checks all PASS, CRITICAL 0
Cost     on a machine with no service (desktop) up to three low-priority constructions; gives up after a 90 s window. The test uses `sliceMethod()` to cut method bodies by brace matching, skipping strings and comments — a tool that incidentally serves later gates
Commit   b38a1d0

### D-036 · 2026-10-09 · fix · v48
Symptom  `disable()` only emptied `_ALL_EFFECTS`: each profile entry held a **filtered copy** of that list plus its own `Gio.Settings`, so the 26 effect objects with their shader pools and decoded textures stayed reachable for the whole disabled period; `_resources` kept a 2.5 MB mapping of the unregistered bundle, the two D-Bus proxies and `_windowPicker` stayed attached as before; `PickWindow()` created a new `LookingGlass.Inspector` on every D-Bus call and the two handlers were never disconnected — clicking "select window" N times left N inspectors alive, each answering the next pick
Change   `_doDisable()` releases `_profiles` (an empty array, not null, so a late read degrades to "no match" instead of throwing), `_resources`, the two proxies and `_windowPicker`, and zeroes `_killEffectsSignal` after disconnecting; `WindowPicker` becomes one inspector per export cycle, and `unexport()` disconnects both handlers and hands the object back
Evidence L1 probe 04 reran 25/25 this round (was 19; five new release assertions + one inspector-reuse assertion; LookingGlass is available in the sandbox, no skip taken). Injecting defects red-verified each: deleting all release statements → 20/25, reverting to a new inspector each time → 24/25
Cost     after `_windowPicker` is nulled, re-enable rebuilds the picker and re-`export()`s the same object path — upstream's path once threw "An object is already exported" on a duplicate export (noted in probe 04's comment); this round `reenabled` still PASSes, so the rebuild order is right
Commit   cb06fa8

### D-037 · 2026-10-09 · fix · v48
Symptom  `_warmedNicks.add(nick)` ran before the `try` and `catch (_e) {}` logged nothing: one driver rejection of a shader permanently registered that effect as "warmed", it was never retried, nothing in the log showed it, and the pool then built that shader on the real animation path (exactly the ~1.1 ms hitch the pre-warm exists to avoid)
Change   register `_warmedNicks` only on success; on failure warn once with the `[burn-my-windows@local]` prefix + nick and retry on the next profile reload; the within-run cross-profile dedup now uses a local `queued` set
Evidence L0 reran `npm test` 46/46 this round (new `test/shader-warmup.test.mjs`, 5 cases: success is not repeated / one failure does not end the queue / a failure is not registered and is retried with a log / two profiles of the same effect build once / the source retires after disable; four injections each red-verified — "register on failure too", "still silent", "failure ends the queue", "drop the dedup"); L1 probe 02 reran 10/10, CRITICAL 0
Cost     the same commit changed sentinel-drift's "exactly 5 warn sites" into the boundary-free invariant "every warn carries the prefix" — a count gate only forces you to delete the gate when a legitimate new log line appears. The cost of failure retries is one more attempt per profile reload, off the animation path
Commit   78e5c47

### D-038 · 2026-10-09 · chore · v48
Symptom  `extension.js`'s power-sampling comment claimed "polling is deliberate, to avoid a resident D-Bus subscription", and `docs/maintenance/measurement.md` §12 recorded "animation-path bus | unconstrained profile: 0 calls" — both were written down, not measured
Change   rewrite the comment to the measured conclusion and state its condition; probe 05 gains the `easeFallthroughsNatural` observation (this entry changes no behaviour)
Evidence direct measurement with gjs 1.88 (the same `makeProxyWrapper` call path + the interface XML in the repo): the proxy's `flags == 0` (`G_DBUS_PROXY_FLAGS_NONE` ⇒ GIO keeps its own PropertiesChanged subscription to maintain the cache), 50 `OnBattery` reads totalling **634 µs** (≈13 µs each); the same conclusion inside the shell: probe 06 `constrainedChooseUs 3299 / 70 / 28`. Probe 05 reran 5/5 this round, `easeFallthroughsNatural = 0` (26 real windows each opened and closed once)
Cost     that `docs/maintenance/measurement.md` §12 line is literally false (the first non-preview animation does construct the proxy, 135 µs in the sandbox); the read itself is a local cache — left for phase D to rewrite per this section. **No code change on that basis**: 13 µs is negligible, and turning `:909` into a lazy computation would only scan the profile list once more per animation. Also, the severity of D-034's branch drops from "current bug" to "potential correctness": on headless mutter under GNOME 50 / Wayland with ordinary window traffic it never fired once
Commit   1bfb768

### D-039 · 2026-10-09 · fix · v48
Symptom  `Main.wm._waitForOverviewToHide` was replaced with "return immediately" whenever the extension was enabled, regardless of any effect — so a user who turned every switch off did not get native behaviour, and windows mapped while the overview was still hiding
Change   decide per call: `_anyEffectEnabled()` reads the `enabledEffects` already cached by `_loadProfiles()` (no settings touched per call). The decision is made at call time rather than at `enable()` time, because the enabled set is changed in the preferences window while the extension stays enabled throughout
Evidence L0 reran `npm test` 49/49 this round (`patch-symmetry` added 3: all-off delegates / effect-present still skips (reverse control) / `_anyEffectEnabled`'s cache semantics; three injections each dropped 1 — "never delegate", "`some`→`every`", "always return false"); L1 probe 01 13/13, 03 **27**/27, 04 25/25, 07 3/3, CRITICAL 0, zero-write three hashes unchanged
Cost     **this is a perceptible behaviour change**: with everything off, window mapping returns to native timing (waiting for the overview to hide). If a user prefers the old "never wait", revert this entry; the criterion and the guards are both in the tests
Commit   16a67db

### D-040 · 2026-10-09 · guard · v48
Symptom  `MAINTENANCE.md`, a single 493-line file, was at once a runbook (what to run before changing, how to read the log, how to roll back) and three long-term assets (sentinel list / compatibility matrix / observation criteria and baseline). The assets get rewritten in place after a GNOME major upgrade, and "what to run first" drifts along with them. Prose has no compiler: when a section number moves house, the `§N` references in `AGENTS.md`, this file and the probe comments still exist and still read as if they had support, while pointing at a mere router line
Change   split the three assets into three pages under `docs/maintenance/`, demoting `MAINTENANCE.md` to a router: §0–§4 / §9 / §11 / §13 keep their body, the other six sections keep one pointer line each (§5 / §7 / §10 → `docs/maintenance/shell-internal-api.md`, §6 → `docs/maintenance/compat-matrix.md`, §8 / §12 → `docs/maintenance/measurement.md`), and §1's 06–07 methodology subsection moves along with them — **section numbers keep their original numbering, never reordered**. Added `test/docs-links.test.mjs` (8 cases): markdown relative links and `#anchors` are reachable, `§N` resolves to the file it names and that file's heading is not a router line, a moved section may no longer be cited by its old home (`MAINTENANCE.md` + `§N`), each section has exactly one pointer line, and moved content is in the new file **and** not in the old one
Evidence L0 `npm test` 57/57, `npm run check`, `npm run check:log` all green. The move was checked by line-by-line containment: 51 lines shared between the new pages and this file had no byte-identical form in the old file, each confirmed as a page preamble / router line / `§N`→path rewrite; 9 lines in the old file had no twin, likewise each confirmed as part of this rewrite, none a lost fact. Mutations were done in a `cp -a` copy, the working tree untouched: moving `docs/maintenance/` away wholesale → 5 red (the first being "`compat-matrix.md` is missing"); appending an old-home citation plus a broken link to the end of `AGENTS.md` → 3 red (old-home citation, broken link, two-hop pointer, one each); after each restore the copy returned to 57/57 and `diff -q` proved the restore byte-identical
Cost     the router trades the three tables you read on an upgrade for three hops, and buys "references resolve" as a machine criterion. **A gate only guarantees resolution, not semantics**: changing the measured value in `docs/maintenance/measurement.md` §12 to a fake number keeps the gate green — numeric truth is `docs/maintenance/measurement.md` §8's criteria discipline, not this. Not renumbering sections is this structure's long-term liability: any "tidy reordering" misaligns the references in `AGENTS.md`, this file and the probe comments at once, and the gate only reports "does not resolve", never "this number used to mean something else"
Commit   0ea8a29

### D-041 · 2026-10-09 · guard · v48
Symptom  the doc-router gate false-positived on its own newly added sentence: a sentence "§5 / §7 / §10 → `docs/maintenance/shell-internal-api.md`, §6 → `docs/maintenance/compat-matrix.md`" was judged to cite a section that does not exist for the second half. The cause was two things — parse order and character set: chain inheritance ("the previous reference on the same line") was placed before the explicit file name and stole the decision; and `ATTACHED_BEFORE`'s attachment character set contained the comma and the enumeration comma, so **the previous clause's** file name could reach across a comma and stamp the next section number — the latter is worse: a path belonging to the previous clause can serve as evidence for the next clause's section number, and an ambiguous spelling is let through as a precise citation, when the whole point of the gate is the criterion
Change   extract single-reference parsing into `targetOfReference()`: an attached file name (written before or after the number) outranks chain inheritance, and the comma and enumeration comma are no longer attachment characters — a name across a comma no longer stamps the following section number, which is then treated as a bare reference, so it falls to the router and is rejected by "that is a router line". Added a 9th unit criterion, pinning both rules with two discriminating fixtures, and kept three control assertions (a pure joiner still inherits, a bare section number still falls back to the router, and an attached path that is not a file must fail and name that token)
Evidence L0 `npm test` 58/58. Mutations in a `cp -a` copy, working tree unaffected: moving the inheritance branch back before the explicit name → 1 red (the new unit criterion); putting the comma back into the attachment character set → 2 red (the new unit criterion + the real `CHANGELOG.md:300` one); after each restore `node --test test/docs-links.test.mjs` returned to 9/9
Cost     tightening attachment turns a previously silent ambiguous spelling red, **changing the citation style, not the gate**: a `§N` must sit right next to its own file name (`docs/maintenance/measurement.md` §12) and not be separated by a comma. If that is too strict, revert this entry, at the cost of "the name belongs to the previous clause" citations becoming undecidable again
Commit   00906e9

### D-042 · 2026-10-09 · chore · v48
Symptom  `docs/maintenance/measurement.md` §12's "most recent full certification" was stuck at 2026-10-07's 89 checks, the `enable()` row still read 5 ms / 30 ms, and the bus row read "first time 4.4 ms (3299 µs in the sandbox)" — the microseconds and milliseconds in parentheses were already inconsistent (3299 µs is 3.3 ms). These numbers were copied, not measured this round
Change   replace `docs/maintenance/measurement.md` §12 with the command output from the 2026-10-09 certification: 7 probes 103 checks (01/02/03/04/05/06/07 = 13/10/27/25/5/20/3), CRITICAL 0, zero-write three hashes unchanged; `enable()` 6 ms / 35 ms; power-constrained `_chooseEffect()` 3191 / 89 / 29 µs; probe 07 begin/end 36/36 with `outstanding` 1 → 0 (it previously said "outstanding 0 at both ends"; now the "narrowing" criterion is spelled out, because the criterion is `outstandingAtEnd <= outstandingAtStart`, not equality); full-suite time 3 min 24 s, measured across `$OUT` artifact timestamps with the method noted
Evidence L1 `./test/headless/run.sh all` completed on the clean tree at commit `95cb463`, `RESULT: PASS`, exit 0; per-probe counts read from the `checks` object in `$OUT/*.json`, not from terminal echo (this round the first run lost the first three gates because the output was piped to `tail -60`, and had to be read back from the artifacts). The working tree had zero changes during the run; editing began only after it finished
Cost     the absolute values in the baseline table can only be compared longitudinally on the same machine (criterion in `docs/maintenance/measurement.md` §8). **This round only replaced rows with a provenance**: rows that were not re-measured stay as they were — not because they were wrong, but because this round did not measure them
Commit   e817c55

### D-043 · 2026-10-09 · guard · v48
Symptom  C1–C6 added and removed lines in `extension.js`, so every `extension.js:` line-number citation in the repo shifted together: the numbers in doc tables, probe comments and one `H.rec` text now point at unrelated code while still reading like evidence. `src/WindowPicker.js` was invalidated the same way by C3's change. No gate can see this — the doc-router gate only judges whether links and section numbers resolve
Change   mechanically re-walk every anchor (the script prints the target line's text for each citation, judged one by one): the citations to `src/Shader.js`, `src/utils.js`, `src/ShaderFactory.js`, `src/effects/Glide.js`, `src/migrate.js`, `prefs.js` and the effect files were not touched this round and checked out as still correct; what had shifted were the four in `extension.js` (true positions 1006 / 1039 / 1105 / 1164 / 1264), `src/WindowPicker.js` (true positions 56 / 65, plus the `closed` handler at 92) and `Shader.js:145` cited by `_preamble.js` (the code reading `.width` / `.height` is really at 150 and 164). **Probe comments are now located by symbol throughout**, with line numbers kept only in the doc tables; `docs/maintenance/shell-internal-api.md` §7's WindowPicker row is corrected from "no layer covers it" to "half covered". AGENTS.md takes in this rule and the re-walk command
Evidence all changes land in comments and one `H.rec` text: **no line in the probe diff contains `H.chk` or `H.metric`** (a regex check over `git diff -U0 test/headless/probes/` output, zero hits), not one checkpoint moved, so L1 was not re-run for this. Each of the four changed probes passes `node --check`; L0 `npm test` 58/58, `npm run check`, `npm run check:log` all green; the only remaining `extension.js:` citations are two, and a `grep` read-back confirms they point at 1164 and 1264
Cost     this rule **has no gate that can hold it**: the line-to-symbol mapping needs a human (or a parser not written this round), and the criterion is that grep plus the "print the target line's text" check. A wrong line number does not error, it only masquerades as evidence — precisely the reason to clear it out of the comments. Reverting this entry needs no test re-run, but the comments become single-use again
Commit   ff84a86

### D-044 · 2026-10-09 · guard · v48
Symptom  the user manual began citing the private-API inventory and the rollback recipe by number, but the doc-router gate had only one global coverage requirement ("at least 20 section-number references"). If the README were skipped by the walk it would still be green, leaving these two new citations unguarded
Change   add positive existence assertions to the section-number resolution gate: README.md and README.zh-CN.md must be in the markdown walk, and each must have at least one section-number reference resolved
Evidence `npm test` 58/58. Both assertions are positive "must exist" forms, so if the walk ever degrades (a directory excluded, a regex failing to match) it goes red instead of quietly scanning one file fewer. The README citations now scanned are [`docs/maintenance/shell-internal-api.md`](docs/maintenance/shell-internal-api.md) §5 and [MAINTENANCE.md](MAINTENANCE.md) §9
Cost     this is a **coverage** assertion, not a content-correctness one: it guarantees the README is scanned, not that the manual's UI semantics match GNOME. The latter came from reading the code back one by one this round, see D-045
Commit   c8fb37f

### D-045 · 2026-10-09 · chore · v48
Symptom  the README's preferences section listed only control names, without saying **how** a profile is chosen. Users can see six dropdowns but cannot see the four behaviours that directly change the look: the application name must match whole-string, a Power Profile constraint **does not** match when the daemon is absent while Power Mode reads "plugged in", preview plays only on window open, and test mode pins animations at 8000 ms. Troubleshooting had nowhere to look either: edited `.js` does nothing, nothing animates, power rules seem ignored, the log is two processes
Change   add two things to the bilingual README. The preferences section now states the selection mechanism: constraints are all-AND, priority is computed (high-priority switch +100, an application written +10, each other non-"Any" constraint +1), one effect is picked at random from the **enabled** ones after matching, no match or none enabled falls to native animation, and only normal windows and dialogs get effects; then each dropdown's comparison is listed. Added a troubleshooting section: module caching and log-out/log-in, the four-step "nothing animates" check, the two power fallbacks being written behaviour, the two journald identifiers and what each of the three warning kinds means, and the reset order of copying `~/.config/burn-my-windows` before `dconf reset -f`. The whole preferences section moved after "Usage", with the English and Chinese section counts and order kept mirrored
Evidence every claim was read back from the implementation: `_chooseEffect()`'s constraint chain and the two power fallbacks, `ProfileManager.getProfilePriority()`'s scoring, `_setupEffect()`'s `duration = testMode ? 8000 : …`, only `fire-enable-effect` defaulting to `true` among the schema's 26 `-enable-effect` (a script counted them), and preview being cleared by the **next** window close (probe 03's existing assertion). The dconf path and profile file name were read back on this machine (`dconf dump /org/gnome/shell/extensions/burn-my-windows/` has `active-profile`, profiles are `~/.config/burn-my-windows/profiles/<microseconds>.conf`). L0 `npm test` 58/58, and the equal bilingual section count is judged by `test/repo.test.mjs`
Cost     the docs state the **current implementation's semantics**, of which "constraints are all-AND" and "the priority algorithm" come from upstream design; this fork changed only the power branch's fallback decision. **Nothing not yet done is promised**: a per-effect reset button and a one-click restore-default both do not exist, so the text says so. If phase B adds a reset entry, this section must be rewritten in step
Commit   a6d792f

### D-046 · 2026-10-09 · fix · v48
Symptom  the widget-tree surgery in `fillPreferencesWindow()` that "reaches inside the preferences window" dereferenced each lookup result one by one: `header.pack_start(...)`, `clamp.get_parent()`, `viewport.get_parent().set_policy(...)`. That tree is not an API, and libadwaita inserting one container returns null — and the exception happens while the dialog is being built, so the user cannot open **the only window that can turn this extension off**. It runs in the prefs process, structurally invisible to the shell-side L1 probes
Change   first prove the move changes no behaviour, then talk about guards: the original statements were moved **verbatim** into `_installWindowChrome(window)`, the title bar and the profile editor each checked for null independently, and each failure writes one warn with the `[burn-my-windows@local]` prefix and continues installing the other half
Evidence new `test/prefs-window-chrome.test.mjs` (5 cases): runs the **real** `_findWidgetByType` recursion against an iterable mock widget tree. The first case, "both halves install on a healthy tree", was already green right after the verbatim move, which is exactly why it exists (proving the refactor changed no behaviour); the other three each lack one thing (no HeaderBar / no Clamp / a viewport with no parent scroller) and require only the matching half to drop, no throw, and the other half still installed; the fifth requires every `console.warn` in prefs.js to carry the prefix. Red first, green after: right after the move, before adding guards, 4 red (TypeError and "0 warns")
Cost     the guard replaces "crash" with "degrade + one warn", it is not a fix: if the widget tree really changes shape the decoration is lost and the dialog still opens, and the warn says which half was lost. Redoing the surgery means locating it by hand from the warn; this round promises no automatic adaptation
Commit   cabdcd3

### D-047 · 2026-10-09 · taste · v48
Symptom  the preferences window already had 119 per-option reset buttons (counted with `grep -o 'id="reset-' resources/ui/adw/*.ui`); what was missing was a single undo for "I've messed up this effect": the user has to remember which options they touched and click each back
Change   add an `edit-clear-symbolic` round button to each effect row, calling `_resetEffect(nick)`. The key set is **not** obtained by "scanning the schema for the `<nick>-` prefix": in the real profile schema `tv-` is also the prefix of 6 `tv-glitch-*` keys (of the 9 `tv-*` keys only 3 belong to tv), so a prefix scan would clear another effect's options too. Instead, while wiring up in `_loadActiveProfile()` a `_bindingEffect` marks the current effect, the keys are collected at the single convergence point, and stored as a per-effect `Set` (each profile switch re-wires, so one click cannot reset twice). The wording reuses the existing msgid "Reset to Default Value" in the `.mo` files (verified present in zh_Hans / de): Q3 does not approve the gettext toolchain, so a new string would be a blank spot in 36 languages
Evidence new `test/prefs-reset-effect.test.mjs` (6 cases, slicing out the convergence point and `_resetEffect` to run against mock settings): the key set is exactly what the effect declares, tv and tv-glitch do not cross, only the current profile is written (after a switch the old profile is not written), re-wiring does not reset twice, a key with no per-option button on its row is still covered, and a source-shape gate. Red first, green after: swapping in the pre-commit prefs.js in a /tmp copy → red (`_resetEffect() is not a two-space-indented method of the source being sliced`)
Cost     the reset scope is defined by "which keys this effect passes through when wired", not by the declaration table — the upside is that new options are covered automatically, the cost is that a new binding path **must** reach the convergence point or it silently escapes the reset set; the shape gate guards exactly that. The README's "there is no per-effect reset yet" line is now false and must be rewritten at wrap-up (both languages)
Commit   8c43373

### D-048 · 2026-10-09 · taste · v48
Symptom  option rows had only a title, giving no clue what the option adjusts. Hand-writing an explanation would owe the same meaning across 36 `.mo` files (the repo has only `.mo`, no `.po` / `.pot`, and Q3 does not approve the gettext toolchain); and GNOME already stores a one-line description per key that nobody fetches at runtime
Change   `_describeRow()` reflects the key's `description` from `getProfileSettings().settings_schema` at bind time and fills it into `subtitle`, adding 0 translatable strings. Three row kinds are left alone: `*-enable-effect` (that is the effect's own title row; "Use the tv effect." under "TV" is noise, not an explanation — 26 of them), those whose description and summary are byte-identical (11, all mushroom / team-rocket placeholders), and those that already have a hand-written subtitle (8 in the `.ui`, 8/8 with `translatable="yes"`, already through 36 languages, while the schema descriptions are all in English). The profile schema's 163 keys → 152 usable descriptions, 0 empty, i.e. 126 rows gain an explanation. `get_key()` throws on an unknown key, so `has_key()` is checked first; if no row is found, do nothing. Putting this into `_bindResetButton` was wrong: the suite went from green to 73/78, five `this._describeRow is not a function` — the reset gate has no need of an explanation. Moved to a `_finishBinding(settingsKey)` convergence point called separately, which all six bind entry points now route through
Evidence each of the six GI interfaces used was confirmed against this machine's typelib (`Adw.ActionRow` / `Adw.ExpanderRow`'s `set_subtitle` / `get_subtitle`, `Gio.SettingsSchema.has_key` / `get_key`, `Gio.SettingsSchemaKey.get_summary` / `get_description`), none written from memory. Coverage was measured two independent ways (gjs reflecting the bundled `schemas/gschemas.compiled` + parsing the schema XML directly), agreeing; `settings_schema` was confirmed to be the one built by `lookup('…-profile')` in `src/ProfileManager.js`, not the main schema's 7 keys. New `test/prefs-describe-row.test.mjs` (9 cases) + two mutations: removing the `_describeRow` call from the convergence point → exactly 1 red of the 9; removing the forwarding from `_bind` → exactly 1 red in the reset gate, and the failing one is the new chain assertion while the per-entry loop stays green (the reason that assertion exists). L0 suite 78/78
Cost     the schema XML has no `gettext-domain` attribute (the one in `metadata.json` applies only to UI strings), so **the explanations are English in any UI language**. Nothing on the code side can make them Chinese without approving the gettext toolchain or copying the descriptions into the `.ui` (the latter being the debt this entry avoids). This machine's LANG is en_US.UTF-8, so nothing looks off; a Chinese UI will mix languages — left for you to judge by eye in a real session, which needs a log-out/log-in (the prefs process also eats GJS module cache, and the L1 probes cannot reach prefs.js)
Commit   9f1a6d6

### D-049 · 2026-10-09 · chore · v48
Symptom  four icons in the resource manifest (the `-symbolic.svg` of copy-effects / paste-effects / window-open / window-close) were named by no shipped text: they were added for actions upstream has and this fork does not, yet were compiled into the bundle and shipped
Change   delete those four lines from `resources/burn-my-windows.gresource.xml`, delete the four `.svg` files, `make` to rebuild. The intermediate state was also caught once by the existing bundle gate (with only the manifest changed, before `make`, it reported exactly "4 member(s) the manifest no longer lists … They are still shipped to users"). The 5 PNGs and the remaining 5 icons are each named by effect JS / shader / `prefs.ui`, checked one by one, so only these four were dead resources, no collateral cleanup
Evidence "dead" was judged on two independent grounds: a repo-wide `grep -rIl` (excluding `.git` / `node_modules` / the bundle itself) found them only in the manifest, and `grep -a` in the `.mo` binary directories also had no hits; D-050's gate, on its first run, listed **exactly these four**. After the change `gresource list` went from 74 members to 70, and `grep -c img/scalable/actions` left 5 lines in the manifest, all 5 named by something
Cost     icon names are looked up at runtime by string (`prefs.js` registers `/img` with IconTheme), so "no text in this repo names it" is not "nothing can ever look it up" — a user's own CSS or a third-party extension could in theory name these icons. A solo-use fork accepts that premise; if upstream ever uses them again, `git revert` this entry
Commit   c7bbb49

### D-050 · 2026-10-09 · guard · v48
Symptom  both existing bundle gates aligned the bundle with the **manifest** only; none aligned the manifest with "is anything using it". So an unnamed icon still compiled and shipped, and deleting a `.ui` reference turned no check red — when an upstream upgrade brings new icons, this class of debt accumulates again
Change   `test/build-freshness.test.mjs` gains one case: take all `img/scalable/actions/` entries from the manifest, strip the directory and `.svg` to get the icon name, and look for it in **the text we ship** — the literals from `allJsSources()` plus the body of every `.ui` in the manifest. An icon reaches a widget by only these two routes (a `.ui`'s `icon-name` attribute, or a string passed to `new_from_icon_name()` in JS), so it is mechanical, unlike shaders which are string-concatenated
Evidence the gate went red on its first run, listing the four names one by one (independently reproducing D-049's conclusion), while the other 6 cases in the same file were green. Two injections (each in a fresh /tmp copy, discarded after): add an icon nobody names to the manifest → the gate goes red and lists the name; change the filter prefix to match nothing → the gate still goes red, via the "an empty set cannot count as a pass" control
Cost     covers only `img/scalable/actions/`. The three kinds PNG / shader / `.ui` are out of scope: their references are runtime paths and string concatenation (`/shaders/${nick}.frag`), and looking up names by literal would be all false red. Widening the scope needs another basis, not this round
Commit   c7bbb49

### D-051 · 2026-10-09 · taste · v48
Symptom  the preferences window's four attribution slots (the menu's `homepage` / `bugs`, About's `set_website` / `set_issue_url`) all pointed at the upstream repository, while `metadata.json`'s `url` had been this fork's since import — a user reporting a problem from the UI hint filed it in a tracker without this code
Change   point all four back at the fork. The dividing line is written into the comment: **where the code is maintained** belongs to the fork, **who wrote the effects and where the money and translation queues live** belongs to upstream. `set_developer_name` / `set_copyright('© 2023 Simon Schneegans')` / license / the four donate-* / `show-sponsors` / `translate` (Weblate) / `new-effect` / `wallpapers` are all untouched, and `metadata.json`'s donations section too (Q5 keeps donations as-is)
Evidence the new gate (D-052) was written first; with the code unchanged, 2 of its 5 cases were red and the failure messages printed both expected and actual addresses; three controls were green on the spot
Cost     this is an **attribution** change, not a fix: the upstream issue page is still right for someone running upstream v48 as-is. If this fork is ever no longer maintained, these four must be changed back together, and the gate will point at the README line saying why
Commit   b64beb7

### D-052 · 2026-10-09 · guard · v48
Symptom  for a change like D-051 where "two answers are easy to write as one", the most likely regression is replacing the upstream repo name wholesale — turning the donation page into the fork's and the credit into this repo — and neither error is visible in the UI. One gate must hold both directions: "point back" and "do not point extra while you're at it"
Change   new `test/prefs-attribution.test.mjs` (5 cases). **The expected addresses are not restated in the test**: the fork comes from the README's `git clone https://github.com/<owner>/<repo>.git` line, the upstream owner from its `**Upstream:** [..](https://github.com/<owner>/<repo>)` line — the README is what users read, and copying a URL into the test again is one more place waiting to drift. The credit comparison uses the owner segment, not a person's name, so a change of person needs no gate change
Evidence three injections each hit the half they guard (each copy carried only one mutation; the first script tried to restore with `cp`, hit this machine's interactive `cp` alias, and without an answer to the prompt did not restore, so the last two runs ran on the previous run's polluted state — conclusions were clean only after switching to a fresh copy each time): wholesale replacement → red only on "money and translation queues stay upstream" and "attribution edits are only these four"; changing only `set_copyright` / `set_developer_name` → red only on the credit line; leaving only `set_website` back at upstream → red on "where bugs go" and "four places". There is also a self-consistency control: the fork address must differ from the upstream one, or the rest would be "true by construction"
Cost     the gate reads the README's two line formats, so rewriting that README section must keep the shape of `git clone …\.git` and `**Upstream:** [..](https://github.com/…)`, or the gate goes red on "cannot get the address" rather than on attribution. This round deliberately did **not** bring the `changelog` action into the assertions: it still opens the upstream changelog, and whether to change it to this repo's `CHANGELOG.md` is not yet decided (see MAINTENANCE.md's "known-not-fixed / to confirm"), so adding a gate would decide half the question for it
Commit   b64beb7

### D-053 · 2026-10-09 · chore · v48
Symptom  `docs/maintenance/measurement.md` §12's "Value" column stored three **single samples** as a baseline: enable() 6 ms / 35 ms, `_chooseEffect()` first frame 3.2 ms, begin_work / end_work "36 / 36". They deceive not by being wrong but by making the reader think each quantity has a single point — the next person comparing 35 against a measured 46 concludes a "31% regression" that does not exist
Change   after two full certifications + three extra samples this round (5 enable() samples, 5 constrained first-frame samples), switch to ranges with the sample count and source noted; the begin_work row is restated as its criterion (a process-level counter that gnome-shell also increments, so **the start-end gap not widening** is the criterion); the cross-run stability row is restated as "five rounds agree on the verdict, not the numbers". The same round changed `docs/maintenance/measurement.md` §12's bundle members 74 → 70, added the four preferences-window gates and the icon gate to AGENTS's L0 gate list, and changed the bilingual README's "restored 74 source files" to "there were 74 then"
Evidence full certification 2026-10-09 23:07–23:10 `RESULT: PASS`: 7 probes 103 checks (13/10/27/25/5/20/3), `CRITICAL/JS ERROR lines across all sessions: 0`, zero-write three hashes (dconf / profiles / working tree) byte-identical, wall clock 3 min 24 s (measured with `date` before and after, noted alongside the earlier artifact-timestamp method). The certified tree is `d7fdbf1`; the diff afterwards can be read back mechanically — `git diff --stat d7fdbf1..HEAD` contains only `docs/maintenance/measurement.md`. L0 84/84
Cost     **this round withdraws an attribution I myself wrote in the previous commit**: in `d7fdbf1` I wrote "the 46 ms run came from a batch run, the three single runs were all 29–35", implying batch runs are slower; this certification was also a batch run yet printed 31 ms, so the causal claim was refuted by its own sample on the spot, and was rewritten as "batch and single runs have no stable high/low relation, 46 is the only high value and I cannot say why". One more correction of the same kind: "then 28–89 µs" was stretched to 127 µs this round. Ranges widen; they are not written once and fixed
Commit   2bbd164

### D-054 · 2026-10-09 · guard · v48
Symptom  D-047's promise was "new options are covered automatically without anyone registering them", and that sentence had a **premise** no check guarded: keys are collected in `_loadActiveProfile()`'s effect loop while `_bindingEffect` is set. If an effect binds its own keys elsewhere (say at page realize), the eraser permanently misses that key while both existing gates stay green — they only assert all six bind entry points reach the convergence point, not which method the call happens in
Change   `test/prefs-reset-effect.test.mjs` gains a **call-site scanning** gate: it walks every `dialog.bind*(` in `src/effects/*.js`, attributes it to its enclosing "two-space-indented class method", and requires all of them to fall inside `bindPreferences()` (the one the effect loop calls, i.e. `effect.bindPreferences(this)` in `prefs.js`). Plus a self-consistency control: both the scanned file count and the call count must be > 0
Evidence measured 26 effect files, all bind calls inside `bindPreferences()`, none escaping today. The other half was checked too: no place in `src/effects/*.js` or `src/*.js` bypasses the helper to call `Gio.Settings.bind(...)` directly (Fire.js's `getProfileSettings().reset/set_*` is its own preset feature, not a binding). Two injections (each in a fresh /tmp copy, discarded after): moving Apparition's `bindAdjustment` line into `getNick()` → red with the message naming "Apparition.js: getNick()"; changing the scan regex to a call name that does not exist → red on the "scanned 26 effect file(s) and found 0 bind call(s)" control. L0 suite 85/85
Cost     attribution relies on "a two-space-indented class method", which is **this repo's writing convention**, not a language rule: if someone later writes a method with different indentation, that line is attributed to `null` and goes red (loudly, never silently passing). This gate holds "which method the call site falls in"; it still does not hold "whether marking and unmarking are paired" — that half is guaranteed by the `_bindingEffect = null` immediately after `bindPreferences`, for which no separate gate was built this round
Commit   22ed443

### D-055 · 2026-10-10 · fix · v48
Symptom  D-047's per-effect reset also collected `<nick>-enable-effect`. In a real session, pressing the eraser in the preferences window via AT-SPI removed two lines from the profile: `glide-tilt` **and** `glide-enable-effect`. Harmless for glide (off by default), but `fire-enable-effect` is the only one of the 26 switches defaulting to `true` (itself guarded by `build-freshness`'s gate) — so "reset this effect to default" would switch Fire on, and resetting paint-brush in reverse would switch it off, directly changing "which animation plays for the next window", while a button labelled "reset" gives no hint of that side effect
Change   exclude `-enable-effect` when collecting, the same suffix criterion as the description line. The switch is left for the user to flip. Also, after the exclusion a "some effect binds only the switch" case could in theory arise → `_effectKeys[nick]` never built → `for (const key of undefined)` throws `can't access property Symbol.iterator`, in the prefs process, i.e. D-046's class. Chose **a gate over a `?? []`**: added "no effect can be left with an empty reset set", scanning the 26 effects' `bindPreferences()` and requiring each to bind at least one non-switch option (all satisfy it today); a future violation goes red at L0 rather than being hidden by a silent fallback
Evidence discovery and re-verification were both at real runtime: ① in a real window, clicking Glide's button, evidenced by a keyfile diff before and after a backup (only those two lines gone, the other 25 byte-identical), then restored byte-identical to the backup (`sha256sum` matching pre-test); ② slicing `_bindResetButton` / `_resetEffect` verbatim out of prefs.js and running them against the **real** keyfile GSettings: after reset `fire-enable-effect=false` is still in the file, `fire-animation-time` and `fire-color-1` are cleared, `wisps-*` untouched; ③ the empty-set path threw the above TypeError in the same script. Red first, green after: change the expectation → 5 red (the new case's failure message directly says "which animation plays for every window") → change the implementation → 9/9; injecting into the gate itself (emptying an effect's `bindPreferences`) goes red on exactly case 9. L0 suite 87/87
Cost     this is a **behaviour fix**, not an extension: reset's meaning narrows to "the options this effect declared". The bilingual README states in step that the switch is out of scope. Also this round's measurement spanned two shells (07:47 and 08:03, the latter after the machine rebooted again); both ran the same on-disk code, so the conclusion is unaffected; D-047's "the key set is exactly what the effect declares" is kept unchanged as the fact at the time
Commit   0e99c80

### D-056 · 2026-10-10 · taste · v48
Symptom  the menu's "View Changelog" and the toast shown after the extension version changes open the changelog in the **upstream repository**. This slot differs from D-051's four: those four were "the issue lands in a tracker without this code", this one **necessarily** answers the wrong question — the toast is triggered by this fork's `metadata.json:version`, the user follows it, and the document they read contains not one change from this fork. Q4 at the time approved only the website / issues two, so this was recorded as "your call" in `MAINTENANCE.md`'s "known-not-fixed / to confirm"; this round closed it under "handle the remaining questions per recommendation"
Change   change the address to this repo's `CHANGELOG.md`. The attribution dividing line is unchanged to the letter: **what someone reading this code should see** belongs to the fork, credit / license / donations / translation queue belong to upstream — so this is a fifth slot, not widening the scope by an inch
Evidence before changing the address, confirmed the landing spot was not my own imagining: `git symbolic-ref refs/remotes/origin/HEAD` → `refs/remotes/origin/master` (the default branch really is `master`, upstream's is `main`, and copying upstream's path would 404); `git cat-file -e origin/master:CHANGELOG.md` holds; fetching the rendered page gave "Repository: burn-my-windows / First heading: CHANGELOG — burn-my-windows@local". Also found something incidentally: the baseline import `16ab10a`'s top level contains only `LICENSE extension.js locale metadata.json prefs.js resources schemas src` — `docs/` was never in our tree, and the old link always pointed at the upstream repository's web page, so "this repo lacks that file" could never have been the regression. L0 suite 87/87
Cost     an attribution change, not a fix: for someone running upstream v48 as-is, the old address is still right; if this fork is ever no longer maintained, these five must be changed back together. There is also a **coupling the gate cannot see**: the branch name `master` in the URL is checked by the command above, not held by an assertion, recorded in `MAINTENANCE.md`'s "known-not-fixed / to confirm"
Commit   f976433

### D-057 · 2026-10-10 · guard · v48
Symptom  D-052's gate **deliberately excluded** changelog — the decision was not yet made, and adding a gate would decide it. Once decided, the fifth slot fell outside the gate: an upstream upgrade bringing that line back to `Schneegans/Burn-My-Windows`, or someone sweeping the whole thing, would turn no check red
Change   `test/prefs-attribution.test.mjs`'s "where bugs go" went from four addresses to five, with a new extractor `changelogUrl()`. This one does not go through `addURIAction`; its URL is in `Gtk.show_uri(null, …)`, so the extractor has a different shape, but it carries the same "red if it cannot be extracted" assertion (deleting the action / no longer opening the URL both go red on the extractor rather than on the expected value). The sweep count went from "exactly 4" to "exactly 5"
Evidence red first, green after: gate widened first, code unchanged → 2 of 5 red (case 2 prints both actual and expected addresses, case 5 reports 4≠5), the other 3 green on the spot — exactly the two that should be red, not all. Two injections each hit the half they guard (a fresh /tmp copy each time, discarded after): change changelog back to upstream → red on cases 2 and 5; then sweep `new-effect` and `wallpapers` into the fork too → red on case 5 **only**, because those two URLs are not in the assertion list anyway and overreach can only be caught by the count
Cost     case 2 judges by `startsWith(forkUrl())`, comparing only host + repo name; the `/blob/master/CHANGELOG.md` path and branch are not in the assertion (the coupling D-056 recorded). The count is written as "exactly 5" on purpose: a future sixth slot must change the expectation too, and one more slot is a new attribution decision that should not be slipped through by an edit
Commit   f976433

### D-058 · 2026-10-10 · chore · v48
Symptom  after D-047 folded reset and the description line into `_finishBinding()`, the seven bind helpers' comments still read "It also binds the corresponding reset button". That sentence is false today: they only hand the key to the convergence point, the real binding is in `_finishBinding()`. A comment pointing at the wrong place sends the next person looking in `_bind` for code that no longer exists
Change   all seven now read "It also feeds `_finishBinding()`." (six were already one line, `bindColorButton`'s was three lines and is now two). Method names carry backticks, for greppability
Evidence `grep -c "It also feeds" prefs.js` = 7; repo-wide search for the stale wording `grep -rn "binds the corresponding" --exclude-dir=.git --exclude-dir=reports .` is empty; `node --check prefs.js` passes. This one was **stumbled on while changing the address this round**: reading all seven helpers to verify the fifth slot is how the seventh (`bindColorButton`) was seen to have been missed last round
Cost     pure comment, no behaviour change, discardable wholesale on an upgrade. The source of the drift was my own previous round's convergence-point rework, not upstream — that comment was correct in the code it originally sat in
Commit   f976433

### D-059 · 2026-10-10 · chore · v48
Symptom  closing D-056's slot surfaced two debts of my own in the same table. ① `docs/maintenance/measurement.md` §12's "most recent full certification" row listed `prefs.js` in the **re-run trigger** list, while the very next row says the seven probes do **not** load `prefs.js` — the two rows contradict each other, and the consequence was not paper agonising: I ran a full 3.5-minute `run.sh all` for one `prefs.js` change on the old list. ② §13's unredirect-no-refcount item still carried "**your call**", yet it was X1, long ago set in STATE as "record and deliberately do not fix" — a decision already made, written twice in two voices
Change   ① rewrite the trigger list by the **probes' load path**: `extension.js` / `src/` / `resources/shaders/` (`.frag` loads via GResource, probe 02 compiles each); `prefs.js` / icons / `.ui` are explicitly carved out, their threshold stated in place as `npm test`'s four preferences-window gates + this page's L2 row, and "this round wasted one run" left in the table as the reason rather than quietly narrowing it. ② change §13's unredirect to **decision: do not fix**, with the asymmetric-cost reason (adding a refcount in `src/Shader.js` = overturning the open/close timing shared by 26 effects, for only a frame-level visual difference) and the **reversal condition** (a real machine reporting fullscreen animations interrupted by redundant compositing — act on the symptom, not on this analysis). ③ put this round's certification numbers into the table: enable()'s eighth sample, constrained first frame's eighth sample (median changed from 3.2 to 3.4 ms), begin/end's fifth round, L1 timing's fourth round, cross-run stability's eighth round; the two lower bounds in the "then 28–149 µs" row (range lower bound 28 from an earlier round; this round and the recent eight's non-first-frame reads are 42–149) are now stated separately, the second ambiguity caused by my previous version mixing them
Evidence certification ran on the clean tree `9b5e3d4`: 08:47:19–08:50:49 (`date` difference 3 min 30 s), `RESULT: PASS`, exit 0, 7 probes 103 checks (13/10/27/25/5/20/3), CRITICAL/JS ERROR 0, zero-write three hashes dconf / profiles / working tree byte-identical. The verdict matches the previous round, per-probe counts identical item by item — which is the measured basis for "wasted for prefs.js". This round's samples come as-is from the artifacts `$OUT/06-main-thread-budget.json` (`steps` section) and stdout: `enableMs` 5 / 35, `constrainedChooseUs` 3260 / 72 / 126, `beginWork=36 endWork=36` (`overview-close` scenario 12/13, i.e. `outstandingWorkByScenario` last value -1, from stdout's scenario lines), 26 effects 71–73 frames. Also did a **full anchor re-walk** incidentally (a one-off python heredoc, **not committed**, because it is not yet decided whether to make it a cross-fork reusable script): extracted 29 distinct `file:line` from committed markdown (excluding `reports/`), printed each target line, **0 blank or out-of-range** (`docs/maintenance/compat-matrix.md` and `docs/maintenance/shell-internal-api.md`'s two tables locate by line number and rot first). L0 87/87, `npm run check`, `check:log` all green
Cost     this narrowing was **bought with a real run's no-difference result**, not laziness: if the probes ever start loading `prefs.js` (say by adding an assertion that really mounts the settings page with `Gtk.Builder`), this list must be changed back. §13's item is just a decision record, no code, nothing to revert; the cost of replacing "your call" is — if you really see fullscreen tearing on a real machine, this is the first suspect
Commit   2fe1e0e

### D-060 · 2026-10-10 · chore · v48
Symptom  after the user logged out and back in, two things had to be answered on the spot, and I got one of them wrong in the first version. ① whether D-056's new address actually reached the real session — last round I could only mark it "not loaded", because the host process in `ps` was older than the file. ② I thought I would use AT-SPI to search for the description text, to upgrade "126 rows rendered" from "your eyes" to machine-judgeable. **It was a false negative**: three option-row titles ("Animation time" / "Tilt" / "Speed") all returned 0 hits, and my first reaction was to write "the descriptions may really not render"
Change   write both conclusions and the **instrument boundary** into the docs: `AGENTS.md`'s L2 section gains "a collapsed `Adw.ExpanderRow`'s whole subtree is not in the a11y tree", with the corollary not to use it to judge description rendering and the alternative; `docs/maintenance/measurement.md` §12 gains a row "L2 re-test (after the 11:19 re-login, automated part)" recording in the same row the causal chain that the new code was loaded, the 26/26 counts, the two channels' warning counts, the boot error **not belonging to this extension**, and "logging out takes the host away, but conversely 'killing just it is enough' is still unmeasured"
Evidence full command output: gnome-shell `350714` started at 11:19:34, `ps` showed **no** prefs host process at that time, and only when I first opened the settings window at 11:34:30 did `/usr/bin/gjs -m /usr/share/gnome-shell/org.gnome.Shell.Extensions` (pid 374277) start — `prefs.js` mtime is 08:37:25, so what loaded must be the new one. `gnome-extensions info` reported `State: ACTIVE`, `Version: 48`, `URL: github.com/SHADE-glitch/…`. AT-SPI walked the real window (frame `Burn-My-Windows 48`) to 469 nodes: `Reset to Default Value` **26**, `Preview this effect` **26**, `switch` **26**, `named=117 / described=1` (the one description is the window's `Close the window`). The evidence for the false negative: in the same tree all 26 effect-row titles are present, while any **option-row** title has 0 hits ⇒ what is missing is the whole collapsed subtree, not the descriptions. `journalctl --since '11:19:30'`: our-prefix warnings **0**; JS ERROR **1** = `TypeError: can't access property "ensure_style", firstIcon.icon is null`, whose attribution is that `grep -rl firstIcon /usr/share/gnome-shell/extensions/` hits only `ubuntu-dock@ubuntu.com/dash.js`, while the whole repo (this fork) has **0 hits** for `ensure_style` / `firstIcon`. The clipboard was not changed by my synthetic click (`wl-paste` identical before and after); the window closed via its own `Close` action (`do_action(0) → true`, re-checked frame count 0), `prefs-open-count` 13 → 14
Cost     whether the descriptions **render** still has no machine method (only expanding and looking, or building real rows by hand) — this one steps back from "I almost wrote it as proven" to "honestly marked unproven". The same corollary is useful later: for any "no text found in a widget tree" conclusion, first prove that subtree was in the tree to begin with. Two other things stay open: whether restarting just the host process is enough (this was a full log-out, so it cannot be inferred); and the ubuntu-dock boot error outside this fork is out of this task's scope, recorded for attribution only, sibling directory untouched
Commit   c4d3a93

### D-061 · 2026-10-10 · guard · v48
Symptom  after D-057 took in the fifth slot, that URL was still only compared by **host + repo name**: the `/blob/master/CHANGELOG.md` half-path was bare. And in §13 I only admitted "the branch name is unguarded" — **actually the path is unguarded too**, an account that misrecorded its own coverage. All three of the missed edits would pass L0 green: copying upstream's `docs/changelog.md` wording back into the path, writing the blob link as the repo root, and renaming our own `CHANGELOG.md` — the third is the most real, because it does not even need the URL touched
Change   `test/prefs-attribution.test.mjs` gains case 5: split the link into `/blob/<ref>/<path>`, require `<path>` to be **really readable in this repo**, non-empty, and to contain the `# CHANGELOG` heading (the toast promises a changelog, not just any document); also explicitly reject absolute paths and `..`, or "a file was read" would not mean "we ship it". The `<ref>` (branch name) is **still not asserted**, the reason written in the assertion comment and in §13: a CI checkout has no trustworthy source for "what this repo's default branch is called", and stuffing a field into the repo for this would decide half that question
Evidence the gate was written first and was green on the spot (the current URL resolves to `CHANGELOG.md`, readable, has the heading), then **three injections each hit the same assertion with different messages** (a fresh /tmp copy each time, deleted after): path changed to `docs/changelog.md` → red and prints `sends the user to "docs/changelog.md" on branch "master", but the repository has no such file … ENOENT`; the whole URL changed to the repo root → red on `"…" is not a /blob/<ref>/<path> link`; renaming the copy's `CHANGELOG.md` to `CHANGES.md` while **not touching the URL** → red back on the first message (this one is the most valuable of the three, proving the criterion really lands on our tree rather than on string shape). All three red on this one case only, the other 5 green as usual. On the first batch-injection run the third case produced no output (`ls -d` reported 0 leftovers), and only a separate re-run gave the conclusion — a batch script "printing less" is not "executing less", it must be re-checked separately. L0 suite **88/88**, `npm run check`, `check:log` all green
Cost     the assertion reads the **working tree**, so "file on disk but not committed" also passes; to catch uncommitted shipping it would have to switch to `git ls-files`, not widened this round. §13's item is now accurate: the only known-unguarded thing left is the **branch name**, and the manual check is one command (`origin` has been an SSH address since this round, `git ls-remote --symref origin HEAD` works directly on this machine)
Commit   0688540

### D-062 · 2026-10-10 · chore · v48
Symptom  right after writing D-061 I found I had left two places where "the doc states a rule it no longer follows". ① `docs/maintenance/measurement.md` §12's certification row says "after certification there should **only be** the docs commit recording this certification", but D-061 is a `test/` gate — read literally, the next session would think a violation occurred and re-run an L1 round, exactly the behaviour D-059 had just refuted with one wasted run. ② in §13 I wrote "`origin` has been an SSH address since this round": whether `origin` uses https or SSH is **each person's local config**, and writing that into a doc others read gives the reader a false promise
Change   ① rewrite the certification row to state only the criterion itself: **re-run only when `extension.js` / `src/` / `resources/shaders/` are touched**, everything else (docs, `test/`'s L0 gates, `prefs.js`, icons, `.ui`) is no reason to re-run, and say plainly "what lands after certification is mostly exactly this kind of commit". ② rewrite that §13 sentence to an environment-neutral form: the command to check the default branch is `git ls-remote --symref origin HEAD`, **which only gives a result when the remote is SSH** (on this machine the https form silently hangs on `github.com:443`), and keep the `ref: refs/heads/master` measured on 2026-10-10
Evidence both are plain text changes, `npm test` **88/88** (including D-061's new gate), `npm run check`, `check:log` PASS; located the old sentence with `grep -n "此后只应有记录这次认证的 docs 提交"` before, and grep-confirmed it gone after. The local remote has also been switched to SSH per the user's instruction and verified both ways: `git ls-remote --symref origin HEAD` returns a result (`ref: refs/heads/master` + tip sha), `git push --dry-run origin master` returns `Everything up-to-date` (the write path works, and this time indeed no object was pushed away)
Cost     this changes a rule I wrote from "observation" back to "criterion", no code, no revert obligation. **One note for the next session**: `origin`'s transport form is local config and no committed doc may depend on it again; write "SSH works, https silently hangs on this machine" — a claim true on both sides. Also, this entry committed the very class of error it fixes: I first wrote the Commit as a sha that **never existed** (`097b424`, really `09fe7bc`), and `check:log`'s check 3 killed it on the spot — but I saw that red only **after committing and pushing**, because I judged with `check:log | grep`, and what took effect on the `&&` chain was grep's status, not its own (the same trap is recorded here: zsh's `$pipestatus`). Rule restated: **never pipe a gate command**; run `npm run check:log > /tmp/x.log 2>&1; echo rc=$?`, read rc, then decide whether to commit
Commit   09fe7bc

### D-063 · 2026-10-10 · guard · v48
Symptom  D-059's anchor re-walk was a **one-off** python heredoc: the conclusion "29 anchors, 0 dead" went into the ledger but not into any gate, while AGENTS.md's rule literally said "nobody checks them". More importantly, that re-walk **filtered by shape** — it counted only `file:line` with a file name, so the three **number-only** citations in `docs/maintenance/shell-internal-api.md`'s `extension.js` function table were not counted at all. "0 dead" and "three already rotten" held at once, precisely because the same evidence was measured twice with the same instrument: the missed class is exactly the one that rots first (no file name, so any grep written for `file:line` cannot see it). This round took those three line numbers back to their true addresses: the calls they point at are really at `extension.js:1240` / `extension.js:1242` / `extension.js:1259`, while the three originally given were `} else {`, `}`, and a blank line
Change   new `test/doc-anchors.test.mjs` (6 cases). Three criteria: ① the file an anchor names exists in this repo — by repo-relative path first, then by **unique** basename (both tables cite effect files by class name only, e.g. `Doom.js:55`; with multiple same-named files it **refuses**, never guesses which); ② the named line is in range and **not blank** (a blank line is the fingerprint of drift); ③ **no citation may give a line number without a file**. Scope and reasons are in the test header: `CHANGELOG.md` is not scanned (the ledger asserts "as of its commit"; checking history against today's tree would turn correct conclusions red); `reports/` is not scanned (gitignored, absent from a fresh clone); anchors in `.js` comments are not scanned (`extension.js` cites upstream shell's `workspace.js` / `windowPreview.js`, which are not in this tree; scanning them would need a hand-maintained "whose file is this" allowlist — exactly the expectation this suite has always avoided). Also added the file name to 5 bare line numbers, re-taking the address for 3 of them
Evidence the gate **red first, green after**: on writing it, 1 red out of 5 (`MAINTENANCE.md` 2 places, `shell-internal-api.md` 3 places); the true addresses were taken back with `grep -n '_mapWindowDone\|_destroyWindowDone\|_lookupIndex' extension.js`, confirming line 1259 is inside `_shouldDestroy()`; after the fix 6/6 green. **Seven injections**, each a fresh `/tmp` copy (`tar --exclude=.git`), deleted after each run, **each log read individually** rather than sharing one: A raise `src/Shader.js:28` to 99999 → red on "line in range"; B have the script find `src/utils.js`'s blank line number (line 104) and repoint `src/utils.js:141` at it → red on "not blank"; C `mv src/ShaderFactory.js` → red on "file exists"; D revert the fixed citation to a bare line number → red on "no bare line numbers" and prints the right message; E copy a `Doom.js` into `docs/dup/` to create a basename ambiguity → red on both "file exists (ambiguous)" and the resolver's unit assertion; F change the gate's extension class to never match → red on **both controls** (the anchor floor and "the ledger would hit if scanned"), proving the controls are not decoration; G put my first AGENTS.md prose back verbatim into the copy → red on **both branches** (3 bare line numbers + `workspace.js:1090` not in this repo). Cleanup always with `/bin/rm -rf` (bare `rm` on this machine is intercepted by gio as "system-internal mounts do not support trash" and leaves the copy behind), afterwards `ls -d /tmp/bmw-anchor.*` was 0. Full L0: `npm run check` rc=0, `npm test` **94/94** (was 88, +6 all from this gate), `npm run check:log` PASS (62 entries / 55 shas). Current count (python and grep agree): **8** markdown files, **35** anchors, **42** line-number checks after comma lists are expanded, **0** bare line numbers; `CHANGELOG.md` would contribute 2 if scanned — which is the basis for the "exclusion is a decision, not blindness" control
Cost     its visible boundary must be stated, so the next session does not read it as "all anchors are right": it passes an anchor that lands on a **real non-blank line** but no longer contains the claimed symbol — this round's two `}` are that class, and they were only found because they were bare line numbers at the time; anchors in `.js` comments are still unguarded (walked by hand this round, `src/Shader.js:139` and `src/Shader.js:150,164` etc. are still accurate), so AGENTS.md's rule only changed from "nobody checks" to "the docs are checked, comments still need a hand-walk"; it reads the **working tree**, so a file on disk but not committed also passes (the same limitation as D-061). **This round triggers no L1 re-run**, the criterion being `docs/maintenance/measurement.md` §12's "re-run only when `extension.js` / `src/` / `resources/shaders/` are touched" (set by D-059, rewritten by D-062), and this change is only `test/` and markdown. The ledger entry is `guard`: reverting means deleting one test file and putting that prose back. One more **process debt of my own**: injection G was added after the fact — I first rewrote the AGENTS.md prose on an inference about the regex and wrote it into the narrative as "the gate bit its author" **without running the gate**; after the extra run the conclusion was unchanged (both branches really did go red), but the order was wrong, and the rule is restated: **any "the gate caught X" must have a real run**; a static inference can only be written as an inference
Commit   08e5227

### D-064 · 2026-10-10 · guard · v48
Symptom  `STANDARD.md` §7 (machine-wide) requires every `.gitignore` to carry at least the runtime ignore list `.venv/ venv/ __pycache__/ *.db *.db-wal *.db-shm .pytest_cache/ reports/`. This repo carried `reports/`, `node_modules/` and the editor cruft, but none of the Python-tooling or database entries, so a stray `.venv/`, `__pycache__/` or `*.db` dropped beside the extension during testing would have shown up as untracked and been committable
Change   Added the seven missing entries under a labeled block citing STANDARD §7. Every existing rule is left byte-identical: `node_modules/`, the `reports/` rule, and the NOTE that keeps the compiled `.gresource` / `gschemas.compiled` tracked on purpose
Evidence L0: `git check-ignore -v .venv/x __pycache__/x.py foo.db .pytest_cache/x` now names `.gitignore` for all four paths (before the change none resolved); `node --test test/repo.test.mjs` 3/3; `npm run check:log` PASS
Cost     The block is a rule, not a check — only `reports/` is pinned by `test/repo.test.mjs`, so the full list can still drift. No `.venv` or `*.db` is produced by this extension's tooling, so the entries are prophylactic
Commit   bff0f2c
