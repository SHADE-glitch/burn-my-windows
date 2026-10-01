#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# © SHADE-glitch — isolated headless GNOME Shell for burn-my-windows@local.
#
#   test/headless/up.sh
#
# Starts a second gnome-shell that cannot touch the live session:
#
#   * its own dbus-daemon on a private socket,
#   * GSETTINGS_BACKEND=memory, so no setting write can reach the real dconf,
#   * XDG_CONFIG_HOME pointed at a scratch tree, so ProfileManager's keyfiles are
#     created there and never in ~/.config/burn-my-windows,
#   * XDG_DATA_HOME pointed at a scratch tree holding a symlink to THIS repo only,
#     so the other carried forks (which fail to load on their own) are not even
#     discovered and cannot be mistaken for our regressions.
#
# The symlink points at the working tree, so a source edit IS live in a freshly
# launched shell. That does not contradict "disable + enable does not reimport
# modules": that is about the one already-running shell process, this is a new one.
#
# Deliberately NOT set -e: a guard like `[ -n "$pid" ] && kill $pid` returns false on
# the normal path and would abort the script silently.
set -u

HARNESS=$(cd "$(dirname "$0")" && pwd)
EXT=$(cd "$HARNESS/../.." && pwd)
WORK=${BMW_WORK:-/tmp/bmw-harness}
UUID=burn-my-windows@local
SOCK=$WORK/bus
WAYLAND=wayland-bmw-harness

[ -f "$EXT/extension.js" ] || {
	echo "FATAL: $EXT is not the extension directory" >&2
	exit 1
}

mkdir -p "$WORK/out"

# Teardown of anything left from a previous run, by pidfile ONLY, after checking that
# the recorded pid is still ours.
#
# Never use `pkill -f <pattern>` here, however specific the pattern looks: the string
# is also present in the command line of whatever invoked this script, so a driver that
# mentions $WAYLAND or $SOCK anywhere in its own argv kills itself. That is not
# theoretical -- it terminated the shell running this suite and read as exit 143. The
# same trap swallows other forks' processes: `pgrep -x gnome-shell` matches the user's
# real session shell, and a bare pattern match hits the headless shells a *parallel*
# session booted for another extension.
kill_recorded() {
	f=$1
	ned=$2
	[ -f "$f" ] || return 0
	pid=$(cat "$f")
	if [ -n "$pid" ] && ps -o args= -p "$pid" 2>/dev/null | grep -q -- "$ned"; then
		kill "$pid" 2>/dev/null
	fi
	rm -f "$f"
}
kill_recorded "$WORK/dbus.pid" "unix:path=$SOCK"
kill_recorded "$WORK/shell.pid" "--wayland-display=$WAYLAND"
sleep 2
rm -f "$SOCK" "$WORK/out/shell.log"

# --- scratch trees ----------------------------------------------------------------
# The extension is symlinked (an edit to a source file is what gets loaded), the
# config and data roots are empty directories this shell owns.
rm -rf "$WORK/xdg-data" "$WORK/xdg-config" "$WORK/runtime"
mkdir -p "$WORK/xdg-data/gnome-shell/extensions" "$WORK/xdg-config" "$WORK/runtime"
chmod 700 "$WORK/runtime"
ln -s "$EXT" "$WORK/xdg-data/gnome-shell/extensions/$UUID"

# --- start --------------------------------------------------------------------------
# GSETTINGS_BACKEND=memory is per-process. Anything the probes write stays inside
# this shell, which is also why the probes set settings themselves instead of this
# script calling `gsettings set`.
export GSETTINGS_BACKEND=memory
export GSETTINGS_SCHEMA_DIR="$EXT/schemas"
export XDG_DATA_HOME="$WORK/xdg-data"
export XDG_CONFIG_HOME="$WORK/xdg-config"
# A private runtime dir is load-bearing, not tidiness: the shell creates
# $XDG_RUNTIME_DIR/gnome-shell-disable-extensions at startup and deletes it about 60 s
# later. This suite kills shells constantly, so a death inside that window would leave
# the marker in the REAL runtime dir, where its presence makes the session disable all
# extensions after the next crash. That is a user-visible outage caused by a test run.
export XDG_RUNTIME_DIR="$WORK/runtime"
export WAYLAND_DISPLAY=$WAYLAND
export DBUS_SESSION_BUS_ADDRESS=unix:path=$SOCK
# GVFS would otherwise write and hold open a metadata store under XDG_DATA_HOME.
export GIO_USE_VFS=local
export NO_AT_BRIDGE=1

# Written for the driver: sourcing this keeps the socket path out of the caller's own
# command line, which is what makes the kill-by-pattern trap above reachable at all.
# BMW_HARNESS is exported so the shell (and a probe spawning a client from inside it)
# can find window-client.js without hardcoding an install path.
export BMW_HARNESS="$HARNESS"
cat >"$WORK/env.sh" <<EOF
export DBUS_SESSION_BUS_ADDRESS=unix:path=$SOCK
export WAYLAND_DISPLAY=$WAYLAND
export XDG_RUNTIME_DIR=$WORK/runtime
export GSETTINGS_BACKEND=memory
export BMW_WORK=$WORK
export BMW_HARNESS=$HARNESS
EOF

dbus-daemon --session --address="$DBUS_SESSION_BUS_ADDRESS" --fork --print-pid >"$WORK/dbus.pid" 2>/dev/null ||
	dbus-daemon --session --address="$DBUS_SESSION_BUS_ADDRESS" --fork

# --unsafe-mode serves Eval; --devkit is not needed (verified against a running
# harness). --nested was removed in GNOME Shell 50 and is not passed.
nohup gnome-shell --headless --wayland-display=$WAYLAND \
	--virtual-monitor 1280x800 --unsafe-mode >"$WORK/out/shell.log" 2>&1 &
echo $! >"$WORK/shell.pid"

# These flags are the whole reason this works. When up.sh stops working after a
# GNOME upgrade, they are the first things to re-check.
echo "shell : $(cat "$WORK/shell.pid")  (--headless --unsafe-mode --virtual-monitor 1280x800)"
echo "bus   : $SOCK"
echo "config: $XDG_CONFIG_HOME (profiles are created here, not in \$HOME)"
echo "data  : $XDG_DATA_HOME -> $EXT"
echo "log   : $WORK/out/shell.log"
