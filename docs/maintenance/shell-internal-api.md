# Shell 私有 API：哨兵清单、未覆盖项与升级手册

本页是 burn-my-windows@local 三张长期资产页之一，从 `MAINTENANCE.md` 拆出，收着原先的三节
（原 MAINTENANCE §5/§7/§10）：§5 哨兵清单（18 个符号）、§7 哨兵没覆盖的私有 API、
§10 大版本升级检查单。`MAINTENANCE.md` 里只留路由行，正文只在这里维护。
本页记的是"fork 到底压在哪些私有接口上、哪一处坏了不会有日志、GNOME 大版本升级时按什么顺序查"。
**动手之前先读 [MAINTENANCE.md](../../MAINTENANCE.md) §3（隔离 headless shell 的边界）与
[AGENTS.md](../../AGENTS.md)（给 agent 的硬规则）**；"哪个观测能当证据"归
[measurement.md](measurement.md) §8 与 §12。

---

## 5. 哨兵清单：18 个符号

fork 的全部生存能力都压在 GNOME Shell 的私有接口上。`_doEnable()` 里三张探针表**只告警、
从不抛异常**，覆盖以下 18 项。升级后先看日志再说别的。

**11 个函数**（`extension.js` 函数表）

| 符号 | 谁在调 |
| --- | --- |
| `Main.wm._shouldAnimateActor` | 补丁本体：每一次窗口开合 |
| `Main.wm._waitForOverviewToHide` | 补丁本体 |
| `Main.wm._mapWindowDone` | 动画收尾 `:1088`（只调用，不 patch） |
| `Main.wm._destroyWindowDone` | 动画收尾 `:1090`（只调用，不 patch） |
| `Workspace.prototype._addWindowClone` | 概览克隆放大 |
| `Workspace.prototype._windowRemoved` | 关闭路径 |
| `Workspace.prototype._doRemoveWindow` | 关闭路径 |
| `Workspace.prototype._lookupIndex` | `_shouldDestroy()` `:1107`（只调用，不 patch） |
| `WindowPreview.prototype._init` | 挂 unmanaged 处理 |
| `WindowPreview.prototype._deleteAll` | 概览 X 双击防重入 |
| `WindowPreview.prototype._restack` | 叠序 |

**2 个访问器**：`WindowPreview.prototype.overlayEnabled`（必须 get **和** set 都在——
真正藏掉图标/标题/关闭按钮的是 setter）、`window_container`（只要 get）。
`window_container` 是 GObject 属性，描述符挂在 `Shell.WindowPreview.prototype` 上而非
我们手里的原型，**必须走原型链**才找得到；`typeof` 读它会调用 getter 并得到 `undefined`。

**4 个实例字段 + 1 个类型检查**（在 patch 过的 `_init` 内部，一次性）：
`WindowPreview._windowActor`、`._icon`、`._closeRequested`、`Workspace._windows`，
外加 `Array.isArray(Workspace._windows)`。
三条踩过的坑：`in` 是**唯一**可用的谓词（`_closeRequested` 出生即为 `false`，`typeof` 与
真值判断都会误报缺失）；`WorkspaceLayout` 有个**同名**的 `Map`，所以必须验数组类型；
这段探针只准用 `in` / `typeof` / `Array.isArray`，不得读 `this.` 上的属性、不得 `.connect(`——
它跑在最危险的补丁上，`sentinel-drift` 对这条有专门断言。

> 重要事实：`Workspace` / `WindowPreview` **不在 `Shell` GI 命名空间里**
> （`imports.gi.Shell.Workspace` 在 GNOME 50 是 `undefined`）。它们是
> `resource:///org/gnome/shell/ui/workspace.js` 与 `ui/windowPreview.js` 的 ESM 导出。
> 任何想在真进程里检查原型的代码都必须 dynamic-import 这两个模块。

规则：**新增一处私有 API 依赖，就同时加一行 §5 和一条探针表**，否则 `sentinel-drift` 会红。

