# Compatibility branch matrix and version gating

This page is one of burn-my-windows@local's three long-term asset pages, split out of
`MAINTENANCE.md` (the original §6); that file now keeps only a router line, and the body is
maintained only here. It answers: which API each of the fork's **8 compatibility branches** that sit
on GNOME Shell private interfaces probes, which one GNOME 50 actually takes, what the consequence of
a row flipping is, and why version gating itself (`shellVersionIs()` /
`shellVersionIsAtLeast()` in `src/utils.js`, plus each effect's `static getMinShellVersion()`) needs
no change even when moving to GNOME 51. **Before touching anything, read
[MAINTENANCE.md](../../MAINTENANCE.md) §3 (the boundaries of the isolated headless shell) and
[AGENTS.md](../../AGENTS.md) (the hard rules for agents)**: this table is re-measured in the sandbox
by probe 01's `compat-matrix`, and touching a branch outside the sandbox both pollutes the real
session and makes the comparison meaningless.

---

## 6. Compatibility branch matrix: 8 sites, and which GNOME 50 takes

Probe 01's `compat-matrix` re-tests these 8 rows and compares them with the expected values; a row
flipping is **loud**, telling you to read the branch you have just started down (the old `if` may
have become a dead branch).

| Site | API probed | GNOME 50 | Consequence of a flip |
| --- | --- | --- | --- |
| `src/Shader.js:122` | `Clutter.Timeline.prototype.set_actor` | present | the timeline no longer follows the actor, the animation runs on the wrong clock |
| `src/Shader.js:136` | `Meta.disable_unredirect_for_display` | **absent** → else: `global.compositor.disable_unredirect()` | tearing during fullscreen animations |
| `src/Shader.js:193` | `Meta.enable_unredirect_for_display` | **absent** → else: `global.compositor.enable_unredirect()` | unredirect never restored (note: this block uses the presence of `disable` to decide whether to call `enable`) |
| `src/Shader.js:154` | `meta_window.is_maximized` | present (added in 49) → if | `uIsFullscreen` wrong → shader padding wrong |
| `src/Shader.js:219` | `Cogl.SnippetHook` | present → Cogl branch | every shader fails to construct |
| `src/utils.js:141` | `shellVersionIsAtLeast(48,'beta')` | true → `St.ImageContent.set_data` takes a Cogl context | texture construction fails for the 5 textured effects (paint-brush / matrix / broken-glass / snap / trex). **Correction**: `getImageResource()` is called only on the effect side, and `prefs.js` never uses it, so the old wording "preferences preview image breaks" blamed the wrong caller |
| `src/utils.js:198` | `shellVersionIsAtLeast(47,'alpha')` | true → `Cogl.Color.from_string` | `parseColor` throws → effects render black |
| `src/ShaderFactory.js:79` | `GObject.Object.new` | true (almost always true in GJS; `newv` is a dead branch) | the shader cannot be constructed at all |

Version gating itself lives in `src/utils.js`: `shellVersionIs()` / `shellVersionIsAtLeast()`, fed
`Config.PACKAGE_VERSION`; the comparator returns true for any higher major, **so moving to GNOME 51
needs no change to it**. What silently disables an effect is the **per-effect** gate:
`static getMinShellVersion()` (highest of the 26 is `[40, 0]`), used by `prefs.js` to filter the list
rows.
