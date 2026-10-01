// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — probe 01: does the fork load on this GNOME, and is its sentinel
// both silent and actually armed?
//
// This is the probe that answers "a GNOME major bump happened -- what broke?" before
// anything about animation behaviour matters. It measures the private API surface
// against a real shell process, which is the only way to know whether the fork's own
// sentinel is telling the truth: test/sentinel-drift.test.mjs can prove the tables are
// intact, only a live shell can prove the symbols they name still exist.

(async () => {
	const H = globalThis.__bmw;
	try {
		H.begin('01');
		const { Main, inst } = await H.boot();
		const { Workspace, WindowPreview, Config } = await H.shellModules();
		const Clutter = imports.gi.Clutter;
		const Meta = imports.gi.Meta;
		const Cogl = imports.gi.Cogl;
		const GObject = imports.gi.GObject;

		H.chk('enabled', !!inst._settings && inst._profiles.length > 0);
		H.metric('shellVersion', Config.PACKAGE_VERSION);
		H.metric('profiles', inst._profiles.length);

		// ------------------------------------------------------------- sentinel surface
		// Walked here independently of the fork's own probe: if both the fork and this
		// probe look at the same table, a symbol removed from the table would make the
		// check agreeably empty and green. So the list below is written out in full.
		const findDescriptor = (obj, name) => {
			for (let o = obj; o !== null; o = Object.getPrototypeOf(o)) {
				const d = Object.getOwnPropertyDescriptor(o, name);
				if (d) return d;
			}
			return null;
		};

		const functions = [
			['Main.wm._shouldAnimateActor', Main.wm._shouldAnimateActor],
			['Main.wm._waitForOverviewToHide', Main.wm._waitForOverviewToHide],
			['Main.wm._mapWindowDone', Main.wm._mapWindowDone],
			['Main.wm._destroyWindowDone', Main.wm._destroyWindowDone],
			['Workspace.prototype._addWindowClone', Workspace.prototype._addWindowClone],
			['Workspace.prototype._windowRemoved', Workspace.prototype._windowRemoved],
			['Workspace.prototype._doRemoveWindow', Workspace.prototype._doRemoveWindow],
			['Workspace.prototype._lookupIndex', Workspace.prototype._lookupIndex],
			['WindowPreview.prototype._init', WindowPreview.prototype._init],
			['WindowPreview.prototype._deleteAll', WindowPreview.prototype._deleteAll],
			['WindowPreview.prototype._restack', WindowPreview.prototype._restack],
		];
		const notFunctions = functions.filter(([, v]) => typeof v !== 'function').map(([k]) => k);
		H.chk('sentinelFunctions11', notFunctions.length === 0 ? true : `not a function: ${notFunctions.join(', ')}`);

		const accessors = [
			['WindowPreview.prototype.overlayEnabled', WindowPreview.prototype, 'overlayEnabled', true, true],
			['WindowPreview.prototype.window_container', WindowPreview.prototype, 'window_container', true, false],
		];
		const badAccessors = [];
		for (const [label, proto, name, needGet, needSet] of accessors) {
			const d = findDescriptor(proto, name);
			if (!d) badAccessors.push(`${label}: nothing`);
			else if ((needGet && typeof d.get !== 'function') || (needSet && typeof d.set !== 'function'))
				badAccessors.push(`${label}: get=${typeof d.get} set=${typeof d.set}`);
		}
		H.chk('sentinelAccessors2', badAccessors.length === 0 ? true : badAccessors.join(' | '));

		// Rule 6 of _preamble.js: the instance-field probe only arms once a WindowPreview
		// has been constructed -- which needs a *mapped window*, not merely an overview.
		// With nothing on the desktop the overview constructs zero previews and the flag
		// stays false on a perfectly healthy shell. Without this window, the "the sentinel
		// said nothing" assertion in run.sh would be true simply because it never ran.
		const handle = await H.withWindow(Main, 'probe01');
		H.chk('testWindowMapped', !!handle.win ? true :
			'no window mapped, so the instance-field probe cannot arm -- harness/client problem, not the fork');
		await H.openOverview(Main);
		H.chk('sentinelProbeArmed', inst._previewFieldsWarned === true ?
			true : `still ${inst._previewFieldsWarned} after mapping a window and opening the overview`);
		H.closeWindow(handle);

		// ---------------------------------------------------------- compatibility matrix
		// One row per feature-detection site in the fork, with the branch GNOME 50 is
		// expected to take. If a row flips, the code starts executing a path nobody has
		// read -- which is exactly why this is a check and not a metric.
		const matrix = {
			'Shader.js:122  timeline.set_actor': typeof Clutter.Timeline.prototype.set_actor === 'function',
			'Shader.js:136  Meta.disable_unredirect_for_display': typeof Meta.disable_unredirect_for_display,
			'Shader.js:193  Meta.enable_unredirect_for_display': typeof Meta.enable_unredirect_for_display,
			'Shader.js:154  meta_window.is_maximized': typeof Meta.Window.prototype.is_maximized,
			'Shader.js:219  Cogl.SnippetHook': Cogl.SnippetHook !== undefined && Cogl.SnippetHook.FRAGMENT !== undefined,
			'Shader.js:139  global.compositor fallback': !!global.compositor &&
				typeof global.compositor.disable_unredirect === 'function',
			'utils.js:141   set_data takes a Cogl context':
				Number(Config.PACKAGE_VERSION.split('.')[0]) >= 48,
			'utils.js:198   Cogl.Color.from_string': typeof Cogl.Color.from_string === 'function',
			'ShaderFactory.js:79  GObject.Object.new': typeof GObject.Object.new === 'function',
		};
		for (const [k, v] of Object.entries(matrix)) H.rec(k, JSON.stringify(v));

		H.chk('matrix.timelineSetActor', matrix['Shader.js:122  timeline.set_actor'] === true ?
			true : 'Clutter.Timeline.set_actor vanished -- the timeline stops following the actor');
		H.chk('matrix.unredirectGoneOnMeta18',
			matrix['Shader.js:136  Meta.disable_unredirect_for_display'] === 'undefined' &&
			matrix['Shader.js:193  Meta.enable_unredirect_for_display'] === 'undefined' ? true :
			`Meta now exposes unredirect again (${JSON.stringify([matrix['Shader.js:136  Meta.disable_unredirect_for_display'], matrix['Shader.js:193  Meta.enable_unredirect_for_display']])}) -- read both branches before changing anything`);
		H.chk('matrix.isMaximizedPresent', matrix['Shader.js:154  meta_window.is_maximized'] === 'function' ?
			true : `is_maximized is ${matrix['Shader.js:154  meta_window.is_maximized']} -- uIsFullscreen would be wrong`);
		H.chk('matrix.coglSnippetHook', matrix['Shader.js:219  Cogl.SnippetHook'] === true ?
			true : 'Cogl.SnippetHook gone; the Shell.SnippetHook fallback is dead code since GNOME 48');
		H.chk('matrix.compositorFallback', matrix['Shader.js:139  global.compositor fallback'] === true ?
			true : 'the else-branch this fork takes on GNOME 50 is itself broken');
		H.chk('matrix.setImageDataContext',
			matrix['utils.js:141   set_data takes a Cogl context'] === true ? true :
			'shellVersionIsAtLeast(48, "beta") now reports false; getImageResource() would take the pre-48 path');
		H.chk('matrix.coglColorFromString', matrix['utils.js:198   Cogl.Color.from_string'] === true ?
			true : 'parseColor would throw and effects would render black');
		H.chk('matrix.gObjectNew', matrix['ShaderFactory.js:79  GObject.Object.new'] === true ?
			true : 'shaders would never be constructed');

		H.done();
	} catch (e) {
		H.fail(e);
	}
})();
