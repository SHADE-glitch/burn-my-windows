//////////////////////////////////////////////////////////////////////////////////////////
//          )                                                   (                       //
//       ( /(   (  (               )    (       (  (  (         )\ )    (  (            //
//       )\()) ))\ )(   (         (     )\ )    )\))( )\  (    (()/( (  )\))(  (        //
//      ((_)\ /((_|()\  )\ )      )\  '(()/(   ((_)()((_) )\ )  ((_)))\((_)()\ )\       //
//      | |(_|_))( ((_)_(_/(    _((_))  )(_))  _(()((_|_)_(_/(  _| |((_)(()((_|(_)      //
//      | '_ \ || | '_| ' \))  | '  \()| || |  \ V  V / | ' \)) _` / _ \ V  V (_-<      //
//      |_.__/\_,_|_| |_||_|   |_|_|_|  \_, |   \_/\_/|_|_||_|\__,_\___/\_/\_//__/      //
//                                 |__/                                                 //
//////////////////////////////////////////////////////////////////////////////////////////

// SPDX-FileCopyrightText: Simon Schneegans <code@simonschneegans.de>
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {fromVersion26} from './src/migrate.js';
import {ProfileManager} from './src/ProfileManager.js';
import {WindowPicker} from './src/WindowPicker.js';
import * as utils from './src/utils.js';

import Apparition from './src/effects/Apparition.js';
import AuraGlow from './src/effects/AuraGlow.js';
import BrokenGlass from './src/effects/BrokenGlass.js';
import Doom from './src/effects/Doom.js';
import EnergizeA from './src/effects/EnergizeA.js';
import EnergizeB from './src/effects/EnergizeB.js';
import Fire from './src/effects/Fire.js';
import Focus from './src/effects/Focus.js';
import Glide from './src/effects/Glide.js';
import Glitch from './src/effects/Glitch.js';
import Hexagon from './src/effects/Hexagon.js';
import Incinerate from './src/effects/Incinerate.js';
import Matrix from './src/effects/Matrix.js';
import Mushroom from './src/effects/Mushroom.js';
import PaintBrush from './src/effects/PaintBrush.js';
import Pixelate from './src/effects/Pixelate.js';
import PixelWheel from './src/effects/PixelWheel.js';
import PixelWipe from './src/effects/PixelWipe.js';
import Portal from './src/effects/Portal.js';
import RGBWarp from './src/effects/RGBWarp.js';
import SnapOfDisintegration from './src/effects/SnapOfDisintegration.js';
import TeamRocket from './src/effects/TeamRocket.js';
import TRexAttack from './src/effects/TRexAttack.js';
import TVEffect from './src/effects/TVEffect.js';
import TVGlitch from './src/effects/TVGlitch.js';
import Wisps from './src/effects/Wisps.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Workspace} from 'resource:///org/gnome/shell/ui/workspace.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';


//////////////////////////////////////////////////////////////////////////////////////////
// This extensions modifies the window-close and window-open animations with all kinds  //
// of effects. The effects are implemented using GLSL shaders which are applied to the  //
// window's Clutter.Actor. The extension is actually very simple, much of the           //
// complexity comes from the fact that GNOME Shell usually does not show an animation   //
// when a window is closed in the overview. Several methods need to be monkey-patched   //
// to get this working. For more details, read the other comments in this file...       //
//////////////////////////////////////////////////////////////////////////////////////////

export default class BurnMyWindows extends Extension {

  // ------------------------------------------------------------------------ public stuff

  // This function could be called after the extension is enabled, which could be done
  // from GNOME Tweaks, when you log in or when the screen is unlocked.
  enable() {

    // GDM autologin hardening (local fork): the original 4s delay existed
    // because the UPower/PowerProfiles DBus proxies were constructed
    // synchronously here, which could block past GDM's ~12s fallback-greeter
    // timeout on autologin boot. Those proxies are now created lazily on first
    // use (see _getUpowerProxy / _getPowerProfilesProxy), so _doEnable() no
    // longer blocks on external services and runs synchronously: window
    // animations work immediately after login/unlock. If the shell is still
    // too early in startup and this throws, a deferred retry is kept as a
    // safety net.
    this._deferredEnableId = null;
    this._activeProfileSignalId = null;
    this._enabled = false;
    if (this._tryEnable()) {
      return;
    }
    this._deferredEnableId = GLib.timeout_add(GLib.PRIORITY_LOW, 1000, () => {
      this._deferredEnableId = null;
      this._tryEnable();
      return GLib.SOURCE_REMOVE;
    });
  }

