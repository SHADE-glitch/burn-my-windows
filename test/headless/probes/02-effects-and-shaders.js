// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — probe 02: all 26 effects, their shader types and their uniforms.
//
// Two of these assertions can only be made inside a real shell:
//   * the expected effect count is derived from the GResource bundle, not from the
//     fork's own list -- comparing _ALL_EFFECTS with itself would be a tautology;
//   * uniform locations are resolved by Cogl when the shader class is built. A
//     renamed uniform in a .frag is invisible today: nothing throws, the effect just
//     stops receiving its parameters, so the animation degrades silently.

(async () => {
	const H = globalThis.__bmw;
	try {
		H.begin('02');
		const { inst } = await H.boot();
		const Gio = imports.gi.Gio;
		const GObject = imports.gi.GObject;

		// _ALL_EFFECTS is null until the first animation asks for it.
		inst._ensureEffects();
		const effects = inst._ALL_EFFECTS;

		// ---------------- expected count derived from the artifact, not from the fork
		const enumerate = (path) => {
			const kids = Gio.resources_enumerate_children(path, Gio.ResourceLookupFlags.NONE);
			return [...kids];
		};
		const frags = enumerate('/shaders').filter((f) => f.endsWith('.frag'));
		H.metric('fragsInBundle', frags.length);
		H.metric('effectsListed', effects.length);
		H.chk('bundleDrivesTheCount', frags.length === effects.length ? true :
			`bundle has ${frags.length} .frag but the fork lists ${effects.length} effects`);
		H.chk('countIsTwentySix', frags.length === 26 ? true :
			`expected 26 shaders, got ${frags.length} -- update test/effect-registry.test.mjs and MAINTENANCE.md together`);

		const nicks = effects.map((e) => e.constructor.getNick());
		const nickSet = new Set(nicks);
		H.chk('nicksUnique', nickSet.size === effects.length ? true :
			`only ${nickSet.size} distinct nicks for ${effects.length} effects -- GType names would collide`);
		const orphanShaders = frags.filter((f) => !nickSet.has(f.replace(/\.frag$/, '')));
		H.chk('noOrphanShaders', orphanShaders.length === 0 ? true :
			`shaders with no effect to load them: ${orphanShaders.join(', ')}`);
		const missingShaders = [...nickSet].filter((n) => !frags.includes(`${n}.frag`));
		H.chk('everyNickHasShader', missingShaders.length === 0 ? true :
			`effects with no shader in the bundle: ${missingShaders.join(', ')}`);

		// ---------------- shader types, pooling and uniforms
		const UNIFORMS = ['_uForOpening', '_uIsFullscreen', '_uProgress', '_uDuration', '_uSize', '_uPadding'];
		const badUniforms = [];
		const badPool = [];
		const badGType = [];
		let created = 0;
		const t0 = H.ms();

		for (const effect of effects) {
			const nick = effect.constructor.getNick();
			const factory = effect.shaderFactory;
			if (!factory) { badPool.push(`${nick}: no shaderFactory`); continue; }

			const before = factory._freeShaders.length;
			const shader = factory.getShader();
			created++;
			// getShader() pops when it can and constructs only when the pool was empty,
			// so after a get the pool is exactly one shorter (never negative, never grown).
			const expectedMid = before > 0 ? before - 1 : 0;
			if (factory._freeShaders.length !== expectedMid)
				badPool.push(`${nick}: pool ${before} -> ${factory._freeShaders.length} on get, expected ${expectedMid}`);

			for (const u of UNIFORMS) {
				if (!(u in shader) || shader[u] < 0) badUniforms.push(`${nick}.${u}=${shader[u]}`);
			}

			const typeName = `BurnMyWindowsShader_${nick}`;
			const registered = GObject.type_from_name(typeName);
			if (!registered) badGType.push(`${nick}: type ${typeName} not registered`);
			else {
				// One GType per nick is the whole caching strategy. A second lookup has
				// to return the identical type, otherwise every animation would register
				// a new type and the process would fill up with shader classes.
				if (GObject.type_from_name(typeName) !== registered) badGType.push(`${nick}: type changed between lookups`);
			}

			shader.returnToFactory();
			// A cold factory legitimately ends up one bigger (that is the point of the
			// pool); asserting "== before" failed for all 25 non-warmed effects. The
			// thing that would actually be a leak is *still growing on the second cycle*,
			// so the invariant is steady state, measured twice.
			const afterFirst = factory._freeShaders.length;
			if (afterFirst !== before + 1 && afterFirst !== before)
				badPool.push(`${nick}: pool jumped ${before} -> ${afterFirst} on return`);

			// The pooled instance must be the same object, not a fresh one.
			const again = factory.getShader();
			if (again !== shader) badPool.push(`${nick}: pool did not hand back the same shader`);
			again.returnToFactory();
			if (factory._freeShaders.length !== afterFirst)
				badPool.push(`${nick}: pool grew across a second round trip (${afterFirst} -> ${factory._freeShaders.length}) -- that is the leak`);
		}

		H.chk('uniformsResolve', badUniforms.length === 0 ? true : badUniforms.slice(0, 6).join(' | '));
		H.chk('shaderPoolBalances', badPool.length === 0 ? true : badPool.slice(0, 6).join(' | '));
		H.chk('shaderTypesStable', badGType.length === 0 ? true : badGType.slice(0, 6).join(' | '));
		H.metric('shadersTouched', created);
		H.metric('shaderRoundTripMs', Math.round(H.ms() - t0));

		// ---------------- warm-up state, reported not judged
		// A pristine profile only enables fire, so the honest default is 1 warmed nick.
		H.metric('warmedNicks', inst._warmedNicks ? inst._warmedNicks.size : -1);
		H.chk('warmSetExists', inst._warmedNicks instanceof Set ? true :
			`_warmedNicks is ${typeof inst._warmedNicks}`);
		H.chk('effectMinimumVersionsParse', effects.every((e) => {
			const v = e.constructor.getMinShellVersion();
			return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number';
		}) ? true : 'an effect declares a malformed getMinShellVersion()');

		H.done();
	} catch (e) {
		H.fail(e);
	}
})();
