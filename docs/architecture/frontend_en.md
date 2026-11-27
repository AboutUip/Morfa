# Frontend Architecture

> 中文原文：[frontend.md](frontend.md)
>
> Status: M1 accounts, VCode, profile panel, realtime channel, and reusable loading screen implemented · Last updated: 2026-11-26

## Technology choices

| Item | Choice | Status |
| --- | --- | --- |
| Framework | React 19 + TypeScript | Integrated |
| Build | Vite 8 | Integrated |
| Routing | React Router | Recommended |
| Server state | TanStack Query | Recommended |
| Client state | Zustand (editor state designed separately) | Recommended |
| Styling | CSS Modules + CSS Variables (design tokens) | Adopted |
| Testing | Vitest + Testing Library; Playwright for E2E | Recommended |
| i18n | i18next + react-i18next | Integrated; see [i18n guidelines](../design/i18n_en.md) |
| Splash animation | SplashScreen + locally synthesized metallic sound effect + fade-out | Implemented |
| Agent streaming protocol | XAIOP browser SDK | Vendored; application integration not started; see [XAIOP integration](../integrations/xaiop_en.md) |

Dependencies are version-locked when M1 is set up and written into `apps/web/package.json`; XAIOP is an exception, registered as `@bylan280/xaiop` through the root workspace but not yet declared in the application package, so the version declaration must be added before business code first `import`s it.

## Directory conventions

```text
apps/web/
├─ public/                 # Static assets (favicon, manifest)
├─ src/
│  ├─ app/                 # Entry, routing, global providers, error boundaries
│  ├─ components/          # Presentational components reused across features
│  ├─ features/            # Feature modules organized by business domain
│  ├─ lib/                 # Shared utilities, hooks, API client, WebSocket realtime client
│  ├─ locales/             # zh-CN / en-US copy resources
│  ├─ styles/              # Design tokens, themes, global styles
│  └─ assets/              # Images and fonts that participate in the build
└─ README.md
```

### Feature modules

```text
features/
├─ auth/                   # AuthProvider, sign-in / sign-up, VCode setup gate (implemented)
├─ profile/                # Profile panel, profile editing, model providers, model tests, API Key / MCP, export and cancellation (implemented)
├─ projects/               # Project home page and top bar (implemented)
├─ editor/                 # Canvas, layers, properties panel, keyboard shortcuts (planned)
├─ agent/                  # Conversation, run status, change preview (planned)
└─ settings/               # Theme, language, account settings (planned)
```

`App` currently renders `projects/ProjectsPage` and the `SplashScreen` splash layer at the same time; account state is restored by `auth/AuthProvider` at app startup through `/api/auth/me`. The cross-feature `components/VCodeModal` provides a 3×4 numeric keypad, 6-digit auto-confirm, physical keyboard input, a focus trap, and focus restoration; `components/PasswordModal` provides current-password verification, sequential operations, and the same focus management; `components/ModelTestModal` and `components/ModelEditModal` host real model invocation tests and capability configuration respectively, reusing the same enter / exit animations and focus management. The profile panel organizes profile, export, and cancellation flows through `features/profile`; `features/profile/ApiTab.tsx` handles MCP API Keys, permission toggles, the llms.txt link, and the capability catalog.

The realtime channel is managed as a singleton by `lib/realtime/client.ts`: one WebSocket per tab, responsible for request / response, subscriptions, heartbeat, and exponential-backoff reconnection. `AuthProvider` fetches a preference snapshot once after sign-in and subscribes to `preferences.changed`; when MCP, HTTP PATCH, or another tab changes preferences, the server pushes directly to online pages, with no focus throttling or periodic polling. When the top bar switches theme or language, it submits over WebSocket first and falls back to one-shot HTTP when the connection is unavailable. See [Realtime channel](realtime_en.md).

Agent streaming payloads (planned) are parsed by the XAIOP browser SDK. XAIOP is an encoding / checkpoint layer for structured data; it will later reuse the single WebSocket realtime channel instead of adding a separate SSE path. Event mapping and endpoints are not implemented yet; see [XAIOP integration](../integrations/xaiop_en.md).

Rules:

- `features/*` may reference each other only through public entry points; deep cross-module imports are forbidden.
- `components/` does not depend on any specific business domain and can be used by any feature.
- `lib/` does not depend on React components; pure functions are preferred for testability.
- The design document schema and API types are imported from `@morfa/shared` to avoid duplicate definitions.

## Startup and loading

The entry point is `src/main.tsx`, which initializes i18n and the theme provider before rendering. `App` renders `ProjectsPage` and the splash layer at the same time:

- `components/SplashScreen.tsx`: makes the Logo appear quickly in the center of the screen after the page opens;
- plays the metallic sound effect in `public/audio/splash-metal.mp3`;
- when the sound starts, the Logo moves left while the `|` and `Morfa` wordmark on the right reveal through a mask / translation;
- when finished, only the splash layer fades out; the main page stays mounted behind it the whole time, with no page transition.

`LoadingScreen`, `LoadingOverlay`, and `lib/loading/` are still kept as a reusable loading UI and progress subscription source for other asynchronous flows; they no longer participate in the startup flow.

## State management

Split state into three layers so not everything ends up in one store:

1. **Server state**: projects, design documents, and run records, with TanStack Query managing caching, invalidation, and retries.
2. **Editor session state**: selection, zoom, panel visibility, and dragging state, maintained with Zustand or inside the editor.
3. **Persisted preferences**: theme and language, written to `localStorage` and synced to `<html>` attributes.

The design document itself follows the command / patch model, with the undo stack separated from document state so Agent changes and manual edits share a single commit path.

## Routing (planned)

| Path | Page |
| --- | --- |
| `/` | Home / project entry |
| `/projects` | Project list |
| `/projects/:projectId` | Design editor |
| `/settings` | Personal settings (theme, language, account) |
| `/share/:token` | Read-only share preview (later) |

The routing layer loads the corresponding feature and sets `<html lang>` and the page title; whether to use locale-prefixed paths is an open question in the [i18n guidelines](../design/i18n_en.md).

## Styling and theming

- All colors, spacing, corner radii, fonts, and shadows come from design tokens; components contain no magic values.
- Themes switch through CSS Variables using `data-theme` and `color-scheme`; see [Theming guidelines](../design/theming_en.md).
- Prefer Flex / Grid for layout; responsive breakpoints are maintained centrally in design tokens.
- Canvas content theme and application UI theme are independent, so dark mode cannot accidentally alter the user's design.

## Internationalization

- All user-facing copy goes through `t()`; never hard-code Chinese or English in JSX.
- Format dates, numbers, and currencies with `Intl`; do not concatenate them manually.
- Language switching takes effect immediately and updates `<html lang>`, the document title, and `localStorage`.
- See [i18n guidelines](../design/i18n_en.md).

## Mobile and desktop

- **Layout**: The project page fills the viewport width, and desktop and mobile share the same React components; only CSS breakpoints adjust spacing, font sizes, and dialog presentation.
- **Viewport**: `index.html` uses `viewport-fit=cover`, and styles adapt to notches and bottom gesture areas through `env(safe-area-inset-*)`; the root container uses `100dvh` to avoid height jumps caused by the mobile browser address bar.
- **Sign-in / sign-up**: A centered dialog on desktop; at `max-width: 640px` it becomes a bottom sheet with a drag handle and safe-area bottom padding.
- **Touch**: Primary buttons on mobile are at least 44px tall, and icon buttons have enlarged hit areas; form inputs use `font-size: 16px` to avoid automatic zoom when focused on iOS.
- **Scrolling**: Pages and dialogs use `overscroll-behavior` and `-webkit-overflow-scrolling: touch` respectively to prevent scroll bleed-through.
- **PWA basics**: `site.webmanifest` declares standalone, the start URL, any orientation, and 192/512 icons; whether to add a Service Worker and offline caching is deferred.
- **Breakpoints**: `640px` (bottom-sheet dialogs, top-bar touch optimization), `700px` (project page spacing and headings), `380px` (top-bar compression on very narrow screens).

## Accessibility

- Prefer native semantic elements for interactive elements; custom controls must supply `role`, keyboard handling, and focus management.
- Never remove focus styles; only enhance visibility.
- WCAG AA is the minimum contrast requirement; theme reviews must cover both themes.
- Animations respect `prefers-reduced-motion`.

## Performance

- Route-level and panel-level code splitting; the editor core and Agent panel load separately.
- The canvas avoids unnecessary full re-renders; selector subscriptions use the smallest state slice.
- Use appropriately sized images in modern formats; static assets follow a caching strategy.
- Define performance budgets (first screen, interaction latency, frame rate) and track them in CI.

## Testing strategy

| Level | Tool | Focus |
| --- | --- | --- |
| Unit | Vitest | Utility functions, schema validation, state transitions |
| Component | Testing Library | Forms, theme / language switching, accessibility |
| E2E | Playwright | Sign-in, project creation, edit and save, core Agent flows |

## Open questions

- The canvas rendering approach and the editor state model.
- Whether to adopt Tailwind or another atomic styling approach (currently leaning toward CSS Modules + tokens).
- Whether route-level i18n needs a URL prefix (affects share links and SEO).
- A unified merge strategy for the editor undo stack and Agent patches.