  // Runs _doEnable() once, undoing partial state on failure. Returns whether
  // the extension is now enabled.
  _tryEnable() {
    if (this._enabled) {
      return true;
    }
    try {
      this._doEnable();
      this._enabled = true;
    } catch (e) {
      console.warn(`[burn-my-windows@local] enable failed: ${e}`);
      // Undo whatever _doEnable() managed to install before it threw. Without
      // this, disable() would return early (_enabled is still false) and the
      // monkey-patches would stay in place until the shell is restarted.
      try {
        this._doDisable();
      } catch (_e) {
        // Nothing more we can do here.
      }
    }
    return this._enabled;
  }

  _doEnable() {

    // _ALL_EFFECTS is created on demand by _ensureEffects(). In practice that
    // already happens in _loadProfiles() below (or in its migration callback),
    // so the 26 effect objects and their 26 ShaderFactory instances do exist
    // during startup. Only the expensive parts are deferred: the shader GType
    // registration and the loading of the GLSL sources happen in the idle ticks
    // of _warmShaders(), not here.
    this._ALL_EFFECTS = null;

    // Nicks of effects whose shaders have been pre-compiled, and the pending
    // pre-compile idle source (if any). Both are reset on every enable.
    this._warmedNicks = new Set();
    this._warmId = 0;

    // Load all of our resources.
    this._resources =
      Gio.Resource.load(this.path + '/resources/burn-my-windows.gresource');
    Gio.resources_register(this._resources);

    // Store a reference to the settings object.
    this._settings = this.getSettings();

    // Now we check whether the extension settings need to be migrated from a previous
    // version. If this is the case, we defer the profile loading until this is finished.
    const lastVersion = this._settings.get_int('last-extension-version');
    if (lastVersion < this.metadata.version) {
      if (lastVersion <= 26) {
        // If the profile migration fails for some reason, the callback will create a
        // default profile instead.
        fromVersion26(this.metadata).finally(() => {
          // The migration is asynchronous, so the extension may have been disabled
          // while it was running. In that case _settings is already null and the
          // profile signal handlers would leak.
          if (!this._enabled)
            return;

          this._loadProfiles();
          this._settings.set_int('last-extension-version', this.metadata.version);
        });
      } else {
        this._loadProfiles();
      }

    } else {
      this._loadProfiles();
    }

    // We reload all effect profiles whenever the currently edited profile in the
    // preferences dialog changes. This is most likely a bit too often, but it will also
    // happen whenever a new profile is created and whenever an old profile is deleted.
    this._activeProfileSignalId = this._settings.connect('changed::active-profile', () => {
      this._loadProfiles();
    });

    // This is used to get the desktop's color scheme.
    this._shellSettings = new Gio.Settings({schema: 'org.gnome.desktop.interface'});

    // Enable the window-picking D-Bus API for the preferences dialog.
    this._windowPicker = new WindowPicker();
    this._windowPicker.export();

    // We will use extensionThis to refer to the extension inside the patched methods.
    const extensionThis = this;

    // These D-Bus proxies are created lazily on first access to avoid blocking
    // during startup (UPower/PowerProfiles may not be ready on autologin).
    this._upowerProxy               = null;
    this._upowerProxyChecked        = false;
    this._powerProfilesProxy        = null;
    this._powerProfilesProxyChecked = false;

    // We will monkey-patch these methods. Let's store the original ones.
    // Sentinel for GNOME upgrades: all patch targets below are private Shell
    // APIs. If a future GNOME version renames or removes one of them, the
    // effects would silently stop working. Warn loudly so the log points at
    // the exact breakage. This check intentionally changes no behavior.
    [
      [Main.wm, '_shouldAnimateActor'],
      [Main.wm, '_waitForOverviewToHide'],
      [Workspace.prototype, '_addWindowClone'],
      [Workspace.prototype, '_windowRemoved'],
      [Workspace.prototype, '_doRemoveWindow'],
      [WindowPreview.prototype, '_deleteAll'],
      [WindowPreview.prototype, '_restack'],
      [WindowPreview.prototype, '_init'],
      [Main.wm, '_mapWindowDone'],
      [Main.wm, '_destroyWindowDone'],
      [Workspace.prototype, '_lookupIndex'],
    ].forEach(([obj, name]) => {
      if (typeof obj[name] !== 'function') {
        console.warn(`[burn-my-windows@local] expected ${name} to be a function, ` +
          `got ${typeof obj[name]}. Effects may not work on this GNOME version.`);
      }
    });

    // Two more symbols we depend on are not plain functions, so the test above
    // would report them as missing on a perfectly working shell.
    // 'overlayEnabled' is a getter/setter pair defined on
    // WindowPreview.prototype: reading it with typeof invokes the getter and
    // yields 'undefined'. 'window_container' is a GObject property whose
    // descriptor lives on Shell.WindowPreview.prototype, not on the prototype
    // we hold here, so an own-property lookup would not find it either.
    // Walking the chain with getOwnPropertyDescriptor() finds both and never
    // invokes a getter, so this cannot throw.
    const findDescriptor = (obj, name) => {
      for (let o = obj; o !== null; o = Object.getPrototypeOf(o)) {
        const descriptor = Object.getOwnPropertyDescriptor(o, name);
        if (descriptor) {
          return descriptor;
        }
      }
      return null;
    };

    [
      // We only ever write overlayEnabled, and its setter is what hides the
      // window overlay, so both halves have to be there.
      [WindowPreview.prototype, 'overlayEnabled', true, true],
      [WindowPreview.prototype, 'window_container', true, false],
    ].forEach(([obj, name, needGet, needSet]) => {
      const descriptor = findDescriptor(obj, name);
      if (!descriptor || (needGet && typeof descriptor.get !== 'function') ||
          (needSet && typeof descriptor.set !== 'function')) {
        const got = descriptor ?
          `get:${typeof descriptor.get} set:${typeof descriptor.set}` : 'nothing';
        console.warn(`[burn-my-windows@local] expected ${name} to be an accessor ` +
          `property, got ${got}. Effects may not work on this GNOME version.`);
      }
    });

    this._origShouldAnimateActor    = Main.wm._shouldAnimateActor;
    this._origWaitForOverviewToHide = Main.wm._waitForOverviewToHide;
    this._origAddWindowClone        = Workspace.prototype._addWindowClone;
    this._origWindowRemoved         = Workspace.prototype._windowRemoved;
    this._origDoRemoveWindow        = Workspace.prototype._doRemoveWindow;

    // ------------------------------- patching the window animations outside the overview

    // If a window is created, the transitions are set up in the async _mapWindow() of the
    // WindowManager:
    // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/windowManager.js#L1436
    // AFAIK, overriding this method is not possible as it's called by a signal to which
    // it is bound via the bind() method. To tweak the async transition anyways, we
    // override the actors ease() method once. We do this in _shouldAnimateActor() which
    // is called right before the ease() in _mapWindow:
    // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/windowManager.js#L1465

    // The same trick is done for the window-close animation. This is set up in a similar
    // fashion in the WindowManager's _destroyWindow():
    // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/windowManager.js#L1525
    // Here is _shouldAnimateActor() also called right before. So we use it again to
    // monkey-patch the window actor's ease() once.

    // We override WindowManager._shouldAnimateActor() also for another purpose: Usually,
    // it returns false when we are in the overview. This prevents the window animations
    // there. To enable animations in the overview, we check inside the method whether it
    // was called by either _mapWindow or _destroyWindow. If so, we return true. Let's see
    // if this breaks stuff left and right...
    Main.wm._shouldAnimateActor = function(actor, types) {
      const stack      = (new Error()).stack;
      const forClosing = stack.includes('_destroyWindow@');
      const forOpening = stack.includes('_mapWindow@');

      // This is also called in other cases, for instance when minimizing windows. We are
      // only interested in window opening and window closing for now.
      if (forClosing || forOpening) {

        // If there is an applicable effect profile, we intercept the ease() method to
        // setup our own effect.
        const chosenEffect = extensionThis._chooseEffect(actor, forOpening);

        if (chosenEffect) {
          // Store the original ease() method of the actor.
          const orig = actor.ease;

          // Now intercept the next call to actor.ease().
          actor.ease = function(...params) {
            // There is a really weird issue in GNOME Shell 44: A few non-GTK windows are
            // resized directly after they are mapped on X11. This happens for instance
            // for keepassxc after it was closed in the maximized state. As the
            // _mapWindow() method is called asynchronously, the window is not yet visible
            // when the resize happens. Hence, our ease-override is called for the resize
            // animation instead of the window-open or window-close animation. This is not
            // what we want. So we check again whether the ease() call is for the
            // window-open or window-close animation. If not, we just call the original
            // ease() method. See also:
            // https://github.com/Schneegans/Burn-My-Windows/issues/335
            const stack      = (new Error()).stack;
            const forClosing = stack.includes('_destroyWindow@');
            const forOpening = stack.includes('_mapWindow@');

            if (forClosing || forOpening) {
              // Quickly restore the original behavior. Nobody noticed, I guess :D
              actor.ease = orig;

              // And then create the effect!
              extensionThis._setupEffect(actor, forOpening, chosenEffect.effect,
                                         chosenEffect.profile);
            } else {
              orig.apply(this, params);
            }
          };

          return true;
        }
      }

      return extensionThis._origShouldAnimateActor.apply(this, [actor, types]);
    };

    // Make sure to remove any effects if requested by the window manager.
    this._killEffectsSignal =
      global.window_manager.connect('kill-window-effects', (wm, actor) => {
        const shader = actor.get_effect('burn-my-windows-effect');
        if (shader) {
          shader.endAnimation();
        }
      });


    // --------------------------------------------- fix window animations in the overview

    // Some of the effects require that the window's actor is enlarged to provide a bigger
    // canvas to draw the effects. Outside the overview we can simply increase the scale
    // of the actor. However, if we are in the overview, we have to enlarge the clone of
    // the window as well.
    Workspace.prototype._addWindowClone = function(...params) {
      const clone      = extensionThis._origAddWindowClone.apply(this, params);
      const container  = clone.window_container;
      const realWindow = params[0].get_compositor_private();

      // Store the overview clone as temporary members of the real window actor. When we
      // set up the effect, we will check for the existence of these and enlarge the clone
      // as needed.
      realWindow._bmwOverviewClone          = clone;
      realWindow._bmwOverviewCloneContainer = container;

      // Remove the temporary members again once the clone is deleted. Only
      // clear them if they still point at this clone: a newer overview open
      // may have replaced them while this container died late.
      container.connect('destroy', () => {
        if (realWindow._bmwOverviewClone === clone) {
          delete realWindow._bmwOverviewClone;
          delete realWindow._bmwOverviewCloneContainer;
        }
      });

      return clone;
    };

    // Usually, windows are faded in after the overview is completely hidden. We enable
    // window-open animations by not waiting for this.
    Main.wm._waitForOverviewToHide = async function() {
      return Promise.resolve();
    };

    // These three method overrides are mega-hacky! Usually, windows are not faded when
    // closed from the overview (why?). With these overrides we make sure that they are
    // actually faded out. To do this, _windowRemoved and _doRemoveWindow now check
    // whether there is a transition ongoing (via extensionThis._shouldDestroy). If that's
    // the case, these methods do nothing.
    // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/workspace.js#L1258
    Workspace.prototype._windowRemoved = function(ws, metaWin) {
      if (extensionThis._shouldDestroy(this, metaWin)) {
        extensionThis._origWindowRemoved.apply(this, [ws, metaWin]);
      }
    };

    // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/workspace.js#L1137
    Workspace.prototype._doRemoveWindow = function(metaWin) {
      if (extensionThis._shouldDestroy(this, metaWin)) {
        extensionThis._origDoRemoveWindow.apply(this, [metaWin]);
      }
    };

    // With the code below, we hide the window-overlay (icon, label, close button) in the
    // overview once the close-animation is running.

    // We will monkey-patch these methods.
    this._origDeleteAll = WindowPreview.prototype._deleteAll;
    this._origRestack   = WindowPreview.prototype._restack;
    this._origInit      = WindowPreview.prototype._init;

    // Whenever a WindowPreview is created, we connect to the referenced Meta.Window's
    // 'unmanaged' signal to hide the overlay.
    WindowPreview.prototype._init = function(...params) {
      extensionThis._origInit.apply(this, params);

      // Hide the window's icon, name, and close button.
      const connectionID = this.metaWindow.connect('unmanaged', () => {
        if (this.window_container) {
          this.overlayEnabled = false;
          this._icon.visible  = false;
        }
      });

      // Make sure to not call the callback above if the Meta.Window was not unmanaged
      // before leaving the overview.
      this.connect('destroy', () => {
        this.metaWindow.disconnect(connectionID);
      });
    };

    // The _deleteAll is called when the user clicks the X in the overview. We should
    // not attempt to close windows twice. Due to the animation in the overview, the
    // close button can be clicked twice which normally would lead to a crash.
    WindowPreview.prototype._deleteAll = function() {
      if (!this._closeRequested) {
        extensionThis._origDeleteAll.apply(this);
      }
    };

    // This is required, else WindowPreview's _restack() which is called by the
    // "this.overlayEnabled = false", sometimes tries to access an already delete
    // WindowPreview.
    WindowPreview.prototype._restack = function() {
      if (!this._closeRequested) {
        extensionThis._origRestack.apply(this);
      }
    };
  }

