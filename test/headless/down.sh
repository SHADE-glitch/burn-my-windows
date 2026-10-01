#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# © SHADE-glitch — tear down whatever up.sh started.
#
#   test/headless/down.sh
#
# run.sh calls this on exit via a trap, but it is standalone on purpose: a crashed run
# leaves a headless gnome-shell holding a couple of hundred MB, and from then on
# `pgrep -x gnome-shell` returns *that* process instead of the user's real session
# shell, which silently corrupts every later log or memory reading.
#
# Killed by pidfile, and only after checking the recorded pid is still ours. Pattern
# kills are deliberately not used: pkill -f also matches the command line of whatever
# invoked this script, and in this workspace it would hit the headless shells a
# parallel session booted for a different extension.
set -u

WORK=${BMW_WORK:-/tmp/bmw-harness}
SOCK=$WORK/bus
WAYLAND=wayland-bmw-harness

kill_recorded() {
	f=$1
	ned=$2
	[ -f "$f" ] || return 0
	pid=$(cat "$f")
	if [ -n "$pid" ] && ps -o args= -p "$pid" 2>/dev/null | grep -q -- "$ned"; then
		kill "$pid" 2>/dev/null
		echo "stopped $pid ($ned)"
	else
		echo "stale pidfile $f -- nothing killed"
	fi
	rm -f "$f"
}

kill_recorded "$WORK/shell.pid" "--wayland-display=$WAYLAND"
kill_recorded "$WORK/dbus.pid" "unix:path=$SOCK"
sleep 1
rm -f "$SOCK"

# Report leftovers instead of killing them: a surviving harness shell is a real problem
# but an untargeted sweep is a worse one.
left=$(ps -eo args= 2>/dev/null | grep -c -- "--wayland-display=$WAYLAND")
if [ "${left:-0}" -gt 0 ]; then
	echo "WARN: a $WAYLAND process survived SIGTERM." >&2
	echo "      find it with: pgrep -af -- '--wayland-display=$WAYLAND'" >&2
	echo "      (that display name is this harness's; nothing else uses it)" >&2
	exit 1
fi
echo "harness down: no $WAYLAND processes left"
