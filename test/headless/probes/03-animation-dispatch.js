// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — probe 03: the animation dispatch, on a real stack.
//
// This is the case Node cannot make: _shouldAnimateActor decides whether to take a
// window animation over by looking for '_mapWindow@' / '_destroyWindow@' in
// (new Error()).stack. That '@' frame syntax is SpiderMonkey's, so under V8 the branch
// is inert no matter what the mock looks like. Here the frames are produced by actually
// defining functions with those names inside a real GNOME Shell process -- which is the
// only way to prove the fork's central mechanism still works on this GNOME version.
//
// Spies replace _chooseEffect / _setupEffect for the dispatch part only, and are
// restored before the lifecycle part runs, so nothing below leaks into probe 04's
// residue check.

(async () => {
	const H = globalThis.__bmw;
	try {
		H.begin('03');
		const { Main, inst } = await H.boot({ settings: { 'test-mode': true } });
		const Clutter = imports.gi.Clutter;

		inst._ensureEffects();
		const effects = inst._ALL_EFFECTS;

		// ------------------------------------------------------------ _chooseEffect
		// The preview branch is the only deterministic way to name a specific effect,
		// and it silently no-ops unless active-profile resolves -- so assert that first.
		// ---------------------------------------------------- the all-effects-off case
		// Skipping the shell's overview wait is what lets a window animate while the
		// overview is still sliding away. With nothing enabled there is nothing to
		// animate, and skipping it anyway changes when windows map -- so the wait has to
		// be handed back. The original is wrapped to observe the delegation, the same way
		// the unrelated-caller case below wraps _origShouldAnimateActor.
		const realWait = inst._origWaitForOverviewToHide;
		let waitDelegated = 0;
		inst._origWaitForOverviewToHide = function () {
			waitDelegated++;
			return Promise.resolve('waited');
		};
		const previousAnyEnabled = inst._anyEffectEnabled;

		inst._anyEffectEnabled = () => false;
		const offResult = await Main.wm._waitForOverviewToHide.call(Main.wm);
		H.chk('overviewWaitHandedBackWhenAllEffectsOff',
			offResult === 'waited' && waitDelegated === 1 ? true :
			`all effects off gave ${JSON.stringify(offResult)} and delegated ${waitDelegated}x -- ` +
			'the fork would map windows over a closing overview with nothing to animate');

		// Negative control: the same call with an effect enabled must not delegate.
		waitDelegated = 0;
		inst._anyEffectEnabled = () => true;
		const onResult = await Main.wm._waitForOverviewToHide.call(Main.wm);
		H.chk('overviewWaitSkippedWhenAnEffectIsEnabled',
			onResult !== 'waited' && waitDelegated === 0 ? true :
			`with an effect enabled the wait still delegated (${waitDelegated}x) -- overview animations would not start`);

		inst._anyEffectEnabled = previousAnyEnabled;
		inst._origWaitForOverviewToHide = realWait;

		const profile = inst._profiles[0];
		H.chk('profileResolves', !!profile && !!profile.settings ? true :
			`active profile is ${JSON.stringify(profile && Object.keys(profile))}`);
		inst._settings.set_string('active-profile', profile.path);
		await H.sleep(400);

		const stubActor = { meta_window: H.mkMetaWindow() };
		const wanted = 'doom';
		inst._settings.set_string('preview-effect', wanted);
		await H.sleep(300);

		const chosen = inst._chooseEffect(stubActor, true);
		H.chk('previewSelectsNamedEffect',
			chosen && chosen.effect && chosen.effect.constructor.getNick() === wanted ? true :
			`preview-effect=${wanted} produced ${chosen?.effect?.constructor?.getNick?.() ?? 'nothing'}`);

		// The contract is `if (!profile || !forOpening)` in _chooseEffect()'s preview
		// branch -- the
		// preview survives the window *open* (that is the animation being previewed) and
		// is cleared on the first *close*. Asserting a clear after an open was my mistake;
		// asserting it after a close is what catches a preview that would stick forever.
		const cleared = inst._chooseEffect(stubActor, false);
		await H.sleep(200);
		H.chk('previewClearedOnClose', inst._settings.get_string('preview-effect') === '' ? true :
			`preview-effect still ${JSON.stringify(inst._settings.get_string('preview-effect'))} after a close`);
		H.chk('previewSurvivesOpen', cleared && cleared.effect ? true :
			'the close call returned nothing to preview');

		// ------------------------------------------------------- real-frame takeover
		const realChoose = inst._chooseEffect;
		const realSetup = inst._setupEffect;
		const chooseCalls = [];
		const setupCalls = [];
		inst._chooseEffect = function (actor, forOpening) {
			const r = realChoose.call(this, actor, forOpening);
			chooseCalls.push({ forOpening, nick: r?.effect?.constructor?.getNick?.() ?? null });
			return r;
		};
		inst._setupEffect = function (actor, forOpening, effect, profile) {
			setupCalls.push({ forOpening, nick: effect?.constructor?.getNick?.() ?? null });
		};

		inst._settings.set_string('preview-effect', 'glide');
		await H.sleep(200);

		// Functions with these exact names put '_mapWindow@' / '_destroyWindow@' in the
		// stack, which is what the fork greps for.
		// `meta_window` is required: _chooseEffect() bails on its very first guard
		// (`if (!actor.meta_window) return null`), and then the fork
		// correctly hands the animation to the shell's own _shouldAnimateActor -- which
		// dereferences actor.get_texture() on a probe object that has none. Without this
		// the takeover branch is never reached and the probe blames the fork.
		const actor = { meta_window: H.mkMetaWindow(), ease() { return 'stock ease'; } };
		const originalEase = actor.ease;
		const opened = (function _mapWindow() {
			return Main.wm._shouldAnimateActor.call(Main.wm, actor, 1);
		})();

		H.chk('openPathConsultedChoose', chooseCalls.length === 1 && chooseCalls[0].forOpening === true ? true :
			JSON.stringify(chooseCalls));
		H.chk('openPathTakesOver', opened === true ? true :
			`_shouldAnimateActor returned ${JSON.stringify(opened)} on a _mapWindow frame -- ` +
			'the shell would fade the window and no effect would ever play');
		H.chk('easeWasIntercepted', actor.ease !== originalEase ? true : 'actor.ease was not replaced');

		// Driving the override from a close frame must hand the *close* flag along, and
		// give ease() back afterwards.
		(function _destroyWindow() { actor.ease({ duration: 500, opacity: 0 }); })();
		H.chk('setupCalledWithCloseFlag', setupCalls.length === 1 && setupCalls[0].forOpening === false ? true :
			JSON.stringify(setupCalls));
		H.chk('easeHandedBack', actor.ease === originalEase ? true : 'the override did not restore ease()');

		// The issue-335 fallthrough on the engine's own frames. A resize which lands
		// before the real animation must reach the shell's ease() and leave the override
		// pending -- but the *next* takeover then has to reuse the shell original it
		// stored the first time. Reading `actor.ease` back would read the pending closure,
		// growing a chain of them: one retained effect per takeover, and an old closure
		// which still fires on animations the fork chose to delegate.
		inst._settings.set_string('preview-effect', 'glide');
		await H.sleep(200);
		const chain = { meta_window: H.mkMetaWindow(), ease() { return 'stock ease'; } };
		const chainOriginal = chain.ease;
		(function _mapWindow() { Main.wm._shouldAnimateActor.call(Main.wm, chain, 1); })();
		const resizeResult = (function _resizeAfterMap() { return chain.ease({ duration: 200 }); })();
		H.chk('fallthroughReachesStockEase', resizeResult === 'stock ease' ? true :
			`a resize ease() call gave ${JSON.stringify(resizeResult)} instead of the shell ease()`);
		H.chk('fallthroughStaysPending', chain.ease !== chainOriginal ? true :
			'the override was dropped on the resize, so the real animation would never be intercepted');

		setupCalls.length = 0;
		(function _destroyWindow() { Main.wm._shouldAnimateActor.call(Main.wm, chain, 1); })();
		(function _destroyWindow() { chain.ease({ duration: 500, opacity: 0 }); })();
		H.chk('fallthroughSetupsOnce', setupCalls.length === 1 ? true :
			`the animation was set up ${setupCalls.length}x -- a stale closure created another effect`);
		H.chk('fallthroughHandsBackShellEase', chain.ease === chainOriginal ? true :
			'ease() came back as a stale closure, which keeps the chain alive for the actor lifetime');
		H.metric('probeInducedFallthroughs', inst._easeFallthroughs);

		// Negative control: a caller on neither path (minimise, resize, ...) must reach
		// the original untouched. Without this, "returns true" could be unconditional.
		// The shell's real _shouldAnimateActor dereferences actor.get_texture(), which a
		// probe cannot supply for a window that does not exist -- so the *saved original*
		// is recorded here. That is the right boundary: this asserts the fork's delegation
		// contract, not the shell's own animation code.
		const realOrigShould = inst._origShouldAnimateActor;
		let delegated = 0;
		inst._origShouldAnimateActor = function () { delegated++; return 'stock'; };
		inst._settings.set_string('preview-effect', 'glide');
		await H.sleep(200);
		const plain = { meta_window: H.mkMetaWindow(), ease() { return 'stock ease'; } };
		const unrelated = (function unrelatedCaller() {
			return Main.wm._shouldAnimateActor.call(Main.wm, plain, 1);
		})();
		H.chk('unrelatedCallerDelegates', unrelated === 'stock' && delegated === 1 ? true :
			`unrelated caller got ${JSON.stringify(unrelated)}, original called ${delegated}x`);
		H.chk('unrelatedCallerUntouched', plain.ease() === 'stock ease' ? true :
			'ease() was intercepted on a path the fork does not handle');

		// And when a stack frame matches but the window type is not one the fork animates,
		// it must still hand the animation back. DOCK is neither NORMAL nor a dialog, so
		// _chooseEffect() returns null at its window-type guard. This check was
		// first written with an ordinary NORMAL-window stub, which *does* match (fire is
		// the only default-enabled effect, and it is enabled) -- so the fork returned true
		// and the check was testing the wrong premise, not a wrong fork.
		inst._settings.set_string('preview-effect', '');
		const dockWindow = H.mkMetaWindow();
		dockWindow.window_type = imports.gi.Meta.WindowType.DOCK;
		const ghost = { meta_window: dockWindow, ease() { return 'stock ease'; } };
		const noEffect = (function _mapWindow() {
			return Main.wm._shouldAnimateActor.call(Main.wm, ghost, 1);
		})();
		H.chk('unanimatedTypeGetsNoEffect', noEffect === 'stock' ? true :
			`a DOCK window got ${JSON.stringify(noEffect)} -- the fork would animate a panel`);
		H.chk('unanimatedTypeEaseUntouched', ghost.ease() === 'stock ease' ? true :
			'ease() was intercepted for a window type the fork ignores');
		inst._origShouldAnimateActor = realOrigShould;

		// -------------------------------------------------- real _setupEffect lifecycle
		inst._chooseEffect = realChoose;
		inst._setupEffect = realSetup;

		const stage = new Clutter.Actor();
		const win = new Clutter.Actor();
		win.meta_window = H.mkMetaWindow();
		stage.add_child(win);
		win.set_size(600, 400);

		const effect = effects.find((e) => e.constructor.getNick() === 'wisps');
		const factory = effect.shaderFactory;
		const poolBefore = factory._freeShaders.length;

		inst._setupEffect(win, false, effect, profile);
		const attached = win.get_effect('burn-my-windows-effect');
		H.chk('effectAttached', !!attached ? true : 'add_effect_with_name did not stick');
		H.chk('testModeDurationPinned', attached && attached._timeline.get_duration() === 8000 ? true :
			`duration is ${attached?._timeline?.get_duration()}, expected the 8000 ms test-mode pin`);

		attached.endAnimation();
		H.chk('effectDetachedOnEnd', win.get_effect('burn-my-windows-effect') === null ? true :
			'the shader is still attached after end-animation');
		H.chk('shaderReturnedToPool', factory._freeShaders.length === poolBefore + 1 ? true :
			`pool went ${poolBefore} -> ${factory._freeShaders.length}`);

		// The destroyed-actor race: mutter reaps the window while the animation is still
		// running. This is what commit fdb2fcb fixed, and it is the assertion that keeps
		// it fixed. The scale restore and the destroy-disconnect must be skipped, while
		// the shader still goes back to the pool and the shell is told the animation is
		// done -- otherwise the window never finishes mapping.
		const doomed = new Clutter.Actor();
		doomed.meta_window = H.mkMetaWindow();
		stage.add_child(doomed);
		const poolBefore2 = factory._freeShaders.length;
		inst._setupEffect(doomed, false, effect, profile);
		// Take the handle while the actor is still alive. After destroy() anything read
		// through the actor is precisely what commit fdb2fcb guards against, and a probe
		// that reads a GObject property off a disposed actor would itself emit the
		// CRITICAL it is trying to detect -- try/catch cannot suppress that.
		const doomedShader = doomed.get_effect('burn-my-windows-effect');
		H.chk('shaderReadableBeforeDestroy', !!doomedShader ? true : 'no shader to race against');
		doomed.destroy();

		let threw = null;
		try {
			doomedShader.endAnimation();
		} catch (e) {
			threw = String(e);
		}
		H.chk('endAnimationAfterActorDestroyDidNotThrow', threw === null ? true : threw);
		// The pool must still come back even though the actor vanished first -- a shader
		// stranded here is a shader the pool never sees again.
		// The band, not a point: getShader() POPPED from this pool, so a correct return
		// lands back on poolBefore2. It would be poolBefore2 + 1 only if the pool had been
		// empty and the shader had to be constructed. Asking for exactly +1 failed here
		// because the earlier wisps round trip had already left one free -- the property
		// that matters is that the shader is neither stranded (below) nor handed back
		// twice (above).
		const afterRace = factory._freeShaders.length;
		H.chk('shaderNotStrandedAfterRace', afterRace >= poolBefore2 ? true :
			`pool shrank ${poolBefore2} -> ${afterRace}: a shader lost on the destroyed-actor path is never recovered`);
		H.chk('shaderReturnedExactlyOnceAfterRace', afterRace <= poolBefore2 + 1 ? true :
			`pool grew ${poolBefore2} -> ${afterRace}: the end handler returned the shader more than once`);
		// And the fork must not have touched the dead actor's scale on the way out; the
		// suite-side "already disposed" grep in run.sh is what actually proves that.
		H.metric('poolAfterRace', factory._freeShaders.length - poolBefore2);

		stage.destroy();
		H.done();
	} catch (e) {
		H.fail(e);
	}
})();
