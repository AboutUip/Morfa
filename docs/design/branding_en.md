# Brand Guidelines

> 中文原文：[branding.md](branding.md)
>
> Status: Established · Last updated: 2026-11-25

## Logo composition

The Morfa logo consists of two parts:

- **Twin-peak M**: formed by a continuous folded ribbon, symbolizing the round trip between design and implementation and the collaboration between Agent and human.
- **Four-pointed star**: in the top-right corner, representing AI assistance and inspiration; it is part of the logo and must not be omitted.

The logo uses a white-to-silver-gray gradient and has no separate full-color brand color. It is a "light logo", designed for dark interfaces.

## Backgrounds and variants

| Background | Version to use | Notes |
| --- | --- | --- |
| Dark (`#0B0F14` or darker) | `branding/logo-mark.png` | Transparent background; display as-is |
| Light / uncertain background | `branding/logo-badge.png` | Dark square base to guarantee contrast |
| App icon / favicon | `branding/icons/*` | Dark base, scaled proportionally |
| Documentation and README | `<picture>` switching by theme | Transparent logo for dark, badge for light |

Do not place the transparent logo directly on a white or light-gray background — the logo will lose contrast.

## Whitespace and sizing

- **Safe whitespace**: keep at least 25% of the logo width on all sides, free from text, borders, or other graphics.
- **Minimum sizes**:
  - Transparent logo: at least 160 px wide in digital contexts.
  - Badge: at least 96 px.
  - favicon: use the provided 16 / 32 / 48 sizes; do not compress to smaller sizes yourself.
- The logo is horizontally centered by default; when paired with a title, the logo sits above and the title below, with at least 24 px between them.

## Prohibited uses

- Do not stretch, squash, rotate, or skew the logo.
- Do not change the gradient direction, colors, or opacity.
- Do not add strokes, outer glows, drop shadows, textures, or 3D effects.
- Do not crop out the four-pointed star, or use the star alone as an icon.
- Do not overlay the logo on complex images, gradients, or high-contrast textures.
- Do not use unauthorized older, redrawn, or AI-generated variants.

## Asset inventory

| Asset | Path | Purpose |
| --- | --- | --- |
| Original logo | [`branding/logo.png`](../../branding/logo.png) | Design source; retains transparent whitespace |
| Transparent logo | [`branding/logo-mark.png`](../../branding/logo-mark.png) | Dark backgrounds |
| Dark badge | [`branding/logo-badge.png`](../../branding/logo-badge.png) | Light backgrounds, share images |
| favicon | [`branding/icons/favicon.ico`](../../branding/icons/favicon.ico) | Browser tabs |
| App icons | [`branding/icons/`](../../branding/icons/) | PWA, iOS, Android |

Asset descriptions and derivation parameters are documented in [`branding/README.md`](../../branding/README.md).

## Using the assets in the project

- **README / documentation**: use `<picture>` to switch between the transparent logo and the badge based on `prefers-color-scheme`.
- **Web app**: `branding/icons/` is already copied to `apps/web/public/`, and `index.html` declares the favicon and Apple Touch Icon; import the in-app logo from `src/assets` or copy the brand assets.
- **Share images**: later generate a 1200 × 630 Open Graph image from `logo-badge.png`, keeping the dark background and safe whitespace.
- **Email / external pages**: use the badge version; do not reference repository-relative paths directly.

## To be added

- Vector masters (SVG / AI / Figma source files).
- Horizontal lockup (logo + Morfa wordmark).
- Open Graph share image and social avatar.
- A dark logo version specifically for light backgrounds (requires design approval; do not invert colors on your own).
