# 主题规范

> 状态：草案 · 最后更新：2026-11-25

## 目标

- 深色与浅色主题均为**原生一等能力**，不是后期覆盖。
- 默认跟随系统，支持手动切换为浅色或深色，并在刷新、跨标签页后保持。
- 首屏无主题闪烁（FOUC），且不依赖 JavaScript 完成基本配色。
- 应用界面主题与用户设计内容的主题相互独立。

## 主题模式

| 模式 | 行为 |
| --- | --- |
| `system` | 跟随 `prefers-color-scheme`，系统切换时实时响应 |
| `light` | 固定浅色 |
| `dark` | 固定深色 |

- 用户偏好存储在 `localStorage` 的 `morfa.theme`，取值为 `system | light | dark`。
- 实际生效的主题称为 **resolved theme**（`light | dark`），写入 `<html data-theme="...">`。
- 同时设置 CSS `color-scheme: light | dark`，让原生滚动条、表单控件与系统 UI 匹配。

## 设计令牌

采用三层令牌，组件只消费语义层：

1. **基础层（primitive）**：原始色板、字号、间距、圆角、阴影，不直接用于组件。
2. **语义层（semantic）**：表达用途，如背景、文本、边框、强调、危险、遮罩。
3. **组件层（component）**：少量组件专属变量，由语义层组合而来。

命名示例：

```css
:root {
  --mf-color-bg-canvas: #f7f7f8;
  --mf-color-bg-surface: #ffffff;
  --mf-color-text-primary: #1a1a1e;
  --mf-color-text-secondary: #5c5c66;
  --mf-color-border-subtle: #e5e5ea;
  --mf-color-accent: #4f46e5;
  --mf-color-accent-contrast: #ffffff;
}

[data-theme='dark'] {
  --mf-color-bg-canvas: #121216;
  --mf-color-bg-surface: #1b1b21;
  --mf-color-text-primary: #f2f2f5;
  --mf-color-text-secondary: #a6a6b2;
  --mf-color-border-subtle: #2c2c35;
  --mf-color-accent: #8b87ff;
  --mf-color-accent-contrast: #101014;
}
```

具体色值在视觉设计阶段确定，本文档只约束结构与用法。

规划文件：

```text
apps/web/src/styles/
├─ tokens.css        # 基础令牌（色板、尺寸、字体、动效）
├─ themes.css        # 浅色 / 深色语义变量映射
├─ global.css        # reset、基础排版、可访问性样式
└─ index.css         # 统一入口
```

## 初始化与切换

为防止刷新闪烁，在 `<head>` 中尽早执行一段内联脚本，读取偏好并设置属性：

```html
<script>
  (function () {
    try {
      var stored = localStorage.getItem('morfa.theme');
      var mode = stored === 'light' || stored === 'dark' ? stored : 'system';
      var dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document.documentElement.dataset.themeMode = mode;
    } catch (e) {}
  })();
</script>
```

运行时约定：

- 主题 Provider 维护 `mode` 与 `resolvedTheme`，暴露 `setMode`。
- 选择 `system` 时监听 `matchMedia('(prefers-color-scheme: dark)')` 的 `change` 事件。
- 监听 `storage` 事件，多标签页同步偏好。
- 切换时只更新根元素属性，不重建组件树。

## 使用规则

- 组件样式只引用语义令牌，禁止直接写十六进制颜色（画布内容与品牌插画除外）。
- 新增语义令牌必须同时补齐浅色与深色取值，并在评审中验证。
- 渐变、阴影、半透明遮罩需要分别定义，不能简单反色。
- 图片、插画与图标在深色模式下检查可读性；必要时提供主题化资源。
- 品牌标志为浅色渐变：透明版本仅用于深色背景，浅色主题使用深色底徽标，见 [品牌规范](branding.md)。
- 画布、预览与导出使用独立主题上下文，应用切换到深色不得改变用户设计本身。

## 可访问性

- 文本与背景对比度至少 4.5:1，大号文本至少 3:1。
- 焦点环、选中态、错误态在两套主题下都清晰可辨。
- 不仅依赖颜色传达状态，搭配图标或文案。
- 尊重 `prefers-reduced-motion`，主题切换动画可省略。

## 测试清单

- 首屏在深色偏好下无白色闪烁。
- `system / light / dark` 三态切换后刷新仍保持。
- 系统主题变化时，`system` 模式实时更新。
- 两个标签页之间的偏好同步。
- 表单控件、滚动条、日期选择器与原生控件配色正确。
- 两套主题下的核心页面截图对比与对比度检查。