---

## 7. 哨兵没覆盖的私有 API（升级后要手验的）

探针表只覆盖 18 项，下面这些**不在表里**（本轮按授权未动 `extension.js`，所以也没扩表）。
它们坏了不会有日志，只会行为异常：

| 位置 | 符号 | 谁会先发现 |
| --- | --- | --- |
| `src/WindowPicker.js:56,65` | `Main.createLookingGlass()`、`new LookingGlass.Inspector` | **半边**：探针 04 只证明"两次点击共用一个 inspector、disable 把它交还"；"真点中一个窗口"（`target` 信号）沙箱里发不出来，仍要手点 "Select app" |
| `src/Shader.js:157` | `Meta.MaximizeFlags.BOTH` | L2（全屏/最大化的判断变错） |
| `TRexAttack.js:77`、`SnapOfDisintegration.js:77,82`、`PaintBrush.js:68`、`BrokenGlass.js:103,108` | `Cogl.PipelineFilter.LINEAR`、`Cogl.PipelineWrapMode.REPEAT` | 探针 05（这 4 个特效带贴图） |
| `src/utils.js:137,138,199` | `Cogl.PixelFormat.{RGB_888,RGBA_8888,RGBA_8888_PRE}` | 探针 02/05 |
| `src/Shader.js:75` | 基类 `Shell.GLSLEffect` | 探针 02（构造即失败）间接发现 |
| `src/Shader.js:142,198` | `global.begin_work()` / `end_work()` | **无人发现**：不平衡只会让电量/时钟统计悄悄错 |
| `Doom.js:55,113`、`src/utils.js:142` | `global.stage.height` | 探针 05 的 `doom` |
| `PixelWipe.js:51`、`Incinerate.js:61`、`BrokenGlass.js:76` | `global.get_pointer()` | 探针 05 只能证明"不抛"，沙箱里没有指针 |
| `extension.js:1264` | `Workspace._windowActor`（运行期字段） | 探针 01 的实例字段臂 |
| `src/effects/*.js` 5 处 | `this._<x>Texture.get_texture()` | 探针 05；另外这决定了**假 actor 走不通**真实 shell 的 `_shouldAnimateActor`（它要 `actor.get_texture()`） |

---

## 10. GNOME 大版本升级检查单

按顺序做，别跳：

1. 起桌面后先看日志：`journalctl -o cat -n 400 --identifier=/usr/bin/gnome-shell | grep -F 'expected '`。
   **告警里点名的符号就是差异本身**，不用猜。
2. 在新 shell 源码里核对 11 个函数名 + `_mapWindow` / `_destroyWindow` 两个帧名
   （帧名被改是**静默**的：只有探针 03 会响）。本机 `/usr/share/gnome-shell/js` 不存在，
   所以要从对应版本的 gnome-shell 源里读。
3. `npm run check && npm test` → 先修 L0。加特效或加第 9 处补丁时，`26` 这个数字要同时改
   `test/effect-registry.test.mjs`、`test/build-freshness.test.mjs`、探针 02/05、
   `MAINTENANCE.md` §1 与 `docs/maintenance/measurement.md` §12。
4. `./test/headless/run.sh 01` → 哨兵与矩阵。
5. `./test/headless/run.sh 02 03 04` → 着色器、派发、残留。
6. 对照 `docs/maintenance/compat-matrix.md` §6：若某行翻了，**先把两条分支都读一遍**再动代码。
7. `./test/headless/run.sh 05` → 真窗口逐个特效。
8. L2 真会话人工项（`MAINTENANCE.md` §1）——只有这一层能确认观感。
9. 同一会话内更新本页 §5/§7 与 `docs/maintenance/compat-matrix.md` §6，以及 README 改动清单
   （代码与文档分开提交）。

优先级永远是 **稳定性 > 性能 > 观感**；绝不为了测试通过去改某个特效的外观。
