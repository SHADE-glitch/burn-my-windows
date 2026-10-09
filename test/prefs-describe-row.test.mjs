// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — every option row explains itself with the schema's own description.
//
// About 97% of the rows in the preferences dialog carry no explanation: upstream wrote
// subtitles for four effects and stopped. The explanations already exist -- each key has a
// `<description>` in the schema -- they are just never shown. Reading them at runtime adds no
// new translatable string, which matters because this fork has no .po sources to regenerate.
//
// Three things can go wrong and each is asserted: overwriting the subtitles upstream wrote by
// hand (they are better than the schema text), printing a subtitle that merely repeats the
// title (11 keys are like that, all in mushroom / team-rocket), and calling `get_key()` on a
// key the schema does not have -- which does not return null, it throws.

import assert from 'node:assert/strict';
import test from 'node:test';

import {PREFS_SRC, sliceMethod} from './lib/extension-slices.mjs';

class ActionRow {}

const Adw = {ActionRow};

const METHODS = new Function('Adw',
  `return {${sliceMethod(PREFS_SRC, '_findRowFor')},\n` +
  `${sliceMethod(PREFS_SRC, '_describeRow')}};`)(Adw);

// A schema that behaves like the real one: `get_key` throws for a key that is not there.
function makeSchema(entries) {
  return {
    has_key: (key) => Object.prototype.hasOwnProperty.call(entries, key),
    get_key: (key) => {
      if (!Object.prototype.hasOwnProperty.call(entries, key)) {
        throw new Error(`GSettingsSchema does not contain the key ${key}`);
      }
      const [summary, description] = entries[key];
      return {get_summary: () => summary, get_description: () => description};
    },
  };
}

// `objects` maps builder ids to widgets. A widget may or may not have `get_ancestor`, which is
// how a GtkAdjustment-backed row differs from a switch-backed one.
function makeEnv(objects, schema) {
  const self = Object.assign({}, METHODS, {
    _builder: {get_object: (id) => objects[id] ?? null},
    getProfileSettings: () => ({settings_schema: schema}),
  });
  return self;
}

function makeRow(subtitle = '') {
  return Object.assign(new ActionRow(), {
    subtitle,
    set_subtitle(value) { this.subtitle = value; },
  });
}

// A row whose bound widget is inside it (the switch case).
function widgetInRow(row, subtitle = '') {
  const r = makeRow(subtitle);
  return {row: r, objects: {[row]: {get_ancestor: (type) => (type === Adw.ActionRow ? r : null)}}};
}

test('a bare row picks up the schema description', () => {
  const schema = makeSchema({'fire-3d-noise': ['3D Noise', 'Creates a more dynamic fire.']});
  const {row, objects} = widgetInRow('fire-3d-noise');
  Object.assign(objects, {'reset-fire-3d-noise': null});

  makeEnv(objects, schema)._describeRow('fire-3d-noise');

  assert.equal(row.subtitle, 'Creates a more dynamic fire.',
    'the description was not shown on a row that had none');
});

test('a hand-written subtitle survives', () => {
  // Upstream wrote real explanations for a few options; the fallback must not bulldoze them.
  const schema = makeSchema({'incinerate-scale': ['Scale', 'The scale of the effect.']});
  const {row, objects} = widgetInRow('incinerate-scale', 'Burns from the pointer to the edge.');

  makeEnv(objects, schema)._describeRow('incinerate-scale');

  assert.equal(row.subtitle, 'Burns from the pointer to the edge.',
    'the schema text overwrote an explanation written for the UI');
});

test('the enable switch never becomes a subtitle on the effect header', () => {
  // Its row is the effect's own expander row, whose title is the effect name: "Use the fire
  // effect." under "Fire" is noise, and it would land on all 26 headers.
  const schema = makeSchema({'fire-enable-effect': ['Fire Enable Effect', 'Use the fire effect.'],
                             'wisps-enable-effect': ['Wisps Enable Effect', 'Use the wisps effect.']});
  const fire = widgetInRow('fire-enable-effect');
  const wisps = widgetInRow('wisps-enable-effect');
  const self = makeEnv({...fire.objects, ...wisps.objects}, schema);

  self._describeRow('fire-enable-effect');
  self._describeRow('wisps-enable-effect');

  assert.equal(fire.row.subtitle, '', 'the enable switch described the effect header row');
  assert.equal(wisps.row.subtitle, '', 'the enable switch described the effect header row');
});

test('a description that repeats the title is not written', () => {
  // 11 keys are shaped like this (mushroom-spark-color, team-rocket-sparkle-size, ...), so the
  // comparison against get_summary() is what keeps the dialog from showing the same words twice.
  const schema = makeSchema({'mushroom-ring-count': ['Ring Count', 'Ring Count']});
  const {row, objects} = widgetInRow('mushroom-ring-count');

  makeEnv(objects, schema)._describeRow('mushroom-ring-count');

  assert.equal(row.subtitle, '', 'the subtitle is a duplicate of the title');
});

test('an empty description is not written', () => {
  const schema = makeSchema({'wisps-color': ['Color', '']});
  const {row, objects} = widgetInRow('wisps-color');

  makeEnv(objects, schema)._describeRow('wisps-color');

  assert.equal(row.subtitle, '', 'an empty subtitle was set, which renders as a blank line');
});

test('a key the schema does not have does not throw', () => {
  // This is the one that would crash the dialog: get_key() throws instead of returning null,
  // and a renamed or typo'd setting is exactly what a maintenance fork produces.
  const schema = makeSchema({'fire-animation-time': ['Animation Time', 'The time fire takes.']});
  const {row, objects} = widgetInRow('fire-typo-time');

  makeEnv(objects, schema)._describeRow('fire-typo-time');

  assert.equal(row.subtitle, '',
    'an unknown key must be skipped, not described and certainly not thrown on');
});

test('an adjustment-backed row is found through its reset button', () => {
  // GtkScale binds its GtkAdjustment, and an adjustment has no ancestors: the only way back to
  // the row is the per-option reset button, which is a sibling inside the same row.
  const schema = makeSchema({'fire-movement-speed': ['Movement Speed', 'How fast fire moves.']});
  const row = makeRow();
  const objects = {
    'fire-movement-speed': {},                       // an adjustment: no get_ancestor at all
    'reset-fire-movement-speed': {
      get_ancestor: (type) => (type === Adw.ActionRow ? row : null),
    },
  };

  makeEnv(objects, schema)._describeRow('fire-movement-speed');

  assert.equal(row.subtitle, 'How fast fire moves.',
    'adjustment-backed options got no explanation, which is most of the sliders');
});

test('a row that cannot be located is skipped, not fatal', () => {
  const schema = makeSchema({'glitch-scale': ['Scale', 'The scale.']});
  const self = makeEnv({}, schema);

  assert.doesNotThrow(() => self._describeRow('glitch-scale'),
    'a missing widget took the whole dialog down -- the lookup must degrade to doing nothing');
});

test('the description runs from the binding funnel, not from a call site', () => {
  // If every bind helper had to remember to call it, the next helper added would silently ship
  // without explanations. _finishBinding is where all six binding paths already converge.
  const funnel = sliceMethod(PREFS_SRC, '_finishBinding');
  assert.ok(funnel.includes('this._describeRow(settingsKey)'),
    'the explanation is no longer wired from the funnel, so a new bind path can forget it');
});
