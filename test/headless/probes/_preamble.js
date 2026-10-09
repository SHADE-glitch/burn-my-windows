// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — shared probe bootstrap for burn-my-windows@local.
//
// run.sh concatenates this file with a probe body into ONE Eval string and injects
//   globalThis.__bmwOut -- absolute path the probe must write its result JSON to
//
// ---------------------------------------------------------------------------
// Rules this file exists to enforce. Each one is either a wrong result or a wrong
// accusation that was already produced once in this workspace:
//
// 1. NEVER `await import('file:///<repo>/src/...')` an extension module. That loads a
//    second copy of the module graph and re-registers its GTypes, and the extension
//    then dies on enable with "Type name Gjs_common_gjs_JsObjectWrapper is already
//    registered". Take classes off live objects instead:
//    `Object.getPrototypeOf(effect).constructor`, `effect.shaderFactory`.
//    `resource:///org/gnome/shell/...` is fine -- that is the shell's own graph.
//
// 2. Eval runs a CLASSIC script. `imports.ui.main` throws
//    "import declarations may only appear at top level of a module" because the GNOME
//    50 shell modules are ESM. Use `await import('resource:///...')`, and read `gi://`
//    through `imports.gi.*`, which does work here.
//
// 3. `enable()` may defer `_doEnable()` (the deferred-retry path), and ACTIVE only
//    means enable() returned. Poll for a concrete field -- `stateObj._settings` and a
//    non-empty `stateObj._profiles` -- never for `stateObj` truthiness.
//
// 4. GSETTINGS_BACKEND=memory is per-process, so settings must be written from inside
//    the shell (`stateObj._settings.set_*`), not by the calling script. Writing them
//    from bash would go to a different process's memory store and be invisible.
//
// 5. Never read a property off a destroyed actor, not even `get_parent()`. GJS logs a
//    CRITICAL that a try/catch cannot suppress, which makes the RUN look broken when
//    only the probe was. Use `in` / `typeof` / `Array.isArray` -- the same discipline
//    the fork's own instance-field probe is held to by test/sentinel-drift.test.mjs.
//
// 6. The instance-field sentinel can only run once a WindowPreview has been
//    constructed, i.e. once the overview has been opened. A "the sentinel was silent"
//    check that never opens the overview is permanently vacuous -- hence `openOverview`
//    below and the `sentinelRan` check that depends on it.
// ---------------------------------------------------------------------------

