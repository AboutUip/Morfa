<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/logo-mark.png" />
    <img src="branding/logo-badge.png" width="128" alt="Morfa logo" />
  </picture>
</p>

# Morfa

**AI-powered online UI design platform · Cross-platform · Agent-driven**

> 中文：[README.md](README.md)

Morfa is an AI-native online UI design tool. It connects natural-language intent with structured, editable design documents: the Agent understands and executes, while users always keep control through preview, apply, and undo.

> Repository: <https://github.com/AboutUip/Morfa> · XAIOP upstream: <https://github.com/AboutUip/XAIOP>
>
> Current stage: **M1 in progress**. Web + API can already run: a splash animation and reusable loading UI, the project home, account registration / sign-in, VCode verification, profile editing, AI model provider configuration and model testing, a native MCP server and API keys, a single WebSocket realtime channel, encrypted data export and registration-time import, and dark / light themes with Chinese / English switching. The editor and project creation are planned for later milestones.

## Core direction

- **Agent-driven**: generate, modify, explain, and review through conversation; every Agent action is based on typed tools, traceable and undoable.
- **Cross-platform**: browser-first, adapted for desktop, tablet, and touch devices; the same design is accessible everywhere, with desktop clients on the roadmap.
- **Native dark / light themes**: follow the system or switch manually; the whole UI is driven by design tokens with no flash on switch.
- **Native i18n**: Simplified Chinese by default with English built in; UI copy, dates, and number formatting all go through the internationalization layer.
- **Structured design documents**: design as data, ready for versioning, collaboration, export, and precise Agent operations.
- **Self-host friendly**: SQLite as an embedded database lowers the barrier for local development and small deployments.
- **Agent streaming protocol**: integrates the [XAIOP](https://github.com/AboutUip/XAIOP) SDK (Node / browser) as the foundation for structured incremental output and resume after disconnect.

## Current implementation

- **Startup animation**: after the page opens, the logo appears quickly in the center of the screen and plays a synthesized metallic hum; the logo moves left while the `|` and `Morfa` wordmark reveal through a mask animation on the right, then the splash fades out. The main page renders behind the splash first; fading out only removes the mask, with no page transition. The reusable `LoadingScreen` / `LoadingOverlay` remain available for later asynchronous flows.
- **Project home**: the top bar shows `logo | Morfa` with Projects / Components / Settings tabs; on mobile it collapses into a top-left logo menu with a chevron indicating expansion. The project area defaults to an empty state with a sign-in entry at the top right. Components and Settings are placeholders for now.
- **Account system**: login / registration modal (only the close button exits; clicking the backdrop does not close), with avatar, nickname, login account, password, password confirmation, and a required 6-digit VCode. Registration can optionally import a cancelled account's archive and signs in automatically on success.
- **VCode verification**: a standalone 3×4 numeric keypad dialog that auto-submits after six digits. It gates data export, account cancellation, password recovery, and revealing model API keys. Existing users without a VCode are signed out automatically and guided to set one after signing in.
- **Profile panel**: on desktop, clicking the avatar opens a centered two-column panel; on mobile it is a full-screen panel with horizontal Profile / Account / Models / API tabs at the top and sign-out at the bottom. The Profile tab edits avatar, nickname, and password (single new-password field plus an old-password verification dialog). The Account tab exports an encrypted archive and cancels the account (password verification → VCode in sequence). The Models tab creates OpenAI / Anthropic providers, fetches models server-side, and stores them in provider cards; each model supports real call testing (including streaming and thinking display) and editing streaming, thinking, and multimodal capabilities; API keys are encrypted and require VCode to reveal. The API tab creates MCP API keys with VCode / password permissions, shows the endpoint, downloads `llms.txt`, and searches and expands all MCP capabilities.
- **Native MCP**: `POST /mcp` provides JSON-RPC 2.0 capabilities for changing language / theme / avatar / nickname / password, creating export archives, cancelling accounts, and adding, refreshing, configuring, testing, revealing keys for, and deleting model providers. The MCP controller registers capabilities, validates API key permissions, and generates `llms.txt`; sensitive capabilities require a VCode / password at call time, and capabilities requiring both require both permission bits on the key.
- **Realtime channel**: one WebSocket per page with a unified envelope separating module and action; high-frequency requests, subscriptions, and server pushes use the realtime channel, while one-off operations, files, sensitive operations, and public MCP stay on HTTP. Language / theme changes are pushed via `preferences.changed`, and the MCP capability catalog is preferably read through the realtime channel.
- **Data export / import**: the server encrypts project data with AES-256-GCM and gzip compression; each user keeps at most one valid export archive, and a new export replaces the old one; import is offered only during registration, requiring the original account to be cancelled and the archive to be unused; the server decrypts, imports, and revokes the archive.
- **Storage and security**: SQLite stores users, sessions, VCode hashes, exports, projects, model providers, preferences, and API key data; login accounts are unique and case-insensitive; passwords and VCode use scrypt hashes; the export master key stays on the server; avatar files are written to disk and the database stores only relative paths.
- **Mobile / desktop**: one React app with responsive adaptation; safe areas, `100dvh`, mobile bottom sheets, 16px form inputs, and 44px touch targets; a PWA manifest and icons are included.
- **Typography**: Maple Mono CN, monospace, covering Chinese and English, sans-serif with soft rounded corners; uses GB2312 level-1 characters and a UI character subset, with the OFL license included.
- **Keyboard accessibility**: skip link, Tab arrow-key navigation, keyboard operation for the language menu, modal focus traps, and focus restoration after closing.
- **Theme**: `system / light / dark` three-state mode, no flash on first paint, switchable from the top bar.
- **Internationalization**: Simplified Chinese by default; the top bar switches to English through a globe icon + current-language dropdown; all UI copy comes from resource files.

## Tech stack

| Layer | Choice | Status |
| --- | --- | --- |
| Frontend | React + TypeScript | Built |
| Frontend build | Vite | Integrated |
| Backend | Node.js + TypeScript + Fastify | Built (auth, models, MCP, realtime) |
| Realtime | WebSocket + `@fastify/websocket` | Base layer integrated |
| Database | SQLite (WAL mode, node:sqlite) | Integrated (auth, VCode, exports, projects, model providers, preferences, and API keys) |
| Agent streaming protocol | XAIOP SDK `0.16.0` (vendored source) | Vendored; app integration not started |
| Repository | npm workspaces (monorepo) | Adopted |
| Testing | Vitest + Playwright | Recommended |

Web dependency versions are recorded in `apps/web/package.json` and the root lockfile; remaining dependencies will be locked during later setup and recorded in the [tech stack decision](docs/decisions/0001-tech-stack_en.md).

## Directory structure

```text
Morfa/
├─ apps/
│  ├─ web/                 # React frontend (projects, account, models and API panel)
│  └─ server/              # Fastify API, SQLite, MCP controller and file storage
├─ packages/
│  └─ shared/              # Cross-platform types, contracts and constants
├─ branding/               # Logo, badge, favicon and app icons
├─ vendor/
│  └─ xaiop/               # XAIOP SDK source (Node / browser), dist not committed
├─ docs/                   # Documentation (Chinese originals + same-directory _en.md)
│  ├─ product/             # Product vision and roadmap
│  ├─ architecture/        # Architecture, frontend, backend, database
│  ├─ design/              # Theming and internationalization specs
│  ├─ agent/               # Agent capabilities and runtime
│  ├─ integrations/        # MCP and third-party integrations
│  ├─ guides/              # Development guide
│  └─ decisions/           # Architecture decision records (ADRs)
├─ scripts/                # Development scripts and Vite integration
├─ README.md
├─ README_en.md
└─ LICENSE
```

See the [documentation home](docs/README_en.md) for directory responsibilities and plans.

## Quick start

```bash
npm install          # Install all workspace dependencies (including vendored XAIOP)
npm run dev          # Start Web + API: http://127.0.0.1:5173 (API: 3001)
npm run build        # Type-check + build the Web bundle
npm run preview      # Preview the production build
npm run xaiop:check  # Validate the XAIOP Node / browser / core entries
```

Requirements: Node.js >= 22.12, npm >= 10, Git. See the [development guide](docs/guides/development_en.md) and [XAIOP integration](docs/integrations/xaiop_en.md) for details.

## Documentation

| Document | Contents |
| --- | --- |
| [Documentation home](docs/README_en.md) · [中文](docs/README.md) | Navigation, reading paths, and writing conventions |
| [Product vision](docs/product/vision_en.md) · [中文](docs/product/vision.md) | Positioning, target users, and product principles |
| [Roadmap](docs/product/roadmap_en.md) · [中文](docs/product/roadmap.md) | Milestones from engineering skeleton to launch |
| [Architecture overview](docs/architecture/overview_en.md) · [中文](docs/architecture/overview.md) | Components, data flow, and cross-platform strategy |
| [Realtime channel](docs/architecture/realtime_en.md) · [中文](docs/architecture/realtime.md) | WebSocket envelope, operations, subscriptions, reconnect, and push |
| [Frontend architecture](docs/architecture/frontend_en.md) · [中文](docs/architecture/frontend.md) | React structure, state, and styling conventions |
| [Backend architecture](docs/architecture/backend_en.md) · [中文](docs/architecture/backend.md) | Node.js service, API, and modules |
| [Database design](docs/architecture/database_en.md) · [中文](docs/architecture/database.md) | SQLite conventions, migrations, and schema draft |
| [Theming](docs/design/theming_en.md) · [中文](docs/design/theming.md) | Dark / light themes and design tokens |
| [i18n](docs/design/i18n_en.md) · [中文](docs/design/i18n.md) | Locale strategy, copy organization, and formatting |
| [Branding](docs/design/branding_en.md) · [中文](docs/design/branding.md) | Logo meaning, backgrounds, whitespace, and assets |
| [Typography](docs/design/typography_en.md) · [中文](docs/design/typography.md) | Maple Mono CN selection, subsets, and usage rules |
| [Keyboard and accessibility](docs/design/accessibility_en.md) · [中文](docs/design/accessibility.md) | Focus order, keyboard operation, and modal focus management |
| [Agent design](docs/agent/overview_en.md) · [中文](docs/agent/overview.md) | Agent runtime, tools, and safety boundaries |
| [MCP integration](docs/integrations/mcp_en.md) · [中文](docs/integrations/mcp.md) | Native MCP server, API key permissions, capabilities, and usage |
| [XAIOP integration](docs/integrations/xaiop_en.md) · [中文](docs/integrations/xaiop.md) | SDK origin, build, usage, and validation |
| [Development guide](docs/guides/development_en.md) · [中文](docs/guides/development.md) | Environment, commands, branches, and commit conventions |
| [Architecture decisions](docs/README_en.md#architecture-decision-records) · [中文](docs/decisions/) | ADR records and background |

## Language strategy

Morfa is **Chinese-first with English alongside**:

- Team and user-facing documents, commit messages, and discussions default to Chinese.
- Code identifiers, API fields, and industry terms remain in English, with Chinese explanations on first use.
- All UI copy goes into i18n resource files, never hard-coded in components.
- Every topic document has a same-directory English version: `name.md` is Chinese and `name_en.md` is English. The English documentation home is [`docs/README_en.md`](docs/README_en.md). When the two differ, the Chinese version is authoritative.

## Development conventions

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(editor): support canvas zoom` or `docs: expand theming spec`.
- Branches are short-lived: `feat/...`, `fix/...`, `docs/...`; keep history clear before merging.
- Architecture or technology changes require a new ADR, not only code changes.
- Behavior changes must update the corresponding documentation and i18n resources.

## Third-party components

| Component | Purpose | Source | Integration |
| --- | --- | --- | --- |
| XAIOP SDK `0.16.0` | Agent structured streaming protocol (Node / browser) | <https://github.com/AboutUip/XAIOP> (commit `83dea5a`, MIT) | Source lives in `vendor/xaiop/`; `dist` is compiled on demand by a Vite plugin |
| Maple Mono CN `7.9` | Monospace UI font for Chinese and English | <https://github.com/subframe7536/maple-font> (OFL-1.1) | Subset WOFF2 files live in `apps/web/src/assets/fonts/maple-mono/`, with `OFL.txt` |

XAIOP source and license are kept in `vendor/xaiop/`; build artifacts are not committed. See [XAIOP integration](docs/integrations/xaiop_en.md) and [ADR 0004](docs/decisions/0004-xaiop-integration_en.md).

## License

[MIT](LICENSE) © 2026 小萱baibai
