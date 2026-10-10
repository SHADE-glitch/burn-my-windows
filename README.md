<p align="right"><a href="README.md"><b>English</b></a> | <a href="README.zh-CN.md">简体中文</a></p>

# Burn My Windows — Local Maintenance Fork

Disintegrate your windows with style.

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45--50-blue)
![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)
![Based on: Burn My Windows](https://img.shields.io/badge/based%20on-Burn%20My%20Windows-orange)
[![Repository](https://img.shields.io/badge/repository-GitHub-black?logo=github)](https://github.com/SHADE-glitch/burn-my-windows)

## 📖 About

This repository is a **personal maintenance fork** of [**Burn My Windows**](https://github.com/Schneegans/Burn-My-Windows) by **Simon Schneegans**, frozen at upstream **v48** and maintained locally under the UUID `burn-my-windows@local`.

It is **not** affiliated with or endorsed by the upstream author. The fork keeps the upstream feature set intact and focuses on **stability, resource management and startup performance** — the kind of latent bugs and leaks that are hard to reproduce but degrade a long-running GNOME Shell session.

## ✨ Features

- **26 shader-based effects** for window open/close animations — Apparition, Aura Glow, Broken Glass, Doom, Energize A/B, Fire, Focus, Glide, Glitch, Hexagon, Incinerate, Matrix, Mushroom, Paint Brush, Pixelate, Pixel Wheel, Pixel Wipe, Portal, RGB Warp, Snap of Disintegration, Team Rocket, T-Rex Attack, TV Effect, TV Glitch and Wisps. All rendering is done on the GPU via GLSL shaders.
- **Profile-based configuration** — each profile can match on application, animation type, window type, color scheme and **power mode / power profile**, so you can run heavy effects on AC and light ones on battery.
- **libadwaita preferences** with a live preview and a dedicated settings page per effect.
- **34 translations**, including Simplified and Traditional Chinese.
- **UPower / PowerProfiles integration** via D-Bus for power-aware profiles.

## 🧰 Prerequisites

| Requirement | Details |
|---|---|
| OS | Ubuntu (verified on Ubuntu 26.04) |
| GNOME Shell | 45 – 50 |
| Build tools | `glib-compile-resources`, `glib-compile-schemas`, `make` |

## 📥 Installation

This fork has no packaging step — it is used **in place** as a local extension:

```bash
sudo apt install libglib2.0-bin make   # glib-compile-resources / glib-compile-schemas

git clone https://github.com/SHADE-glitch/burn-my-windows.git ~/.local/share/gnome-shell/extensions/burn-my-windows@local
cd ~/.local/share/gnome-shell/extensions/burn-my-windows@local
make                     # rebuild the GResource bundle and gschemas.compiled
gnome-extensions enable burn-my-windows@local
```

On Wayland you must log out and back in for GNOME Shell to load the extension.

### Uninstall

```bash
gnome-extensions disable burn-my-windows@local
rm -rf ~/.local/share/gnome-shell/extensions/burn-my-windows@local
```

## 🖱️ Usage

Open **GNOME Settings → Extensions → Burn My Windows → Settings**. Pick an effect from the preview list, then tune its parameters. Create profiles to scope effects to specific applications, window types or power states.

## ⚙️ Preferences

- **Global:** active profile, preview effect, test mode.
- **Per effect:** enable toggle, animation time and effect-specific parameters (colors, scale, speed, …).
- **Profiles:** matching rules on app, animation type, window type, color scheme, power mode and power profile.

The dialog writes two places. Global keys go to dconf under
`/org/gnome/shell/extensions/burn-my-windows/`; **each profile is its own keyfile**,
`~/.config/burn-my-windows/profiles/<microseconds>.conf`, group `[burn-my-windows-profile]`.
A profile is not a preset you have to activate first — the extension picks one per window.

**How a profile is chosen.** Every constraint on a profile has to hold at the same time, and among
the matching ones the highest-priority profile wins; from it, one *enabled* effect is picked at
random. Priority is computed rather than ordered by hand:

| What | Contribution |
|---|---|
| the profile's **high priority** switch | +100 |
| a non-empty **Application** field | +10 |
| each of animation type / window type / color scheme / power mode / power profile that is not "Any" | +1 |

If no profile matches, or the matching profile has no effect enabled, the window animates the native
GNOME way. Only normal windows and dialogs get effects — panels, docks and the desktop never do.

**What each constraint compares against.**

| Dropdown | Values | Matched against |
|---|---|---|
| Application | free text, `|`-separated | the window's `WM_CLASS`, lower-cased, compared as a **whole string**: `fire` does not match `firefox`. The pick button fills it in for you |
| Animation Type | Any / Opening Windows / Closing Windows | whether this window is mapping or unmapping |
| Window Type | Any / Normal Windows / Dialog Windows | normal vs dialog / modal-dialog |
| Color Scheme | Any / Default Color Scheme / Dark Color Scheme | GNOME's `color-scheme`, i.e. `default` vs `prefer-dark`; read per animation, so following the system theme works |
| Power Mode | Any / On Battery / Plugged In | UPower's `OnBattery`; **with no UPower the fork reads "Plugged In"** |
| Power Profile | Any / Power-Saver / Balanced / Performance / Saver or Balanced / Balanced or Performance | `org.gnome.PowerProfiles`' `ActiveProfile`; **if that daemon is absent, a constrained profile does not match** |

**Preview and test mode.** Preview ignores the constraints and uses the profile you are editing, and
it plays on window **open** only — the request is cleared on the next window close. Test mode pins every
animation to 8000 ms and fixes the random seeds so screenshots stay reproducible; it exists for the
test harness, not for daily use, so turn it back off.

**Undoing your own tuning.** Each effect row has a clear icon that resets **that effect's options** in
the profile you are editing, and each individual option still has its own reset button in its row. One
effect's button cannot reach another effect's keys, and neither button switches your profile. The clear
icon does **not** touch the effect's on/off switch — that is deliberate: one effect's default is "on",
so an "undo my tuning" button that also flipped switches would silently change which animation plays for
every window. Flip the switch yourself, it is right next to the button. What is reset is whatever that
effect declared for itself, so an option added later is covered without anyone remembering to register it.

**What the rows explain.** Most option rows carry a one-line description. It is the text the setting
itself already declares, read at runtime — nothing was written into the interface for the sake of this,
which is also why it is **not translated**: it shows in English whatever your GNOME language is. Rows
that already had a hand-written sentence keep theirs, and the effect header rows are deliberately left
without one, because "Use the fire effect." under a row titled *Fire* explains nothing.

## 🛠️ Troubleshooting

**I edited a `.js` file and nothing changed.** Disabling and re-enabling the extension does **not**
re-import its modules — a cached ESModule keeps its old code. On Wayland this needs a
**log out and log back in**. `scripts/reload.sh` rebuilds, cycles the extension, tails the log and
warns when `extension.js` or `src/` still has uncommitted changes, which is precisely the case where
a reload cannot have picked up your edit.

**Nothing animates.** Work through these in order:

1. Is at least one effect enabled in **some** profile? A fresh profile enables only `fire`.
2. Does that profile match this window? Constraints are all-AND, and the window has to be a normal
   window or a dialog — see **⚙️ Preferences** above.
3. Is an application constraint set? It compares whole `WM_CLASS` strings, so a partial name never
   matches. Use the pick button instead of typing.
4. Is test mode still on? Animations are pinned to 8 seconds and look nothing like the real speed.

With every effect switched off the extension deliberately stops touching animations, so window
mapping waits for the overview to close exactly like stock GNOME does.

**Battery or power-profile rules seem to be ignored.** That is the documented fallback, not a
detection failure: a profile constrained on **Power Profile** does not match while
`org.gnome.PowerProfiles` is absent, and a **Power Mode** constraint reads "plugged in" while UPower
is absent. A constrained profile never gets to match on an unverifiable reading.

**Reading the log.** The shell process and the preferences dialog are two different journald
identifiers:

```sh
journalctl -f -o cat --identifier=/usr/bin/gnome-shell | grep -F '[burn-my-windows@local]'
journalctl -f -o cat --identifier=org.gnome.Shell.Extensions | grep -iE 'burn-my|GJS|TypeError'
```

- `[burn-my-windows@local] expected <name> to be …` — a private GNOME Shell API moved under this
  GNOME version. Start with `./test/headless/run.sh 01`; the list of watched symbols is
  [`docs/maintenance/shell-internal-api.md`](docs/maintenance/shell-internal-api.md) §5.
- `[burn-my-windows@local] shader warm-up failed for <nick>` — that effect's shader was rejected by
  the driver during the idle pre-warm. The effect still works: its shader is built on the first real
  animation (one small hitch) and the pre-warm retries when profiles are reloaded.
- `An object is already exported for the interface …` on enable means `enable()` ran twice without a
  `disable()` between them. That is upstream behaviour and normal desktop flows do not reach it.

**Resetting.** Profile keyfiles are the only copy of your work, so copy them before resetting:

```sh
cp -a ~/.config/burn-my-windows ~/bmw-profiles-backup
dconf reset -f /org/gnome/shell/extensions/burn-my-windows/   # global keys only
```

Deleting a profile file deletes that profile for good. There is no whole-profile reset — the per-effect
button on each row is as far as it goes, and the commands above only clear the global keys.
For the rollback ladder — from "just disable it" to "clean reinstall" — see
[MAINTENANCE.md](MAINTENANCE.md) §9.

## 🧪 Testing

Three layers, always run in order. The full playbook — what each layer can and cannot prove
and the rollback recipe — is in [MAINTENANCE.md](MAINTENANCE.md), which now routes the three
long-term assets to `docs/maintenance/`: the private-API inventory
([shell-internal-api.md](docs/maintenance/shell-internal-api.md)), the compatibility matrix
([compat-matrix.md](docs/maintenance/compat-matrix.md)) and the measurement baselines
([measurement.md](docs/maintenance/measurement.md)).

```bash
npm run check && npm test          # L0: static, seconds, no display needed
./test/headless/run.sh all         # L1: real GNOME Shell in a sandbox, minutes
./test/headless/run.sh 01          # after a GNOME bump: start here
```

| Layer | Proves | Cannot prove |
|---|---|---|
| **L0** static gates | stale compiled artifacts, the 26 effects registered in all 8 places, sentinel/patch bookkeeping, the take-over branch on a synthetic stack | any runtime behaviour |
| **L1** headless probes | the 18 private APIs still exist on *this* GNOME, which compatibility branch is taken, shader/uniform resolution, real windows animating each effect, leak-free disable, `enable()` main-thread budget, `begin_work`/`end_work` balance on interrupted animations | smoothness, absolute GPU cost, whether an effect looks right |
| **L2** real session | everything a human can see — after log out / log in | nothing, but it is not automatable |

L1 is fully isolated: a private D-Bus socket, `GSETTINGS_BACKEND=memory`, scratch
`XDG_CONFIG_HOME` / `XDG_DATA_HOME` / `XDG_RUNTIME_DIR`, and it refuses to report green
unless `~/.config/dconf/user`, the profile directory and the working tree are
byte-identical to before the run.

## 🆚 Changes vs upstream (v48)

This fork adds maintenance commits on top of the upstream v48 baseline (`16ab10a`).
The count is deliberately not stated — `git rev-list --count 16ab10a..HEAD` is authoritative and a hardcoded number always drifts.
Every divergence below is recorded commit-by-commit in [CHANGELOG.md](CHANGELOG.md) with its kind,
its evidence tier and its hash, and `npm run check:log` proves that record covers every commit in
the window that touched `extension.js` or `src/`. `MAINTENANCE.md` still owns the how-to-verify
half; this section and CHANGELOG.md do not copy each other.


- **Crash fixes:** stale pointer in Incinerate/Pixel Wipe, `actor.height` clamp in Doom, null-pipeline guards in texture-binding callbacks, null `meta_window` guard, partial-enable rollback when `_doEnable()` throws, overview-clone cleanup scoped to the owning clone.
- **Stability:** the end-of-animation handler no longer touches a window actor that has already been destroyed, which used to log three `has been already disposed` criticals per occurrence.
- **Resource leaks:** signal handlers in Aura Glow/Fire now respect the `_isConnected` guard; preferences teardown disconnects the exact connected window; `changed::active-profile` and the desktop interface settings are released on disable; idempotent `realize`.
- **Performance / startup:** synchronous enable with a deferred retry as fallback; deferred-enable delay reduced from 4000 ms to 1000 ms; enabled effects *and* the profile match constraints cached per profile instead of being re-read on every animation; `common.glsl` decoded once per shell process instead of once per shader; shader pre-warm reuses the cached effect list instead of reading the same 26 keys a second time; effect presets built once per widget realize; idle shader pre-warm; cached UPower and PowerProfiles proxies.
- **Power handling:** tolerate UPower being unavailable instead of throwing; a constrained power profile no longer matches when the daemon is absent — the proxy is now rejected when nobody owns the bus name, which is what makes that rule actually hold.
- **GNOME 50 compatibility:** the private-API sentinel now also covers the symbols that are only used at runtime (`_mapWindowDone`, `_destroyWindowDone`, `_lookupIndex`, the `overlayEnabled`/`window_container` accessors, and the `WindowPreview`/`Workspace` instance fields), using the only predicates that do not raise false warnings on a working shell; comments corrected where they no longer described GNOME 50 (`Meta.disable_unredirect_for_display` no longer exists, the effects are not built lazily, and the pre-warm does not compile GLSL — verified, `get_pipeline()` is still `null` afterwards).
- **Preferences:** colour buttons are set through `set_rgba()` instead of the deprecated `rgba` property, which removes the warning that was logged for all 29 of them on every dialog open; the widget-tree surgery that decorates the dialog now degrades with a logged warning instead of throwing while the dialog is still being built; each effect row resets its own options in one click; option rows fill in the description the setting itself already declares, read at runtime, which adds no new string to translate; and the menu's homepage / bug links, the About dialog's website / issue links and the changelog entry — the one the "what changed" toast opens after an update — point at this repository while the author credit, the licence and the donation and translation links stay upstream.
- **Migration:** async migration callback guarded against post-disable execution; profiles are no longer duplicated on a retried migration.
- **Build:** restored the shader / UI / asset sources that had been lost and only existed inside the compiled bundle (74 of them at the time), and added a `Makefile` so the committed bundle and schemas can never sit behind their sources.
- **Cleanup:** removed dead code (`getUIDir()`, `Shader._time`, commented `mushroom-8bit-enable` key) and four icons that nothing named, behind a standing check so the resource manifest cannot grow another one.

## 🤝 Contributing

Issues and pull requests are welcome. Please keep changes scoped and test them against the GNOME Shell versions listed above.

## 🙏 Credits & Attribution

This extension is a **maintenance fork** of **Burn My Windows** by **Simon Schneegans**. All original design, shaders, effects and preferences are their work.

- **Upstream:** [Schneegans/Burn-My-Windows](https://github.com/Schneegans/Burn-My-Windows) — license **GPL-3.0-or-later**
- **Upstream author:** Simon Schneegans
- **Fork baseline:** upstream **v48** (commit `16ab10a`, "baseline: v48 upstream fork, before fixes")
- **Additional copyright:** the Team Rocket effect is © Justin Garza.

## ⚖️ License

Licensed under the **GNU General Public License v3.0 or later** — see [LICENSE](LICENSE).

As a derivative work of Burn My Windows, this fork remains under GPL-3.0-or-later and retains the upstream copyright notice.

© Simon Schneegans and contributors; fork modifications © SHADE-glitch.
