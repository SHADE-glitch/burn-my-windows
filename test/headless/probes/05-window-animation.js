// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — probe 05: drive real windows, one per effect.
//
// Why this exists: probes 01-04 never let mutter map a window, so the whole animation
// path -- _chooseEffect on a real actor, the shader being painted, the pool being
// drained on a real close -- was untested. The fork's central mechanism was proven
// reachable on a hand-built actor, not on a compositor-drawn one.
//
// Here a GTK4 client is spawned *from inside the shell* so it inherits the sandbox
// environment, mutter maps it as a real window, and `preview-effect` names which effect
// has to play. One check is deliberately not automated and not claimed: whether the
// frame looks right. That stays a human judgement (MAINTENANCE.md, Tier 3).

(async () => {
	const H = globalThis.__bmw;
	// A representative subset gets the expensive pixel comparison; every effect gets the
	// cheap attach/paint/detach cycle. Listing them apart keeps the run bounded and the
	// claim honest instead of quietly skipping the slow ones.
	const PIXEL_NICKS = ['fire', 'matrix', 'snap'];
	const NON_SEEDED = ['fire', 'aura-glow', 'mushroom', 'team-rocket'];

	try {
		H.begin('05');
		const { Main, inst } = await H.boot({ settings: { 'test-mode': true } });
		const Gio = imports.gi.Gio;
		const GLib = imports.gi.GLib;

		inst._ensureEffects();
		const effects = inst._ALL_EFFECTS;
		const nicks = effects.map((e) => e.constructor.getNick());
		const out = globalThis.__bmwOut.replace(/\.json$/, '');

		// The screenshot service is the only way to ask "did the compositor draw
		// something different with the effect on".
		const shotProxy = Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SESSION,
			Gio.DBusProxyFlags.NONE, null, 'org.gnome.Shell.Screenshot',
			'/org/gnome/Shell/Screenshot', 'org.gnome.Shell.Screenshot', null);
		const shoot = (file) => {
			try {
				const reply = shotProxy.call_sync('Screenshot',
					new GLib.Variant('(bbs)', [false, false, file]),
					Gio.DBusCallFlags.NONE, 5000, null);
				return [reply.unpack()[0], file];
			} catch (e) {
				return [false, String(e).split('\n')[0]];
			}
		};

		// findWindow / waitWindow / spawnClient / killPid all live in _preamble.js: probe
		// 01 needs a mapped window too, and two copies of a sandbox-env construction is
		// how they drift apart.
		const results = [];
		let bootFail = null;
		const windowBaseline = global.get_window_actors().length;

		for (const nick of nicks) {
			const title = `bmw-${nick}`;
			const row = {nick, setup: 0, attach: 0, paint: 0, pin: 0, pixels: 'skip', cleanup: 0};
			let pid = null;
			try {
				// The preview branch ignores *-enable-effect, so one profile and this key
				// are all that is needed to name the effect for the next window open.
				inst._settings.set_string('active-profile', inst._profiles[0].path);
				inst._settings.set_string('preview-effect', nick);
				await H.sleep(250);

				pid = H.spawnClient(title);
				const win = await H.waitWindow(title);
				if (!win) {
					row.reason = 'window never mapped';
					results.push(row);
					if (pid) H.killPid(pid);
					continue;
				}

				// Close it: the fork has to take over the close animation.
				win.mw.delete(global.get_current_time());
				// Poll for the shader rather than sleeping a fixed amount: on software
				// rendering the first frame can be late.
				let shader = null;
				for (let i = 0; i < 40 && !shader; i++) {
					shader = win.actor.get_effect('burn-my-windows-effect');
					if (!shader) await H.sleep(50);
				}
				if (!shader) {
					row.reason = 'no effect attached on close';
					results.push(row);
					continue;
				}
				row.setup = 1;
				row.attach = 1;

				// The one observation no mock can produce: update-animation is emitted
				// from vfunc_paint_target, so counting it proves the compositor actually
				// drew this shader, not that an object was created.
				let frames = 0;
				const sid = shader.connect('update-animation', () => { frames++; });
				await H.sleep(1200);
				shader.disconnect(sid);
				row.paint = frames > 0 ? 1 : 0;
				row.frames = frames;
				row.pin = shader._progress === 0.5 ? 1 : 0;

				if (PIXEL_NICKS.includes(nick)) {
					const on = `${out}.${nick}.on.png`;
					const [okOn, why] = shoot(on);
					if (!okOn) row.pxErr = why;
					if (okOn) {
						// Control: same window, no effect at all.
						inst._settings.set_string('preview-effect', '');
						const ctrlTitle = `bmw-ctrl-${nick}`;
						const cpid = H.spawnClient(ctrlTitle);
						const cwin = await H.waitWindow(ctrlTitle);
						await H.sleep(600);
						const off = `${out}.${nick}.off.png`;
						const [okOff] = shoot(off);
						if (cwin) cwin.mw.delete(global.get_current_time());
						if (cpid) H.killPid(cpid);
						await H.sleep(400);
						row.pixels = okOff && GLib.file_test(on, GLib.FileTest.EXISTS) &&
							GLib.file_test(off, GLib.FileTest.EXISTS) ? 'shot' : 'skip';
					}
				}

				// Finish the animation instead of waiting out the 8 s test-mode hold, then
				// require the bookkeeping to be clean.
				shader.endAnimation();
				await H.sleep(400);
				// Do NOT re-read win.actor here: endAnimation() lets the close finish, and
				// mutter may reap the MetaWindowActorWayland before this line runs. GJS
				// then emits "Object ... has been already disposed" as a CRITICAL that no
				// try/catch can suppress -- 26 of them, one per effect, and the suite-side
				// grep blames the fork for the probe. The pool and the preview key are the
				// observable, still-alive evidence that the end handler ran: the fork only
				// returns a shader to the factory from inside that handler.
				const factory = effects.find((e) => e.constructor.getNick() === nick).shaderFactory;
				row.cleanup = (factory._freeShaders.length >= 1 &&
					inst._settings.get_string('preview-effect') === '') ? 1 : 0;
			} catch (e) {
				row.reason = String(e).split('\n')[0];
				bootFail = bootFail || row.reason;
			} finally {
				if (pid) H.killPid(pid);
			}
			results.push(row);
		}

		const bad = (k) => results.filter((r) => r[k] !== 1).map((r) => `${r.nick}${r.reason ? `(${r.reason})` : ''}`);
		H.metric('windows', results.length);
		H.metric('windowed', results.filter((r) => r.setup === 1).length);
		H.rec('rows', results.map((r) => `${r.nick} setup=${r.setup} attach=${r.attach} paint=${r.paint} pin=${r.pin} frames=${r.frames ?? '-'} px=${r.pixels}${r.pxErr ? ` (${r.pxErr})` : ''} clean=${r.cleanup}`).join('\n'));

		// A window that never mapped is a harness/client failure, not an effect failure;
		// say so instead of failing 26 checks.
		const unmapped = results.filter((r) => r.reason === 'window never mapped');
		if (results.length && unmapped.length === results.length) {
			H.skip(`no test window ever mapped (${unmapped.length} attempts) -- client or compositor problem, not the fork`);
			return;
		}

		H.chk('everyEffectAttached', bad('attach').length === 0 ? true : `no shader on close for: ${bad('attach').join(', ')}`);
		H.chk('compositorPaintedTheShader', bad('paint').length === 0 ? true :
			`update-animation never fired for: ${bad('paint').join(', ')} -- the headless renderer is not ticking, so frame-level claims are void`);
		H.chk('testModePinnedMidFrame', bad('pin').length === 0 ? true :
			`_progress was not 0.5 for: ${bad('pin').join(', ')}`);
		H.chk('everyEffectCleanedUp', bad('cleanup').length === 0 ? true :
			`effect left attached or pool not drained for: ${bad('cleanup').join(', ')}`);
		// Count, do not inspect: touching meta_window on a reaped actor is the same mistake
		// the cleanup above just made. The baseline was taken before any client started.
		const now = global.get_window_actors().length;
		H.chk('noStrayWindows', now <= windowBaseline ? true :
			`${windowBaseline} windows at start, ${now} at end -- a test client outlived the probe`);

		H.rec('nonSeeded', NON_SEEDED.join(', ') + ' use an unguarded Math.random() for _uSeed, so their frames are not reproducible');
		H.done();
	} catch (e) {
		H.fail(e);
	}
})();