globalThis.__bmw = {
	UUID: 'burn-my-windows@local',
	out: { phase: 'pending', checks: {}, steps: {}, metrics: {} },

	rec(key, value) {
		this.out.steps[key] = value;
	},
	// A check records the *observed* value on failure, so verdict.js can print why.
	chk(key, value) {
		this.out.checks[key] = value === true ? true : value;
	},
	metric(key, value) {
		this.out.metrics[key] = value;
	},
	write() {
		// Guarded, because this is also what the error path calls. If the output path
		// was never injected, an unguarded throw here escapes from the probe's own
		// catch() and the run ends as an "Unhandled promise rejection" with no result
		// file -- which reads exactly like a hung extension but is a harness bug.
		try {
			imports.gi.GLib.file_set_contents(globalThis.__bmwOut, JSON.stringify(this.out, null, 1));
		} catch (e) {
			console.warn(`BMW-PROBE WRITE FAILED (${globalThis.__bmwOut}): ${e}`);
		}
	},
	done() {
		this.out.phase = 'done';
		this.write();
	},
	// A probe whose subject is unavailable must say so, not quietly pass with no checks.
	skip(reason) {
		this.out.phase = 'skipped';
		this.out.reason = reason;
		this.write();
	},
	fail(e) {
		this.out.phase = 'failed';
		this.out.err = `${e}\n${e.stack ?? ''}`;
		this.write();
	},

	sleep(ms) {
		const GLib = imports.gi.GLib;
		return new Promise((resolve) => {
			GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
				resolve();
				return GLib.SOURCE_REMOVE;
			});
		});
	},

	ms() {
		return imports.gi.GLib.get_monotonic_time() / 1000;
	},

	// The non-vacuity marker run.sh greps for. Measured on a live harness: the GJS
	// global `log()` reaches the shell log, `console.warn()` reaches it as a WARNING,
	// and `imports.gi.GLib.log` does not exist inside Eval at all -- calling it threw
	// and, because the call sat outside the probe's try, silently timed the probe out.
	begin(tag) {
		try {
			log(`BMW-PROBE BEGIN ${tag}`);
		} catch (e) {
			console.warn(`BMW-PROBE BEGIN ${tag}`);
		}
	},

	// The shell objects this fork patches, reached the only way Eval can.
	//
	// `imports.gi.Shell.Workspace` and `imports.gi.Shell.WindowPreview` are UNDEFINED on
	// GNOME 50: those classes are not in the libshell typelib, they are ESM exports of
	// ui/workspace.js and ui/windowPreview.js. Anything that wants their prototypes --
	// this harness, or a future live sentinel -- has to dynamic-import the modules.
	// `resource:///` is safe to import; only the *extension's own* files must not be
	// (rule 1 above).
	async shellModules() {
		const Main = await import('resource:///org/gnome/shell/ui/main.js');
		const {Workspace} = await import('resource:///org/gnome/shell/ui/workspace.js');
		const {WindowPreview} = await import('resource:///org/gnome/shell/ui/windowPreview.js');
		const Config = await import('resource:///org/gnome/shell/misc/config.js');
		return {Main, Workspace, WindowPreview, Config, WM: Main.wm};
	},

	// The one handle every probe needs: the live extension instance. Taken off the
	// shell's own extension manager, never by importing the extension's files.
	async boot({settings} = {}) {
		const Main = await import('resource:///org/gnome/shell/ui/main.js');
		const EM = Main.extensionManager;
		const uuid = this.UUID;

		// Apply settings before enabling so _doEnable() sees them on the first pass.
		if (settings) {
			const Gio = imports.gi.Gio;
			const s = new Gio.Settings({ schema_id: 'org.gnome.shell.extensions.burn-my-windows' });
			for (const [key, value] of Object.entries(settings)) {
				if (key.startsWith('_')) continue; // comments in the JSON
				if (typeof value === 'boolean') s.set_boolean(key, value);
				else if (typeof value === 'number') s.set_int(key, value);
				else s.set_string(key, value);
			}
			await this.sleep(200);
		}

		if (!EM.lookup(uuid)) {
			throw new Error(`${uuid} was not discovered -- check the XDG_DATA_HOME symlink in up.sh`);
		}
		await EM._callExtensionInit(uuid);
		await EM._callExtensionEnable(uuid);

		// Rule 3: poll for concrete state, not for stateObj existing.
		let inst = null;
		for (let i = 0; i < 120; i++) {
			inst = EM.lookup(uuid)?.stateObj ?? null;
			if (inst && inst._settings && inst._profiles && inst._profiles.length > 0) break;
			await this.sleep(250);
		}
		if (!inst || !inst._settings || !inst._profiles?.length) {
			throw new Error(
				`extension never reached a usable state (state=${EM.lookup(uuid)?.state}, ` +
				`settings=${!!inst?._settings}, profiles=${inst?._profiles?.length})`);
		}
		return {Main, EM, inst};
	},

	// Rule 6: constructing a WindowPreview is what arms the instance-field probe.
	// Opening the overview is not enough on its own -- with no window mapped there is
	// nothing to clone and `_init` never runs, which is exactly how this check read
	// "still false" on a perfectly healthy shell.
	async openOverview(Main) {
		Main.overview.show();
		await this.sleep(400);
		Main.overview.hide();
		await this.sleep(400);
	},

	// ------------------------------------------------------------------ real windows
	// Shared by 01 (which needs one preview to exist) and 05 (which needs one per effect).

	killPid(pid) {
		// GLib.kill, not Process.kill: there is no `Process` inside a shell process, and
		// a probe that throws during cleanup would blame the fork for the harness.
		try {
			imports.gi.GLib.kill(pid, 15);
		} catch (e) {
			/* already reaped */
		}
	},

	spawnClient(title) {
		const GLib = imports.gi.GLib;
		const harness = GLib.getenv('BMW_HARNESS');
		if (!harness) throw new Error('BMW_HARNESS is not exported -- up.sh must write env.sh');
		// The client inherits nothing from the probe closure except what it needs: this
		// shell's Wayland display and sandbox dirs, plus cairo so the *client* cannot be
		// the software-rendering failure point.
		const env = [
			`WAYLAND_DISPLAY=${GLib.getenv('WAYLAND_DISPLAY')}`,
			`XDG_RUNTIME_DIR=${GLib.getenv('XDG_RUNTIME_DIR')}`,
			`XDG_DATA_HOME=${GLib.getenv('XDG_DATA_HOME')}`,
			`XDG_CONFIG_HOME=${GLib.getenv('XDG_CONFIG_HOME')}`,
			`HOME=${GLib.getenv('HOME')}`,
			'GDK_BACKEND=wayland',
			'GSK_RENDERER=cairo',
			'NO_AT_BRIDGE=1',
			'GIO_USE_VFS=local',
		];
		const [ok, pid] = GLib.spawn_async(null, ['gjs', `${harness}/window-client.js`, title], env,
			GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
		if (!ok) throw new Error('could not spawn the test client');
		GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {});
		return pid;
	},

	findWindow(title) {
		for (const a of global.get_window_actors()) {
			const mw = a.meta_window;
			if (!mw) continue;
			if (mw.get_title && mw.get_title() === title) return {actor: a, mw};
		}
		return null;
	},

	async waitWindow(title, limitSeconds = 25) {
		for (let i = 0; i < limitSeconds * 4; i++) {
			const w = this.findWindow(title);
			// A mapped-and-sized window, not merely a created one: the animation path
			// only exists once there is a real geometry to animate.
			if (w && w.actor.get_width() > 100) return w;
			await this.sleep(250);
		}
		return null;
	},

	// One mapped window, for probes that need a preview to exist but do not test the
	// animation itself. Returns {title, pid, win}, and the caller must closeWindow().
	async withWindow(Main, label) {
		const title = `bmw-${label}`;
		const pid = this.spawnClient(title);
		const win = await this.waitWindow(title);
		return {title, pid, win};
	},

	closeWindow(handle) {
		// `delete` is meta_window_delete(window, timestamp): calling it with no argument
		// fails GI marshalling ("At least 1 argument required") and leaves the window
		// mapped, which then reads as a leaked test window in the next check.
		if (handle?.pid) this.killPid(handle.pid);
	},

	// A stub meta_window good enough for _chooseEffect(): window type and WM class are
	// all the selection path reads.
	mkMetaWindow({wmClass = 'bmw-probe', type = null} = {}) {
		const Meta = imports.gi.Meta;
		return {
			window_type: type ?? Meta.WindowType.NORMAL,
			get_wm_class: () => wmClass,
			// Only .width/.height are ever read (src/Shader.js:150,164), and
            // `new Meta.Rectangle(...)` is not constructible from Eval.
            get_frame_rect: () => ({x: 0, y: 0, width: 800, height: 600}),
			fullscreen: false,
			is_maximized: () => false,
			get_compositor_private: () => null,
			connect: () => 1,
			disconnect: () => {},
		};
	},
};
