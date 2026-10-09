// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — probe 04: does disable() leave anything behind, and does a profile
// switch cost a handler each time?
//
// Two leak classes this extension can accumulate across a login session:
//   * a patched shell method that was not handed back (every later enable stacks
//     another wrapper around the same hot path), and
//   * a GSettings 'changed' handler that was not disconnected, which grows by one per
//     profile opened in the preferences dialog and never shrinks.
// Both are invisible until the session has been up long enough to notice.

(async () => {
	const H = globalThis.__bmw;
	try {
		H.begin('04');
		const { Main, EM, inst } = await H.boot();
		const { Workspace, WindowPreview } = await H.shellModules();
		const Gio = imports.gi.Gio;

		// Snapshot the patched closures so the re-enable check can prove they are new.
		const patchedBefore = {
			shouldAnimate: Main.wm._shouldAnimateActor,
			addWindowClone: Workspace.prototype._addWindowClone,
			previewInit: WindowPreview.prototype._init,
		};
		const signalCountOne = inst._profileSignalIds.length;
		H.metric('profilesOne', inst._profiles.length);
		H.metric('signalIdsOne', signalCountOne);
		H.chk('signalIdsExist', signalCountOne > 0 ? true :
			`no per-profile handlers were registered at all (${signalCountOne}) -- the leak meter below is blind`);

		// WindowPicker used to allocate a LookingGlass inspector on every pick and never
		// disconnect the handlers: N clicks left N inspectors alive, each of which
		// answered the *next* pick. Ask twice and require one inspector to come back.
		try {
			const picker = inst._windowPicker;
			picker.PickWindow();
			const firstInspector = picker._inspector;
			picker.PickWindow();
			H.chk('pickerReusesOneInspector',
				firstInspector !== null && picker._inspector === firstInspector ? true :
				`two PickWindow() calls did not share one inspector (first=${!!firstInspector}, ` +
				`same=${picker._inspector === firstInspector})`);
		} catch (e) {
			// No automated coverage of the picking path is a known gap (MAINTENANCE §7);
			// if LookingGlass cannot be instantiated headless, say so instead of passing.
			H.skip('pickerReusesOneInspector', `LookingGlass unavailable in the sandbox: ${String(e).split('\n')[0]}`);
		}

		// A window actor which still carries the extension's *own* ease() override is
		// residue the eight patch restores cannot reach: that override is installed per
		// actor and is only handed back when it meets a real window animation, so one can
		// outlive disable(). Reaching that state for real means winning the map-then-resize
		// race, which this harness cannot drive (`_chooseEffect()` declines an
		// already-mapped actor, so a manual call delegates instead of claiming). The
		// pending state is therefore manufactured here -- probe 03's fallthrough cases show
		// the fork itself producing exactly this shape on real engine frames. What is
		// genuinely under test is the walk: live window actors, the marker read, and the
		// hand-back.
		const opened = await H.withWindow(Main, '04-pending-override');
		const burned = opened.win.actor;
		const shellEase = burned.ease;
		burned._bmwEaseOriginal = shellEase;
		burned.ease = function pendingOverride() { return 'extension override'; };
		H.chk('pendingOverrideWasPending', burned.ease !== shellEase ? true :
			'the manufactured override is not distinguishable from the shell ease() -- the check below is vacuous');

		// ------------------------------------------------------------ disable residue
		// The instance's own disable(), not EM._callExtensionDisable(): the latter is not
		// the counterpart of _callExtensionEnable and left everything installed -- the
		// 8 patches, the 8 settings handlers, the bundle and the D-Bus export all stayed,
		// and the following enable() then died with "An object is already exported for
		// the interface org.gnome.shell.extensions.BurnMyWindows".
		inst.disable();
		await H.sleep(600);

		const restored = [
			['Main.wm._shouldAnimateActor', Main.wm._shouldAnimateActor === inst._origShouldAnimateActor],
			['Main.wm._waitForOverviewToHide', Main.wm._waitForOverviewToHide === inst._origWaitForOverviewToHide],
			['Workspace.prototype._addWindowClone', Workspace.prototype._addWindowClone === inst._origAddWindowClone],
			['Workspace.prototype._windowRemoved', Workspace.prototype._windowRemoved === inst._origWindowRemoved],
			['Workspace.prototype._doRemoveWindow', Workspace.prototype._doRemoveWindow === inst._origDoRemoveWindow],
			['WindowPreview.prototype._init', WindowPreview.prototype._init === inst._origInit],
			['WindowPreview.prototype._deleteAll', WindowPreview.prototype._deleteAll === inst._origDeleteAll],
			['WindowPreview.prototype._restack', WindowPreview.prototype._restack === inst._origRestack],
		];
		const stuck = restored.filter(([, ok]) => !ok).map(([n]) => n);
		H.chk('allEightPatchesRestored', stuck.length === 0 ? true :
			`still patched after disable(): ${stuck.join(', ')}`);

		H.chk('pendingOverrideTakenBack', burned.ease === shellEase ? true :
			'a live window actor still carries the extension ease() override after disable()');
		H.closeWindow(opened);

		H.chk('profileHandlersReleased', inst._profileSignalIds.length === 0 ? true :
			`${inst._profileSignalIds.length} settings handler(s) survive disable()`);
		H.chk('settingsReleased', inst._settings === null ? true :
					`_settings is still ${typeof inst._settings} -- the reference (and its subscription) is kept`);
		H.chk('activeProfileSignalReleased', inst._activeProfileSignalId === null ? true :
			`_activeProfileSignalId is still ${inst._activeProfileSignalId}`);
		H.chk('effectsListEmptied', inst._ALL_EFFECTS.length === 0 ? true :
			`${inst._ALL_EFFECTS.length} effect objects kept across disable`);

		// Emptying _ALL_EFFECTS is not the same as releasing the effects: each profile
		// entry holds a filtered *copy* of that very list, so all 26 effect objects,
		// their shader pools and their decoded textures stayed reachable through
		// _profiles -- and _resources kept the 2.5 MB mapping alive even though the
		// bundle was already unregistered.
		H.chk('profileDataReleased', inst._profiles.length === 0 ? true :
			`${inst._profiles.length} profile object(s) survived disable(), each holding a Gio.Settings and its effects`);
		H.chk('resourcesReferenceDropped', inst._resources === null ? true :
			'_resources still refers to the unregistered bundle');
		H.chk('windowPickerReleased', inst._windowPicker === null ? true :
			'the picker survived disable(), inspector and D-Bus wrapper included');
		H.chk('proxiesReleased',
			inst._upowerProxy === null && inst._powerProfilesProxy === null ? true :
			'a live D-Bus proxy survived disable()');
		H.chk('killEffectsSignalCleared', inst._killEffectsSignal === 0 ? true :
			`_killEffectsSignal is still ${inst._killEffectsSignal} after the disconnect`);

		// The gresource is registered by the extension, not the shell: reading it after
		// disable must fail. If it does not, the bundle (2.5 MB, mapped) outlives the
		// extension and every re-enable stacks another registration attempt.
		let bundleGone = false;
		try {
			Gio.resources_lookup_data('/shaders/common.glsl', Gio.ResourceLookupFlags.NONE);
		} catch (e) {
			bundleGone = true;
		}
		H.chk('bundleUnregisteredOnDisable', bundleGone ? true :
			'the GResource bundle is still registered after disable()');

		// ------------------------------------------------------------- re-enable clean
		inst.enable();
		let inst2 = null;
		for (let i = 0; i < 60; i++) {
			inst2 = EM.lookup(H.UUID)?.stateObj ?? null;
			if (inst2 && inst2._settings && inst2._profiles?.length) break;
			await H.sleep(250);
		}
		H.rec('enableErrors', (globalThis.__bmwEnableErrors ?? []).join(' | ') || 'none');
		H.chk('reenabled', !!inst2 && !!inst2._settings ? true : 'extension never came back');
		H.chk('patchesAreFreshClosures',
			Main.wm._shouldAnimateActor !== patchedBefore.shouldAnimate ? true :
			'the same patched closure is still installed -- enable() stacked or skipped');
		H.chk('patchedAgain', Main.wm._shouldAnimateActor.toString().includes('_destroyWindow@') ? true :
			'the re-enabled patch no longer contains the stack probe: it is the original, not ours');

		let shaderCount = -1;
		try {
			shaderCount = [...Gio.resources_enumerate_children('/shaders', Gio.ResourceLookupFlags.NONE)]
				.filter((f) => f.endsWith('.frag')).length;
		} catch (e) {
			shaderCount = -1;
		}
		H.chk('bundleReregistered', shaderCount === 26 ? true : `after re-enable, /shaders holds ${shaderCount}`);
		H.chk('handlersRebalancedToMatch', inst2._profileSignalIds.length === signalCountOne ? true :
			`one profile should register ${signalCountOne} handlers again, got ${inst2._profileSignalIds.length}`);

		// --------------------------------------------------- profile reload symmetry
		// Duplicate the sandbox profile keyfile and switch to it, then back, then delete.
		// The meter is proportional (double for double, back to one) rather than an
		// absolute count, so it keeps working if the number of watched keys changes.
		const dir = inst2._profiles[0].path;
		const second = dir.replace(/\.conf$/, '-second.conf');
		// GLib.file_get_contents is the form that works from Eval (Gio.File.load_bytes
		// hands back a stream here, not a Bytes, and .get_data() on it threw).
		const [ok, data] = imports.gi.GLib.file_get_contents(dir);
		H.chk('profileKeyfileReadable', ok ? true : `could not read ${dir}`);
		imports.gi.GLib.file_set_contents(second, data);

		inst2._settings.set_string('active-profile', second);
		await H.sleep(1200);
		const two = inst2._profiles.length;
		const twoHandlers = inst2._profileSignalIds.length;
		H.chk('secondProfileLoaded', two === 2 ? true : `_profiles is ${two} after pointing at a second keyfile`);
		H.chk('handlersDoubled', twoHandlers === 2 * signalCountOne ? true :
			`${twoHandlers} handlers for 2 profiles, expected ${2 * signalCountOne} -- a leak shows up here as a multiple of three`);

		inst2._settings.set_string('active-profile', dir);
		await H.sleep(1200);
		H.chk('handlersStillDoubled',
			inst2._profileSignalIds.length === twoHandlers ? true :
			`switching back changed the count to ${inst2._profileSignalIds.length} -- handlers were added again`);

		// GLib.file_remove is not a function; Gio.File.delete is.
		Gio.File.new_for_path(second).delete(null);
		inst2._settings.set_string('active-profile', '');
		await H.sleep(1200);
		const back = inst2._profileSignalIds.length;
		H.chk('handlersDropWithProfile', back === signalCountOne ? true :
			`${back} handlers after the second profile was deleted, expected ${signalCountOne}`);

		H.done();
	} catch (e) {
		H.fail(e);
	}
})();
