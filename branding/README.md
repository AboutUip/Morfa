# Morfa 品牌资产

本目录保存 Morfa 的标志与图标。原始文件 [`logo.png`](logo.png) 是唯一设计源；其余文件由它派生。

## 标志

双峰 `M` 与右上角的四角星，使用白色至银灰渐变，适合放置在深色背景上。

## 文件

| 文件 | 尺寸 | 背景 | 用途 |
| --- | --- | --- | --- |
| [`logo.png`](logo.png) | 1254 × 1254 | 透明 | 原始设计源，保留不修改 |
| [`logo-mark.png`](logo-mark.png) | 817 × 577 | 透明 | 深色背景上的标志（README 深色模式、深色 UI） |
| [`logo-badge.png`](logo-badge.png) | 1024 × 1024 | `#0B0F14` | 浅色背景、社交分享、应用图标基底 |
| [`icons/favicon.ico`](icons/favicon.ico) | 16 / 32 / 48 | `#0B0F14` | 浏览器 favicon |
| [`icons/favicon.png`](icons/favicon.png) | 64 × 64 | `#0B0F14` | 现代浏览器备用 favicon |
| [`icons/apple-touch-icon.png`](icons/apple-touch-icon.png) | 180 × 180 | `#0B0F14` | iOS 主屏图标 |
| [`icons/icon-192.png`](icons/icon-192.png) | 192 × 192 | `#0B0F14` | PWA / Android 图标 |
| [`icons/icon-512.png`](icons/icon-512.png) | 512 × 512 | `#0B0F14` | PWA / 应用清单图标 |

## 派生方式

- 从原图按内容边界裁切（`218, 318, 817 × 577`），去掉大面积透明留白。
- 清理背景噪点：将 `alpha < 240` 的像素置为完全透明，避免深色背景上出现浅色残影。
- 徽标画布：1024 × 1024，背景 `#0B0F14`，标志宽度 700 px 居中。
- 图标由徽标等比缩放生成；`.ico` 内含 16 / 32 / 48 三种尺寸。

如果替换 `logo.png`，需要重新生成上述派生文件，并同步更新 [品牌规范](../docs/design/branding.md)。

## 使用要求

- 透明标志仅用于深色背景；浅色背景使用 `logo-badge.png` 或图标版本。
- 不拉伸、不旋转、不改变渐变方向、不添加描边或投影。
- 保留四角星，不单独裁切或拆分为其他图形。
- 最小展示宽度：徽标 96 px，透明标志 160 px。
- 四周留白不少于标志宽度的 25%。

完整规范见 [docs/design/branding.md](../docs/design/branding.md)。
