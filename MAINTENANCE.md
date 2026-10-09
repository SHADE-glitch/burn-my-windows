# burn-my-windows@local 维护清单

本仓库是上游 [Burn-My-Windows](https://github.com/Schneegans/Burn-My-Windows) v48 冻结后的
本地维护分支，没有安装步骤，直接从 `~/.local/share/gnome-shell/extensions/burn-my-windows@local`
运行。目标平台只有一个：Ubuntu 26.04 + GNOME Shell 50.1 + gjs 1.88 + Wayland。

这份文件只回答三个问题：**改之前跑什么、日志怎么读、哪些东西别碰。**
"改了什么、为什么改"看 [README.zh-CN.md](README.zh-CN.md) 的相对上游改动清单；
给 agent 的硬规则看 [AGENTS.md](AGENTS.md)。三处不重复，避免漂移。

需要长期留存的三块内容已经拆进 `docs/maintenance/`，本文件只做索引，节号一律沿用原编号不重排：

- §5 / §7 / §10 → [docs/maintenance/shell-internal-api.md](docs/maintenance/shell-internal-api.md#5-哨兵清单18-个符号)
- §6 → [docs/maintenance/compat-matrix.md](docs/maintenance/compat-matrix.md#6-兼容分支矩阵8-处以及-gnome-50-实际走哪条)
- §8 / §12 → [docs/maintenance/measurement.md](docs/maintenance/measurement.md#8-哪些观测能当判据哪些不能)
- 本文件 §1 拆出的 06 / 07 方法学 → [docs/maintenance/measurement.md](docs/maintenance/measurement.md)

---

## 0. 三十秒速查

| 我要做的事 | 先跑 |
| --- | --- |
| 改了任何 `.js` | `npm run check && npm test`（秒级，不需要 shell） |
| 改了 `resources/` 或 `schemas/` | `make` **并且**把重生成的 `resources/burn-my-windows.gresource`、`schemas/gschemas.compiled` 一起提交，然后 `npm test` |
| 改了 8 处 monkey-patch 之一 | `npm test`（`patch-symmetry` + `sentinel-drift` 两道门都在管它） |
| 加了 / 删了一个特效 | `npm test`（登记点齐全性会红），再 `./test/headless/run.sh 02` |
| 想知道 GNOME 升级后坏在哪 | `./test/headless/run.sh 01`，再看 [`docs/maintenance/shell-internal-api.md`](docs/maintenance/shell-internal-api.md) §5 |
| 想确认动画真的还播 | `./test/headless/run.sh 05`（真窗口）→ 再按 §1 的 L2 用眼睛确认 |
| 怀疑有残留进程在干扰 | `./test/headless/down.sh` |
| 桌面出问题了要退回 | §9，第一级不需要重新登录 |

**永远先跑 L0。** 它不需要桌面、不抢 CPU，而且它是唯一能在没有显示器的情况下抓到"登记漏项"的门。

---

## 1. 三层验证

### L0 静态（不需要 shell，`npm test`）

```sh
npm run check   # node --check extension.js prefs.js + src/ 全部 32 个文件
npm test        # test/*.test.mjs
```

期望：`check` 无输出；`test` 全绿。门数与用例数**由命令自己打印**，不要抄进任何文档；
出现 `# SKIP` 要当失败读——被跳过的门等于不存在。

每个门各抓一种"不会报错的错"：

| 文件 | 抓什么 |
| --- | --- |
| `test/build-freshness.test.mjs` | 编译产物陈旧：bundle 成员集合 vs 清单、逐成员 sha256 内容 vs 源文件、已编译 schema 键集合 vs XML、主键默认值 |
| `test/effect-registry.test.mjs` | 26 个特效在 **8 个登记点**齐全，含 130 处 `dialog.bind*` 绑定的键同时存在于 schema 与其 `.ui` |
| `test/sentinel-drift.test.mjs` | 哨兵三张表 ↔ `PATCHES` ↔ install/restore 守卫 ↔ warn 前缀互相咬合；外加探针纯度门 |
| `test/patch-symmetry.test.mjs` | 8 处补丁成对装卸、绝不为上游已删的方法造桩；`Error` 形状栈帧驱动接管分支，含 ease 覆写不回链、全特效关闭时归还概览等待 |
| `test/proxy-retry.test.mjs` | 电源代理：失败后不在动画热路径上重建、重试有上界、`disable()` 取消定时器且允许 re-enable 重新尝试 |
| `test/shader-warmup.test.mjs` | 着色器预热：只有成功才登记、一个失败不结束队列、失败留日志、跨 profile 去重、禁用后源自退 |
| `test/repo.test.mjs` | 仓库自身的约定：README 双语对成对、无复选框、`reports/` 既被忽略也没被追踪 |
| `test/docs-links.test.mjs` | 文档路由：`docs/maintenance/` 三页在、markdown 链接指向的文件在、`§N` 引用不悬空、拆出去的内容真的不在本文件里 |

**为什么需要 build-freshness 这一门**：本仓库把编译产物提交进 git 且没有安装步骤，所以改了
`.frag` / `.ui` / schema 而忘记 `make`，运行时会**继续用旧产物并且报绿**。没有工具会告诉你这件事。

期望值 `26` 是**硬编码**的。从被检对象自身导出 26 再跟它比，是 `a === a`。

门的有效性用变异验证（在 `cp -a` 的副本里做，绝不在工作树）：

```sh
D=$(mktemp -d /tmp/bmw-mutate.XXXXXX); cp -a ./. "$D/" && cd "$D"
printf '\n// x\n' >> resources/shaders/glide.frag   # build-freshness 必须红
node --test test/build-freshness.test.mjs | grep -c '^not ok'
```

### L1 headless 探针（真 shell 进程，沙箱，分钟级）

```sh
./test/headless/run.sh all      # 探针清单见 run.sh 的 ALL_PROBES，每个独占一次 shell 启动
./test/headless/run.sh 01       # 只跑升级后最该看的那个
```

探针清单：

| # | 名字 | checks | 只有真进程能证明的事 |
| --- | --- | --- | --- |
| 01 | `load-and-sentinel` | 13 | 18 个私有 API 符号在**这个** GNOME 上实存；8 处兼容分支实际走了哪条；哨兵既没响也真的跑了 |
| 02 | `effects-and-shaders` | 10 | 期望特效数取自 gresource 而非 fork 自己的列表；着色器池收支；GType 每 nick 唯一且稳定；6 个 uniform 位置解析得到 |
| 03 | `animation-dispatch` | 21 | `_chooseEffect` 预览分支与其清空契约；用**真名**叫 `_mapWindow` / `_destroyWindow` 的函数产生真 SpiderMonkey `@` 帧，驱动接管分支；真 `_setupEffect` 附着/收尾与 dispose 竞态 |
| 04 | `lifecycle-residue` | 17 | `disable()` 后 8 处补丁身份还原、handler 归零、bundle 注销；再 enable 是**新闭包**；profile 增删时 handler 数量按比例（泄漏表现为 3 倍） |
| 05 | `window-animation` | 5 | mutter 真的映射窗口、真的按 `preview-effect` 播了指定特效、`update-animation` 每帧有数（= 合成器真的画了这个 shader） |
| 06 | `main-thread-budget` | 20 | `enable()` 在单 profile 与 20 profile 下各阻塞主线程多久；懒代理是否退化回启动期构造；无约束 profile 是否真的完全不碰总线 |
| 07 | `global-state-balance` | 3 | `begin_work` / `end_work` 与 unredirect 在**动画没走完**的路径上是否仍然配平（正常关闭 / 动画中 `kill -9` / 动画中 disable / 动画中最小化 / 概览中关闭） |

2026-10-01 的一次干净运行：**7 个探针全部 PASS，合计 89 个 checks**；
探针 05 里 26/26 窗口成功映射并播放，每轮 70–73 帧，`_progress` 恒为 0.5，收尾全部回池，
指向前扩展自身路径的 CRITICAL 为 0 条。

### 06 / 07 这两道门为什么单独存在 → [docs/maintenance/measurement.md](docs/maintenance/measurement.md)

**但探针 05 的像素对照层是 SKIP，不是 PASS**：`org.gnome.Shell.Screenshot.Screenshot`
在沙箱里返回 `Gio.IOErrorEnum: Timeout was reached`（三个取样点 `fire` / `matrix` / `snap`
都一样）。它单独计数、打印原因、**从不折进成败判定**，成败仍由
setup / attach / paint / pin / cleanup 五路决定。因此"26 个特效的画面已被验证"这句话
不成立——被验证的是它们各自被选中、附着、绘制了约 72 帧并正确回收；画面本身仍是 L2 的人工判断。

结果落在 `/tmp/bmw-harness/out/<probe>.json`，**不在仓库里**，所以不需要 gitignore，崩溃了证据还在。
`checks` 与 `metrics` 分开：数字变了不该让套件变红，真回归必须让套件变红——这是同一个文件
（`verdict.js`）里的两件事。

### L2 真实会话（只读，人工判断）

只有这一层能判断"看起来对不对"。注销登录之后：

```sh
journalctl -f -o cat --identifier=/usr/bin/gnome-shell | grep -F '[burn-my-windows@local]'
```

然后依次：开关窗口 ×20、在概览里关窗口、最小化与工作区切换、全屏视频时关另一个窗口、
插拔电源并切 power-saver、打开偏好设置看日志有无新增告警、disable/enable 各 ×10。

**任何"特效看起来不对"的结论只能来自这一层。** L1 只判结构和日志形状。

---

## 2. 代码加载规则（最容易自欺的一条）

- `disable` + `enable` **不会**重新导入模块。GNOME Shell 按 URI 缓存 ES 模块，所以
  `scripts/reload.sh` 跑的是**旧代码**。改了 `.js` 要在桌面上看到效果，必须**注销重登**。
- 但 `./test/headless/up.sh` 起的是**新进程**，它加载的是**当前工作树**——改了 `.js` 立刻生效。
  这两句不矛盾：一条讲已在跑的进程，一条讲新起的进程。想在不动桌面的前提下验证新代码，用后者。
- 因此**不允许**用"`npm test` 过了"或"reload 后没报错"来声称某个改动已验证。前者只证书记簿，
  后者跑的是旧代码。

---

## 3. 隔离 headless shell 的边界

`up.sh` 里每一项都是承重的，去掉任何一项都会污染真实会话或让测量失去意义：

| 设置 | 为什么 |
| --- | --- |
| 私有 `dbus-daemon`（`$WORK/bus`） | 与真实 session bus 隔离；也是 teardown 时的身份标识 |
| `GSETTINGS_BACKEND=memory` | 探针的设置写入**永远到不了** `~/.config/dconf/user`。它是**逐进程**的，所以设置必须在 shell 内部写 |
| `XDG_CONFIG_HOME=$WORK/xdg-config` | ProfileManager 的 keyfile 落在沙箱。少了这条，`getProfiles()` 会在你**真实的** `~/.config/burn-my-windows/profiles/` 里**悄悄建一个 profile** |
| `XDG_DATA_HOME=$WORK/xdg-data`（里面只有指向本仓库的软链） | 只发现 burn-my-windows 一个扩展。`fast-translate@local`、`macos-dock@local` 自己起不来，它们的报错会被误读成本 fork 的回归 |
| 私有 `XDG_RUNTIME_DIR` | shell 启动时会在 runtime dir 建 `gnome-shell-disable-extensions`，约 60 s 后删除。本套件频繁杀 shell，若死在那个窗口内会把标记**留在真实 runtime dir**，其存在会让会话在下次崩溃后禁用全部扩展——一次测试跑成用户可见故障 |
| `WAYLAND_DISPLAY=wayland-bmw-harness` + `--wayland-display=` 同名 | 不指定就会去抢 `/run/user/1000/wayland-0.lock`，失败后 cascade 成 `StartServiceByName` 失败、`Execution of main.js threw exception`，最后 `free(): invalid pointer`——看起来像 shell 自己有 bug |
| `--headless --unsafe-mode --virtual-monitor 1280x800` | `--unsafe-mode` 才是提供 `org.gnome.Shell.Eval` 的那个（GNOME 50 已删除 `unsafe-mode` gsettings 键）；`--devkit` 不需要；**`--nested` 在 GNOME 50 已被移除** |
| `GIO_USE_VFS=local` | 否则 GVFS 会在重定向的 XDG_DATA_HOME 下写并持有一个 metadata store |

### Eval 里能用什么、不能用什么的实测清单

这些都是在写探针时撞出来的，每一条都会伪装成"扩展坏了"：

| 写法 | 实测结果 |
| --- | --- |
| `log('...')`（GJS 全局） | ✅ 进 shell 日志，探针标记就用它 |
| `console.warn('...')` | ✅ 进日志，但是 WARNING 级别 |
| `imports.gi.GLib.log(...)` | ❌ **该函数不存在**，调用即抛 |
| `Main.global.compositor` | ❌ `Main.global` 是 undefined；直接用裸 `global` |
| `imports.gi.Shell.Workspace` / `.WindowPreview` | ❌ GNOME 50 上 undefined，见 [`docs/maintenance/shell-internal-api.md`](docs/maintenance/shell-internal-api.md) §5 末尾 |
| `new Meta.Rectangle(0,0,800,600)` | ❌ 不可从 Eval 构造。fork 只读 `get_frame_rect().width`，普通对象即可 |
| `mw.delete()` | ❌ 需要时间戳：`mw.delete(global.get_current_time())`，否则 GI 报 "At least 1 argument required"，窗口**没关掉**，接着被算成泄漏窗口 |
| `GLib.file_remove(p)` | ❌ 不存在；用 `Gio.File.new_for_path(p).delete(null)` |
| `imports.gi.Gtk` 版本串 | 必须 `'4.0'`，写 `'4'` 会得到 "Typelib file for namespace 'Gtk', version '4' not found" |
| `Process.kill(pid)` | ❌ shell 进程里没有 `Process`；用 `GLib.kill(pid, 15)` |
| `EM._callExtensionDisable(uuid)` | ❌ **不等效于** disable：8 处补丁、8 个 handler、bundle、D-Bus 导出全都还在，随后的 enable 立刻死于 "An object is already exported"。用 `stateObj.disable()` / `stateObj.enable()` |
| `GLib.spawn_async` 起客户端 | ✅ 但必须**显式传 envp**（`WAYLAND_DISPLAY`、私有 `XDG_RUNTIME_DIR`、`GDK_BACKEND=wayland`、`GSK_RENDERER=cairo`），且 `BMW_HARNESS` 要由 up.sh 导出，否则探针找不到 `window-client.js` |


**杀进程只按 pidfile，并且先校验那个 pid 的 cmdline 还是不是自己的。**
不要 `pkill -f <pattern>`：模式字符串同样出现在调用者自己的命令行里，脚本会杀掉启动它的
shell（表现为一声不响的 exit 143）；`pgrep -x gnome-shell` 还会命中用户真实的会话 shell，
而本 workspace 里常有**并行的另一个 fork 会话**开着它自己的 headless shell。

驱动侧要连那个私有总线，用 `. /tmp/bmw-harness/env.sh`，不要在自己的命令行里写 socket 路径。

就绪判定：冷启动约 20 s，`gnome-extensions info` 可能报 `State: UNKNOWN` 而 `stateObj` 仍是
undefined。可靠信号只有两个——Eval 回 `(true, ...)`（没开 unsafe-mode 的 shell 会以 exit 0
回 `(false, ...)`），以及 `extensionManager.lookup(uuid).stateObj._settings` 真的有值。

---

## 4. 日志怎么读

两条通道，**prefs 进程不在第一条里**：

```sh
# 壳进程：extension.js 与 src/ 的一切
journalctl -f -o cat --identifier=/usr/bin/gnome-shell | grep -F '[burn-my-windows@local]'

# 偏好设置进程（独立 gjs，journald 打的是 org.gnome.Shell.Extensions）
journalctl -f -o cat --identifier=org.gnome.Shell.Extensions | grep -iE 'burn-my|GJS|TypeError'
```

用方括号前缀而不是 `-i burn-my-windows`：`utils.debug()` 也会打印含
`burn-my-windows@local` 的常规运维信息，宽松匹配会把话痨当成回归。

哨兵告警的字面形状（`test/sentinel-drift.test.mjs` 会守住它，改文案要同时改 §0 的 grep）：

```
[burn-my-windows@local] expected <name> to be a function, got <type>. Effects may not work on this GNOME version.
```

数一条就够：

```sh
journalctl -o cat --since "-10 min" | grep -cE '\[burn-my-windows@local\] expected .* to be'   # 必须是 0
```

---

## 5. 哨兵清单：18 个符号 → [docs/maintenance/shell-internal-api.md](docs/maintenance/shell-internal-api.md)

---

## 6. 兼容分支矩阵：8 处，以及 GNOME 50 实际走哪条 → [docs/maintenance/compat-matrix.md](docs/maintenance/compat-matrix.md)

---

## 7. 哨兵没覆盖的私有 API（升级后要手验的） → [docs/maintenance/shell-internal-api.md](docs/maintenance/shell-internal-api.md)

---

## 8. 哪些观测能当判据，哪些不能 → [docs/maintenance/measurement.md](docs/maintenance/measurement.md)

---

## 9. 回滚配方（按暴力程度递增）

1. **立刻、不需要重登**：`gnome-extensions disable burn-my-windows@local`
   —— 动画回到原生，其他一切不受影响。
2. **退代码**：`git stash` 或 `git checkout <good-sha>`；若曾碰过 `resources/` / `schemas/`，
   必须 `make` **并**提交重生产物；然后**注销重登**（模块缓存是逐 shell 进程的）。
3. **只清设置**（永不用 `dconf rm /`，永不用空 dump `dconf load /`——那会清掉整个用户库；
   profile 是 keyfile，**永远不要删**）：
   ```sh
   cp -a ~/.config/burn-my-windows ~/.config/burn-my-windows.bak.$(date +%s)
   dconf dump /org/gnome/shell/extensions/burn-my-windows/ > /tmp/bmw.dconf
   dconf rm   /org/gnome/shell/extensions/burn-my-windows/    # 只影响 active-profile / last-*-version
   ```
   恢复：`dconf load /org/gnome/shell/extensions/burn-my-windows/ < /tmp/bmw.dconf`，
   profile 目录 `cp -a` 回来即可。
4. **核选项**：把扩展目录 `mv` 出 `~/.local/share/gnome-shell/extensions`（在还能登录的状态下做），
   然后注销。**绝不要在仓库目录里跑 `gnome-extensions install` 或 `pack`**——它跟随符号链接，
   会把源码内容抹掉。
5. **报 bug 要附的证据**：§4 的两条 grep 输出、`gnome-shell --version`、`git log --oneline -1`、
   以及 18 个符号里具体哪几个告警了。

---

## 10. GNOME 大版本升级检查单 → [docs/maintenance/shell-internal-api.md](docs/maintenance/shell-internal-api.md)

---

## 11. headless 能证明什么、不能证明什么

**能证明**：私有 API 在不在、分支走哪条、26 个特效能否被选中并附着到真窗口、着色器池与
GType 是否稳定、disable 后有没有残留、dispose 竞态会不会抛、日志形状是否干净。

**不能证明**：真 GPU 上首次绘制的 link 耗时；每帧
`get_pipeline().set_blend('RGBA = ADD (...)')` 重新解析的成本；多显示器/HiDPI 下
`uSize` 与 padding 的正确性；任何需要指针的特效的真实表现（沙箱没有指针）；
`WindowPicker` 的 LookingGlass 交互（沙箱里点不动）；X11/XWayland 窗口路径；
以及"好不好看"。

---

## 12. 当前基线 → [docs/maintenance/measurement.md](docs/maintenance/measurement.md)

---

## 13. 已知不修 / 待确认

- **设了电源档位约束的 profile，登录后第一次匹配动画付 4.4 ms 同步 D-Bus**（实测
  `4437 / 88 / 52` µs，即一次性的）。4.4 ms 是 60 Hz 一帧（16.7 ms）的约 26%，理论上
  是登录、解锁或切换电源后第一次开合窗的一次抖动。**决定：不改。**
  把代理构造从 `enable()` 挪走正是当年修那次启动事故的做法，为消掉一次性 4.4 ms
  而重新改动这个已验证的启动设计，按"稳定性 > 性能"不划算。
  若将来真要改，正确落点是已有的 `_warmShaders()` 空闲泵（低优先级、每 tick 一件事），
  在那里各调一次 `_getUpowerProxy()` / `_getPowerProfilesProxy()`，
  **不要**放回 `enable()`。
  注意：只有 profile 设了 `profile-power-mode` 或 `profile-power-profile` 才会走到；
  无约束 profile 的动画路径一次总线都不碰（`_chooseEffect()` 里的
  `if (matches && c.powerProfile != 0)`），当前用户配置就属于这种。
- **`_doDisable()` 不主动结束正在播放的动画**。07 实测这种情况下全局状态仍然配平
  （shader 被 timeline 自己带着走完并回收），所以这不是待修项；但它是上面那条
  actor-clock 风险的来源，改动 disable 路径前必须重跑 07。
- **`enable()` 不幂等**（上游行为，非 fork 引入，**不修**）：在没有 `disable()` 的情况下第二次
  `enable()` 会在导出 D-Bus 对象时抛
  `An object is already exported for the interface org.gnome.shell.extensions.BurnMyWindows`，
  并且被 fork 自己的 catch 记成 `[burn-my-windows@local] enable failed`，同时留下一条
  `g_dbus_interface_skeleton_unexport: assertion 'interface_->priv->connections != NULL' failed`。
  正常桌面流程走不到（一次登录一次 enable），**但探针走得到**：这就是为什么 04 必须用
  `stateObj.disable()` / `stateObj.enable()` 而不是 `EM._callExtensionDisable()`（后者根本不会
  释放任何东西）。若将来有改动让扩展在运行中被重启，这条会变成真问题。
- **`WindowPicker` 的 LookingGlass 路径只有半边覆盖**（`docs/maintenance/shell-internal-api.md` §7
  第一行）。探针 04 现在断言两次
  `PickWindow()` 共用一个 inspector、且 `disable()` 把它交还；但"真的点中一个窗口"仍然只能
  手点 —— 沙箱里没有指针输入，`target` 信号不会由 mutter 发出。升级后仍要手点一次 "Select app"。
- `_chooseEffect()` 的第一个守卫是 `if (!actor.meta_window) return null`。给探针造的对象忘了
  这个字段，接管分支就永远走不到，并且会落回 shell 真实的 `_shouldAnimateActor`——后者要
  `actor.get_texture()`，于是在**探针**里抛异常，看起来像 fork 崩了。
- **unredirect 不是引用计数的**：`Shader.beginAnimation` / `endAnimation` 切的是**全局**状态，
  所以两个动画重叠时，先结束的那个会在另一个还在跑时就把 unredirect 打开。只影响全屏
  （例如全屏播放时关另一个窗口）。上游行为，非 fork 引入。**待你决定**，因为修它等于推翻上游机制。
- `src/Shader.js:28` 与 `src/effects/Glide.js:37` 的注释写 `.glsl`，而 `:209` 实际加载 `.frag`。
- `src/migrate.js` 的已知脆弱都是文本解析（只跑一次，由 `last-extension-version` 把关）：
  `r.includes(...)` 会匹配到 dconf dump 里别的键的字符串值内部；`replace('[/]\n','')` 与
  `replace('flame-','fire-')` 都是字面替换，只处理第一次出现；`^.*-preview-.*` 会删掉任何含
  `-preview-` 的行；重试去重比较的是精确 trim 后文本，格式一变就失效。
  **撤回一条旧结论**：本节原先写"`:89` 从迁移来的 keyfile 里剥掉 `test-mode=`，所以迁移过的
  profile 永远进不了测试模式"——不成立。`test-mode` 属于**主** schema
  （`schemas/org.gnome.shell.extensions.burn-my-windows.gschema.xml`），只从 `this._settings`
  读（`extension.js:1164`），而迁移根本不写主 schema：生成的 keyfile 里本来就不可能有这个键。
  测试模式对迁移过的 profile 照常生效。
- `_ALL_EFFECTS` 在 `extension.js` 与 `prefs.js` 里顺序不同（Mushroom 一个垫底一个排第 14）。
  这是合法的，所以所有比较都按**集合**做。
- `test-mode` 对 4 个特效不播种（见 `docs/maintenance/measurement.md` §8），所以它们的帧不参与可复现性断言。
- `src/Shader.js:215` 的 `match.index` 没有 null 检查：`.frag` 若不含 `void main(){…}` 就
  在构造期抛 TypeError。当前 26 个 `.frag` 全部由探针 02 证明可编译，所以它是**潜在**问题，
  影响是"新增一个写错的 `.frag` 时报错位置难读"，不参与本轮修复。
- 偏好对话框的 About 与"每开 10 次提示一次"的捐赠弹窗**仍属于上游**（`set_developer_name`、
  `set_copyright`、license、四个 `donate-*`、`show-sponsors`、`translate` 与 `metadata.json:donations`
  一概不动），而**报障去处**（菜单 `homepage` / `bugs`，About 的 `set_website` / `set_issue_url`）
  已指回本仓库，与 `metadata.json:url` 一致。两个方向都有门守着：`test/prefs-attribution.test.mjs`
  从 README 的 `git clone` 行与 `**Upstream:**` 行取期望地址，所以改写 README 那两行的**形状**
  会让它红在"取不到地址"而不是红在归属上。详见 CHANGELOG 的 D-051 / D-052。
- **`changelog` 动作仍打开上游的 `docs/changelog.md`**，而扩展版本变化后弹出的 toast 引导用户去读的
  正是它；本 fork 的变更记在本仓库 `CHANGELOG.md`。Q4 只批了 website/issues 两处，改这条属于扩大
  范围，**待你决定**。本轮也没有为它加门 —— 加了就等于替这个决定做掉。
- 沙箱里 `gjs` GTK4 客户端只证明"能开窗、能关窗、动画被接管"，不证明 GTK 应用在你机器上的其他行为。
- **文档路由门不区分正文与引文**：它扫每一行 markdown 里的节号引用，所以**举一个坏例子也会被当成一次
  真引用**并让门变红。规避办法是要么在引文里不写节号，要么让引文里的节号紧挨它自己的文件名；
  `原 MAINTENANCE §N` 那种溯源写法已经被掩掉，不会被当成活指针。
