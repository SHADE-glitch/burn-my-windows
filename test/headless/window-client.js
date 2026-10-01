// SPDX-License-Identifier: GPL-3.0-or-later
// © SHADE-glitch — a throwaway GTK4 window for burn-my-windows@local's real-window probe.
//
//   gjs test/headless/window-client.js <title>
//
// Classic GJS on purpose: `imports.gi.versions` is how the GTK version is pinned, and
// running this as ESM would raise a second question the probe does not need to answer.
//
// The title is the only identity the shell-side probe has for finding this window, so
// it comes from argv and is echoed into the label as well -- a window that renders its
// own title makes the pixel comparison meaningful.
//
// 45 s self-quit: if the probe dies, this must not be left mapped in the sandbox shell
// holding a window (and, on a real session, a place in the overview).
imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gio = '2.0';

const {Gio, GLib, Gtk} = imports.gi;

const title = ARGV[0] ?? 'bmw-client';

const app = new Gtk.Application({
    application_id: null,
    flags: Gio.ApplicationFlags.NON_UNIQUE,
});

app.connect('activate', () => {
    const win = new Gtk.ApplicationWindow({
        application: app,
        title: title,
        default_width: 640,
        default_height: 400,
    });

    const label = new Gtk.Label({label: title});
    label.set_hexpand(true);
    label.set_vexpand(true);
    win.set_child(label);
    win.present();
});

GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 45, () => {
    app.quit();
    return false;
});

app.run([]);
