// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — turn one probe result into a PASS/FAIL line.
//
// Probes report two separate things: `checks` (booleans that must all hold) and
// `metrics` (observations, printed but not judged). Keeping them apart is what lets
// a number move without the suite going red, and lets a real regression be red
// without anyone having to read a table.
//
// `phase` other than 'done' is a FAIL: a probe that threw halfway, or that never
// wrote at all, must never be readable as a pass.
import { readFileSync } from 'node:fs';

const [, , path, name] = process.argv;
let r;
try {
	r = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
	console.log(`     ${name}: UNREADABLE (${e.message.split('\n')[0]})`);
	process.exit(1);
}

if (r.phase === 'skipped') {
	console.log(`     ${name}: SKIP  ${r.reason || ''}`);
	process.exit(0);
}
if (r.phase !== 'done') {
	console.log(`     ${name}: phase=${r.phase} err=${(r.err || '').split('\n')[0]}`);
	process.exit(1);
}

const checks = r.checks || {};
const bad = Object.entries(checks).filter(([, v]) => v !== true);
const status = bad.length === 0 ? 'PASS' : 'FAIL';
console.log(`     ${name}: ${status}  ${checks ? Object.keys(checks).length - bad.length : 0}/${Object.keys(checks).length} checks`);
for (const [k, v] of bad) console.log(`       x ${k} = ${JSON.stringify(v)}`);
if (r.metrics) console.log(`       ${Object.entries(r.metrics).map(([k, v]) => `${k}=${v}`).join('  ')}`);
if (r.steps) for (const [k, v] of Object.entries(r.steps)) console.log(`       . ${k}: ${v}`);
process.exit(bad.length === 0 ? 0 : 1);
