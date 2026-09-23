<p align="right"><a href="README.md"><b>English</b></a> | <a href="README.zh-CN.md">简体中文</a></p>

# Burn My Windows — Local Maintenance Fork

Disintegrate your windows with style.

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45--50-blue)
![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)
![Based on: Burn My Windows](https://img.shields.io/badge/based%20on-Burn%20My%20Windows-orange)

## About

This repository is a **personal maintenance fork** of [**Burn My Windows**](https://github.com/Schneegans/Burn-My-Windows) by **Simon Schneegans**, frozen at upstream **v48** and maintained locally under the UUID `burn-my-windows@local`.

It is **not** affiliated with or endorsed by the upstream author. The fork keeps the upstream feature set intact and focuses on **stability, resource management and startup performance** — the kind of latent bugs and leaks that are hard to reproduce but degrade a long-running GNOME Shell session.

## Features

- **26 shader-based effects** for window open/close animations — Apparition, Aura Glow, Broken Glass, Doom, Energize A/B, Fire, Focus, Glide, Glitch, Hexagon, Incinerate, Matrix, Mushroom, Paint Brush, Pixelate, Pixel Wheel, Pixel Wipe, Portal, RGB Warp, Snap of Disintegration, Team Rocket, T-Rex Attack, TV Effect, TV Glitch and Wisps. All rendering is done on the GPU via GLSL shaders.
- **Profile-based configuration** — each profile can match on application, animation type, window type, color scheme and **power mode / power profile**, so you can run heavy effects on AC and light ones on battery.
- **libadwaita preferences** with a live preview and a dedicated settings page per effect.
- **34 translations**, including Simplified and Traditional Chinese.
- **UPower / PowerProfiles integration** via D-Bus for power-aware profiles.

## Prerequisites

| Requirement | Details |
|---|---|
| GNOME Shell | 45 – 50 |
| Build tools | `glib-compile-resources`, `glib-compile-schemas` (package `glib2` / `libglib2.0-bin`) |

## Installation

This fork has no packaging step — it is used **in place** as a local extension:

```bash
git clone <your-fork-url> ~/.local/share/gnome-shell/extensions/burn-my-windows@local
cd ~/.local/share/gnome-shell/extensions/burn-my-windows@local
make                     # rebuild the GResource bundle and gschemas.compiled
gnome-extensions enable burn-my-windows@local
```

On Wayland you must log out and back in for GNOME Shell to load the extension.

## Usage

Open **GNOME Settings → Extensions → Burn My Windows → Settings**. Pick an effect from the preview list, then tune its parameters. Create profiles to scope effects to specific applications, window types or power states.

## Preferences

- **Global:** active profile, preview effect, test mode.
- **Per effect:** enable toggle, animation time and effect-specific parameters (colors, scale, speed, …).
- **Profiles:** matching rules on app, animation type, window type, color scheme, power mode and power profile.

## Changes vs upstream (v48)

This fork adds 20 commits on top of the upstream v48 baseline (`16ab10a`):

- **Crash fixes:** stale pointer in Incinerate/Pixel Wipe, `actor.height` clamp in Doom, null-pipeline guards in texture-binding callbacks, null `meta_window` guard, partial-enable rollback when `_doEnable()` throws, overview-clone cleanup scoped to the owning clone.
- **Resource leaks:** signal handlers in Aura Glow/Fire now respect the `_isConnected` guard; preferences teardown disconnects the exact connected window; `changed::active-profile` is disconnected on disable; idempotent `realize`.
- **Performance / startup:** synchronous enable with a deferred retry as fallback; deferred-enable delay reduced from 4000 ms to 1000 ms; enabled effects cached per profile instead of per animation; effect presets built once per widget realize; idle shader pre-warm; cached UPower proxy.
- **Power handling:** tolerate UPower being unavailable instead of throwing; a constrained power profile no longer matches when the daemon is absent.
- **Migration:** async migration callback guarded against post-disable execution; profiles are no longer duplicated on a retried migration.
- **Build:** restored 74 shader/UI/asset sources from the compiled bundle and added a `Makefile`.
- **Cleanup:** removed dead code (`getUIDir()`, `Shader._time`, commented `mushroom-8bit-enable` key).

## Contributing

Issues and pull requests are welcome. Please keep changes scoped and test them against the GNOME Shell versions listed above.

## Credits & Attribution

This extension is a **maintenance fork** of **Burn My Windows** by **Simon Schneegans**. All original design, shaders, effects and preferences are their work.

- **Upstream:** [Schneegans/Burn-My-Windows](https://github.com/Schneegans/Burn-My-Windows) — license **GPL-3.0-or-later**
- **Upstream author:** Simon Schneegans
- **Fork baseline:** upstream **v48** (commit `16ab10a`, "baseline: v48 upstream fork, before fixes")
- **Additional copyright:** the Team Rocket effect is © Justin Garza.

## License

Licensed under the **GNU General Public License v3.0 or later** — see [LICENSE](LICENSE).

As a derivative work of Burn My Windows, this fork remains under GPL-3.0-or-later and retains the upstream copyright notice.
