<p align="right"><a href="README.md">English</a> | <a href="README.zh-CN.md"><b>简体中文</b></a></p>

# Burn My Windows —— 本地维护分支

让你的窗口以华丽的方式消散。

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45--50-blue)
![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)
![Based on: Burn My Windows](https://img.shields.io/badge/based%20on-Burn%20My%20Windows-orange)

## 项目说明

本仓库是 **Simon Schneegans** 的 [**Burn My Windows**](https://github.com/Schneegans/Burn-My-Windows) 的**个人维护分支**，冻结在上游 **v48** 版本，以 `burn-my-windows@local` 为 UUID 在本地维护。

本项目**与上游作者无关**，也未获得其背书。本分支完整保留上游功能，重点修复**稳定性、资源管理与启动性能**问题——即那些难以复现、却会在长时间运行的 GNOME Shell 会话中逐渐劣化体验的潜在 bug 与泄漏。

## 功能特性

- **26 种着色器特效**，用于窗口打开/关闭动画 —— Apparition、Aura Glow、Broken Glass、Doom、Energize A/B、Fire、Focus、Glide、Glitch、Hexagon、Incinerate、Matrix、Mushroom、Paint Brush、Pixelate、Pixel Wheel、Pixel Wipe、Portal、RGB Warp、Snap of Disintegration、Team Rocket、T-Rex Attack、TV Effect、TV Glitch、Wisps。全部通过 GLSL 着色器在 GPU 上渲染。
- **配置档（Profile）机制** —— 每个配置档可按应用、动画类型、窗口类型、配色方案以及**电源模式 / 电源配置档**匹配，从而在接电时使用重特效、在电池时使用轻特效。
- **libadwaita 偏好设置**，带实时预览，每种特效都有独立设置页。
- **34 种语言翻译**，包含简体与繁体中文。
- **UPower / PowerProfiles 集成**（通过 D-Bus），支持感知电源状态的配置档。

## 前置依赖

| 依赖 | 说明 |
|---|---|
| GNOME Shell | 45 – 50 |
| 构建工具 | `glib-compile-resources`、`glib-compile-schemas`（包名 `glib2` / `libglib2.0-bin`） |

## 安装

本分支没有打包步骤，作为**本地扩展就地使用**：

```bash
git clone <你的仓库地址> ~/.local/share/gnome-shell/extensions/burn-my-windows@local
cd ~/.local/share/gnome-shell/extensions/burn-my-windows@local
make                     # 重新构建 GResource 包与 gschemas.compiled
gnome-extensions enable burn-my-windows@local
```

在 Wayland 下需注销后重新登录，GNOME Shell 才会加载扩展。

## 使用

打开 **GNOME 设置 → 扩展 → Burn My Windows → 设置**。在预览列表中选择特效，再调整其参数。可创建配置档，将特效限定到特定应用、窗口类型或电源状态。

## 偏好设置

- **全局：** 当前配置档、预览特效、测试模式。
- **单特效：** 启用开关、动画时长及特效专属参数（颜色、缩放、速度等）。
- **配置档：** 按应用、动画类型、窗口类型、配色方案、电源模式与电源配置档匹配。

## 相对上游的改动（v48）

本分支在上游 v48 基线（`16ab10a`）之上新增 20 个提交：

- **崩溃修复：** Incinerate/Pixel Wipe 的失效指针、Doom 的 `actor.height` 钳制、纹理绑定回调的空管线守卫、空 `meta_window` 守卫、`_doEnable()` 抛异常时回滚部分启用状态、概览克隆清理仅限所属克隆。
- **资源泄漏：** Aura Glow/Fire 的信号处理器现遵循 `_isConnected` 守卫；偏好设置销毁时断开与确切窗口的连接；禁用时断开 `changed::active-profile`；`realize` 幂等化。
- **性能 / 启动：** 同步启用并以延迟重试兜底；延迟启用时长由 4000ms 降至 1000ms；启用特效按配置档缓存（而非每次动画）；特效预设每个 widget realize 只构建一次；空闲着色器预热；缓存 UPower 代理。
- **电源处理：** UPower 不可用时容忍而非抛异常；守护进程缺失时受限电源配置档不再匹配。
- **迁移：** 异步迁移回调增加禁用后守卫；重试迁移时不再重复生成配置档。
- **构建：** 从编译后的资源包中恢复 74 个着色器/UI/资源源文件，并新增 `Makefile`。
- **清理：** 移除死代码（`getUIDir()`、`Shader._time`、注释掉的 `mushroom-8bit-enable` 键）。

## 参与贡献

欢迎提交 Issue 与 Pull Request。请保持改动范围聚焦，并针对上述 GNOME Shell 版本进行测试。

## 致谢与来源说明

本扩展是 **Simon Schneegans** 的 **Burn My Windows** 的**维护分支**。原始设计、着色器、特效与偏好设置均出自其手。

- **上游：** [Schneegans/Burn-My-Windows](https://github.com/Schneegans/Burn-My-Windows) —— 许可证 **GPL-3.0-or-later**
- **上游作者：** Simon Schneegans
- **分支基线：** 上游 **v48**（提交 `16ab10a`，"baseline: v48 upstream fork, before fixes"）
- **其他版权：** Team Rocket 特效版权归 Justin Garza 所有。

## 许可证

本项目采用 **GNU 通用公共许可证 v3.0 或更高版本** —— 见 [LICENSE](LICENSE)。

作为 Burn My Windows 的衍生作品，本分支继续沿用 GPL-3.0-or-later，并保留上游版权声明。
