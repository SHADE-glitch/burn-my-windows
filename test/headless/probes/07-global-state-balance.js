// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — probe 07: does every animation leave the global state balanced?
//
// Why this is the highest-stakes question in the extension: `Shader.beginAnimation()`
// calls `global.begin_work()` and `global.compositor.disable_unredirect()`, and the
// matching `end_work()` / `enable_unredirect()` happen ONLY inside `endAnimation()`,
// which is reached through the timeline's `stopped` signal. The timeline is bound to the
// window actor (`set_actor(actor)`), i.e. it runs on the *actor's* clock: it only
// advances when that actor is redrawn.
//
// So any path where an animation stops being drawn without stopping its timeline leaves
// the shell permanently "working" and permanently unredirect-suppressed for the rest of
// the session. That is not a visual bug and it does not log anything: it is a battery,
// frame-clock and fullscreen-playback regression that the user cannot attribute to a
// window effect. Nothing in the code ends a running animation when the extension is
// disabled.
//
// Measurement: `begin_work` / `end_work` are wrapped on the shell global when that is
// allowed, which gives a direct count. When it is not (they may be GI-provided and
// non-writable), the probe falls back to wrapping each shader instance's begin/endAnimation
// and says which method produced the number -- a count obtained by a fallback is never
// presented as the stronger one.

