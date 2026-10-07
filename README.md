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

## 🧪 Testing

Three layers, always run in order. The full playbook — what each layer can and cannot
prove, the private-API inventory, the compatibility matrix and the rollback recipe — is
in [MAINTENANCE.md](MAINTENANCE.md).

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

## ⚙️ Preferences

- **Global:** active profile, preview effect, test mode.
- **Per effect:** enable toggle, animation time and effect-specific parameters (colors, scale, speed, …).
- **Profiles:** matching rules on app, animation type, window type, color scheme, power mode and power profile.

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
- **Preferences:** colour buttons are set through `set_rgba()` instead of the deprecated `rgba` property, which removes the warning that was logged for all 29 of them on every dialog open.
- **Migration:** async migration callback guarded against post-disable execution; profiles are no longer duplicated on a retried migration.
- **Build:** restored 74 shader/UI/asset sources from the compiled bundle and added a `Makefile`.
- **Cleanup:** removed dead code (`getUIDir()`, `Shader._time`, commented `mushroom-8bit-enable` key).

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
