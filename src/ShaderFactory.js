//////////////////////////////////////////////////////////////////////////////////////////
//          )                                                   (                       //
//       ( /(   (  (               )    (       (  (  (         )\ )    (  (            //
//       )\()) ))\ )(   (         (     )\ )    )\))( )\  (    (()/( (  )\))(  (        //
//      ((_)\ /((_|()\  )\ )      )\  '(()/(   ((_)()((_) )\ )  ((_)))\\((_)()\ )\       //
//      | |(_|_))( ((_)_(_/(    _((_))  )(_))  _(()((_|_)_(_/(  _| |((_)(()((_|(_)      //
//      | '_ \ || | '_| ' \))  | '  \()| || |  \ V  V / | ' \)) _` / _ \ V  V (_-<      //
//      |_.__/\_,_|_| |_||_|   |_|_|_|  \_, |   \_/\_/|_|_||_|\__,_\___/\_/\_//__/      //
//                                 |__/                                                 //
//////////////////////////////////////////////////////////////////////////////////////////

// SPDX-FileCopyrightText: Simon Schneegans <code@simonschneegans.de>
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

import GObject from 'gi://GObject';

import {Shader} from './Shader.js';

//////////////////////////////////////////////////////////////////////////////////////////
// Each effect of Burn-My-Windows owns an instance of this class. It is used to create  //
// shaders whenever a new one is required. It tries to re-use old shaders as much as    //
// possible in order to avoid memory leaks.                                             //
//////////////////////////////////////////////////////////////////////////////////////////

// The unused shaders live in this module-global cache, shared by every ShaderFactory.
// This is required because GNOME Shell disables and re-enables all extensions whenever
// the screen is locked and unlocked: each cycle constructs new ShaderFactory instances,
// while the GObject classes registered below belong to the shell session and are never
// unregistered. With the cache owned by the instances, those classes kept the factories
// of the very first enable() alive forever, and every shader created after a lock/unlock
// was returned to one of those leaked factories, where it could never be re-used -- a GPU
// leak with every window animation.
//
// The array is looked up at call time for the same reason: freeAll() drops the entries,
// and a class that is already registered must then land in the *new* array, not in the
// one it captured at registration time.
const _freeShaders = new Map();

function freeShadersFor(nick) {
  if (!_freeShaders.has(nick)) {
    _freeShaders.set(nick, []);
  }
  return _freeShaders.get(nick);
}

export default class ShaderFactory {

  // Creates a new ShaderFactory. Requires the nick of the effect and a callback function
  // which will be called whenever a new shader is created.
  constructor(nick, setupFunc) {
    // The nick of the effect is required when creating new shaders as it's part of the
    // GLSL source code file name.
    this._nick = nick;

    // Store the setup callback.
    this._setupFunc = setupFunc;
  }

  // ---------------------------------------------------------------- API for extension.js

  // Drops every currently unused shader of every effect so that it can be collected.
  // Called from _doDisable(): the pool is the only place a shader survives a disable()
  // that has no actor left to own it.
  static freeAll() {
    _freeShaders.clear();
  }

  // This is called from extension.js whenever a window is opened or closed. It returns an
  // instance of the shader class, trying to reuse previously created shaders. If a new
  // shader instance is required, it calls creates a new one and calls the setupFunc
  // thereafter.
  // The pool is shared per effect nick. Exposing it under the historical name keeps the
  // headless probes' observable (`.length`) pointed at the real pool, not at a copy of
  // it: a probe measuring a look-alike would stay green while the real pool leaked.
  get _freeShaders() {
    return freeShadersFor(this._nick);
  }

  getShader() {
    let shader;

    const freeShaders = this._freeShaders;

    // If there are currently no free shaders, we have to create a new one.
    if (freeShaders.length == 0) {

      // Since Shell.GLSLEffect caches the shader source per class (not per instance), we
      // have to derive a new shader type for each effect. The type name contains the nick
      // of the effect to make it unique.
      const typeName = `BurnMyWindowsShader_${this._nick}`;

      // Only try to register the new type once.
      if (GObject.type_from_name(typeName) == null) {
        const outerThis = this;
        GObject.registerClass({GTypeName: typeName}, class ShaderImp extends Shader {
          // This will actually load the GLSL source code from the resources.
          _init() {
            super._init(outerThis._nick);
          }

          // This can be called to mark this instance to be re-usable.
          returnToFactory() {
            freeShadersFor(outerThis._nick).push(this);
          }
        });
      }

      // Now create a niew instance of the newly registered shader type.
      // GObject.Object.new is only available with newer versions of GJS.
      if (GObject.Object.new) {
        shader = GObject.Object.new(GObject.type_from_name(typeName), {});
      } else {
        shader = GObject.Object.newv(GObject.type_from_name(typeName), []);
      }

      // Call the provided setup callback.
      this._setupFunc(shader);

    } else {
      shader = freeShaders.pop();
    }

    return shader;
  }
}