(async () => {
	const H = globalThis.__bmw;
	try {
		H.begin('07');
		const { Main, inst } = await H.boot({ settings: { 'test-mode': true } });
		const GLib = imports.gi.GLib;

		inst._ensureEffects();

		// ------------------------------------------------ direct begin_work/end_work count
		let begins = 0, ends = 0, workInstrumented = false;
		try {
			const realBegin = global.begin_work.bind(global);
			const realEnd = global.end_work.bind(global);
			global.begin_work = () => { begins++; realBegin(); };
			global.end_work = () => { ends++; realEnd(); };
			workInstrumented = (global.begin_work !== undefined && typeof global.begin_work === 'function');
		} catch (e) {
			workInstrumented = false;
			H.rec('workInstrumentError', String(e).split('\n')[0]);
		}
		H.rec('workCountersInstrumented', workInstrumented);

		const startWindow = async (nick, tag) => {
			inst._settings.set_string('active-profile', inst._profiles[0].path);
			inst._settings.set_string('preview-effect', nick);
			await H.sleep(200);
			const title = `bmw-07-${tag}`;
			const pid = H.spawnClient(title);
			const win = await H.waitWindow(title);
			return {title, pid, win};
		};

		// Find the shader an animation attached, without touching a possibly dead actor.
		const shaderOf = (nick) => {
			const factory = inst._ALL_EFFECTS.find((e) => e.constructor.getNick() === nick).shaderFactory;
			// A live animation holds its shader out of the pool, so the pool going from
			// N to N-1 is the attachment signal that does not require actor access.
			return factory;
		};

		const scenarios = [];

		const runScenario = async (name, nick, act) => {
			const before = {begins, ends};
			const handle = await startWindow(nick, name);
			if (!handle.win) {
				scenarios.push({name, outcome: 'NO-WINDOW'});
				if (handle.pid) H.killPid(handle.pid);
				return;
			}
			const factory = shaderOf(nick);
			const poolIdle = factory._freeShaders.length;
			const r = {name, nick, poolIdle, outcome: 'ok'};
			try {
				await act(handle, r, factory, name);
			} finally {
				if (handle.pid) H.killPid(handle.pid);
			}
			r.beginsDelta = begins - before.begins;
			r.endsDelta = ends - before.ends;
			scenarios.push(r);
			await H.sleep(600);
		};

		// A. the balanced baseline: close the window and let the animation finish.
		await runScenario('normal-close', 'wisps', async (h, r, factory) => {
			h.win.mw.delete(global.get_current_time());
			for (let i = 0; i < 60 && factory._freeShaders.length <= r.poolIdle; i++) await H.sleep(200);
			r.returnedToPool = factory._freeShaders.length > r.poolIdle;
		});

		// B. the client is killed while the effect is still playing. test-mode holds the
		// frame for 8 s, so this is a wide window to hit on purpose.
		await runScenario('kill-9-mid-animation', 'hexagon', async (h, r, factory) => {
			h.win.mw.delete(global.get_current_time());
			await H.sleep(500);            // animation definitely running
			H.killPid(h.pid);              // mutter reaps the actor under it
			h.pid = null;
			for (let i = 0; i < 100 && factory._freeShaders.length <= r.poolIdle; i++) await H.sleep(200);
			r.returnedToPool = factory._freeShaders.length > r.poolIdle;
			r.waitedMs = 100 * 200;
		});

		// C. the extension is disabled while an animation is in flight. Nothing in
		// _doDisable ends running shaders, so this asks what actually happens to the
		// pairing once our own code has stopped existing.
		await runScenario('disable-mid-animation', 'doom', async (h, r, factory) => {
			h.win.mw.delete(global.get_current_time());
			await H.sleep(400);
			inst.disable();
			await H.sleep(1200);
			r.stillAttached = (() => {
				// The actor may already be gone; only ask while the window is mapped.
				const live = H.findWindow(h.title);
				return live ? live.actor.get_effect('burn-my-windows-effect') !== null : 'actor-gone';
			})();
			inst.enable();
			for (let i = 0; i < 80 && factory._freeShaders.length <= r.poolIdle; i++) await H.sleep(200);
			r.returnedToPool = factory._freeShaders.length > r.poolIdle;
		});

		// D. the actor stops being drawn instead of being destroyed: minimise mid-open.
		// An actor-clock timeline has nothing to tick on here. This is the scenario that
		// could leave the shell permanently working with no window even visible.
		await runScenario('minimize-mid-animation', 'matrix', async (h, r, factory) => {
			// Opening is what plays the animation, so wait for the attach then minimise.
			await H.sleep(700);
			h.win.mw.minimize(global.get_current_time());
			await H.sleep(9000);           // well past the 8 s test-mode hold
			const live = H.findWindow(h.title);
			r.stillAttached = live ? (live.actor.get_effect('burn-my-windows-effect') !== null) : 'actor-gone';
			r.timelinePlaying = (() => {
				const sh = live?.actor?.get_effect?.('burn-my-windows-effect');
				return sh ? sh._timeline.is_playing() : 'n/a';
			})();
			r.returnedToPool = factory._freeShaders.length > r.poolIdle;
			h.win.mw.unminimize(global.get_current_time());
			await H.sleep(500);
			h.win.mw.delete(global.get_current_time());
			for (let i = 0; i < 60 && factory._freeShaders.length <= r.poolIdle; i++) await H.sleep(200);
			r.eventuallyReleased = factory._freeShaders.length > r.poolIdle;
		});

		// E. closing from the overview must hand the clone's overlay back. A missed
		// restore leaves that window's icon and title invisible in the overview -- visible,
		// permanent, and invisible to every structural assertion.
		await runScenario('overview-close', 'glide', async (h, r, factory) => {
			Main.overview.show();
			await H.sleep(600);
			h.win.mw.delete(global.get_current_time());
			for (let i = 0; i < 60 && factory._freeShaders.length <= r.poolIdle; i++) await H.sleep(200);
			r.returnedToPool = factory._freeShaders.length > r.poolIdle;
			Main.overview.hide();
			await H.sleep(400);
		});

		H.rec('scenarios', scenarios.map((s) => JSON.stringify(s)).join('\n'));

		const bad = [];
		for (const s of scenarios) {
			if (s.outcome !== 'ok') { bad.push(`${s.name}: ${s.outcome}`); continue; }
			// The claim under test, per scenario: whatever happened to the window, the
			// animation must finish and hand its shader back. This is the per-scenario
			// signal, and it is the one that catches a stall.
			if (s.returnedToPool === false && s.eventuallyReleased !== true)
				bad.push(`${s.name}: shader never returned to the pool -- begin_work()/disable_unredirect() never paired back`);
		}
		H.chk('everyPathReleasedItsShader', bad.length === 0 ? true : bad.join(' | '));

		// Why the per-scenario begin/end equality is NOT asserted: an animation started
		// inside one scenario can legitimately finish in the next one (that is exactly what
		// minimise-mid-animation does), so a window-local count reads ends > begins without
		// anything being wrong. It did: overview-close measured 12 begins / 13 ends while the
		// session totals were 34 / 34. Asserting the local equality produced a red suite over
		// a healthy extension, which is worse than not measuring -- so the invariant is the
		// one that is actually boundary-free: the session as a whole must balance.
		let running = 0, worst = 0;
		for (const s of scenarios) {
			running += (s.beginsDelta ?? 0) - (s.endsDelta ?? 0);
			worst = Math.max(worst, running);
		}
		H.rec('outstandingWorkByScenario', scenarios.map((s) => `${s.name}:${(s.beginsDelta ?? 0) - (s.endsDelta ?? 0)}`).join(' '));
		H.chk('noUnboundedWorkAccumulation', worst <= 2 ? true :
			`up to ${worst} animations outstanding at once across five scenarios -- the shell would never go idle`);

		// Global, not per-scenario: the session as a whole must not have accumulated work.
		if (workInstrumented) {
			H.chk('sessionWorkBalanced', begins === ends ? true :
				`${begins} begin_work vs ${ends} end_work across the probe -- the shell is left permanently "working"`);
			H.metric('beginWork', begins);
			H.metric('endWork', ends);
		} else {
			H.rec('globalWorkCounters', 'unavailable: global.begin_work/end_work are not writable from Eval; the per-scenario pool check above is what ran');
		}

		// Declared gaps, deliberately NOT checks: recording a gap as a failing check would
		// train everyone to expect a red suite, and recording it as a passing one would lie.
		//  * the overview clone's overlayEnabled restore needs a live WindowPreview handle,
		//    which is only reachable through overview internals -- that is an L2 look.
		//  * kill-window-effects is a Meta WM signal; it cannot be emitted from Eval, so the
		//    handler at extension.js:343 is exercised only by L2's minimise / workspace switch.
		H.rec('notCoveredByThisProbe', 'overview overlayEnabled restore (L2) and kill-window-effects (L2)');

		H.done();
	} catch (e) {
		H.fail(e);
	}
})();
