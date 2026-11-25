# Maple Mono CN

Morfa 的界面等宽字体。

| 项 | 值 |
| --- | --- |
| 字体 | Maple Mono CN |
| 上游 | <https://github.com/subframe7536/maple-font> |
| 版本 | `7.9` |
| 许可证 | SIL Open Font License 1.1，见 [`OFL.txt`](OFL.txt) |
| 字重 | Regular `400`、SemiBold `600` |
| 格式 | WOFF2 |

## 选择原因

- 等宽，英文与中文都覆盖，中文按 2:1 宽度设计。
- 无衬线，带圆角与较柔和的笔画，视觉上不会过锐。
- 适合设计工具中的标题、标签与后续 Agent / 代码文本。

## 子集说明

为控制加载体积，字体已使用 `fonttools` 子集化，保留：

- ASCII、Latin-1；
- 常用标点、CJK 标点、全角字符、货币与箭头符号；
- GB2312 一级汉字（约 3755 字）；
- 当前 Web UI 源码中出现的全部字符。

未包含的生僻字会回退到系统字体。完整字体请从上游 release 下载 `MapleMono-CN.zip`。

## 使用

```css
@font-face {
  font-family: "Maple Mono CN";
  src: url("../assets/fonts/maple-mono/maple-mono-cn-regular.woff2")
    format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
```

字体通过 `apps/web/src/styles/fonts.css` 注册，并由 `--mf-font-sans` / `--mf-font-mono` 使用。

## 更新字体

1. 从上游 Release 下载对应版本的 `MapleMono-CN.zip`。
2. 提取 Regular 与 SemiBold TTF，以及 `LICENSE.txt`。
3. 使用 `fonttools` 子集化并转为 WOFF2，保留上述字符集。
4. 更新本文件的版本号，并更新 `docs/design/typography.md`。
5. 检查中英文、标点与粗体的实际渲染。
