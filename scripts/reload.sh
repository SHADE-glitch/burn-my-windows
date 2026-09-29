#!/usr/bin/env bash
# reload.sh: re-run the enable()/disable() cycle in the live shell and show the log.
#
# IMPORTANT: this does NOT reimport any module. GNOME Shell keeps a cached
# ESModule, so disable() + enable() runs the *old* code. An edit to extension.js or
# src/*.js only takes effect after a log out / log in. Use this script to exercise
# the patch install/restore cycle and to read the log, not to activate an edit.
#
# After editing resources/ or schemas/, run `make` first: the GResource bundle and
# gschemas.compiled are committed and used in place, with no install step.
set -euo pipefail

UUID="burn-my-windows@local"

echo "🔨 Compiling GSettings schemas and the GResource bundle..."
make

echo "🔍 Current state:"
gnome-extensions info "$UUID" | sed 's/^/    /' || true

echo "🔄 Restarting the extension (disable + enable)..."
gnome-extensions disable "$UUID"
sleep 1
gnome-extensions enable "$UUID"

# ACTIVE is only published by the shell after enable() returns, so it is the real
# readiness signal. A fixed sleep would race the state machine.
echo "⏳ Waiting for the shell to report ACTIVE..."
INFO=""
for _ in $(seq 1 30); do
    INFO=$(gnome-extensions info "$UUID" 2>/dev/null || true)
    case "$INFO" in
        *"State: ACTIVE"*|*"State: ERROR"*) break ;;
    esac
    sleep 1
done
echo "${INFO:-gnome-extensions info failed}"

if echo "$INFO" | grep -q "State: ERROR"; then
    echo "❌ The extension came up in ERROR state. Recent log:"
    journalctl -o cat -n 40 "/usr/bin/gnome-shell" | grep -i "burn-my-windows" || \
        journalctl -o cat -n 40 "/usr/bin/gnome-shell"
    exit 1
fi

echo "🔬 Watching the log for 10s (Ctrl-C to stop)..."
timeout 10 journalctl -f -o cat "/usr/bin/gnome-shell" | grep --line-buffered -i "burn-my-windows" || true

if git -C "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." diff --quiet -- 'src/*.js' extension.js 2>/dev/null; then
    : # no uncommitted source changes, nothing to warn about
else
    echo
    echo "⚠️  extension.js or src/*.js has uncommitted changes. This reload did NOT"
    echo "    activate them: GNOME Shell caches ESModules. Log out and back in to"
    echo "    exercise the new code."
fi

echo "✅ Reload finished."