  // This function could be called after the extension is uninstalled, disabled in GNOME
  // Tweaks, when you log out or when the screen locks.
  disable() {

    if (this._deferredEnableId !== null) {
      try { GLib.Source.remove(this._deferredEnableId); } catch (_e) {}
      this._deferredEnableId = null;
    }
    if (!this._enabled)
      return;

    this._enabled = false;
    this._doDisable();
  }

  _doDisable() {

    // Cancel any pending shader pre-compile source.
    if (this._warmId) {
      try { GLib.Source.remove(this._warmId); } catch (_e) {}
      this._warmId = 0;
    }

    // Disconnect profile settings signal connections.
    if (this._profileSignalIds) {
      this._profileSignalIds.forEach(id => {
        try {
          id.settings.disconnect(id.signalId);
        } catch (_e) {
          // Settings object may have been destroyed.
        }
      });
      this._profileSignalIds = [];
    }

    // Free all effect resources.
    this._ALL_EFFECTS = [];

    // The blocks below undo whatever _doEnable() managed to install. Each step is
    // guarded because _doDisable() may also be reached after a partially failed
    // _doEnable(), in which case most of these fields are still undefined.
    // Assigning undefined to the patched methods would break the shell.

    // Unregister our resources.
    if (this._resources) {
      Gio.resources_unregister(this._resources);
    }

    // Disable the window-picking D-Bus API.
    if (this._windowPicker) {
      this._windowPicker.unexport();
    }

    if (this._killEffectsSignal) {
      global.window_manager.disconnect(this._killEffectsSignal);
    }

    // Restore the original window-open and window-close animations.
    if (this._origAddWindowClone)
      Workspace.prototype._addWindowClone = this._origAddWindowClone;
    if (this._origWindowRemoved)
      Workspace.prototype._windowRemoved = this._origWindowRemoved;
    if (this._origDoRemoveWindow)
      Workspace.prototype._doRemoveWindow = this._origDoRemoveWindow;
    if (this._origShouldAnimateActor)
      Main.wm._shouldAnimateActor = this._origShouldAnimateActor;
    if (this._origWaitForOverviewToHide)
      Main.wm._waitForOverviewToHide = this._origWaitForOverviewToHide;

    if (this._origDeleteAll)
      WindowPreview.prototype._deleteAll = this._origDeleteAll;
    if (this._origRestack)
      WindowPreview.prototype._restack = this._origRestack;
    if (this._origInit)
      WindowPreview.prototype._init = this._origInit;

    // Disconnect the active-profile handler. This has to happen before we drop the
    // settings reference below. Otherwise the handler would outlive disable() and
    // re-create the per-profile signal handlers on every profile switch.
    if (this._settings && this._activeProfileSignalId !== null) {
      try {
        this._settings.disconnect(this._activeProfileSignalId);
      } catch (_e) {
        // Settings object may have been destroyed.
      }
      this._activeProfileSignalId = null;
    }

    this._settings = null;
  }

