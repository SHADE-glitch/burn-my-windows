<p align="right"><a href="README.md">English</a> | <a href="README.zh-CN.md"><b>简体中文</b></a></p>

# Burn My Windows —— 本地维护分支

让你的窗口以华丽的方式消散。

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45--50-blue)
![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)
![Based on: Burn My Windows](https://img.shields.io/badge/based%20on-Burn%20My%20Windows-orange)
[![Repository](https://img.shields.io/badge/repository-GitHub-black?logo=github)](https://github.com/SHADE-glitch/burn-my-windows)

## 📖 项目说明

本仓库是 **Simon Schneegans** 的 [**Burn My Windows**](https://github.com/Schneegans/Burn-My-Windows) 的**个人维护分支**，冻结在上游 **v48** 版本，以 `burn-my-windows@local` 为 UUID 在本地维护。

本项目**与上游作者无关**，也未获得其背书。本分支完整保留上游功能，重点修复**稳定性、资源管理与启动性能**问题——即那些难以复现、却会在长时间运行的 GNOME Shell 会话中逐渐劣化体验的潜在 bug 与泄漏。

## ✨ 功能特性

- **26 种着色器特效**，用于窗口打开/关闭动画 —— Apparition、Aura Glow、Broken Glass、Doom、Energize A/B、Fire、Focus、Glide、Glitch、Hexagon、Incinerate、Matrix、Mushroom、Paint Brush、Pixelate、Pixel Wheel、Pixel Wipe、Portal、RGB Warp、Snap of Disintegration、Team Rocket、T-Rex Attack、TV Effect、TV Glitch、Wisps。全部通过 GLSL 着色器在 GPU 上渲染。
- **配置档（Profile）机制** —— 每个配置档可按应用、动画类型、窗口类型、配色方案以及**电源模式 / 电源配置档**匹配，从而在接电时使用重特效、在电池时使用轻特效。
- **libadwaita 偏好设置**，带实时预览，每种特效都有独立设置页。
- **34 种语言翻译**，包含简体与繁体中文。
- **UPower / PowerProfiles 集成**（通过 D-Bus），支持感知电源状态的配置档。

## 🧰 前置依赖

| 依赖 | 说明 |
|---|---|
| 系统 | Ubuntu（已在 Ubuntu 26.04 验证） |
| GNOME Shell | 45 – 50 |
| 构建工具 | `glib-compile-resources`、`glib-compile-schemas`、`make` |

## 📥 安装

本分支没有打包步骤，作为**本地扩展就地使用**：

```bash
sudo apt install libglib2.0-bin make   # glib-compile-resources / glib-compile-schemas

git clone https://github.com/SHADE-glitch/burn-my-windows.git ~/.local/share/gnome-shell/extensions/burn-my-windows@local
cd ~/.local/share/gnome-shell/extensions/burn-my-windows@local
make                     # 重新构建 GResource 包与 gschemas.compiled
gnome-extensions enable burn-my-windows@local
```

在 Wayland 下需注销后重新登录，GNOME Shell 才会加载扩展。

### 卸载

```bash
gnome-extensions disable burn-my-windows@local
rm -rf ~/.local/share/gnome-shell/extensions/burn-my-windows@local
```

## 🖱️ 使用

打开 **GNOME 设置 → 扩展 → Burn My Windows → 设置**。在预览列表中选择特效，再调整其参数。可创建配置档，将特效限定到特定应用、窗口类型或电源状态。

## ⚙️ 偏好设置

- **全局：** 当前配置档、预览特效、测试模式。
- **单特效：** 启用开关、动画时长及特效专属参数（颜色、缩放、速度等）。
- **配置档：** 按应用、动画类型、窗口类型、配色方案、电源模式与电源配置档匹配。

偏好对话框写两个地方。全局键落在 dconf 的 `/org/gnome/shell/extensions/burn-my-windows/`；
**每个配置档是一个独立的 keyfile**——`~/.config/burn-my-windows/profiles/<微秒时间戳>.conf`，
组名 `[burn-my-windows-profile]`。配置档不是"要先手动激活的预设"：扩展是**逐个窗口**挑一个来用。

**怎么选配置档。** 一个配置档上的所有约束必须同时成立；在所有命中的配置档里取优先级最高的，
再从它**已启用**的特效里随机取一个。优先级是算出来的，不是手工排序：

| 条件 | 加分 |
|---|---|
| 配置档的**高优先级**开关 | +100 |
| **Application** 一栏非空 | +10 |
| 动画类型 / 窗口类型 / 配色方案 / 电源模式 / 电源配置档 中每一个不是"任意"的 | +1 |

若无任何配置档命中，或命中的那个一个特效都没启用，窗口就走 GNOME 原生动画。只有普通窗口和
对话框会有特效——面板、dock、桌面永远不会。

**每个约束在比什么。**

| 下拉项 | 取值 | 比对对象 |
|---|---|---|
| Application | 自由文本，用 `|` 分隔 | 窗口的 `WM_CLASS`，统一转小写后按**整串相等**比较：`fire` 匹配不到 `firefox`。旁边的拾取按钮可以替你填好 |
| Animation Type（动画类型） | 任意 / 打开窗口 / 关闭窗口 | 这个窗口正在 map 还是 unmap |
| Window Type（窗口类型） | 任意 / 普通窗口 / 对话框窗口 | normal 与 dialog / modal-dialog |
| Color Scheme（配色方案） | 任意 / 默认配色 / 深色配色 | GNOME 的 `color-scheme`，即 `default` 与 `prefer-dark`；每次动画各读一次，所以跟随系统主题可用 |
| Power Mode（电源模式） | 任意 / 使用电池 / 外接电源 | UPower 的 `OnBattery`；**没有 UPower 时按"外接电源"处理** |
| Power Profile（电源配置档） | 任意 / 省电 / 平衡 / 性能 / 省电或平衡 / 平衡或性能 | `org.gnome.PowerProfiles` 的 `ActiveProfile`；**该守护进程不在时，受限的配置档不会命中** |

**预览与测试模式。** 预览无视约束，直接用你正在编辑的那个配置档，而且只在窗口**打开**时播——
下一次任意窗口关闭时这个请求就被清掉。测试模式把每段动画钉在 8000 ms 并锁住随机种子，好让截图可复现；
它是给测试脚手架用的，不是日常设置，用完请关回去。

**撤销自己调乱的东西。** 每个特效行都有一枚清除图标，把**这个特效的选项**在你正在编辑的那个配置档里
恢复默认；每个选项自己也仍有一枚单独的重置按钮。一个特效的按钮碰不到另一个特效的键，两枚按钮都不会
切换你当前用的配置档。重置的范围就是那个特效自己声明过的选项，所以以后新增的选项不用谁去登记就自动
被覆盖。

**每一行的说明从哪来。** 大多数选项行带一句说明，取的是这个设置项本来就声明好的文本，运行时读出来，
不是为这件事往界面里新写的句子——也因此它**不走翻译**：不管你的 GNOME 界面是什么语言，它都显示英文。
原本已经手写过一句的行保持原样，而特效的标题行故意不留说明："Use the fire effect." 压在标题为
*Fire* 的行下面，等于没说。

## 🛠️ 故障排查

**改了 `.js` 却没变化。** 禁用再启用扩展**不会**重新导入模块——缓存的 ESModule 保留旧代码。
Wayland 上必须**注销并重新登录**。`scripts/reload.sh` 会重新编译、切换扩展、跟读日志，并在
`extension.js` 或 `src/` 还有未提交改动时发出警告——而那正是"重载不可能已经生效"的情形。

**动画完全不播。** 按顺序检查：

1. **有没有**某个配置档至少启用了一个特效？新建的配置档只默认启用 `fire`。
2. 那个配置档命中这个窗口了吗？约束是全 AND，而且窗口必须是普通窗口或对话框——见上面
   **⚙️ 偏好设置**。
3. 是不是设了应用约束？它比较的是完整的 `WM_CLASS` 串，写半截永远匹配不上。别手打，用拾取按钮。
4. 测试模式是不是还开着？动画被钉死在 8 秒，看起来完全不是真实速度。

把所有特效都关掉时，扩展是**故意**不再插手动画的：窗口 map 会等概览完全退场，与原生 GNOME 一致。

**电池 / 电源配置档规则像是被无视了。** 这是写好的降级行为，不是检测失败：
`org.gnome.PowerProfiles` 不在时，带 **Power Profile** 约束的配置档不会命中；UPower 不在时，
**Power Mode** 约束按"外接电源"处理。一个受限的配置档绝不会靠一个验证不了的读数来命中。

**看日志。** shell 进程和偏好对话框是两个不同的 journald identifier：

```sh
journalctl -f -o cat --identifier=/usr/bin/gnome-shell | grep -F '[burn-my-windows@local]'
journalctl -f -o cat --identifier=org.gnome.Shell.Extensions | grep -iE 'burn-my|GJS|TypeError'
```

- `[burn-my-windows@local] expected <name> to be …` —— 某个 GNOME Shell 私有 API 在这个 GNOME
  版本上变了。先跑 `./test/headless/run.sh 01`；被盯的符号清单在
  [`docs/maintenance/shell-internal-api.md`](docs/maintenance/shell-internal-api.md) §5。
- `[burn-my-windows@local] shader warm-up failed for <nick>` —— 该特效的着色器在空闲预热时被驱动
  拒绝了。特效仍能用：着色器会在第一次真实动画时现建（一次小卡顿），预热会在配置档重载时重试。
- 启用时报 `An object is already exported for the interface …`，说明在没有 `disable()` 的情况下
  跑了第二次 `enable()`。这是上游行为，正常桌面流程走不到。

**重置。** profile keyfile 是你唯一的一份成果，重置前先复制：

```sh
cp -a ~/.config/burn-my-windows ~/bmw-profiles-backup
dconf reset -f /org/gnome/shell/extensions/burn-my-windows/   # 只影响全局键
```

删掉一个 profile 文件就是永久删除那个配置档。没有"整个配置档一键恢复默认"——每行上那枚特效级重置
按钮就是上限，上面那两条命令也只清全局键。从"先禁用试试"到"干净重装"
的分级回滚配方见 [MAINTENANCE.md](MAINTENANCE.md) §9。

## 🧪 测试

三层，必须按顺序跑。完整手册——每层能证明什么、不能证明什么，以及回滚配方——在
[MAINTENANCE.md](MAINTENANCE.md)，它如今把三张长期资产路由到 `docs/maintenance/`：私有 API
清单（[shell-internal-api.md](docs/maintenance/shell-internal-api.md)）、兼容分支矩阵
（[compat-matrix.md](docs/maintenance/compat-matrix.md)）与观测判据／当前基线
（[measurement.md](docs/maintenance/measurement.md)）。

```bash
npm run check && npm test          # L0 静态：秒级，不需要显示器
./test/headless/run.sh all         # L1 headless：真 GNOME Shell，沙箱内，分钟级
./test/headless/run.sh 01          # GNOME 大版本升级后，从这里开始
```

| 层 | 能证明 | 不能证明 |
|---|---|---|
| **L0** 静态门 | 编译产物是否陈旧、26 个特效在 8 个登记点是否齐全、哨兵与补丁的簿记、合成栈帧下的接管分支 | 任何运行期行为 |
| **L1** headless 探针 | 18 个私有 API 在**当前** GNOME 上是否实存、每条兼容分支实际走哪条、着色器与 uniform 解析、真窗口逐个特效播放、disable 无残留、`enable()` 阻塞主线程的预算、动画被打断时 `begin_work`/`end_work` 是否配平 | 流畅度、GPU 绝对成本、特效好不好看 |
| **L2** 真实会话 | 人能看见的一切（需先注销重登） | 无可自动化 |

L1 完全隔离：私有 D-Bus socket、`GSETTINGS_BACKEND=memory`、独立的
`XDG_CONFIG_HOME` / `XDG_DATA_HOME` / `XDG_RUNTIME_DIR`；并且只要 `~/.config/dconf/user`、
profile 目录与工作树与开跑前不是逐字节一致，它就拒绝报绿。

## 🆚 相对上游的改动（v48）
下面每一项改动在 [CHANGELOG.md](CHANGELOG.md) 里有逐提交记录：kind、证据层级与提交号，
`npm run check:log` 会证明那份记录覆盖了窗口内每一笔动过 `extension.js` 或 `src/` 的提交。
"怎么验"仍然只归 `MAINTENANCE.md` 管，三段内容互不复述。


本分支在上游 v48 基线（`16ab10a`）之上新增维护提交。此处刻意不写死数量——
`git rev-list --count 16ab10a..HEAD` 才是权威，写死的数字总会漂移。

- **崩溃修复：** Incinerate/Pixel Wipe 的失效指针、Doom 的 `actor.height` 钳制、纹理绑定回调的空管线守卫、空 `meta_window` 守卫、`_doEnable()` 抛异常时回滚部分启用状态、概览克隆清理仅限所属克隆。
- **稳定性：** 动画结束处理器不再触碰已被销毁的窗口 actor——此前每次命中都会打出 3 条 `has been already disposed` critical。
- **资源泄漏：** Aura Glow/Fire 的信号处理器现遵循 `_isConnected` 守卫；偏好设置销毁时断开与确切窗口的连接；禁用时释放 `changed::active-profile` 与桌面 interface 设置对象；`realize` 幂等化。
- **性能 / 启动：** 同步启用并以延迟重试兜底；延迟启用时长由 4000ms 降至 1000ms；启用特效**与配置档匹配约束**均按配置档缓存（而非每次动画重读）；`common.glsl` 每个 shell 进程只解码一次（而非每个着色器一次）；着色器预热复用已缓存的启用列表，不再把同样 26 个键读第二遍；特效预设每个 widget realize 只构建一次；空闲着色器预热；缓存 UPower 与 PowerProfiles 代理。
- **电源处理：** UPower 不可用时容忍而非抛异常；守护进程缺失时受限电源配置档不再匹配——现在会在无人认领总线名时拒绝该代理，这条规则才真正成立。
- **GNOME 50 兼容性：** 私有 API 哨兵现已覆盖仅在运行期使用的符号（`_mapWindowDone`、`_destroyWindowDone`、`_lookupIndex`、`overlayEnabled`/`window_container` 访问器，以及 `WindowPreview`/`Workspace` 的实例字段），且采用的谓词不会在正常 shell 上误报；纠正了若干已不再符合 GNOME 50 的注释（`Meta.disable_unredirect_for_display` 已不存在、特效并非延迟构造、预热**不**编译 GLSL——已验证，构造后 `get_pipeline()` 仍为 `null`）。
- **偏好设置：** 颜色按钮改用 `set_rgba()` 而非已弃用的 `rgba` 属性，消除了每次打开对话框时为全部 29 个颜色按钮各打印一条的弃用告警；给对话框做装饰的那段控件树手术遇到缺失控件改为记一条 warn 后降级，不再在对话框还没建完时抛异常；每个特效行一键重置它自己的选项；选项行的说明句直接取该设置项本来就声明好的文本、运行时读出，不新增任何需要翻译的串；菜单的首页 / 反馈链接与 About 的网站 / 问题链接指回本仓库，而作者署名、许可证、捐赠与翻译队列的链接仍归上游。
- **迁移：** 异步迁移回调增加禁用后守卫；重试迁移时不再重复生成配置档。
- **构建：** 从编译后的资源包里恢复出当初只剩在包里的那批着色器 / UI / 资源源文件（那时是 74 个），并新增 `Makefile`，让提交进仓库的 bundle 与 schema 不可能落后于它们的源文件。
- **清理：** 移除死代码（`getUIDir()`、`Shader._time`、注释掉的 `mushroom-8bit-enable` 键），并删掉 4 个没有任何 shipped 文本指名的图标——资源清单里再多一个这种条目，常设检查就会红。

## 🤝 参与贡献

欢迎提交 Issue 与 Pull Request。请保持改动范围聚焦，并针对上述 GNOME Shell 版本进行测试。

## 🙏 致谢与来源说明

本扩展是 **Simon Schneegans** 的 **Burn My Windows** 的**维护分支**。原始设计、着色器、特效与偏好设置均出自其手。

- **上游：** [Schneegans/Burn-My-Windows](https://github.com/Schneegans/Burn-My-Windows) —— 许可证 **GPL-3.0-or-later**
- **上游作者：** Simon Schneegans
- **分支基线：** 上游 **v48**（提交 `16ab10a`，"baseline: v48 upstream fork, before fixes"）
- **其他版权：** Team Rocket 特效版权归 Justin Garza 所有。

## ⚖️ 许可证

本项目采用 **GNU 通用公共许可证 v3.0 或更高版本** —— 见 [LICENSE](LICENSE)。

作为 Burn My Windows 的衍生作品，本分支继续沿用 GPL-3.0-or-later，并保留上游版权声明。

© Simon Schneegans 及贡献者；分支修改 © SHADE-glitch。
