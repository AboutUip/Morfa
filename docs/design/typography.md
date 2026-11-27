# 字体与排版

> 状态：已接入 · 最后更新：2026-11-25
>
> English: [typography_en.md](typography_en.md)

## 当前字体

Morfa 使用 **Maple Mono CN** 作为界面字体与等宽字体。

| 项 | 值 |
| --- | --- |
| 上游 | <https://github.com/subframe7536/maple-font> |
| 版本 | `7.9` |
| 字形 | 等宽、无衬线、圆角、较柔和的笔画 |
| 语言 | 拉丁字母 + 简体中文（中文按 2:1 宽度设计） |
| 字重 | Regular `400` / SemiBold `600` |
| 许可证 | SIL Open Font License 1.1 |

选择原因：同时满足「等宽、中英文覆盖、无衬线、不过度锐利」四个条件；圆角与较柔和的字形适合设计工具的界面与后续 Agent 输出。

## 文件

```text
apps/web/src/assets/fonts/maple-mono/
├─ maple-mono-cn-regular.woff2    # 400，约 0.98 MB
├─ maple-mono-cn-semibold.woff2   # 600，约 1.01 MB
├─ OFL.txt                        # SIL OFL 1.1 全文
└─ README.md                      # 来源、子集与更新说明
```

许可证同时复制到 `apps/web/public/fonts/OFL.txt`，可通过 `/fonts/OFL.txt` 访问。

字体在 `apps/web/src/styles/fonts.css` 中通过 `@font-face` 注册，并优先用于：

```css
--mf-font-sans: "Maple Mono CN", ...;
--mf-font-mono: "Maple Mono CN", ...;
```

## 子集策略

完整 CJK 字体体积过大，因此当前文件使用 `fonttools` 子集化：

- ASCII、Latin-1
- 常用标点、CJK 标点、全角字符、货币与箭头
- GB2312 一级汉字（约 3755 字）
- Web UI 源码中出现的全部字符

生僻字会回退到系统字体。正文展示、用户昵称与未来设计内容应允许字体回退，不应假定所有汉字都存在于子集内。

## 性能

- 使用 WOFF2，`font-display: swap`。
- 两个文件合计约 2 MB；应用启动阶段会提前触发字体请求，进入项目页时通常已完成。
- 不从第三方 CDN 加载，避免运行时外部依赖与隐私问题。
- 后续可根据实际字符覆盖情况拆分 `unicode-range` 或提供完整字体下载。

## 使用规则

- 保持 `400` / `600` 两档字重，不人为拉伸或压缩字形。
- 标题可使用负字距；正文不要过度收紧，保持等宽字体的呼吸感。
- 中文与英文混排时依靠字体本身的 2:1 比例，不手动插入额外空格。
- 代码块、Agent 输出与固定宽度信息优先使用 `--mf-font-mono`。
- 不得单独售卖字体文件；分发时保留 `OFL.txt` 与版权声明。

## 更新流程

1. 从上游 Release 下载对应版本的 `MapleMono-CN.zip`。
2. 提取 Regular / SemiBold 与 `LICENSE.txt`。
3. 按当前字符集使用 `fonttools` 子集化为 WOFF2。
4. 替换字体文件与 `OFL.txt`，更新字体目录 README 与本文档的版本号。
5. 检查中英文、标点、粗体与移动端布局。