  // ----------------------------------------------------------------------- private stuff

  // This loads all effect profiles and assigns a priority to each profile. Whenever a
  // window is opened or closed, the matching effect profile with the highest priority
  // will be chosen.
  // This method is called whenever the currently edited profile in the/ preferences
  // dialog changes. This is most likely a bit too often, but it will also happen whenever
  // a new profile is created and whenever an old profile is deleted.
  _loadProfiles() {

    // Disconnect any previous profile settings signal connections to avoid leaks.
    if (this._profileSignalIds) {
      this._profileSignalIds.forEach(id => {
        try {
          id.settings.disconnect(id.signalId);
        } catch (_e) {
          // Settings object may have been destroyed.
        }
      });
    }
    this._profileSignalIds = [];

    // Get all currently available profiles.
    const profileManager = new ProfileManager(this.metadata);
    this._profiles       = profileManager.getProfiles();

    // The enabled-effect cache below needs the effect objects to exist.
    this._ensureEffects();

    // Whenever the properties of a profile is changed in the settings, we may have to
    // resort all profiles according to their priority.
    const updatePriority = (p) => {
      p.priority = profileManager.getProfilePriority(p.settings);
      this._profiles.sort((a, b) => b.priority - a.priority);
    };

    // For each profile, assign an initial priority and update the priority whenever a
    // related setting changes.
    this._profiles.forEach(p => {
      p.priority = profileManager.getProfilePriority(p.settings);
      const keys = [
        'profile-app', 'profile-animation-type', 'profile-window-type',
        'profile-color-scheme', 'profile-power-mode', 'profile-power-profile',
        'profile-high-priority'
      ];
      keys.forEach(key => {
        const signalId = p.settings.connect('changed::' + key, () => updatePriority(p));
        this._profileSignalIds.push({settings: p.settings, signalId});
      });

      // Cache the enabled effects so window animations do not have to read
      // two dozen settings keys on every open/close. The generic handler
      // keeps the cache fresh whenever any key of the profile changes.
      p.enabledEffects = this._buildEnabledEffects(p);
      const enabledSignalId = p.settings.connect('changed', () => {
        p.enabledEffects = this._buildEnabledEffects(p);
      });
      this._profileSignalIds.push({settings: p.settings, signalId: enabledSignalId});
    });

    // Sort all profiles initially according to their initial priority.
    this._profiles.sort((a, b) => b.priority - a.priority);

    // Pre-compile shaders for newly enabled effects during idle time.
    this._warmShaders();
  }

