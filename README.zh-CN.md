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

## 🧪 测试

三层，必须按顺序跑。完整手册——每层能证明什么、不能证明什么，私有 API 清单、兼容分支矩阵、
回滚配方——都在 [MAINTENANCE.md](MAINTENANCE.md)。

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

## ⚙️ 偏好设置

- **全局：** 当前配置档、预览特效、测试模式。
- **单特效：** 启用开关、动画时长及特效专属参数（颜色、缩放、速度等）。
- **配置档：** 按应用、动画类型、窗口类型、配色方案、电源模式与电源配置档匹配。

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
- **偏好设置：** 颜色按钮改用 `set_rgba()` 而非已弃用的 `rgba` 属性，消除了每次打开对话框时为全部 29 个颜色按钮各打印一条的弃用告警。
- **迁移：** 异步迁移回调增加禁用后守卫；重试迁移时不再重复生成配置档。
- **构建：** 从编译后的资源包中恢复 74 个着色器/UI/资源源文件，并新增 `Makefile`。
- **清理：** 移除死代码（`getUIDir()`、`Shader._time`、注释掉的 `mushroom-8bit-enable` 键）。

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
