# 品牌规范

> 状态：已建立 · 最后更新：2026-11-25
>
> English: [branding_en.md](branding_en.md)

## 标志构成

Morfa 的标志由两部分组成：

- **双峰 M**：由连续折带构成，象征设计与实现的往返、Agent 与人的协作。
- **四角星**：位于右上角，代表 AI 辅助与灵感，是标志的一部分，不可省略。

标志使用白色至银灰的渐变，没有独立的彩色品牌色。它属于「浅色标志」，为深色界面设计。

## 背景与变体

| 背景 | 使用版本 | 说明 |
| --- | --- | --- |
| 深色（`#0B0F14` 或更暗） | `branding/logo-mark.png` | 透明背景，直接展示 |
| 浅色 / 不确定背景 | `branding/logo-badge.png` | 深色方形底，保证对比度 |
| 应用图标 / favicon | `branding/icons/*` | 深色底，等比缩放 |
| 文档与 README | `<picture>` 按主题切换 | 深色用透明标志，浅色用徽标 |

禁止把透明标志直接放在白色或浅灰背景上——标志会失去对比度。

## 留白与尺寸

- **安全留白**：四周至少保留标志宽度的 25%，不得被文字、边框或其他图形侵入。
- **最小尺寸**：
  - 透明标志：数字场景不小于 160 px 宽。
  - 徽标：不小于 96 px。
  - favicon：使用提供的 16 / 32 / 48 尺寸，不自行压缩到更小。
- 标志默认水平居中；与标题组合时，标志在上、标题在下，间距不小于 24 px。

## 禁止事项

- 不要拉伸、压扁、旋转或倾斜标志。
- 不要改变渐变方向、颜色或透明度。
- 不要添加描边、外发光、投影、纹理或 3D 效果。
- 不要裁掉四角星，或把四角星单独作为图标使用。
- 不要将标志叠加在复杂图片、渐变或高对比纹理上。
- 不要使用未经授权的旧版、重绘版或 AI 生成变体。

## 资产清单

| 资产 | 路径 | 用途 |
| --- | --- | --- |
| 原始标志 | [`branding/logo.png`](../../branding/logo.png) | 设计源，保留透明留白 |
| 透明标志 | [`branding/logo-mark.png`](../../branding/logo-mark.png) | 深色背景 |
| 深色徽标 | [`branding/logo-badge.png`](../../branding/logo-badge.png) | 浅色背景、分享图 |
| favicon | [`branding/icons/favicon.ico`](../../branding/icons/favicon.ico) | 浏览器标签页 |
| 应用图标 | [`branding/icons/`](../../branding/icons/) | PWA、iOS、Android |

资产说明与派生参数见 [`branding/README.md`](../../branding/README.md)。

## 在项目中使用

- **README / 文档**：使用 `<picture>` 按 `prefers-color-scheme` 切换透明标志与徽标。
- **Web 应用**：`branding/icons/` 已复制到 `apps/web/public/`，`index.html` 已声明 favicon 与 Apple Touch Icon；界面中的标志从 `src/assets` 导入或复制品牌资产。
- **分享图**：后续基于 `logo-badge.png` 生成 1200 × 630 的 Open Graph 图片，保持深色底与安全留白。
- **邮件 / 外部页面**：使用徽标版本，不直接引用仓库相对路径。

## 待补充

- 矢量母版（SVG / AI / Figma 源文件）。
- 横向组合标志（标志 + Morfa 字标）。
- Open Graph 分享图与社交头像。
- 浅色背景专用的深色标志版本（需设计确认，不自行反色）。
