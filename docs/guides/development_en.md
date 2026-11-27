# Development Guide

> 中文原文：[development.md](development.md)
>
> Status: Draft · Last updated: 2026-11-26

## Environment requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | >= 22.12 (current LTS recommended) | Check with `node --version` |
| npm | >= 10 | Installed with Node.js; the project uses npm workspaces |
| Git | Latest stable | Confirm line-ending configuration before committing |
| SQLite | Bundled by dependencies | No separate CLI tool required |

Windows, macOS, and Linux are supported. Scripts should remain cross-platform and must not depend on bash-only commands.

## Current state

The repository is at M1: the web project page, splash animation, account registration / login, profile panel, model providers and testing, API keys / MCP, the single WebSocket realtime channel, and encrypted export / import are available; project creation, the editor, and Agent capabilities are still pending.

### Available commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install all workspace dependencies (including the vendored XAIOP) |
| `npm run dev` | Start web and API in parallel (`5173` / `3001`) |
| `npm run dev:web` | Start the frontend only |
| `npm run dev:server` | Start the backend only (`tsx watch`) |
| `npm run build` | Web build + server type check |
| `npm run preview` | Preview the production web build |
| `npm run typecheck` | TypeScript checks for web and server |
| `npm run xaiop:build` | Compile the XAIOP SDK to `vendor/xaiop/.../dist` |
| `npm run xaiop:test` | Compile and run the full upstream XAIOP test suite |
| `npm run xaiop:check` | Validate the Node / browser / core entries and fixture parsing |

### Remaining M1 commands

| Command | Purpose |
| --- | --- |
| `npm run lint` | Code linting |
| `npm run format` | Formatting |
| `npm run test` | Unit and integration tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:migrate` | Standalone migration command (migrations currently run automatically at server startup) |

Once these commands land, this table and the root `package.json` must stay in sync.

## First-time setup

```bash
git clone https://github.com/AboutUip/Morfa.git Morfa
cd Morfa
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. After the splash animation, the project page should appear. The API runs at `127.0.0.1:3001` by default.

- The SQLite database lives at `apps/server/data/morfa.sqlite` (not committed); migrations run automatically at server startup.
- Avatar files live in `apps/server/data/uploads/avatars/`; the database stores only relative paths.
- No `.env` is currently required; set `PORT`, `HOST`, `DATA_DIR`, or `DATABASE_PATH` to override the port or data directory.

## Startup and loading flow

The web startup now uses a splash animation; `App` mounts both `ProjectsPage` and `SplashScreen`:

- `components/SplashScreen.tsx`: the logo appears quickly in the center of the screen and plays a synthesized metallic sound;
- while the sound plays, the logo shifts left and the `|` and `Morfa` wordmark expand;
- when the animation ends, only the splash layer fades out; the main page no longer waits for a loading-screen transition;
- The sound file is `public/audio/splash-metal.mp3`; if the browser blocks autoplay, the splash prompts the user to click anywhere to start.

`components/LoadingScreen.tsx`, `components/LoadingOverlay.tsx`, and `lib/loading/` remain available as a reusable loading UI and progress subscription source for other asynchronous flows; the startup flow no longer uses them.

## XAIOP SDK

XAIOP is vendored as source under `vendor/xaiop/`, registered as `@bylan280/xaiop` through npm workspaces, and its build output `dist/` is not committed.

- After modifying or syncing the SDK source, run `npm run xaiop:test` and `npm run xaiop:check`.
- Do not commit `dist/`, `*.tgz`, or `node_modules/` inside `vendor/xaiop`.
- `apps/web/vite.config.ts` already mounts `xaiopSourcePlugin()`; before Vite starts or builds it checks and compiles automatically, and in development it watches source changes, recompiles, and triggers a full page reload.
- Currently only build and smoke validation exist; business code does not `import` the SDK yet, and the applications' own `package.json` files do not declare `@bylan280/xaiop` yet.
- To temporarily skip the automatic build, set `XAIOP_SKIP_BUILD=1`; use this only when `dist` is confirmed to exist and be up to date.
- For upstream information, sync steps, entry selection, and security boundaries, see [XAIOP Integration](../integrations/xaiop_en.md); the Chinese original is [XAIOP 集成](../integrations/xaiop.md).

