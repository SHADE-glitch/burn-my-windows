# 兼容分支矩阵与版本门控

本页是 burn-my-windows@local 三张长期资产页之一，从 `MAINTENANCE.md` 拆出（原 MAINTENANCE §6），
那里现在只留一行路由，正文只在这里维护。它回答的问题是：fork 踩在 GNOME Shell 私有接口上的
**8 处兼容分支**各自探测哪个 API、在 GNOME 50 上实际走哪条、某一行翻转的后果是什么，
以及版本门控本身（`src/utils.js` 的 `shellVersionIs()` / `shellVersionIsAtLeast()` 与每特效的
`static getMinShellVersion()`）为什么升到 GNOME 51 也不需要改。**动手之前先读
[MAINTENANCE.md](../../MAINTENANCE.md) §3（隔离 headless shell 的边界）与 [AGENTS.md](../../AGENTS.md)
（给 agent 的硬规则）**：这张表是由探针 01 的 `compat-matrix` 在沙箱里重测的，
绕过沙箱去动分支，既会污染真实会话，也会让比对本身失去意义。

---

## 6. 兼容分支矩阵：8 处，以及 GNOME 50 实际走哪条

探针 01 的 `compat-matrix` 会把这 8 行重新测一遍并与期望值比对；某一行翻转是**响的**，
提示你去读那条你刚开始走的分支（原来的 `if` 可能已变成死支）。

| 站点 | 探测的 API | GNOME 50 | 翻转的后果 |
| --- | --- | --- | --- |
| `src/Shader.js:122` | `Clutter.Timeline.prototype.set_actor` | 存在 | 时间线不再跟随 actor，动画走错时钟 |
| `src/Shader.js:136` | `Meta.disable_unredirect_for_display` | **不存在** → 走 else：`global.compositor.disable_unredirect()` | 全屏动画期间撕裂 |
| `src/Shader.js:193` | `Meta.enable_unredirect_for_display` | **不存在** → 走 else：`global.compositor.enable_unredirect()` | unredirect 永不恢复（注意：这段用 `disable` 的存在来决定是否调 `enable`） |
| `src/Shader.js:154` | `meta_window.is_maximized` | 存在（49 加入）→ 走 if | `uIsFullscreen` 错 → shader padding 错 |
| `src/Shader.js:219` | `Cogl.SnippetHook` | 存在 → Cogl 分支 | 所有 shader 构造失败 |
| `src/utils.js:141` | `shellVersionIsAtLeast(48,'beta')` | true → `St.ImageContent.set_data` 带 Cogl context | 5 个带贴图特效（paint-brush / matrix / broken-glass / snap / trex）纹理构造失败。**纠正**：`getImageResource()` 只在特效侧调用，`prefs.js` 完全不用它，所以旧写法"偏好设置预览图坏"是找错了人 |
| `src/utils.js:198` | `shellVersionIsAtLeast(47,'alpha')` | true → `Cogl.Color.from_string` | `parseColor` 抛 → 特效发黑 |
| `src/ShaderFactory.js:79` | `GObject.Object.new` | true（GJS 里几乎恒真，`newv` 是死支） | shader 根本构造不出来 |

版本门控本身在 `src/utils.js`：`shellVersionIs()` / `shellVersionIsAtLeast()`，
喂 `Config.PACKAGE_VERSION`，比较器对任何更高的 major 都返回 true，**所以升到 GNOME 51
不需要改它**。真正会隐形关掉一个特效的是**每特效**的门：`static getMinShellVersion()`
（26 个里最高 `[40, 0]`），由 `prefs.js` 用来过滤列表项。
