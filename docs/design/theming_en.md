# Theming Guidelines

> 中文原文：[theming.md](theming.md)
>
> Status: Base implemented (`system` / `light` / `dark`) · Last updated: 2026-11-25

## Goals

- Dark and light themes are both **first-class native capabilities**, not later overrides.
- Follow the system by default, with manual switching to light or dark, persisted across refreshes and browser tabs.
- No theme flash on first paint (FOUC), and the basic color scheme does not depend on JavaScript.
- The application UI theme and the theme of user design content are independent of each other.

## Theme modes

| Mode | Behavior |
| --- | --- |
| `system` | Follow `prefers-color-scheme` and respond live when the system changes |
| `light` | Always light |
| `dark` | Always dark |

- The user preference is stored in `localStorage` under `morfa.theme`, with values `system | light | dark`; after sign-in it syncs to `user_preferences` and subscribes to `preferences.changed` on the realtime channel, applying changes initiated by the server (including MCP) immediately.
- The theme that actually takes effect is called the **resolved theme** (`light | dark`) and is written to `<html data-theme="...">`.
- CSS `color-scheme: light | dark` is set at the same time so native form controls and system UI match.
- Scrollbars are driven uniformly by `--mf-scrollbar`: WebKit / Chrome use an 8 px transparent track with a rounded thin thumb and hidden arrows; Firefox uses `scrollbar-width: thin` and `scrollbar-color`, staying understated but not hidden.

## Design tokens

Three token layers are used; components consume only the semantic layer:

1. **Primitive layer**: raw color palette, font sizes, spacing, radii, and shadows; not used directly by components.
2. **Semantic layer**: expresses purpose, such as background, text, border, accent, danger, and overlay.
3. **Component layer**: a small number of component-specific CSS variables composed from the semantic layer.

Naming example:

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

Concrete color values are determined during visual design; this document only constrains structure and usage.

Implementation files (theme state lives in `apps/web/src/lib/theme.tsx`):

```text
apps/web/src/styles/
├─ tokens.css        # Primitive tokens (palette, sizes, fonts, motion)
├─ themes.css        # Light / dark semantic variable mapping
├─ global.css        # Reset, base typography, accessibility styles
└─ index.css         # Unified entry
```

## Initialization and switching

To prevent flash on refresh, run an inline script as early as possible in `<head>` to read the preference and set attributes:

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

Runtime conventions:

- The theme provider maintains `mode` and `resolvedTheme` and exposes `setMode`.
- When `system` is selected, listen for the `change` event on `matchMedia('(prefers-color-scheme: dark)')`.
- Listen for the `storage` event to sync preferences across tabs.
- Switching only updates root element attributes and does not rebuild the component tree.
- Theme switches use a temporary root attribute to enable a 320 ms color transition and cross-fade the brand mark; the attribute is removed afterwards so regular hover / transform animations are unaffected.
- Respect `prefers-reduced-motion`: when reduced motion is enabled, switch immediately without the theme transition.

## Usage rules

- Component styles reference only semantic tokens; direct hex colors are forbidden (except canvas content and brand illustrations).
- New semantic tokens must include both light and dark values and be verified during review.
- Gradients, shadows, and translucent overlays must be defined separately, not simply inverted.
- Check the readability of images, illustrations, and icons in dark mode; provide themed assets when necessary.
- The brand logo is a light gradient: the transparent version is only for dark backgrounds; the light theme uses the badge on a dark base, see [Brand Guidelines](branding_en.md).
- Canvas, preview, and export use an independent theme context; switching the app to dark must not change the user's design itself.

## Accessibility

- Text and background contrast is at least 4.5:1, and at least 3:1 for large text.
- Focus rings, selected states, and error states are clearly distinguishable in both themes.
- Do not convey state through color alone; pair it with an icon or copy.
- Respect `prefers-reduced-motion`; the theme transition animation may be omitted.

## Test checklist

- No white flash on first paint under a dark preference.
- The `system / light / dark` choice survives a refresh.
- When the system theme changes, `system` mode updates live.
- Preference sync between two tabs.
- Form controls, scrollbars, date pickers, and native controls use correct colors.
- Screenshot comparison and contrast checks for core pages in both themes.