## Environment variables

- Local configuration goes in `.env` at the repository root or in each app; do not commit it.
- All variables are listed in `.env.example` with their purpose and default value.
- Secrets are injected only through environment variables; never write them into source code, documentation, or commit history.
- Required variables are validated at startup, with a clear error when one is missing.

## Directories and naming

- Directories and file names use kebab-case (for example `agent-panel`, `design-document.ts`).
- React component files use PascalCase (for example `ThemeSwitcher.tsx`) and follow the style of their directory.
- Shared types live in `packages/shared` and are imported by package name; do not use relative paths that reach across workspaces.
- Test files live next to the file under test and are named `*.test.ts` / `*.test.tsx`.
- SQL migrations use `NNNN_short-name.sql`.

## Code style

- TypeScript runs in `strict` mode; avoid `any`, and explain why when it is truly necessary.
- Prefer function components and hooks; keep components focused on a single responsibility.
- Extract pure logic into `lib` or `services` so it is easy to unit test.
- Make error handling explicit: do not swallow exceptions, and user-facing errors must be translatable.
- Comments explain "why", not what the code does; document public APIs and complex algorithms.
- Formatting and linting are handled by tools; do not argue about formatting by hand.

## Branches and commits

- Use trunk-based development and keep `main` buildable.
- Short-lived branches: `feat/agent-panel`, `fix/theme-flash`, `docs/i18n-guide`, `chore/workspace-setup`.
- Commit messages follow Conventional Commits, with Chinese subjects:

```text
feat(editor): 支持画布缩放与平移
fix(theme): 修复刷新时深色主题闪白
docs(agent): 补充工具权限边界
chore: 初始化 npm workspaces
```

- One commit does one thing; commit formatting and logic changes separately.
- Rebase before merging to keep history linear; this is not mandatory, but avoid meaningless merge commits.

## Change workflow

1. Read the relevant documents and ADRs first to confirm constraints.
2. Implement in small steps with tests.
3. Update affected documentation, i18n resources, and `.env.example`.
4. Run `lint`, `test`, and `build` locally (available after M1).
5. Open a PR describing the motivation, approach, verification, and screenshots (for UI changes).

## Documentation requirements

- Changes to behavior, interfaces, or data structures must update the documentation in the same change.
- Write an ADR for each new architecture decision and register it in the [documentation center](../README_en.md).
- UI copy must be provided in both `zh-CN` and `en-US`; neither may be omitted.
- When adding theme tokens, provide values for both themes and update the theming specification.

## Database changes

- Migration files are append-only; merged migrations must not be edited.
- Before committing, run each migration once against an empty database and once against a database with data.
- Destructive changes (dropping columns, changing types) require a data migration and rollback notes.
- Back up before production migrations; see [Database design](../architecture/database_en.md).

## Windows notes

- The repository normalizes line endings to LF through `.gitattributes`; if you see line-ending warnings, run `git add --renormalize .`.
- npm scripts should avoid Unix commands such as `rm -rf` and `cp`; use Node scripts or cross-platform tools instead.
- Case-sensitivity differences in paths can break imports; keep import paths consistent with actual file names.

## Troubleshooting

- **`npm install` fails**: confirm that Node.js and npm versions meet the requirements, clear `node_modules`, and retry.
- **The SQLite file is locked**: close the process holding the database; confirm that WAL and the correct `busy_timeout` are enabled.
- **Dark theme flash**: check that the inline initialization script in `<head>` runs before styles load.
- **Language does not switch**: check `morfa.locale` in `localStorage`, `<html lang>`, and the i18n initialization order.

> This section grows with the implementation. Check the documentation first when you hit a problem, then add it here to avoid repeating the investigation.
