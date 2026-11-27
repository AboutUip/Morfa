# Typography

> 中文原文：[typography.md](typography.md)
>
> Status: Integrated · Last updated: 2026-11-25

## Current typeface

Morfa uses **Maple Mono CN** as both the UI font and the monospace font.

| Item | Value |
| --- | --- |
| Upstream | <https://github.com/subframe7536/maple-font> |
| Version | `7.9` |
| Letterforms | Monospace, sans-serif, rounded, with softer strokes |
| Languages | Latin + Simplified Chinese (Chinese is designed at 2:1 width) |
| Font weights | Regular `400` / SemiBold `600` |
| License | SIL Open Font License 1.1 |

Why it was chosen: it satisfies four criteria at once — monospace, Chinese and English coverage, sans-serif, and not overly sharp. The rounded, softer letterforms suit a design tool's UI and future Agent output.

## Files

```text
apps/web/src/assets/fonts/maple-mono/
├─ maple-mono-cn-regular.woff2    # 400, about 0.98 MB
├─ maple-mono-cn-semibold.woff2   # 600, about 1.01 MB
├─ OFL.txt                        # Full SIL OFL 1.1 text
└─ README.md                      # Origin, subset, and update notes
```

The license is also copied to `apps/web/public/fonts/OFL.txt` and is available at `/fonts/OFL.txt`.

The font is registered through `@font-face` in `apps/web/src/styles/fonts.css` and is preferred for:

```css
--mf-font-sans: "Maple Mono CN", ...;
--mf-font-mono: "Maple Mono CN", ...;
```

## Subsetting strategy

A complete CJK font is too large, so the current files are subset with `fonttools`:

- ASCII, Latin-1
- Common punctuation, CJK punctuation, full-width characters, currency symbols, and arrows
- GB2312 Level 1 Hanzi (about 3,755 characters)
- All characters that appear in the Web UI source

Rare characters use a system fallback font. Body copy, user nicknames, and future design content should allow font fallback; do not assume every Hanzi is present in the subset.

## Performance

- WOFF2 with `font-display: swap`.
- The two files total about 2 MB; the font request is triggered early during app startup and is usually complete by the time the project page opens.
- Not loaded from a third-party CDN, avoiding runtime external dependencies and privacy concerns.
- Later, `unicode-range` can be split based on actual character coverage, or a full font download can be offered.

## Usage rules

- Keep the two weights, `400` / `600`; do not artificially stretch or compress letterforms.
- Headings may use negative letter-spacing; do not tighten body text excessively — keep the breathing room of a monospace font.
- In mixed Chinese and English text, rely on the font's own 2:1 proportions; do not insert extra spaces manually.
- Prefer `--mf-font-mono` for code blocks, Agent output, and fixed-width information.
- Do not sell the font files separately; retain `OFL.txt` and the copyright notice when distributing.

## Update process

1. Download the matching version of `MapleMono-CN.zip` from the upstream release.
2. Extract Regular / SemiBold and `LICENSE.txt`.
3. Subset to WOFF2 with `fonttools` using the current character set.
4. Replace the font files and `OFL.txt`, and update the font directory README and the version number in this document.
5. Check Chinese and English, punctuation, bold, and mobile layouts.
