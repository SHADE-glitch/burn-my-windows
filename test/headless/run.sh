#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# © SHADE-glitch — run the headless probes and print a verdict.
#
#   test/headless/run.sh all
#   test/headless/run.sh 01 03
#
# Each probe gets its OWN shell session. Sharing one session bakes the earlier
# probe's enables, disables and warm-ups into the later probe's state -- which for
# this extension is not a timing nicety but a correctness matter: the shader pool,
# the GType registrations and the warm-set are all process-global, so a probe that
# runs second would be measuring the residue of the first.
#
# Results land in $BMW_WORK/out (default /tmp/bmw-harness/out), never in the repo, so
# there is nothing to gitignore and a crash leaves the artifacts behind to read.
set -u

HARNESS=$(cd "$(dirname "$0")" && pwd)
WORK=${BMW_WORK:-/tmp/bmw-harness}
OUT=$WORK/out
ALL_PROBES="01 02 03 04 05"

if [ $# -lt 1 ]; then
	cat >&2 <<EOF
usage: $0 <all|probe ...>
  probes: $ALL_PROBES
          (01 load-and-sentinel   02 effects-and-shaders  03 animation-dispatch
           04 lifecycle-residue   05 window-animation)
EOF
	exit 2
fi

PROBES="$*"
[ "$PROBES" = "all" ] && PROBES=$ALL_PROBES

# ------------------------------------------------------------------ zero-write proof
# The suite is only allowed to report green if it can show it changed nothing the user
# owns. Recorded before anything starts and compared again at the end.
real_hash() {
	[ -f "$HOME/.config/dconf/user" ] && sha256sum "$HOME/.config/dconf/user" | cut -d' ' -f1
}
real_profiles() {
	if [ -d "$HOME/.config/burn-my-windows/profiles" ]; then
		(cd "$HOME/.config/burn-my-windows/profiles" && ls -1 | sort | sha256sum | cut -d' ' -f1)
		(cd "$HOME/.config/burn-my-windows/profiles" && cat ./* 2>/dev/null | sha256sum | cut -d' ' -f1)
	fi
}
BEFORE_DCONF=$(real_hash)
BEFORE_PROFILES=$(real_profiles)
BEFORE_GIT=$(cd "$HARNESS/../.." && git status --porcelain)

mkdir -p "$OUT"
rm -f "$OUT"/*.json "$OUT"/*.shell.log
trap '"$HARNESS/down.sh" >/dev/null 2>&1' EXIT INT TERM

# A shell without Eval answers the call with exit status 0 and replies "(false, ...)",
# so only the reply text is a usable readiness signal.
wait_for_shell() {
	i=0
	while [ $i -lt 90 ]; do
		if ! kill -0 "$(cat "$WORK/shell.pid" 2>/dev/null || echo 0)" 2>/dev/null; then
			echo "  nested shell exited during boot:"
			tail -20 "$OUT/shell.log" 2>/dev/null
			return 1
		fi
		if gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
			--method org.gnome.Shell.Eval '1+1' 2>/dev/null | grep -q '(true,'; then
			return 0
		fi
		sleep 1
		i=$((i + 1))
	done
	return 1
}

FAIL=0
RAN=0
for probe in $PROBES; do
	name=$(ls "$HARNESS/probes/" | grep "^$probe-[0-9a-z-]*\.js$" | sed 's/\.js$//')
	if [ -z "$name" ]; then
		echo "no such probe: $probe" >&2
		FAIL=1
		continue
	fi

	echo "=== $name ==="
	"$HARNESS/up.sh" >"$OUT/up.$probe.log" 2>&1
	# Sourced immediately, before any gdbus call: an un-exported
	# DBUS_SESSION_BUS_ADDRESS means wait_for_shell talks to the *user's real*
	# session bus and Evals there.
	. "$WORK/env.sh"
	if ! wait_for_shell; then
		echo "  -> $name FAILED: shell never answered Eval"
		tail -20 "$OUT/shell.log" 2>/dev/null
		FAIL=1
		"$HARNESS/down.sh" >/dev/null 2>&1
		continue
	fi

	# The probe body is loaded from a file *by the shell*, not pasted into the Eval
	# string: probe bodies contain backticks and ${}, which a double-quoted shell
	# string would try to expand.
	cat "$HARNESS/probes/_preamble.js" "$HARNESS/probes/$name.js" >"$OUT/$name.eval.js"
	# __bmwOut must be set BEFORE the probe body runs: the probe reports by writing to
	# that path, and its error handler writes to it too. Leaving it unset made every
	# probe's catch block throw on its way out, which surfaced as an "Unhandled promise
	# rejection" in the shell log and no result file -- a timeout that looks like a hung
	# extension but is a harness bug.
	gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
		--method org.gnome.Shell.Eval \
		"globalThis.__bmwOut = '$OUT/$name.json'; \
eval(imports.byteArray.toString(imports.gi.GLib.file_get_contents('$OUT/$name.eval.js')[1]))" >/dev/null 2>&1

	i=0
	while [ ! -s "$OUT/$name.json" ] && [ $i -lt 90 ]; do
		sleep 5
		i=$((i + 1))
	done

	cp "$OUT/shell.log" "$OUT/$name.shell.log" 2>/dev/null
	if [ ! -s "$OUT/$name.json" ]; then
		echo "  -> $name TIMEOUT after 450s (no result file)"
		FAIL=1
	else
		RAN=$((RAN + 1))
		node "$HARNESS/verdict.js" "$OUT/$name.json" "$name" || FAIL=1

		# Log-side assertions, in this session's log only -- a fresh boot per probe
		# means shell.log IS this probe's window, which is what makes "zero sentinel
		# warnings" a meaningful claim in a session that emits unrelated GLib noise
		# at teardown.
		warns=$(grep -acE '\[burn-my-windows@local\] expected' "$OUT/$name.shell.log" 2>/dev/null)
		[ -z "$warns" ] && warns=0
		if [ "$warns" -gt 0 ]; then
			echo "       x $warns sentinel warning(s) -- a private API the fork patches is gone:"
			grep -aE '\[burn-my-windows@local\] expected' "$OUT/$name.shell.log" | head -5
			FAIL=1
		fi
		disposed=$(grep -ac 'has been already disposed' "$OUT/$name.shell.log" 2>/dev/null)
		[ -z "$disposed" ] && disposed=0
		if [ "$disposed" -gt 0 ]; then
			echo "       x $disposed disposed-object CRITICAL(s) mentioning this fork:"
			grep -aB2 -A6 'has been already disposed' "$OUT/$name.shell.log" | head -20
			FAIL=1
		fi
		# Non-vacuity: the probe actually ran in this session.
		marker=$(grep -ac 'BMW-PROBE BEGIN' "$OUT/$name.shell.log" 2>/dev/null)
		[ -z "$marker" ] && marker=0
		if [ "$marker" -lt 1 ]; then
			echo "       x probe marker absent from the log: the zero-warning counts above are vacuous"
			FAIL=1
		fi
		enablefail=$(grep -ac '\[burn-my-windows@local\] enable failed' "$OUT/$name.shell.log" 2>/dev/null)
		[ -z "$enablefail" ] && enablefail=0
		[ "$enablefail" -gt 0 ] && { echo "       x enable() threw"; FAIL=1; }
	fi

	"$HARNESS/down.sh" >/dev/null 2>&1
done

# ------------------------------------------------------------------ run integrity
if [ "$RAN" != "$(echo $PROBES | wc -w)" ]; then
	echo "TRUNCATED RUN: $RAN of $(echo $PROBES | wc -w) probes produced a result file"
	FAIL=1
fi

echo "=== log summary (all sessions) ==="
crit=$(cat "$OUT"/*.shell.log 2>/dev/null | grep -acE 'CRITICAL|JS ERROR')
[ -z "$crit" ] && crit=0
echo "CRITICAL/JS ERROR lines across all sessions: $crit"
if [ "$crit" -gt 0 ]; then
	cat "$OUT"/*.shell.log | grep -aE 'CRITICAL|JS ERROR' | head -8
	# Headless teardown is known to emit shell-internal noise unrelated to the fork.
	# Only lines naming this extension's files are treated as regressions.
	ours=$(cat "$OUT"/*.shell.log | grep -aE 'CRITICAL|JS ERROR' | \
		grep -acE 'burn-my-windows@local/(extension\.js|prefs\.js|src/|resources/)')
	[ -z "$ours" ] && ours=0
	if [ "$ours" -gt 0 ]; then
		echo "       x $ours of them point at THIS extension:"
		cat "$OUT"/*.shell.log | grep -aE 'CRITICAL|JS ERROR' | \
			grep -aE 'burn-my-windows@local/(extension\.js|prefs\.js|src/|resources/)' | head -5
		FAIL=1
	else
		echo "       (none of them point at this extension's files -- recorded, not judged)"
	fi
fi

echo "=== zero-write proof ==="
AFTER_DCONF=$(real_hash)
AFTER_PROFILES=$(real_profiles)
AFTER_GIT=$(cd "$HARNESS/../.." && git status --porcelain)
if [ "$BEFORE_DCONF" != "$AFTER_DCONF" ]; then
	echo "       x the real dconf database changed during this run"
	FAIL=1
fi
if [ "$BEFORE_PROFILES" != "$AFTER_PROFILES" ]; then
	echo "       x ~/.config/burn-my-windows/profiles changed during this run"
	FAIL=1
fi
if [ "$BEFORE_GIT" != "$AFTER_GIT" ]; then
	echo "       x the working tree changed during this run:"
	# No process substitution anywhere in this script: it runs under dash, where
	# <(...) is a syntax error that aborts the run before the verdict is printed.
	printf '%s\n' "  before: ${BEFORE_GIT:-clean}" "  after:  ${AFTER_GIT:-clean}"
	FAIL=1
fi
[ $FAIL -eq 0 ] && echo "dconf / profiles / worktree: byte-identical to before"

if [ $FAIL -eq 0 ]; then
	echo "RESULT: PASS"
else
	echo "RESULT: FAIL"
fi
exit $FAIL
