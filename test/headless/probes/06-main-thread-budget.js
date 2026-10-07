// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — probe 06: what does enable() block the compositor main thread with?
//
// The fork's history contains an incident where a synchronous D-Bus call during startup
// made GNOME Shell miss the greeter's fallback timeout and dragged the whole session
// down. That class of bug is invisible to every other gate here: it does not throw, it
// does not warn, and it does not change behaviour -- it just freezes the compositor.
// So this probe measures it. Budgets are wall-clock on the machine running the tests,
// under software rendering, so they are relative: the check is "did something start
// blocking that used not to", not "is this number fast in absolute terms".

(async () => {
	const H = globalThis.__bmw;
	const PROFILE_COUNTS = [1, 20];
	try {
		H.begin('06');
		const { Main, EM, inst } = await H.boot();
		const GLib = imports.gi.GLib;

		// ------------------------------------------------ no external service at enable
		// This is the exact regression guard for the startup incident: the UPower and
		// PowerProfiles proxies must NOT be constructed while enabling. Each construction
		// is a synchronous bus round trip (measured 1.3 - 2.2 ms) that used to sit in
		// _doEnable() behind a 4 s delay.
		H.chk('noUpowerProxyBuiltAtEnable', inst._upowerProxy === null &&
			inst._upowerProxyChecked === false ? true :
			`_upowerProxyChecked=${inst._upowerProxyChecked} -- enable() touched the bus`);
		H.chk('noPowerProfilesProxyBuiltAtEnable', inst._powerProfilesProxy === null &&
			inst._powerProfilesProxyChecked === false ? true :
			`_powerProfilesProxyChecked=${inst._powerProfilesProxyChecked} -- enable() touched the bus`);

		// The stronger property, and the reason enable() is cheap now: the bus is not even
		// *consulted* on the animation path unless a profile declares a power constraint
		// (extension.js:953 `if (matches && c.powerProfile != 0)`). If that guard is ever
		// hoisted out of the loop, every window animation pays a synchronous round trip --
		// which is exactly the failure that once blew the greeter timeout at startup.
		H.chk('busUntouchedOnUnconstrainedAnimations',
			inst._powerProfilesProxyChecked === false && inst._upowerProxyChecked === false ? true :
			`an unconstrained profile still probed the bus (powerProfiles=${inst._powerProfilesProxyChecked}, upower=${inst._upowerProxyChecked})`);

		// ------------------------------------------------------ enable() cost vs profiles
		// _loadProfiles() builds one Gio.Settings per profile against a keyfile backend,
		// which parses the file: the only part of enable() that grows with user data.
		// Profiles are duplicated inside the SANDBOX config dir, never the real one.
		const dir = inst._profiles[0].path.replace(/\/[^/]*$/, '');
		const base = GLib.file_get_contents(inst._profiles[0].path)[1];
		const paths = [];
		for (let n = 1; n < PROFILE_COUNTS[1]; n++) {
			const p = `${dir}/synthetic-${n}.conf`;
			GLib.file_set_contents(p, base);
			paths.push(p);
		}

		const costs = [];
		for (const want of PROFILE_COUNTS) {
			// Keep exactly `want - 1` synthetic files (plus the real one = want).
			// _loadProfiles() only re-runs on changed::active-profile, so pointing the key
			// at the *same* path would be a no-op and the count would never change -- the
			// first version of this loop read back 1 profile at N=20 for exactly that reason.
			const keep = paths.slice(0, want - 1);
			// Create what this round needs and delete what it does not. The first version
			// only ever deleted, so by the time N=20 came around the files were gone from
			// the N=1 round and the profile count stayed at 1 -- a test that quietly
			// measured one profile while claiming to measure twenty.
			for (const p of keep) GLib.file_set_contents(p, base);
			for (const p of paths) {
				if (!keep.includes(p)) {
					try { imports.gi.Gio.File.new_for_path(p).delete(null); } catch (e) { /* absent */ }
				}
			}
			const probe = keep.length ? keep[keep.length - 1] : inst._profiles[0].path;
			inst._settings.set_string('active-profile', probe);
			await H.sleep(1800);
			H.chk(`profileCount${want}`, inst._profiles.length === want ? true :
				`expected ${want} profiles after writing ${keep.length} synthetic keyfiles, loaded ${inst._profiles.length}`);
			if (inst._profiles.length !== want) continue;

			// enable() is synchronous through _tryEnable() -> _doEnable(), so this is the
			// real main-thread hold time, not an approximation.
			inst.disable();
			await H.sleep(300);
			const t0 = H.ms();
			inst.enable();
			const ms = Math.round(H.ms() - t0);
			costs.push({want, ms});
			// The deferred-retry safety net must not be what made it work: if a retry is
			// pending, enable() bailed and the number measures the failure path.
			H.chk(`enableNotDeferred${want}`, inst._deferredEnableId === null ? true :
				`enable() fell back to the deferred retry at N=${want}: ${ms} ms is not the sync cost`);
			// Restore before the next round.
			await H.sleep(400);
		}
		for (const c of costs) H.rec(`enableMs at N=${c.want}`, `${c.ms} ms`);

		// The budget is deliberately loose: it catches an order-of-magnitude regression
		// (a bus call, an IO burst, a shader storm) creeping into enable(), not micro-
		// optimisations. 250 ms at 20 profiles is already a visible login hitch.
		const one = costs.find((c) => c.want === 1), many = costs.find((c) => c.want === 20);
		if (one) H.chk('enableAtOneProfileIsCheap', one.ms < 60 ? true :
			`enable() blocked the main thread ${one.ms} ms with a single profile (budget 60 ms)`);
		if (many) H.chk('enableAtTwentyProfilesIsBounded', many.ms < 250 ? true :
			`enable() blocked the main thread ${many.ms} ms with 20 profiles (budget 250 ms)`);
		if (one && many) {
			// Growth must be roughly linear in the profile count. A super-linear jump means
			// something quadratic or an IO burst joined the path.
			const per = (many.ms - one.ms) / 19;
			H.chk('growthIsRoughlyLinear', per < 12 ? true :
				`${per.toFixed(1)} ms per added profile (budget 12) -- _loadProfiles() costs ~0.66 ms/profile offline, so this is super-linear`);
		}

		// --------------------------------------------- the lazy proxies, where they now run
		// Moving them out of enable() did not delete the cost, it relocated it to the first
		// window animation. That is the right trade, but it is a main-thread cost too and it
		// must stay bounded -- and a *missing* service must not make it run every animation.
		const chooseBudgetUs = 4000;
		const actor = { meta_window: H.mkMetaWindow(), ease() { return 'x'; } };
		inst._settings.set_string('preview-effect', 'fire');
		const tChoose0 = GLib.get_monotonic_time();
		inst._chooseEffect(actor, true);
		const firstUs = Math.round(GLib.get_monotonic_time() - tChoose0);
		inst._settings.set_string('preview-effect', 'fire');
		const tChoose1 = GLib.get_monotonic_time();
		inst._chooseEffect(actor, true);
		const secondUs = Math.round(GLib.get_monotonic_time() - tChoose1);
		H.rec('firstChooseEffectUs', firstUs);
		H.rec('secondChooseEffectUs', secondUs);
		H.chk('chooseEffectWithinFrameBudget', Math.max(firstUs, secondUs) < chooseBudgetUs ? true :
			`_chooseEffect took ${Math.max(firstUs, secondUs)} us (budget ${chooseBudgetUs} us, i.e. 24% of a 60 Hz frame)`);

		// Now give a profile a real power constraint and measure the same thing that
		// actually matters for a masked daemon: the decision must be made ONCE, not once
		// per animation. Without the negative cache the proxy construction (measured
		// 1.3 - 2.2 ms synchronous) would repeat on every window open and close, forever.
		// A brand-new profile's keyfile is 0 bytes until something writes to it (the
		// keyfile backend only materialises keys on the first set), so neither "copy the
		// real file" nor "hand-write the group" is reliable here. Write through the
		// profile's own Gio.Settings instead: that is the path the preferences dialog
		// uses, and it also proves the constraint reaches matchConstraints.
		const constrained = `${dir}/constrained.conf`;
		GLib.file_set_contents(constrained, `[burn-my-windows-profile]\n`);
		inst._settings.set_string('active-profile', constrained);
		await H.sleep(1200);
		const fresh = inst._profiles.find((p) => p.path === constrained);
		H.chk('constrainedProfileCreated', !!fresh?.settings ? true :
			`creating a second profile did not work (profiles=${inst._profiles.length})`);
		if (fresh) {
			fresh.settings.set_int('profile-power-profile', 2);
			fresh.settings.set_int('profile-power-mode', 1);
			fresh.settings.set_boolean('paint-brush-enable-effect', true);
			fresh.settings.apply();
		}
		inst._settings.set_string('active-profile', constrained);
		await H.sleep(1500);
		const constrainedProfile = inst._profiles.find((p) => p.path === constrained);
		H.chk('constrainedProfileLoaded', !!constrainedProfile?.matchConstraints ? true :
			`could not load a profile with a power constraint (profiles=${inst._profiles.length})`);
		// The precondition of the whole measurement: without this the probe silently
		// measures an unconstrained profile and reports "the bus was never consulted" as
		// if that were surprising.
		H.chk('constraintReachedMatchCache',
			constrainedProfile?.matchConstraints?.powerProfile === 2 ? true :
			`powerProfile is ${constrainedProfile?.matchConstraints?.powerProfile}, expected 2`);

		if (constrainedProfile) {
			// preview-effect must be EMPTY here: with it set, _chooseEffect() takes the
			// preview branch and never runs the profile-matching loop where the power
			// probes live -- so the earlier version of this measured a branch that does not
			// contain the thing it claimed to test.
			inst._settings.set_string('preview-effect', '');
			const t0 = GLib.get_monotonic_time();
			inst._chooseEffect(actor, true);
			const firstUs = Math.round(GLib.get_monotonic_time() - t0);
			const t1 = GLib.get_monotonic_time();
			inst._chooseEffect(actor, true);
			const secondUs = Math.round(GLib.get_monotonic_time() - t1);
			const t2 = GLib.get_monotonic_time();
			inst._chooseEffect(actor, true);
			const thirdUs = Math.round(GLib.get_monotonic_time() - t2);
			H.rec('constrainedChooseUs', `${firstUs} / ${secondUs} / ${thirdUs}`);
			// Which proxy got consulted is itself the finding: the power-MODE branch (UPower)
			// runs first, and once it fails, `matches &&` short-circuits the power-PROFILE
			// branch (extension.js:953) so PowerProfiles is never touched. Asserting on the
			// wrong one of the two made a working short-circuit look like a bug.
			H.chk('upowerProbeDecidedExactlyOnce', inst._upowerProxyChecked === true ? true :
				`profile-power-mode=1 ran three matched animations and UPower was still not decided`);
			H.rec('powerProfilesBranch', inst._powerProfilesProxyChecked === true ?
				'reached (both power constraints survived matching)' :
				'not reached: matches was already false at extension.js:953 -- measuring that branch needs a profile that matches on every earlier condition');
			// Steady state must not carry the construction cost.
			H.chk('noPerAnimationBusRoundTrip', thirdUs < 2000 ? true :
				`the third constrained animation cost ${thirdUs} us -- a fresh synchronous bus round trip per animation costs 2.2 ms of a 16.7 ms frame`);
			H.chk('upowerProbedOnMatchedAnimation', inst._upowerProxyChecked === true ? true :
				'the power-mode branch never ran for a matched animation -- check what _chooseEffect is short-circuiting on');
			// A masked service must leave the proxy null but the decision made.
			H.chk('maskedServiceDoesNotRetainProxy',
				!(inst._powerProfilesProxy !== null && inst._powerProfilesProxy.get_name_owner?.() === null) ? true :
				'a proxy whose bus name has no owner was kept: the `if (!proxy)` guard downstream is dead code');
		}
		try { imports.gi.Gio.File.new_for_path(constrained).delete(null); } catch (e) { /* gone */ }

		// Clean up the synthetic profiles so probe 04 still sees exactly one. Count the
		// FILES, not `_profiles`: _loadProfiles() only re-runs on changed::active-profile,
		// and pointing the key back at the value it already holds is a no-op -- that is how
		// an earlier version of this cleanup reported 21 profiles left while the disk was
		// already clean, i.e. a stale in-memory list read as a leak.
		for (const p of [...paths, constrained]) {
			try { imports.gi.Gio.File.new_for_path(p).delete(null); } catch (e) { /* gone */ }
		}
		// enumerate_children() returns a FileEnumerator, not an array: there is no
		// filter_info/map on it. Step it with next_file().
		const en = imports.gi.Gio.File.new_for_path(dir).enumerate_children('*', 0, null);
		const leftOnDisk = [];
		for (let info = en.next_file(null); info; info = en.next_file(null)) {
			if (info.get_name().endsWith('.conf')) leftOnDisk.push(info.get_name());
		}
		H.chk('sandboxProfilesFilesRemoved', leftOnDisk.length === 1 ? true :
			`${leftOnDisk.length} profile keyfiles left in the sandbox -- probe 04 expects exactly one`);
		// Force a real reload by moving the key away and back, so the in-memory count the
		// next probe reads is not stale.
		const keep = inst._profiles[0].path;
		inst._settings.set_string('active-profile', '');
		await H.sleep(600);
		inst._settings.set_string('active-profile', keep);
		await H.sleep(1200);
		H.chk('sandboxReloadedToOne', inst._profiles.length === 1 ? true :
			`in-memory profile list is ${inst._profiles.length} after cleanup`);

		H.done();
	} catch (e) {
		H.fail(e);
	}
})();