  // Returns the effect objects enabled in the given profile. The result is
  // cached per profile (see _loadProfiles) instead of being recomputed on
  // every window animation.
  _buildEnabledEffects(p) {
    if (!this._ALL_EFFECTS) {
      return [];
    }
    return this._ALL_EFFECTS.filter(e => {
      return p.settings.get_boolean(`${e.constructor.getNick()}-enable-effect`);
    });
  }

  // Pre-compiles one shader per idle tick for each enabled effect which has not
  // been warmed yet, so the first real window animation does not hitch on GLSL
  // compilation. This never blocks startup or animations: it runs at low idle
  // priority with at most one shader per callback, a single failing effect is
  // skipped in isolation, and the source removes itself once the queue is
  // drained or the extension is disabled.
  _warmShaders() {
    // Drop any pending source from a previous profile load first.
    if (this._warmId) {
      try { GLib.Source.remove(this._warmId); } catch (_e) {}
      this._warmId = 0;
    }

    this._ensureEffects();

    const queue = [];
    (this._profiles || []).forEach(p => {
      // The enabled effects are already cached per profile by _loadProfiles(),
      // so the 26 enable-effect keys do not have to be read a second time here.
      // The cache is a filtered copy of _ALL_EFFECTS, which keeps the queue
      // order exactly as it was: profiles by descending priority, effects in
      // _ALL_EFFECTS construction order.
      (p.enabledEffects || []).forEach(e => {
        const nick = e.constructor.getNick();
        if (!this._warmedNicks.has(nick)) {
          this._warmedNicks.add(nick);
          queue.push(e);
        }
      });
    });

    if (queue.length == 0) {
      return;
    }

    this._warmId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
      // The extension was disabled while warming: abort and clean up.
      if (this._settings === null) {
        this._warmId = 0;
        return GLib.SOURCE_REMOVE;
      }

      const effect = queue.shift();
      if (!effect) {
        this._warmId = 0;
        return GLib.SOURCE_REMOVE;
      }

      try {
        // Creating the shader registers its GType and loads and concatenates
        // its GLSL source (~127 us per effect, measured). Whether Cogl also
        // compiles the GL program at this point is unconfirmed:
        // Shell.GLSLEffect only receives the source via add_glsl_snippet() in
        // vfunc_build_pipeline(), so the program may well be linked lazily on
        // the first draw. Returning the shader to the factory makes it
        // immediately reusable for real animations either way.
        effect.shaderFactory.getShader().returnToFactory();
      } catch (_e) {
        // A single effect failing to compile must not break the rest.
      }

      if (queue.length == 0) {
        this._warmId = 0;
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    });
  }

  // Lazily create the UPower D-Bus proxy to avoid blocking during startup.
  // Both the success and the failure are cached: constructing the proxy performs
  // a synchronous D-Bus call, so retrying it on every window animation would
  // stall the compositor repeatedly while UPower is unavailable.
  _getUpowerProxy() {
    if (!this._upowerProxyChecked) {
      this._upowerProxyChecked = true;
      try {
        const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(
          utils.getStringResource('/interfaces/org.freedesktop.UPower.xml'));
        const proxy = new UPowerProxy(Gio.DBus.system, 'org.freedesktop.UPower',
                                      '/org/freedesktop/UPower');
        // Only keep the proxy if the service actually owns its bus name.
        if (proxy.get_name_owner() != null) {
          this._upowerProxy = proxy;
        }
      } catch (_e) {
        // Service may be unavailable (masked, or still starting up); leave as null.
      }
    }
    return this._upowerProxy;
  }

  // Lazily create the PowerProfiles D-Bus proxy. As for UPower above, both the
  // success and the failure are cached: constructing the proxy performs a
  // synchronous D-Bus call (~1.4 ms measured), so retrying it on every window
  // animation would stall the compositor repeatedly while the daemon is
  // unavailable. Note that the construction itself *succeeds* even when nobody
  // owns the bus name, so the name owner has to be checked explicitly. Without
  // that check we would hand out a merely owner-less proxy, whose ActiveProfile
  // reads back as null. _chooseEffect() would then fall through to its
  // "performance" branch and let profiles which are constrained to a power
  // profile match, even though the constraint could not be verified at all.
  _getPowerProfilesProxy() {
    if (!this._powerProfilesProxyChecked) {
      this._powerProfilesProxyChecked = true;
      try {
        const PowerProfilesProxy = Gio.DBusProxy.makeProxyWrapper(
          utils.getStringResource('/interfaces/net.hadess.PowerProfiles.xml'));
        const proxy = new PowerProfilesProxy(
          Gio.DBus.system, 'net.hadess.PowerProfiles', '/net/hadess/PowerProfiles');
        // Only keep the proxy if the service actually owns its bus name.
        if (proxy.get_name_owner() != null) {
          this._powerProfilesProxy = proxy;
        }
      } catch (_e) {
        // Service may be masked; leave as null.
      }
    }
    return this._powerProfilesProxy;
  }

  // Lazily instantiate all 26 effect objects. Called on first window animation.
  _ensureEffects() {
    if (this._ALL_EFFECTS) return;
    this._ALL_EFFECTS = [
      new Apparition(), new AuraGlow(),   new BrokenGlass(), new Doom(),
      new EnergizeA(),  new EnergizeB(),  new Fire(),        new Focus(),
      new Glide(),      new Glitch(),     new Hexagon(),     new Incinerate(),
      new Matrix(),     new PaintBrush(), new Pixelate(),    new PixelWheel(),
      new PixelWipe(),  new Portal(),     new RGBWarp(),     new SnapOfDisintegration(),
      new TeamRocket(), new TRexAttack(), new TVEffect(),    new TVGlitch(),
      new Wisps(),      new Mushroom()
    ];
  }

  // This method selects an effect profile matching the current circumstances. Then a
  // random effect from its enabled effects will be selected. It returns null if no
  // profile is currently applicable.
  _chooseEffect(actor, forOpening) {
    this._ensureEffects();

    // The actor may outlive its window during teardown races.
    if (!actor.meta_window) {
      return null;
    }

    // For now, we only add effects to normal windows and dialog windows.
    const isNormalWindow = actor.meta_window.window_type == Meta.WindowType.NORMAL;
    const isDialogWindow =
      actor.meta_window.window_type == Meta.WindowType.MODAL_DIALOG ||
      actor.meta_window.window_type == Meta.WindowType.DIALOG;

    if (!isNormalWindow && !isDialogWindow) {
      return null;
    }

    // ----------------------------------------------- choose a profile and then an effect

    // Usually, we use the effect profile with the highest priority which matches the
    // current circumstances. From this profile, we choose a random effect. However, if an
    // effect is to be previewed, we choose the currently edited profile regardless of the
    // circumstances.
    let profile = null;
    let effect  = null;

    // Hence, we first check if an effect is to be previewed.
    const previewNick = this._settings.get_string('preview-effect');

    if (previewNick != '') {
      const activeProfile = this._settings.get_string('active-profile');
      effect =
        this._ALL_EFFECTS.find(e => e.constructor.getNick() == previewNick);
      profile = this._profiles.find(p => p.path == activeProfile);

      // Only preview the effect until the preview window is closed.
      if (!profile || !forOpening) {
        this._settings.set_string('preview-effect', '');
      }
    }
    // If no effect is previewed, we use the effect profile with the highest priority
    // which matches the current circumstances. From this profile, we choose a random
    // effect.
    else {

      // These numbers match the indices in the Gtk.StringLists defined in the UI files
      // (e.g. resources/ui/adw/prefs.ui).
      const animationType = forOpening ? 1 : 2;
      const windowType    = isNormalWindow ? 1 : 2;
      // Power state is sampled on each window animation, so (un)plugging or
      // switching power modes takes effect on the next animation. This
      // polling is intentional to avoid permanent D-Bus subscriptions.
      // If UPower is unavailable, assume we are not on battery.
      const powerMode     = this._getUpowerProxy()?.OnBattery ? 1 : 2;

      // Get the first profile whose constraints match the circumstances. The list is
      // sorted by priority, so we are good to take the first match.
      profile = this._profiles.find(p => {
        const profileApp           = p.settings.get_string('profile-app');
        const profileAnimationType = p.settings.get_int('profile-animation-type');
        const profileWindowType    = p.settings.get_int('profile-window-type');
        const profilePowerMode     = p.settings.get_int('profile-power-mode');
        const profileColorScheme   = p.settings.get_int('profile-color-scheme');
        const profilePowerProfile  = p.settings.get_int('profile-power-profile');

        // First we check whether the animation type, window type, and power mode are
        // matching.
        let matches =
          (profileAnimationType == 0 || profileAnimationType == animationType) &&
          (profileWindowType == 0 || profileWindowType == windowType) &&
          (profilePowerMode == 0 || profilePowerMode == powerMode);

        // If that was the case, we also check the application name.
        if (matches && profileApp != '') {
          const wmClass = actor.meta_window.get_wm_class();

          if (wmClass) {
            const app = wmClass.toLowerCase();

            // Split app names at |, remove any whitespace, and transform to lower case.
            const profileApps =
              profileApp.split('|').map(item => item.trim().toLowerCase());
            matches = profileApps.includes(app);
          } else {
            matches = false;
          }
        }

        // If the profile is still matching, we also check the color scheme.
        if (matches && profileColorScheme != 0) {
          const colorScheme = this._shellSettings.get_string('color-scheme');
          matches &= (profileColorScheme == 1 && colorScheme == 'default') ||
            (profileColorScheme == 2 && colorScheme == 'prefer-dark');
        }

        // Finally, we may also have to check the power profile. If the daemon
        // is unavailable, the constraint cannot be verified, so a constrained
        // profile must not match.
        if (matches && profilePowerProfile != 0) {
          const powerProfilesProxy = this._getPowerProfilesProxy();

          if (!powerProfilesProxy) {
            matches = false;
          } else {
            const powerProfile = powerProfilesProxy.ActiveProfile;

            // To understand the numbers, please refer to the indices in the Gtk.StringList
            // of the profile-power-profile Adw.ComboRow in resources/ui/adw/prefs.ui.
            if (powerProfile == 'power-saver') {
              matches &= profilePowerProfile == 1 || profilePowerProfile == 4;
            } else if (powerProfile == 'balanced') {
              matches &= profilePowerProfile == 2 || profilePowerProfile == 4 ||
                profilePowerProfile == 5;
            } else {
              matches &= profilePowerProfile == 3 || profilePowerProfile == 5;
            }
          }
        }

        return matches;
      });

      // If we found a matching profile, choose a random effect from it.
      if (profile) {

        // Pick from the cached list of enabled effects of this profile.
        const enabled = profile.enabledEffects || [];

        // And then choose a random effect.
        if (enabled.length > 0) {
          effect = enabled[Math.floor(Math.random() * enabled.length)];
        }
      }
    }

    // If nothing was enabled, we have to do nothing :)
    if (!effect || !profile) {
      return null;
    }

    return {effect: effect, profile: profile};
  }

  // This method adds the given effect using the settings from the given profile to the
  // given actor.
  _setupEffect(actor, forOpening, effect, profile) {

    // There is the weird case where an animation is already ongoing. This happens when a
    // window is closed which has been created before the session was started (e.g. when
    // GNOME Shell has been restarted in the meantime).
    const oldShader = actor.get_effect('burn-my-windows-effect');
    if (oldShader) {
      oldShader.endAnimation();
    }

    // If we are currently performing integration test, all animations are set to a fixed
    // duration and show a fixed frame from the middle of the animation.
    const testMode = this._settings.get_boolean('test-mode');

    // The following is used to tweak the ongoing transitions of a window actor. Usually
    // windows are faded in / out scaled up / down slightly by GNOME Shell. Here, we tweak
    // the transitions so that nothing changes. The window stays opaque and is scaled to
    // actorScale.
    const actorScale =
      effect.constructor.getActorScale(profile.settings, forOpening, actor);

    // All scaling is relative to the window's center.
    actor.set_pivot_point(0.5, 0.5);
    actor.opacity = 255;
    actor.scale_x = actorScale.x;
    actor.scale_y = actorScale.y;

    // If we are in the overview, we have to enlarge the window's clone as well. We also
    // disable the clone's overlay (e.g. its icon, name, and close button) during the
    // animation.
    if (actor._bmwOverviewClone) {
      actor._bmwOverviewClone.overlayEnabled = false;
      actor._bmwOverviewCloneContainer.set_pivot_point(0.5, 0.5);
      actor._bmwOverviewCloneContainer.scale_x = actorScale.x;
      actor._bmwOverviewCloneContainer.scale_y = actorScale.y;
    }

    // Now add a cool shader to our window actor!
    const shader = effect.shaderFactory.getShader();
    actor.add_effect_with_name('burn-my-windows-effect', shader);

    // At the end of the animation, we restore the scale of the overview clone (if any)
    // and call the methods which would have been called by the original ease() calls at
    // the end of the standard fade-in animation.
    const endID = shader.connect('end-animation', () => {
      shader.disconnect(endID);

      if (actor._bmwOverviewClone) {
        actor._bmwOverviewClone.overlayEnabled   = true;
        actor._bmwOverviewCloneContainer.scale_x = 1.0;
        actor._bmwOverviewCloneContainer.scale_y = 1.0;
      }

      // Restore the original scale of the window actor.
      actor.scale_x = 1.0;
      actor.scale_y = 1.0;

      // Remove the shader and mark it being re-usable for future animations.
      actor.remove_effect(shader);
      shader.returnToFactory();

      // Finally, once the animation is done or interrupted, we call the methods which
      // should have been called by the original ease() methods.
      // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/windowManager.js#L1487
      // https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/windowManager.js#L1558.
      if (forOpening) {
        Main.wm._mapWindowDone(global.window_manager, actor);
      } else {
        Main.wm._destroyWindowDone(global.window_manager, actor);
      }
    });

    // To make things deterministic during testing, we set the effect duration to 8
    // seconds.
    const duration = testMode ?
      8000 :
      profile.settings.get_int(effect.constructor.getNick() + '-animation-time');

    // Finally start the animation!
    shader.beginAnimation(profile.settings, forOpening, testMode, duration, actor);
  }

  // This is required to enable window-close animations in the overview. See the comment
  // for Workspace.prototype._windowRemoved above for an explanation.
  _shouldDestroy(workspace, metaWindow) {
    const index = workspace._lookupIndex(metaWindow);
    if (index == -1) {
      return true;
    }

    const actor  = workspace._windows[index]._windowActor;
    const shader = actor.get_effect('burn-my-windows-effect');

    return shader == null;
  }
}
